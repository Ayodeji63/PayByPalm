/**
 * Remove every Tencent palm registered by this PayByPalm database.
 *
 * Dry-run is the default. Destructive execution requires the exact confirmation
 * argument `--confirm=DELETE_ALL_PALMS` so this cannot happen through a typo.
 */

import { db } from '../src/db/client.js';
import { palm } from '../src/palm/index.js';
import { clearLocalPalmBinding } from '../src/services/enrolService.js';

const CONFIRMATION = '--confirm=DELETE_ALL_PALMS';
const execute = process.argv.includes(CONFIRMATION);
const PAGE_SIZE = 1_000;

async function loadRegisteredUserIds(): Promise<string[]> {
  const ids = new Set<string>();

  for (const table of ['palm_bindings', 'palm_audit', 'profiles']) {
   for (let from = 0; ; from += PAGE_SIZE) {
    const column = table === 'profiles' ? 'id' : 'user_id';
    let query = db.from(table).select(column).order('id').range(from, from + PAGE_SIZE - 1);
    if (table === 'palm_audit') query = query.eq('endpoint', 'register');
    if (table === 'profiles') query = query.eq('palm_enrolled', true);
    const page = await query;
    if (page.error) throw new Error(`Could not load ${table}: ${page.error.message}`);

    for (const row of page.data ?? []) {
      const value = (row as unknown as Record<string, unknown>)[column];
      if (typeof value === 'string') ids.add(value);
    }
    if (!page.data || page.data.length < PAGE_SIZE) break;
   }
  }

  return [...ids].sort();
}

async function main() {
  if (palm.name !== 'tencent') {
    throw new Error('PALM_PROVIDER must be set to tencent for this cleanup.');
  }

  const userIds = await loadRegisteredUserIds();
  console.log(`Found ${userIds.length} distinct PayByPalm user(s) in binding, enrollment flag or registration audit history.`);
  console.log('Scope: all known users in this database; Tencent has no documented gallery-list/bulk-delete API.');

  if (!execute) {
    console.log('DRY RUN: nothing was deleted.');
    console.log(`Run again with ${CONFIRMATION} to permanently delete all listed palms.`);
    return;
  }

  let deleted = 0;
  const failures: Array<{ userId: string; message: string }> = [];

  for (const userId of userIds) {
    try {
      await palm.delete(userId);
      await clearLocalPalmBinding(userId);
      deleted += 1;
      console.log(`Deleted ${deleted}/${userIds.length}: ${userId}`);
    } catch (err) {
      failures.push({
        userId,
        message: err instanceof Error ? err.message : 'Unknown deletion error',
      });
      console.error(`FAILED: ${userId}`);
    }
  }

  console.log(`Finished: ${deleted} deleted, ${failures.length} failed.`);
  if (failures.length) {
    for (const failure of failures) console.error(`${failure.userId}: ${failure.message}`);
    process.exitCode = 1;
  }
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
