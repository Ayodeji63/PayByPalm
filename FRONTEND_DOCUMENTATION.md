# PayByPalm — Frontend Engineering Documentation & Hand-off

**Project:** PayByPalm (Biometric Palm Authentication & Tokenized Wallet)  
**Author:** Raji Mubarak (Software Dev / Frontend Lead)  
**Recipient / Partner:** Olusanya Ayodeji (Hardware & Backend Lead)  
**Branch:** `software`  
**Repository:** `Ayodeji63/PayByPalm`  
**Date:** September 11, 2026  

---

## 1. Executive Summary

This document serves as the complete technical hand-off of the **PayByPalm Frontend Ecosystem** developed by Raji Mubarak. 

The frontend covers the three primary surfaces outlined in the Master Development Plan:
1. **User Client PWA (`/`, `/dashboard`, `/cards`, `/activity`, `/profile`)**: High-performance, mobile-first Google/Apple Wallet paradigm with tokenized Nigerian bank cards, palm biometrics consent/enrollment, P2P & Interbank transfers, and biometric QR receiving.
2. **Merchant Portal (`/merchant`)**: A mobile-optimized merchant dashboard matching the PayByPalm royal blue client design system, featuring live revenue tracking, POS kiosk hardware telemetry, instant test sale simulations, transaction filters, CSV export, and T+1 Paystack settlement.
3. **POS Terminal UI (`/terminal`)**: Interactive cashier checkout and palm scanner preview with centered hand guides and step-up confirmation states.

---

## 2. Technology Stack & Key Architectural Patterns

- **Core Framework**: React 19 + TypeScript (strict mode with `noUncheckedIndexedAccess`).
- **Styling**: Tailwind CSS + Custom CSS micro-animations.
- **Build Tool**: Vite 6 (production bundle builds in under 10 seconds, zero warnings).
- **Icons & Graphics**: Custom SVG library + PayByPalm Biometric Palm emblem and scanner brackets.
- **Portaling Pattern**: Extensive use of `createPortal(..., document.body)` with `z-[100]` for dropdown menus, action sheets, transfer modals, and transaction receipts. This prevents CSS `transform` stacking contexts on page transition wrappers from trapping fixed elements beneath the bottom navigation bar.
- **Touch Interception**: Strict `touchAction: 'none'` configured on stacked card swipe areas so vertical gestures switch cards without browser page-scroll collisions.
- **State Management & Offline Storage**:
  - `cardStore.ts`: Tokenized card-on-file store managing linked cards, balance mutations, lock/pause states, and active default card tracking in `localStorage`.
  - `auth.ts`: Authentication session, consent status, and biometric enrollment flags.
  - `money.ts`: Nigerian Naira (`₦`) banking-grade formatting with whole number and kobo fractional splitting.

---

## 3. Surface 1: User Client Wallet PWA

### 3.1 Stacked Card Deck (Google / Apple Wallet Paradigm)
- **Concept**: Moves away from the flawed "stored-value digital wallet" model to a real **Tokenized Card-on-File infrastructure** linked to palm biometrics.
- **Bank Cards Supported**: Pre-configured cards for **GTBank** (Mastercard), **Zenith Bank** (Visa), **Kuda Microfinance Bank** (Verve), and **Access Bank**.
- **Interactive Gestures**:
  - Cards are stacked with three-dimensional depth (`scale`, `translateY`, `opacity`, and `zIndex`).
  - Vertical swipe-up or card-tap cycles the rear cards forward.
  - Dot pagination indicator with quick tap-to-switch.
- **Auto-Default Assignment**: Whichever card is brought to the front automatically receives the **`● DEFAULT PALM`** badge (`isDefault={isFront}`) and synchronizes via `cardStore.setDefaultCard(activeCard.id)`. Any palm payment at a kiosk automatically debits this front-facing card.

### 3.2 Header & Contextual Menu
- **Fintech Gradient**: Radiant royal blue gradient (`radial-gradient(ellipse at 20% 0%, #2563eb 0%, #1d4ed8 45%, #0f2468 100%)`) with frosted glass action buttons.
- **Dynamic Greeting**: Time-of-day greeting ("Good Morning / Afternoon / Evening Mubarak").
- **Available Balance**: Superscript kobo presentation (`₦ 250,000.00`) with visibility toggle eye icon.
- **3-Dots (`⋮`) Menu**: Dynamically anchored popover portaled to `document.body` at `z-[100]`. Includes upward arrow notch, backdrop dismiss, and options to manage cards, view palm status, open security settings, or lock/pause the active card.

