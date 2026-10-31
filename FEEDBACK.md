# Customer ratings and moderated comments

Customers submit a 1–5 star rating and a comment from **Wallet → Profile & Security**.
Each account has one current review, which it can edit. A nonempty comment is
required, with a 2,000-character limit. Feedback is private when submitted.

Administrators open **Admin → Feedback** to read private reviews and publish or
unpublish selected entries. The public welcome page displays up to six published
reviews without account identifiers, names, email addresses or reviewer attribution.
No public review section or placeholder ratings appear when nothing is published.

The form explains the publication policy and asks users to omit private details.
Review comments before publishing: user-entered text may still include sensitive
information. The application renders comments as plain text, never as HTML.

## Publication and edit races

Admin publication requires the exact `updated_at` version that was reviewed.
A concurrent customer edit causes a conflict rather than publication of unseen
text. A database trigger removes publication whenever rating/comment content
changes. Saving through the customer API always returns the review to private,
even when the content has not changed. Admin can publish it again after review.

The table has RLS enabled and no anonymous/customer database grants. Customers
access only their own entry through the authenticated backend. Admin moderation
uses the existing administrator session/allowlist and write budget. Public reads
use an explicit column projection and a published-only filter.

## Release

1. Apply `supabase/migrations/0030_customer_feedback.sql` through the project's
   normal reviewed migration workflow. It requires the current Better Auth schema
   and is an additive migration; preserve existing application data and keys.
2. Deploy the matching **backend, wallet and admin** releases. The CCNet release
   helper currently covers migrations 0027–0029; it does not apply 0030.
3. Submit a review, confirm it is initially private, then publish/unpublish it in
   Admin. Edit a published review and confirm it becomes private again.

A missing migration produces an unavailable/retry state, never a false save.
The public welcome page omits reviews if its feed cannot be loaded.

## API

| Endpoint | Access | Behavior |
| --- | --- | --- |
| `GET /feedback/mine` | User session | Current account's entry, or null |
| `POST /feedback` | User session | Save `{ rating, comment }`; always private |
| `GET /feedback/public` | Public, under backend request budgets | Latest six published reviews; safe fields only |
| `GET /api/feedback?page=1&status=private` | Admin server session | Ten entries/page; status is all/private/published |
| `POST /api/feedback/:id` | Admin server session | `{ publish, expected }`; exact-version publication/unpublication |

Customer submissions are limited to five per hour per account. Admin feedback
requests use the existing authenticated and write budgets. No feedback endpoint
accepts user-supplied account ownership, publication attribution or HTML markup
as executable content.

## Validation

- Backend/Admin tests cover ownership, authentication, validation, safe public
  projections, pagination, publication and stale-review conflicts.
- `python3 supabase/tests/feedback_test.py` runs a disposable PostgreSQL database
  to verify RLS/grants, constraints, reset triggers and concurrent edit/publication.
- `pnpm test:feedback:browser` in `wallet/` exercises the actual mobile/desktop
  wallet, admin and public UI with intercepted APIs. Start wallet port 5177 and
  admin port 5190 first; Playwright/tool paths can be set as in the wallet README.

Automated tests do not write hosted feedback, send email or charge cards.
