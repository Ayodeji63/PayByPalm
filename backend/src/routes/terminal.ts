/**
 * Terminal identity.
 *
 * The kiosk needs to know which merchant it belongs to before it can show its
 * idle screen. Everything else it does creates state — a sale, an enrolment
 * session — so without this it would have to create a throwaway row on every
 * boot just to learn its own name.
 *
 * Terminal-authenticated. Returns nothing a device does not already know about
 * itself, and nothing about any user.
 */

import { Router } from 'express';
import { requireTerminal, terminalAuth } from '../middleware/terminalAuth.js';

export const terminalRouter: Router = Router();

terminalRouter.get('/terminal/me', terminalAuth, (req, res) => {
  const terminal = requireTerminal(req);
  res.json({
    terminalId: terminal.id,
    terminalLabel: terminal.label,
    merchantName: terminal.merchantName,
  });
});