### 3.3 Interactive Send Money Flow
- **Tabs**:
  1. **Palm User (P2P)**: Input phone number or `@handle` with 1-tap quick contact chips (Amina Bello, Tunde Adeleke, Chidi Okonkwo).
  2. **Bank Transfer**: Select from 8 commercial Nigerian banks (GTBank, Access, Zenith, Kuda, OPay, PalmPay, First Bank, UBA). Entering 10 digits triggers an automatic account name lookup (**David A. Adeleke (Verified)**).
- **Balance Validation**: Source card selector, quick increment chips (`+₦1,000` to `+₦20,000`), real-time insufficient funds validation, and optional memo field.
- **Settlement & Receipt**: Automatically deducts balance via `deductCardBalance`, prepends a debit record with palm badge to history, and presents a full **Transfer Receipt**.

### 3.4 Interactive Receive Money Flow
- **Biometric QR Code**: High-contrast QR matrix with central PayByPalm palm emblem.
- **PayByPalm ID**: Monospace phone ID with 1-tap copy button (`Copied! ✓`).
- **Settlement Destination**: Shows the exact linked bank card receiving inbound transfers.
- **Instructions**: Guidelines for kiosk proximity payments and student-to-student transfers.

### 3.5 High-Visibility Transaction Details Sheet
- Portaled to `document.body` at `z-[100]` with full-viewport dimmed backdrop.
- **Zero Glyph Collision**: Explicit non-breaking spacing (`{isCredit ? '+' : '−'}&nbsp;{formatNaira(...)}`) prevents the minus sign from clipping through the Naira symbol crossbars (`− ₦250.00`).
- High-contrast metadata badges: `● Settled` (emerald), `Palm Biometric · score 98` (blue), and interactive "Dispute this payment" action.

---

## 4. Surface 2: Merchant Portal (`/merchant`)

The merchant portal has been fully redesigned to follow the exact same visual identity and royal blue design system as the client wallet.

### 4.1 Home Dashboard & Royal Blue Upper Deck
- **Store Title Row**:
  - PayByPalm squircle logo with a live pulsing green online dot.
  - Store identity: `MERCHANT PORTAL` / `Campus Mart #01`.
  - **Quick Wallet Return**: Frosted glass `← Personal` button and wallet icon button that route immediately back to the client dashboard (`/dashboard`).
- **Frosted Glass Revenue Card**:
  - Translucent card (`bg-white/15 border border-white/25 backdrop-blur-md`).
  - Today's revenue display with hide/show toggle.
  - `+12% vs. yesterday` badge.
  - Metrics row: Total Sales counter, Net Revenue, and emerald sparkline chart.
- **4 Quick Action Cards**:
  - Pristine white cards with blue icons and drop shadows: **POS Kiosk**, **Simulate Sale**, **Settlement**, and **Export CSV**.

### 4.2 Curved Sheet Cover Transition ("The Space Between")
- Replaced the abrupt horizontal cut between the blue upper deck and the white lower panel with an elevated curved cover sheet (`rounded-t-[36px] -mt-6`).
- Includes a centered metallic/frosted grab handle pill (`h-1.5 w-12 bg-slate-300 rounded-full`) creating a layered mobile card transition.

### 4.3 Hardware Telemetry & Remote Actions
- Live hardware status card displaying **Kiosk #01** (Main Counter POS) and **Kiosk #02** (Express Lane POS).
- Metrics: Hardware model (Raspberry Pi 5 / Wide Cam v3), uptime (`99%`), and last heartbeat ping (`2s ago`).
- Interactive remote controls:
  - **Open Terminal**: Navigates to `/terminal`.
  - **Restart Kiosk**: Triggers a live reboot simulation (switches state to `rebooting`, sends reboot signal, and comes back online after 1.6s).
  - **View Logs**: Verifies zero hardware faults in 24h.

### 4.4 Payment Simulation Engine
- Dedicated subscreen enabling testing of palm payments without physical hardware.
- Selectable quick amounts: `₦1,000`, `₦2,500`, `₦5,000`, `₦10,000`.
- Tapping **Simulate Payment** randomly selects a student customer, creates an instant transaction record with a 98% biometric match score, credits the merchant's revenue balance in real time, and triggers a success toast.

### 4.5 Multi-Filter Transactions Ledger
- Search bar filtering by customer name, transaction ID, or terminal label.
- Category chips: `All`, `Palm`, `Card`, `Refunds`.
- Tapping any row opens a portaled **Transaction Details Sheet** with customer name, timestamp, biometric match score, kiosk label, 1.5% processing fee split, and a **Download Receipt** button.

