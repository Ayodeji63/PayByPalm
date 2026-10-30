import { config } from '../config.js';
import { db } from '../db/client.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';
import type { ProviderBinding } from '../palm/provider.js';

export async function activeProviderBinding(userId: string): Promise<boolean> {
  const { data, error } = await db.from('palm_bindings').select('id').eq('user_id', userId)
    .eq('provider', config.PALM_PROVIDER).is('revoked_at', null).maybeSingle();
  if (error) throw new AppError(503, 'palm_status_unavailable', 'Could not check palm enrollment. Please try again.');
  return !!data;
}
export async function ccnetBindings(): Promise<ProviderBinding[]> {
  const started = performance.now();
  const { data, error } = await db.from('palm_bindings')
    .select('id,user_id,provider_subject_id,palm_side').eq('provider', 'ccnet').is('revoked_at', null).order('id').limit(1001);
  if (error || !data || data.length > 1000) throw new AppError(503, 'palm_candidates_unavailable', 'Could not load the eligible palm gallery. Please try again.');
  logger.info({ stage: 'eligible_bindings', durationMs: Math.round((performance.now() - started) * 100) / 100, count: data.length }, 'Palm database timing');
  return data.map(row => {
    if (!row.provider_subject_id || !['left','right'].includes(row.palm_side)) throw new AppError(503, 'palm_binding_invalid', 'Palm enrollment needs administrator attention.');
    return { id: row.id, userId: row.user_id, subjectId: row.provider_subject_id, palmSide: row.palm_side };
  });
}
export function sameBindings(before: ProviderBinding[], after: ProviderBinding[]): boolean {
  return JSON.stringify(before) === JSON.stringify(after);
}
