# Country and Payment Rail Coverage Guide

Flutterwave provides payment acceptance and payout capabilities across 30+ African countries, as well as global cross-border corridors in North America, Europe, and Asia.

This document details the primary rail mixes, local payment methods, and regulatory requirements by key markets.

---

## African Regional Markets & Payment Rails

| Country | Code | Currency | Supported Collection Rails | Payout Rails | Key Local Insights |
| --- | --- | --- | --- | --- | --- |
| **Nigeria** | `NG` | `NGN` | Mastercard, Visa, Verve, NIP Bank Transfer, Pay with Bank, USSD, OPay, Virtual Accounts | NIP Instant Bank Payouts, Wallets | Cards require 3DS/OTP. USSD and Bank Transfers are high-converting alternatives. |
| **Kenya** | `KE` | `KES` | M-Pesa (STK Push), Airtel Money, Mastercard, Visa | M-Pesa Payouts, Bank Transfers | M-Pesa is dominant (>80% market share). Collect phone numbers in E.164 (`+254...`). |
| **Ghana** | `GH` | `GHS` | MTN MoMo, Telecel Cash (Vodafone), AirtelTigo, Cards | Mobile Money Payouts, Bank Transfers | Prompt user for their mobile money network provider (voucher code required for Vodafone/Telecel). |
| **South Africa** | `ZA` | `ZAR` | Visa, Mastercard, EFT Secure (Ozow), 1Voucher | Bank Account Payouts (EFT) | Strong card adoption with strict 3DS requirements. EFT provides immediate clearing. |
| **Uganda** | `UG` | `UGX` | MTN MoMo, Airtel Money, Cards | Mobile Money Payouts, Bank Transfers | High mobile money penetration. |
| **Rwanda** | `RW` | `RWF` | MTN MoMo, Airtel Money, Cards | Mobile Money Payouts, Bank Transfers | E-commerce rapidly adopting mobile money push authorizations. |
| **Côte d'Ivoire** | `CI` | `XOF` | Orange Money, MTN MoMo, Wave, Moov | Mobile Money Payouts | Francophone West Africa hub. Support for French language prompts and regional wallets. |
| **Senegal** | `SN` | `XOF` | Wave, Orange Money, Free Money | Mobile Money Payouts | Wave and Orange Money dominate consumer retail transactions. |
| **Cameroon** | `CM` | `XAF` | MTN MoMo, Orange Money | Mobile Money Payouts | Central African CFA franc zone. |
| **Tanzania** | `TZ` | `TZS` | M-Pesa, Tigo Pesa, Airtel Money, Halopesa | Mobile Money Payouts | Multi-operator mobile money landscape. |
| **Egypt** | `EG` | `EGP` | Fawry, Meeza, Cards | Local Bank Accounts | Fawry cash code and national Meeza debit card rails. |

---

## Global & Cross-Border Corridors

- **United States (`USD`) / Europe (`EUR`) / United Kingdom (`GBP`):**
  - Collection: International credit/debit cards, Apple Pay, Google Pay.
  - Payouts: Wire transfers, ACH, SEPA, and stablecoin liquidity corridors (facilitating real-time corporate treasury settlements).
- **Asia-Africa Trade Corridors:**
  - Commercial merchant clearing connecting Asian suppliers with African buyers via multi-currency virtual accounts and stablecoin rails.

---

## Core Engineering Rules for Multi-Country Rollout

1. **Dynamic Rail Filtering:** Filter payment methods based on customer billing country and transaction currency (do not offer M-Pesa for `NGN` or Verve cards for `KES`).
2. **Phone Number Standardization:** Normalize phone numbers to international E.164 format (e.g. `+254712345678` or `254712345678` depending on rail requirement) before initiating mobile money pushes.
3. **Currency Precision:**
   - Flutterwave APIs process standard major unit amounts with decimals (e.g., `5000.50` NGN).
   - If your application internally uses minor integer units (kobo/cents), always format to decimal strings/numbers when calling the Flutterwave API.
4. **Fallback Chaining:**
   - Direct Cards declined -> Offer Bank Transfer or Mobile Money.
   - Dynamic USSD for users with feature phones or unstable data connections.
