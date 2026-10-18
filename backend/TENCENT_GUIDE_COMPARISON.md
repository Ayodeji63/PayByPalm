# Pasted Tencent Open API guide comparison

Reviewed the complete guide supplied on 18 October 2026 against the backend
adapter. The public guide also loaded during this review at
https://palm.tencent.com/docs/kyc-api . A link failing in a browser does not mean
the API endpoint has been removed.

| Supplied guide item | Existing implementation / action |
| --- | --- |
| International host; HTTPS POST JSON | Already matches |
| Server-only `Authorization: Bearer <api_key>` | Already matches; no key goes to Pi/browser |
| PascalCase body fields; base64 image data | Already matches the existing RGB endpoints |
| `{code,message,requestId,data}` envelope | Already matches |
| Optional 32-character hexadecimal `X-TraceId` | Added to each outbound call and provider-failure logs |
| `2080010`: normal 1:N no-match | Corrected to return no match, rather than a service error |
| `GetPalm(UserId)` registration query | Already used to verify provider absence after deletion |
| `DeletePalm(UserId,PalmDirectionList)` | Already matches and verifies both hands are absent |
| `CreateSdkUserToken` | Not needed by current server-to-server image calls; no client SDK is currently installed |
| `GetSessionResult(SessionId)` | Requires a result session from an already-completed SDK scan; not an image-upload endpoint |

## What the supplied guide does not specify

The guide does not provide image-registration/comparison/search replacements,
the client capture SDK package or host, how to launch a recognition scan, or how
its SessionId is bound to a terminal sale. It says the SDK comparison happens
before `GetSessionResult`. Sending a JPEG, enrollment-session ID or transaction
ID to that endpoint cannot substitute for the missing SDK scan.

The currently published RGB comparison and search references still document:

- https://palm.tencent.com/docs/palm-api/compare-rgb-palm
- https://palm.tencent.com/docs/palm-api/search-rgb-palm

No RGB endpoints, account-selection rules, payment confirmation or card-charge
logic were replaced by this compatibility update. The documented normal no-match
remains a rejection and never authorizes payment. Tencent request IDs remain in
provider-failure logs together with the new trace IDs; no image or credential is
added to logging.

## SDK migration prerequisite

A complete SDK migration needs the actual SDK host/package and configuration for
this API-key application, plus its capture/recognition and SessionId callback
contract. The separately published enterprise Mobile H5 SDK reference requires
a provider-supplied SDK Host, a numeric enterprise appId and enterprise access
token provisioning; this is not established by the current `app_...` identifier
and `ak_...` key. Do not mix those credential families or guess a loader URL:
https://palm.tencent.com/docs/enterprise/api/mobile-h5

Any future SDK integration must bind a provider-verified result to the expected
user, terminal and sale, enforce our short authorization validity and consume
each result once. Tencent's two-hour result-query retention does not establish
fresh authorization for a sale. A browser callback alone must not authorize a
card charge.

## Current known failures

`2080023` from search is an application-level error. The observed code-999
`PalmAlignGap ... ret=-360` comparison error occurs during alignment. Neither
is a successful response containing a result session. Changing the subsequent
result-query endpoint does not resolve either observed failure.

The supported compatibility changes are covered by mocked provider contract
tests. They do not prove live 1:1/1:N matching succeeds. No palm registration,
deletion or payment request was made during this guide comparison.
