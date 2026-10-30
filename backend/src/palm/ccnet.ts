/** CCNet transport. Only this server-side module reads its API key. */
import { randomUUID } from 'node:crypto';
import { z } from 'zod/v3';
import { config } from '../config.js';
import { AppError } from '../errors.js';
import { normaliseImage } from '../lib/image.js';
import type { PalmProvider, ProviderBinding, ProviderMeta, SampleRegistration } from './provider.js';

const side = z.enum(['left', 'right']);
const score = z.number().finite().min(-1).max(1);
const candidate = z.object({ user_id: z.string().min(1).max(128), palm_side: side, cosine_similarity: score,
  angular_distance: z.number().finite().min(0).max(1) });
const identification = z.object({ candidates: z.array(candidate).max(2), matched: z.boolean(), threshold: score,
  identified_user_id: z.string().nullable(), identified_palm_side: side.nullable() });
const verification = candidate.extend({ matched: z.boolean(), threshold: score });
const enrollment = z.object({ user_id: z.string(), palm_side: side, status: z.enum(['created', 'replaced']), sample_count: z.literal(3), minimum_pair_similarity: score.optional() });

export function ccnetScore(cosine: number): number {
  if (!Number.isFinite(cosine) || cosine < -1 || cosine > 1) throw invalid();
  return Math.max(0, Math.min(100, Math.floor(cosine * 100)));
}
function invalid(): AppError { return new AppError(502, 'palm_response_invalid', 'The palm reader returned an invalid result. Please scan again.'); }
function requireBinding(binding?: ProviderBinding): ProviderBinding {
  if (!binding) throw new AppError(409, 'palm_binding_missing', 'Link your palm with this reader before scanning.');
  return binding;
}
function imagePart(encoded: string): Blob {
  const image = normaliseImage(encoded);
  if (image.bytes > 512 * 1024) throw new AppError(422, 'image_too_large', 'Each palm capture must be at most 512 KiB.');
  return new Blob([Uint8Array.from(Buffer.from(image.data, 'base64'))], { type: 'application/octet-stream' });
}

