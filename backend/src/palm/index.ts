/**
 * Palm provider selection.
 *
 * One environment variable, `PALM_PROVIDER`, decides whether biometric calls go to
 * Tencent PalmAI or to the deterministic in-memory mock. Nothing else in the
 * codebase branches on it.
 *
 * Whichever is chosen is wrapped in the auditing decorator, so there is no way to
 * reach a provider without writing a palm_audit row.
 */

import { config } from '../config.js';
import { logger } from '../logger.js';
import { withAudit } from './audit.js';
import { createMockProvider } from './mock.js';
import { createTencentProvider } from './tencent.js';
import type { PalmProvider } from './provider.js';

function build(): PalmProvider {
  const inner =
    config.PALM_PROVIDER === 'tencent' ? createTencentProvider() : createMockProvider();

  if (inner.name === 'mock') {
    logger.warn(
      'PALM_PROVIDER=mock — biometric matching is SIMULATED. Set PALM_PROVIDER=tencent for real matching.',
    );
  }

  return withAudit(inner);
}

/** The audited provider. Import this; never import tencent.ts or mock.ts directly. */
export const palm: PalmProvider = build();

export * from './provider.js';
export * from './policy.js';
