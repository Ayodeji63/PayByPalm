# PayByPalm Administration

## Platform
web

## Users and purpose
PayByPalm operators onboard merchants and configure their Raspberry Pi terminals.
The user explicitly selected a separate directory, desktop-first merchant table,
terminal inventory, guided device setup, and the existing PayByPalm blue identity.
The initially authorized administrator is the verified existing account
olusanyasamson633@gmail.com, identified on the server by its immutable Supabase UUID.

## Stack and boundaries
Uses the existing project's React/TypeScript and Express/Supabase stack in an
independently installed application. It shares the existing Supabase database;
customer wallet, payment provider, palm recognition and Pi kiosk remain separate.
Only this application's server can access the service-role key. Administrators
authenticate with their existing account and must be in a server-side UUID allowlist.

## Capabilities
Create/edit merchant details and existing Paystack subaccount identifiers; resolve
bank account names and create Paystack payout subaccounts through the admin server;
show provider verification status and recover ambiguous creation without duplicate
POSTs, with separate test/live destinations; create terminals bound to a merchant; edit labels; generate or import a device key hash;
rotate/revoke device credentials; download an actual Pi terminal.env configuration;
inspect last contact and operator changes. Bank-name resolution is separate from
Paystack payout/KYC approval. No remote Pi agent, remote restart or remote hardware
configuration exists in this app.

## Constraints
Merchant creation must be atomic with its required account. Device merchant
assignments are immutable; a new merchant requires a new terminal registration.
Revocation changes the hash recognized by the existing backend, making the old
credential unusable. Plaintext device keys are generated in browser memory and
are not recoverable from the server. No fabricated merchants, telemetry or charts
appear in production. Local browser-test fixtures are explicitly test-only.

## Accessibility
Keyboard-operable forms, explicit labels, meaningful empty/error/loading states,
visible focus, responsive tables and comfortable touch targets are required.
