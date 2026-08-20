#!/usr/bin/env node
/**
 * Secret guard.
 *
 * The non-negotiable rule in this project is that the palm provider key and the
 * Supabase service role key live in backend environment variables and nowhere
 * else — never in browser JS, never on the Pi, never in a response body.
 *
 * A rule enforced only by discipline eventually gets broken by a late-night
 * "just for now" import. This greps the built bundle and fails the build if
 * anything that looks like a credential made it in.
 *
 *   pnpm build && pnpm guard:secrets
 *
 * Run it in CI, before deploying.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;

/** Anything matching these must never appear in a client bundle. */
const FORBIDDEN = [
  {
    name: 'Tencent PalmAI key',
    pattern: /\bak_[A-Za-z0-9]{8,}/,
  },
  {
    name: 'Supabase service role key',
    // Supabase JWTs are three base64url segments; the service role one carries
    // this claim. Matching the claim avoids flagging the harmless anon key.
    pattern: /service_role/,
  },
  {
    name: 'Palm provider endpoint (the browser must never call it directly)',
    pattern: /open\.intl\.palm\.tencent\.com/,
  },
  {
    name: 'Terminal device key (must come from the Pi at runtime, never the bundle)',
    // The wallet and the terminal are one bundle on one public origin, so a
    // VITE_TERMINAL_KEY would be readable by every wallet user. The key belongs
    // in /etc/paybypalm/terminal.env and reaches the page via the kiosk URL.
    pattern: /\bpbp_[A-Za-z0-9_]{6,}/,
  },
  {
    name: 'Generic private key block',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  },
];

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

const SCANNABLE = /\.(js|mjs|cjs|css|html|map|json|txt)$/i;

let failures = 0;
let scanned = 0;

for (const file of walk(DIST)) {
  if (!SCANNABLE.test(file)) continue;
  scanned += 1;

  const contents = readFileSync(file, 'utf8');
  for (const { name, pattern } of FORBIDDEN) {
    const match = contents.match(pattern);
    if (match) {
      failures += 1;
      const relative = file.replace(DIST, '');
      console.error(`LEAK  ${relative}`);
      console.error(`      ${name}`);
      console.error(`      matched: ${match[0].slice(0, 32)}…\n`);
    }
  }
}

if (scanned === 0) {
  console.error('guard:secrets found no build output. Run `pnpm build` first.');
  process.exit(1);
}

if (failures > 0) {
  console.error(`FAILED — ${failures} potential secret(s) in the client bundle.`);
  process.exit(1);
}

console.log(`guard:secrets OK — scanned ${scanned} file(s), found no credentials.`);