### 4.6 T+1 Custodial-Free Settlement
- Expected daily settlement balance with payout date.
- Commercial bank linkage card: `Wema Bank PLC •••• 1234 (Linked ✓)`.
- Financial breakdown: 98.5% Net Settlement vs. 1.5% Paystack processing fee.
- Dedicated **"Switch to Personal Wallet"** return card.

### 4.7 Polished Bottom Navigation Bar
- Continuous `bg-white` canvas extending beneath the fixed navbar (zero dead-zone gaps).
- Raised floating circular center button (`relative -top-5`, `h-13 w-13`, `bg-[#1d4ed8]`, `ring-4 ring-white`) with the palm scanner bracket emblem. Tapping it opens the POS Terminal scanner.
- 5 items: **Home**, **History** (Transactions), **Floating POS Scanner**, **Kiosks**, and **Settlement**.

---

## 5. Surface 3: Terminal UI (`/terminal`)

- **Cashier Checkout**: Merchant enters the sale amount (`₦500`, `₦2,500`, etc.).
- **Customer Palm Preview**: Displays real-time camera feed overlay with palm alignment guide and proximity feedback.
- **Biometric Matching & Step-Up**: Simulates 1:N palm matching against enrolled embeddings; shows green authorized checkmark or requests step-up PIN for transactions above `₦20,000`.

---

## 6. Integration Contract Points for Ayodeji (Backend & Hardware)

Here are the specific interfaces and endpoints ready for backend wiring:

### 6.1 Card Tokenization & Vault (Paystack)
- **Frontend File**: `wallet/src/lib/cardStore.ts` & `wallet/src/routes/Cards.tsx`
- **What Frontend Sends**: Card token received from Paystack inline popup / mobile SDK.
- **What Frontend Expects Back**: Masked card details (`bank`, `last4`, `expiry`, `scheme`, `tokenizedId`).
- **Endpoint**: `POST /api/cards/tokenize`

### 6.2 Biometric Enrollment (Palm Linking)
- **Frontend File**: `wallet/src/routes/Scan.tsx` & `wallet/src/routes/Consent.tsx`
- **What Frontend Sends**: User ID + consent timestamp + 512-dim palm embedding vector (or captured frame from camera).
- **What Frontend Expects Back**: Palm enrollment confirmation (`palmLinked: true`, `templateId`).
- **Endpoint**: `POST /api/palm/enroll`

### 6.3 1:N Palm Payment Authorization (Terminal)
- **Frontend File**: `wallet/src/routes/TerminalApp.tsx`
- **What Frontend Sends**: Terminal ID + sale amount (in kobo) + live palm probe embedding.
- **What Frontend Expects Back**:
  - `status: "APPROVED" | "DECLINED" | "STEP_UP_REQUIRED"`
  - `customerName`: Masked customer name (e.g., `Adewale B.`)
  - `matchedCard`: Debited card details (`GTBank •••• 1042`)
  - `matchScore`: Similarity score (0–100)
- **Endpoint**: `POST /api/terminal/charge`

### 6.4 Terminal Telemetry & Config Sync
- **Frontend File**: `wallet/src/routes/MerchantDashboard.tsx`
- **What Frontend Expects**: Kiosk status array (`id`, `name`, `status`, `uptime`, `hardware`, `lastSeen`, `configVersion`).
- **Endpoints**:
  - `GET /api/merchant/kiosks`
  - `POST /api/merchant/kiosks/:id/reboot`
  - `GET /api/merchant/settlement/summary`

---

## 7. How to Run and Verify

```bash
# Navigate to wallet directory
cd wallet

# Install dependencies (if fresh clone)
npm install

# Run Vite dev server (host on 0.0.0.0 for mobile network testing)
npm run dev

# Run TypeScript check & Production build
npm run build
```

- **Local URL**: `http://localhost:5173/`
- **Merchant Portal**: `http://localhost:5173/merchant`
- **Terminal View**: `http://localhost:5173/terminal`

---

## 8. Git Commit Log on `software` Branch

- `d6e3b20` — `feat(merchant): align merchant dashboard with client royal blue theme, add curved sheet cover, floating center bottom nav, and wallet return navigation`
- `7bb2081` — `feat(merchant): redesign mobile merchant area matching client design language with interactive sales, kiosks monitor, settlement and CSV export`
- `1ee7fbd` — `style(wallet): enhance transaction sheet visibility, contrast, and sign spacing`
- `74eb84c` — `fix(wallet): portal Sheet to root at z-[100] above BottomNav and separate negative sign from currency symbol`
- `3e62f01` — `feat(wallet): implement Google Wallet style stacked cards with dynamic front-card default debit selection`

*All changes are staged, committed, and pushed to `origin/software`.*
