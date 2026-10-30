/** Tested release helper: check publish access, atomically migrate, then push.
 * Never calls Paystack or writes credentials to GitHub. Run from backend/:
 *   node --import tsx scripts/release-ccnet.ts
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { authPool } from '../src/auth/engine.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const git = (...args: string[]) => spawnSync('git', args, {
  cwd: root, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
});
class ReleaseError extends Error {}
const fail = (message: string): never => { throw new ReleaseError(message); };
async function release() {
  if (git('status', '--porcelain').stdout.trim()) fail('Commit the release changes before publishing.');
  if (git('branch', '--show-current').stdout.trim() !== 'main') fail('Check out the tested main branch before publishing.');
  if (git('remote', 'get-url', 'origin').stdout.trim() !== 'https://github.com/Ayodeji63/PayByPalm.git') fail('Unexpected Git origin. Review it before publishing.');
  const access = git('push', '--dry-run', 'origin', 'HEAD:main');
  if (access.status !== 0) fail('GitHub write access unavailable. Run gh auth login --web --git-protocol https, then gh auth setup-git, and retry. No database changes were made.');
  const databaseURL = process.env.AUTH_DATABASE_URL;
  if (!databaseURL) throw new ReleaseError('AUTH_DATABASE_URL must be configured in backend/.env.');
  const sql = readFileSync(new URL('../../supabase/migrations/0027_ccnet_provider.sql', import.meta.url), 'utf8');
  const pool = authPool(databaseURL);
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("set local lock_timeout='10s'; set local statement_timeout='60s'");
    await client.query("select pg_advisory_xact_lock(hashtextextended('paybypalm-ccnet-release',0))");
    const recorded = await client.query<{ statements: string[] }>("select statements from supabase_migrations.schema_migrations where version='0027'");
    if (recorded.rows.length) {
      if (recorded.rows[0]!.statements.join('\n') !== sql) fail('Migration 0027 differs from the recorded version. Review the schema before continuing.');
      console.log('Database: CCNet migration already applied.');
    } else {
      const prior = await client.query("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='palm_bindings' and column_name='provider') as migrated");
      if (prior.rows[0].migrated) fail('The provider schema already exists without this migration record. Review it before continuing.');
      const claim = await client.query("select prosrc from pg_proc where oid='public.begin_card_payment(uuid,uuid,text,integer,integer)'::regprocedure");
      const definition = String(claim.rows[0]?.prosrc ?? '').toLowerCase();
      if (!['domain=p_domain', 'p_validity>60', 'for update', 'card_payment_attempts', 'is_default'].every(part => definition.includes(part)))
        fail('The database must have the current verified-card/payment-mode migrations before CCNet rollout.');
      // Keep migration and its Supabase ledger record in one transaction.
      const body = sql.replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, '');
      await client.query(body);
      await client.query("insert into supabase_migrations.schema_migrations(version,name,statements) values('0027','ccnet_provider',$1::text[])", [[sql]]);
      console.log('Database: provider metadata, enrollment leases and charge guards prepared.');
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback'); throw error;
  } finally { client.release(); await pool.end(); }
  const pushed = git('push', 'origin', 'HEAD:main');
  if (pushed.status !== 0) fail('The migration is applied, but GitHub publishing failed. Keep the same release and rerun this command; do not bypass payment guards.');
  console.log('Code published. Import CCNet/secrets/paybypalm-render.env into the Render backend and choose Save, rebuild, and deploy.');
}
release().catch((error: unknown) => {
  // Driver exceptions can include connection details. Print only our own messages.
  if (error instanceof ReleaseError) console.error(error.message);
  else console.error('Release could not finish. Check GitHub login, a clean main branch and database connectivity. No card charges were requested.');
  process.exitCode = 1;
});
