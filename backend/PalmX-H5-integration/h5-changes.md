# CHANGELIST

## v1.3.0 — 2026-09-14

### Features

- **palmreport log contract (aligned across H5 / Android / iOS)**:
  - Final-state trace (success / cancel / failure) is now **always** reported to `/palm/openai/palm/palmreport/logs` (OTLP, `report_source=3`, browser-persistent random `device_sn`). `enableLogReport` no longer gates the trace — it only controls uploading encrypted on-site image / video diagnostic replicas.
  - `enableLogReport` documented in the H5 API reference (previously missing).
- **`create_tmp_obj` migration**: diagnostic replica presigning moved from `/palm/palmreport/create_image` to `/palm/openai/palm/palmreport/create_tmp_obj`, with `AppId` passed in the request body; presigned URLs support both plaintext https and base64 encodings.
- **Flush completion**: all exit paths (success / failure / cancel / token-invalid interceptor) await the trace queue before finishing, so the final trace is not truncated when the host destroys the iframe.

### Fixes

- Desktop browsers with landscape windows no longer cancel acquisition with `ErrUserCancelled (10002)`; orientation invalidation now applies to touch devices only (`pointer: coarse`).
- wasm build: `wasm_post.js` compatible with Emscripten 6 (`--post-js` now appended after `await run()`); ncnn OpenMP forced off on single-threaded WASM builds (duplicate pthread/futex link symbols).

### Docs

- H5 API reference (zh / en) updated to v1.3.0: `enableLogReport`, palmreport log channel in architecture & sequence diagram, orientation behavior, and the new local integration guide (Example dev server same-origin proxies loader / embed / wasm / `/palm/openai/*`; `PALM_API_KEY make dev` issues test tokens locally).

## v1.2.0 — 2026-08-18

### Features

- **`RecognitionData.sessionId`**: from `SearchRgbPalmRsp.SessionId` (temporary search-result lookup credential, ~2h TTL; callers can verify recognition results against the server).
- **`CheckAppQuality`**: recognition (`search_rgb_palm`) and verification (`compare_rgb_palm`) upload requests now send `CheckAppQuality: true`.

### BREAKING CHANGES

- **Removed `Params.baseUrl` / `DEFAULT_BASE_URL`**: aligned with master H5 — Web API host is fixed by the SDK Host deployment (same-origin `/palm/*` / Ingress; `app.*` → `open.*` via `resolveOpenApiOrigin`). Host pages cannot override the endpoint; pass-through of this field was previously ignored at runtime.

### Docs

- Restructured H5 API docs to the unified interface-doc template (aligned with master `docs/` layout); content reflects PalmX Web SDK surface. No mini-program SDK on this line.

## v1.1.0 — 2026-08-16

### Features

- PalmX Web SDK surface:
  - Params: `token`, `userId`, `mode` (REGISTRATION / VERIFICATION / RECOGNITION), `customHeaders`, `palmDirection`, `enableManager` (default `true`), `enableImageOnly` (default `false`)
  - Result: mode payloads + `ImageData.payload` when `enableImageOnly`; codes include `10020`, `10105`, `10302`, optional `traceId`
  - `VerificationData.sessionId`: from `CompareRgbPalmRsp.SessionId` (temporary compare-result lookup credential)
- Manager: direction wired into acquisition; verification hand constrained by registered palms; `get_palm` `10021` → empty palms

## v1.0.0 — 2026-07-20

- Initial PalmX line.
