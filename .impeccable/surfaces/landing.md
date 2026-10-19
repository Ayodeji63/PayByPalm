# Customer welcome page

Target: wallet/src/routes/Landing.tsx and its route-scoped Landing.css.
Mode: Persuade. Existing PayByPalm blue identity and wallet type system retained.
Request: restructure the landing page and remove its dull imagery.

Replace the timed, swipe-driven photo carousel with a stable reading path:
product purpose → create account → illustrative checkout → ordered setup steps
→ card and palm control → a final signup/sign-in choice. The checkout is clearly
labelled illustrative, uses an example naira amount and never initiates a payment.
The public page makes no customer-count, speed, encryption or security guarantees.

Desktop pairs copy and checkout, then uses a three-column ordered setup sequence.
Mobile puts the primary action before the checkout and stacks the setup steps.
All links use existing auth routes and explicit signup/signin state. Authenticated
visitors still follow the existing dashboard redirect. The hero uses a locally served, licensed photograph of a real open palm, with
reserved image dimensions and high fetch priority. The brand retains the shared
PalmIcon. Reduced-motion anchor navigation remains supported. Blue, touch target, focus and typography conventions remain.

Scope excludes authentication, payments, palm matching, Pi terminals and admin.
