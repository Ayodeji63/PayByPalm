# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

PayByPalm merchants reviewing their own business payments, bank settlements and terminals on phones and computers. Administrators grant and revoke access; merchants do not invite staff in this version.

## Product Purpose

Give merchants a separate reporting app at merchant.paybypalm.app, distinct from the administrator and customer wallet interfaces.

## Capabilities and Constraints

Verified Supabase accounts receive explicit business grants from an administrator. Read-only reports include date and status filters, reference lookup, payment CSV export, payment details, Paystack settlement statuses, terminal contact status and payout account information. Mode follows the main payment backend. All amounts are NGN minor units; dates are presented in Africa/Lagos. Successful card charges do not establish that a bank settlement completed. Provider failures must never appear as zero balances. Merchant accounts cannot create charges, refunds, edit bank destinations, change terminal keys or access another business without a grant.

## Brand Commitments

Inherit PayByPalm’s established blue identity and practical admin typography. Distinguish this app visibly as Merchant workspace.

## Evidence on Hand

admin/DESIGN.md, existing merchant/terminal/payment schemas, Paystack’s official settlement API. Demonstration data belongs only in automated test fixtures, visibly labelled.

## Product Principles

Show business-owned information only. Separate payments from bank settlement. State test/live mode explicitly. Keep tasks usable on mobile and intermittent connections.

## Accessibility

Keyboard operation, semantic tables and forms, visible focus, text-labelled statuses, reduced motion and responsive navigation.
