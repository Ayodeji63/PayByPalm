# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

PayByPalm serves wallet customers who need to manage money and pay quickly, including people using a phone in everyday, on-the-go settings. A separate merchant-facing terminal exists, but it is outside the customer-wallet redesign scope.

## Product Purpose

The wallet lets customers create and secure an account, manage linked cards, understand that bank balances must be checked in their bank app, review transactions and receipts, and enrol or unlink a palm for terminal payments. Success means customers can understand their money at a glance and complete common actions confidently without needing a card or phone at the point of sale after enrolment.

## Positioning

PayByPalm joins an ordinary mobile wallet to a one-time palm-enrolment flow and a separate merchant terminal. The customer controls the wallet and consent on their phone; the terminal captures the palm; the backend alone communicates with the biometric provider.

## Operating Context

- Customers use the wallet primarily on mobile web, often for short balance checks and quick money actions.
- Palm enrolment begins with a single-use QR session created by a merchant terminal.
- Authentication, wallet management, card linking, top-up, activity, receipts, profile/security, consent and palm enrolment are parts of one customer journey.
- The production frontend deploys to Vercel and communicates with the Render API and Supabase-backed services.

## Capabilities and Constraints

- Existing routes and working financial, authentication, card, transaction and palm-enrolment behavior must remain functional during redesign.
- Monetary values use Nigerian naira and require clear, stable numeric presentation.
- Palm images and provider credentials must not be exposed or persisted by the frontend.
- The application must remain mobile-first, touch-friendly, responsive and installable as a PWA.
- Loading, empty, offline, authentication, permission, error and success states are material product states.
- The Raspberry Pi terminal UI is explicitly outside the current wallet-redesign scope.

## Brand Commitments

- Product name: PayByPalm.
- The product must communicate trust, control and speed without overstating biometric security or implying that real banking rails are already integrated.
- Existing supplied screenshots and assets are evidence of the current product, not a binding visual system for the redesign.

## Evidence on Hand

- Working customer-wallet source under `wallet/src/`.
- Existing screen references under `designs/`.
- Product and architecture documentation in `README.md`, `FRONTEND_DOCUMENTATION.md` and component-level source comments.
- No testimonials, customer counts, performance benchmarks or commercial claims are available and none should be invented.

## Product Principles

- Make the default payment card, direct card charges and transaction status immediately understandable.
- Keep biometric consent and security boundaries explicit rather than decorative.
- Prioritize repeat daily actions while keeping infrequent setup tasks findable.
- Preserve customer control: no debit occurs without explicit confirmation.
- Design for real mobile constraints, intermittent networks and large touch targets.

## Accessibility & Inclusion

The wallet must support keyboard focus, readable contrast, semantic status feedback, minimum 44–48px touch targets and layouts that remain usable with text enlargement. Important states cannot be communicated by colour alone.
