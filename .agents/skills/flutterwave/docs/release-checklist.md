# Release Checklist for DevMubarak1/Flutterwave

This checklist ensures all skill markdown files, schema references, and documentation stay in sync with the current Flutterwave developer platform specifications (v3.0.0 and v4.0.0 Public Beta).

---

## 1. Repository & Metadata Integrity

- [ ] Confirm repository is public at `https://github.com/DevMubarak1/Flutterwave`.
- [ ] Confirm package metadata in `package.json`:
  - `name`: `flutterwave-skills`
  - `version`: Bumped appropriately (e.g., `0.2.0`)
  - `repository.url`: `git+https://github.com/DevMubarak1/Flutterwave.git`
- [ ] Verify that `skills/manifest.json` lists all 23 active skills.
- [ ] Verify all skill files exist at `skills/[skill-name]/SKILL.md` with valid YAML frontmatter (`name`, `description`).

---

## 2. API Specification & Live Standards Alignment

- [ ] **Dual Versioning:**
  - Stable v3 routes point to `https://api.flutterwave.com/v3`.
  - Next-Gen v4 routes point to `https://developersandbox-api.flutterwave.com` (sandbox) and `https://f4bexperience.flutterwave.com/` (live).
- [ ] **Authentication Consistency:**
  - v3 examples use `Authorization: Bearer <FLW_SECRET_KEY>`.
  - v4 examples note OAuth 2.0 OpenID Connect endpoint `https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token` with `client_id` and `client_secret`.
  - v4 mutations include `X-Trace-Id` (12-255 chars) and `X-Idempotency-Key`.
- [ ] **Webhook Verification:**
  - Verified against the official `verif-hash` header comparison with `process.env.FLW_WEBHOOK_HASH` using `crypto.timingSafeEqual`.
  - Fast HTTP 200 acknowledgment within 60 seconds.
- [ ] **Machine-Readable AI Documentation:**
  - Reference links point to `https://developer.flutterwave.com/llms.txt` and `https://developer.flutterwave.com/v4.0.0/llms.txt`.
  - Explain `.md` URL extension convention for clean markdown retrieval.

---

## 3. Local Verification

- [ ] Run `npm run check`.
- [ ] Ensure TypeScript code snippets inside each `SKILL.md` are syntactically valid and contain realistic usage examples.
- [ ] Confirm no dead links or malformed markdown tables across `docs/` and `skills/`.

---

## 4. Skills.sh & Package Registry Deployment

- [ ] Test local and remote installation:
  ```bash
  npx skills add DevMubarak1/Flutterwave
  ```
- [ ] Check installed skills in test environment:
  ```bash
  npx skills list
  ```
- [ ] Publish release to npm:
  ```bash
  npm publish --access public
  ```
- [ ] Create GitHub Release matching the release tag (e.g., `v0.2.0`).
