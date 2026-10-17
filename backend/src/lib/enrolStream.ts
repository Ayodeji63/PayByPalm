import type { Request, Response } from 'express';
import { db } from '../db/client.js';
import { AppError } from '../errors.js';
import type { SessionView } from '../services/enrolService.js';

export async function enrolStream(
  req: Request, res: Response, terminalId: string, sessionId: string,
  read: (signal: AbortSignal) => Promise<SessionView>,
): Promise<void> {
  const { data: lease, error } = await db.rpc('acquire_api_stream', { p_terminal_id: terminalId, p_session_id: sessionId });
  if (error) throw new AppError(503, 'stream_unavailable', 'Please use polling instead.');
  if (!lease) throw new AppError(429, 'stream_limit', 'Too many enrollment streams.', { retryAfter: 120 });
  const abort = new AbortController();
  let closed = false;
  let poll: ReturnType<typeof setTimeout> | undefined;
  let lifetime: ReturnType<typeof setTimeout> | undefined;
  const finish = () => {
    if (closed) return;
    closed = true;
    abort.abort();
    clearTimeout(poll); clearTimeout(lifetime);
    res.off('drain', schedule);
    res.off('close', finish);
    if (!res.destroyed) res.end();
    void db.rpc('release_api_stream', { p_id: lease }).then(({ error: releaseError }) => {
      if (releaseError) req.log.warn({ code: 'stream_release_failed' }, 'stream lease will expire');
    }, () => req.log.warn({ code: 'stream_release_failed' }, 'stream lease will expire'));
  };
  const schedule = () => {
    if (!closed) poll = setTimeout(() => void tick(), 1000);
  };
  const tick = async () => {
    if (closed) return;
    try {
      const view = await read(abort.signal);
      if (closed) return;
      const writable = res.write(`event: status\ndata: ${JSON.stringify(view)}\n\n`);
      if (view.status === 'completed' || view.status === 'expired') { finish(); return; }
      if (writable) schedule();
      else res.once('drain', schedule);
    } catch {
      if (!closed) finish();
    }
  };
  if (res.destroyed) { finish(); return; }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
  });
  res.on('close', finish);
  lifetime = setTimeout(finish, 90_000);
  await tick();
}
