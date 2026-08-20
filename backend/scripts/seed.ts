/**
 * Seed the five demo users.
 *
 *   cd backend && pnpm seed
 *
 * Run supabase/seed.sql first — it creates the float account these top-ups draw
 * from, plus the merchant and terminal.
 *
 * Safe to re-run. Users that already exist are left alone, and a wallet that
 * already has a balance is not topped up again, so this will not quietly double
 * everyone's money the second time you run it.
 */

import bcrypt from 'bcryptjs';
import { db } from '../src/db/client.js';
import { config } from '../src/config.js';
import { normalisePhone, syntheticEmailFor } from '../src/lib/phone.js';
import { getBalanceMinor, getWalletAccountId } from '../src/db/queries.js';

const OPENING_BALANCE_MINOR = 20_000 * 100; // ₦20,000
const SHARED_PASSWORD = 'palmpay2026';

interface DemoUser {
  fullName: string;
  phone: string;
  pin: string;
}

/**
 * Note the last-4 digits: 1001–1005 are all distinct, so each user is alone in
 * their bin and the terminal's compare path resolves to exactly one candidate.
 * Give two users the same last four if you want to demo the multi-candidate path.
 */
const DEMO_USERS: DemoUser[] = [
  { fullName: 'Ada Okonkwo', phone: '08010001001', pin: '2468' },
  { fullName: 'Bola Adeyemi', phone: '08010001002', pin: '1357' },
  { fullName: 'Chidi Nwosu', phone: '08010001003', pin: '9753' },
  { fullName: 'Dami Balogun', phone: '08010001004', pin: '8642' },
  { fullName: 'Emeka Obi', phone: '08010001005', pin: '7391' },
];

async function findUserIdByEmail(email: string): Promise<string | null> {
  // listUsers is paginated; the demo set is tiny, so one page is plenty.
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`Could not list users: ${error.message}`);
  return data.users.find((u) => u.email === email)?.id ?? null;
}

async function seedUser(user: DemoUser): Promise<{ id: string; created: boolean }> {
  const phone = normalisePhone(user.phone);
  const email = syntheticEmailFor(phone);

  const existing = await findUserIdByEmail(email);
  if (existing) return { id: existing, created: false };

  const { data, error } = await db.auth.admin.createUser({
    email,
    password: SHARED_PASSWORD,
    email_confirm: true,
    // handle_new_user() reads these to build the profile and wallet account.
    user_metadata: { full_name: user.fullName, phone },
  });

  if (error || !data.user) {
    throw new Error(`Could not create ${user.fullName}: ${error?.message ?? 'unknown error'}`);
  }

  const { error: pinError } = await db
    .from('profiles')
    .update({ pin_hash: await bcrypt.hash(user.pin, 10) })
    .eq('id', data.user.id);

  if (pinError) throw new Error(`Could not set PIN for ${user.fullName}: ${pinError.message}`);

  return { id: data.user.id, created: true };
}

async function main(): Promise<void> {
  console.log(`Seeding demo users against ${config.SUPABASE_URL}\n`);

  const { data: float, error: floatError } = await db
    .from('accounts')
    .select('id')
    .eq('kind', 'float')
    .maybeSingle();

  if (floatError) throw new Error(`Could not check float account: ${floatError.message}`);
  if (!float) {
    console.error('No float account found. Run supabase/seed.sql first.');
    process.exit(1);
  }

  const rows: string[][] = [];

  for (const user of DEMO_USERS) {
    const { id, created } = await seedUser(user);

    const accountId = await getWalletAccountId(id);
    let balance = await getBalanceMinor(accountId);

    // Only fund an empty wallet, so re-running does not stack credits.
    if (balance === 0) {
      const { error } = await db.rpc('post_topup', {
        p_user_id: id,
        p_amount: OPENING_BALANCE_MINOR,
        p_description: 'Demo opening balance',
      });
      if (error) throw new Error(`Could not fund ${user.fullName}: ${error.message}`);
      balance = OPENING_BALANCE_MINOR;
    }

    rows.push([
      user.fullName,
      normalisePhone(user.phone),
      user.pin,
      `NGN ${(balance / 100).toLocaleString('en-NG')}`,
      created ? 'created' : 'existed',
    ]);
  }

  const headers = ['Name', 'Phone (login)', 'PIN', 'Balance', ''];
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
  );
  const line = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  ').trimEnd();

  console.log(line(headers));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(line(r));

  console.log(`\nPassword for every demo user: ${SHARED_PASSWORD}`);
  console.log('Terminal key (from supabase/seed.sql): pbp_dev_terminal_key_001');
  console.log('\nOn PALM_PROVIDER=mock, pass X-Mock-User: <user id> to simulate a palm.');
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
