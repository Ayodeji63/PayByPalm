/**
 * Remove every Tencent palm registered by this PayByPalm database.
 *
 * Dry-run is the default. Destructive execution requires the exact confirmation
 * argument `--confirm=DELETE_ALL_PALMS` so this cannot happen through a typo.
 */

import { db } from '../src/db/client.js';
import { palm } from '../src/palm/index.js';

const CONFIRMATION = '--confirm=DELETE_ALL_PALMS';
const execute = process.argv.includes(CONFIRMATION);
const PAGE_SIZE = 1_000;

async function loadRegisteredUserIds(): Promise<string[]> {
  const ids = new Set<string>();

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from('palm_bindings')
      .select('user_id')
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Could not load palm bindings: ${error.message}`);
    for (const row of data as Array<{ user_id: string }>) ids.add(row.user_id);
    if (data.length < PAGE_SIZE) break;
  }

  return [...ids].sort();
}

async function clearLocalBinding(userId: string): Promise<void> {
  const revokedAt = new Date().toISOString();
  const { error: bindingError } = await db
    .from('palm_bindings')
    .update({ revoked_at: revokedAt })
    .eq('user_id', userId)
    .is('revoked_at', null);
  if (bindingError) throw new Error(`Could not revoke local binding: ${bindingError.message}`);

  const { error: profileError } = await db
    .from('profiles')
    .update({ palm_enrolled: false })
    .eq('id', userId);
  if (profileError) throw new Error(`Could not update profile: ${profileError.message}`);
}

async function main() {
  if (palm.name !== 'tencent') {
    throw new Error('PALM_PROVIDER must be set to tencent for this cleanup.');
  }

  const userIds = await loadRegisteredUserIds();
  console.log(`Found ${userIds.length} distinct PayByPalm user(s) with binding history.`);

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
      await clearLocalBinding(userId);
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
