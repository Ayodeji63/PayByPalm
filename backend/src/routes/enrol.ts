/**
 * Enrolment routes.
 *
 * AUTHENTICATION IS PER-ROUTE AND DELIBERATELY MIXED HERE, because the flow is a
 * handshake between two different actors. Read the middleware on each route:
 *
 *   terminalAuth  the device creating the session and capturing the palm
 *   userAuth      the phone that says who the user actually is
 *
 * No route accepts both.
 */

import { Router } from 'express';
import { z } from 'zod';
import { AppError, forbidden, notFound } from '../errors.js';
import { requireTerminal, terminalAuth } from '../middleware/terminalAuth.js';
import { requireUser, userAuth } from '../middleware/userAuth.js';
import { validate } from '../middleware/validate.js';
import {
  claimSession,
  createSession,
  getSessionView,
  registerPalmForSession,
  revokePalm,
} from '../services/enrolService.js';
import { db } from '../db/client.js';

export const enrolRouter: Router = Router();

const idParam = z.object({ id: z.string().uuid('Not a valid session id') });

// ---------------------------------------------------------------------------
// POST /enrol/sessions          (terminal)
// ---------------------------------------------------------------------------

enrolRouter.post('/enrol/sessions', terminalAuth, async (req, res) => {
  const terminal = requireTerminal(req);
  const session = await createSession(terminal);

  res.status(201).json({
    ...session,
    merchantName: terminal.merchantName,
    terminalLabel: terminal.label,
  });
});

// ---------------------------------------------------------------------------
// GET /enrol/sessions/:id       (terminal polls)
// ---------------------------------------------------------------------------

enrolRouter.get(
  '/enrol/sessions/:id',
  terminalAuth,
  validate({ params: idParam }),
  async (req, res) => {
    res.json(await getSessionView(req.params.id as string));
  },
);

// ---------------------------------------------------------------------------
// GET /enrol/sessions/:id/stream  (terminal, Server-Sent Events)
// ---------------------------------------------------------------------------
// A nicer alternative to polling, not a replacement for it: GET above stays fully
// functional, and the terminal should fall back to it if the stream drops. A
// kiosk that can only enrol when SSE is healthy is a kiosk that stops working
// behind the first proxy that buffers responses.

enrolRouter.get(
  '/enrol/sessions/:id/stream',
  terminalAuth,
  validate({ params: idParam }),
  async (req, res) => {
    const sessionId = req.params.id as string;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Tells nginx and friends not to buffer, which would defeat the point.
      'X-Accel-Buffering': 'no',
    });

    let closed = false;
    const send = (event: string, payload: unknown) => {
      if (closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    const finish = () => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      res.end();
    };

    req.on('close', finish);

    const tick = async () => {
      try {
        const view = await getSessionView(sessionId);
        send('status', view);

        // Nothing further will happen to a session in one of these states.
        if (view.status === 'completed' || view.status === 'expired') finish();
      } catch (err) {
        req.log.warn({ err }, 'enrolment stream tick failed');
        send('error', { message: 'Lost track of this session. Fall back to polling.' });
        finish();
      }
    };

    const timer = setInterval(() => void tick(), 1000);
    await tick();
  },
);

// ---------------------------------------------------------------------------
// POST /enrol/sessions/:id/claim   (phone)
// ---------------------------------------------------------------------------
// Rejects with 409 already_enrolled when the user has a palm linked. Enrolment is
// one-time, and this is where that is enforced.

enrolRouter.post(
  '/enrol/sessions/:id/claim',
  userAuth,
  validate({ params: idParam }),
  async (req, res) => {
    const user = requireUser(req);
    res.json(await claimSession(req.params.id as string, user.id));
  },
);

// ---------------------------------------------------------------------------
// GET /enrol/sessions/:id/mine     (phone polls its own claimed session)
// ---------------------------------------------------------------------------
// The phone shows "now place your palm on the terminal" and needs to know when
// that has happened. It cannot use the terminal's polling route, which requires a
// device key — hence this one, scoped to the session the caller actually claimed.

enrolRouter.get(
  '/enrol/sessions/:id/mine',
  userAuth,
  validate({ params: idParam }),
  async (req, res) => {
    const user = requireUser(req);
    const sessionId = req.params.id as string;

    const { data, error } = await db
      .from('enrol_sessions')
      .select('user_id')
      .eq('id', sessionId)
      .maybeSingle();

    if (error) throw new AppError(500, 'db_error', `Could not load session: ${error.message}`);
    if (!data) throw notFound('This enrolment session does not exist.');
    if ((data as { user_id: string | null }).user_id !== user.id) {
      throw forbidden('This enrolment session belongs to someone else.');
    }

    res.json(await getSessionView(sessionId));
  },
);

// ---------------------------------------------------------------------------
// POST /enrol/sessions/:id/palm    (terminal captures and registers)
// ---------------------------------------------------------------------------

enrolRouter.post(
  '/enrol/sessions/:id/palm',
  terminalAuth,
  validate({
    params: idParam,
    body: z.object({ imageB64: z.string().min(1, 'A palm image is required') }),
  }),
  async (req, res) => {
    const terminal = requireTerminal(req);
    const { imageB64 } = req.body as { imageB64: string };

    const outcome = await registerPalmForSession(req.params.id as string, terminal, imageB64);
    res.json(outcome);
  },
);

// ---------------------------------------------------------------------------
// POST /palm/revoke                (phone)
// ---------------------------------------------------------------------------

enrolRouter.post('/palm/revoke', userAuth, async (req, res) => {
  const user = requireUser(req);
  const result = await revokePalm(user.id);

  res.json({
    ...result,
    message: result.revoked
      ? 'Palm unlinked. You can enrol again at any terminal.'
      : 'No palm was linked to this account.',
  });
});