export function createCcnetProvider(): PalmProvider {
  const base = config.CCNET_BASE_URL!.replace(/\/$/, '');
  const key = config.CCNET_API_KEY!;
  async function call(path: string, method: string, body?: FormData, enrollmentCall = false, missingOk = false): Promise<{ data: unknown; meta: ProviderMeta }> {
    const requestId = randomUUID();
    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), enrollmentCall ? config.CCNET_ENROLL_TIMEOUT_MS : config.CCNET_MATCH_TIMEOUT_MS);
    try {
      const response = await fetch(base + path, {
        method, body, signal: controller.signal, redirect: 'error',
        headers: { Authorization: `Bearer ${key}`, 'ngrok-skip-browser-warning': '1', 'X-Request-ID': requestId },
      });
      if (missingOk && response.status === 404) { await response.body?.cancel(); return { data: null, meta: { requestId } }; }
      if (!response.ok) {
        await response.body?.cancel();
        if ([401, 403].includes(response.status)) throw new AppError(503, 'palm_reader_configuration', 'The palm reader credentials need attention. Ask the administrator.');
        if (response.status === 404) throw new AppError(409, 'palm_not_enrolled', 'Link your palm with this reader before paying.');
        if ([400, 413, 415, 422].includes(response.status)) throw new AppError(422, 'palm_capture_rejected', 'The palm capture could not be read. Show one open palm and try again.');
        if (response.status === 409) throw new AppError(409, 'palm_reader_conflict', 'The palm enrollment changed. Check its status before trying again.');
        throw new AppError(503, 'palm_reader_busy', 'The palm reader is busy or unavailable. Please try again.');
      }
      let data: unknown = null;
      if (response.status !== 204) {
        const reader = response.body?.getReader();
        if (!reader) throw invalid();
        const chunks: Uint8Array[] = []; let received = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > 1024 * 1024) { await reader.cancel(); throw invalid(); }
          chunks.push(value);
        }
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw invalid(); }
      }
      const timings: Record<string, number> = { transport_ms: performance.now() - started };
      for (const entry of (response.headers.get('server-timing') ?? '').split(',')) {
        const match = /^\s*(extract|embed|search);dur=([\d.]+)\s*$/.exec(entry);
        if (match && Number.isFinite(Number(match[2]))) timings[`${match[1]}_ms`] = Number(match[2]);
      }
      return { data, meta: { requestId, timings } };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, controller.signal.aborted ? 'palm_reader_timeout' : 'palm_reader_offline',
        controller.signal.aborted ? 'The palm check timed out. Please scan again.' : 'The palm reader is offline. Check the PC and connection.');
    } finally { clearTimeout(timeout); }
  }

  return {
    name: 'ccnet',
    async register() { throw new AppError(422, 'palm_samples_required', 'CCNet enrollment requires three captures and a palm side.'); },
    async registerSamples(_userId, input: SampleRegistration) {
      const form = new FormData();
      input.imagesB64.forEach((image, index) => form.append('images', imagePart(image), `capture-${index}.jpg`));
      const result = await call(`/v1/users/${encodeURIComponent(input.subjectId)}/palms/${input.palmSide}`, 'PUT', form, true);
      const parsed = enrollment.safeParse(result.data);
      if (!parsed.success || parsed.data.user_id !== input.subjectId || parsed.data.palm_side !== input.palmSide) throw invalid();
      return { palmId: input.subjectId, meta: {...result.meta,sampleCount:3,minimumPairSimilarity:parsed.data.minimum_pair_similarity} };
    },
    async compare(_userId, imageB64, reference) {
      const binding = requireBinding(reference);
      const form = new FormData(); form.append('image', imagePart(imageB64), 'probe.jpg');
      const result = await call(`/v1/users/${encodeURIComponent(binding.subjectId)}/palms/${binding.palmSide}/verify`, 'POST', form);
      const parsed = verification.safeParse(result.data);
      if (!parsed.success || parsed.data.user_id !== binding.subjectId || parsed.data.palm_side !== binding.palmSide ||
        parsed.data.matched !== (parsed.data.cosine_similarity >= parsed.data.threshold)) throw invalid();
      return { isMatch: parsed.data.matched, score: ccnetScore(parsed.data.cosine_similarity),
        meta: { ...result.meta, providerIsMatch: parsed.data.matched, cosineSimilarity:parsed.data.cosine_similarity } };
    },
    async identify(imageB64, bindings) {
      if (bindings.length > 1000 || new Set(bindings.map(b => `${b.subjectId}:${b.palmSide}`)).size !== bindings.length) throw invalid();
      const form = new FormData(); form.append('image', imagePart(imageB64), 'probe.jpg'); form.append('top_k', '2');
      form.append('eligible_palms', JSON.stringify(bindings.map(b => ({ user_id: b.subjectId, palm_side: b.palmSide }))));
      const result = await call('/v1/identify', 'POST', form);
      const parsed = identification.safeParse(result.data);
      if (!parsed.success) throw invalid();
      const answer = parsed.data; const first = answer.candidates[0];
      const expectedMatch = !!first && first.cosine_similarity >= answer.threshold;
      if (answer.matched !== expectedMatch || answer.identified_user_id !== (expectedMatch ? first!.user_id : null) ||
        answer.identified_palm_side !== (expectedMatch ? first!.palm_side : null)) throw invalid();
      const bySubject = new Map(bindings.map(b => [`${b.subjectId}:${b.palmSide}`, b]));
      const seen = new Set<string>(); let previous = Infinity;
      const candidates = answer.candidates.map(item => {
        const id = `${item.user_id}:${item.palm_side}`; const binding = bySubject.get(id);
        if (!binding || seen.has(id) || item.cosine_similarity > previous) throw invalid();
        seen.add(id); previous = item.cosine_similarity;
        return { ...binding, score: ccnetScore(item.cosine_similarity), cosineSimilarity: item.cosine_similarity };
      });
      return { candidates, meta: { ...result.meta, providerIsMatch: answer.matched, cosineSimilarity:first?.cosine_similarity } };
    },
    async delete(_userId, reference) {
      const binding = requireBinding(reference); let meta: ProviderMeta = {};
      for (const palmSide of ['left', 'right']) {
        meta = (await call(`/v1/users/${encodeURIComponent(binding.subjectId)}/palms/${palmSide}`, 'DELETE', undefined, false, true)).meta;
      }
      return { meta };
    },
  };
}
