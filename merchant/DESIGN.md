---
name: PayByPalm Merchant workspace
description: The established PayByPalm blue identity for read-only business payment and settlement reporting.
colors:
  primary: "#2454ce"
  primary-hover: "#173e9f"
  primary-soft: "#edf2ff"
  canvas: "#f5f7fb"
  surface: "#fff"
  ink: "#14213a"
  muted: "#58677e"
  line: "#e2e7f0"
  field-line: "#cbd5e4"
  control-line: "#d7dfeb"
  focus: "#84a8ff"
  success-ink: "#24653d"
  success-soft: "#eaf7ef"
  warning-ink: "#875b10"
  warning-soft: "#fff5df"
  danger-ink: "#a12a25"
  danger-soft: "#ffedeb"
  neutral-soft: "#eef1f6"
typography:
  headline:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "29px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "14px"
    fontWeight: 400
  field-label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "13px"
    fontWeight: 550
  table:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "12px"
  metric:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "26px"
    fontWeight: 650
    letterSpacing: "-0.025em"
  badge:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "10px"
    fontWeight: 600
rounded:
  badge: "5px"
  range: "6px"
  field: "7px"
  control: "8px"
  panel: "12px"
  dialog: "14px"
spacing:
  compact: "8px"
  control-gap: "10px"
  group-gap: "12px"
  section: "20px"
  panel: "23px"
  main: "34px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "11px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "11px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
  nav-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.control}"
    padding: "13px 12px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "23px"
  payout-panel:
    backgroundColor: "{colors.primary-soft}"
    rounded: "{rounded.panel}"
    padding: "24px"
  badge-green:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success-ink}"
    rounded: "{rounded.badge}"
    padding: "5px 8px"
  badge-amber:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning-ink}"
    rounded: "{rounded.badge}"
    padding: "5px 8px"
  badge-red:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger-ink}"
    rounded: "{rounded.badge}"
    padding: "5px 8px"
  badge-neutral:
    backgroundColor: "{colors.neutral-soft}"
    textColor: "{colors.muted}"
    rounded: "{rounded.badge}"
    padding: "5px 8px"
---

# Design System: PayByPalm Merchant workspace

<!-- BUILT: extracted from the completed merchant application; fixture values are not design truth. -->

## Overview

**Creative North Star: "PayByPalm merchant workspace"**

The merchant app inherits the established PayByPalm blue identity: white work surfaces, navy text, restrained borders and tabular financial amounts. Compact controls and labelled statuses support reviewing business records, with a visibly separate Merchant workspace identity.

This is the built system, extracted from src/style.css, src/main.tsx and src/icons.tsx and checked against the desktop and mobile browser captures. The parent identity authority is ../admin/DESIGN.md; merchant-specific dimensions and states below describe this implementation. The operational overview and reconciliation rail belong to the surface contract in index.html, rather than defining every future screen.

**Key Characteristics:**

- PayByPalm blue actions and pale blue selections.
- White bordered surfaces on a cool neutral canvas.
- Compact sans typography and aligned financial amounts.
- Responsive navigation, semantic tables and explicit status words.

## Colors

One royal blue accent organizes the inherited cool operational palette. Frontmatter is the normative token source; semantic colors communicate state.

### Primary

- **PayByPalm blue** (`primary`): main actions, links, selected labels, chart line and the leading received-payment metric. `primary-hover` deepens primary buttons.
- **Pale blue** (`primary-soft`): selected navigation, chart area, workspace mark and payout context.

### Neutral

- **Cool canvas** (`canvas`) and **white work surface** (`surface`): page background, panels, sidebar, topbar and fields.
- **Deep ink** (`ink`) and **muted slate** (`muted`): primary records and supporting labels, dates and hints.
- **Quiet dividers** (`line`), **field stroke** (`field-line`) and **control stroke** (`control-line`): row, panel and control boundaries.
- **Focus blue** (`focus`): visible keyboard outlines.
- **Neutral soft** (`neutral-soft`): cancelled, unknown and enabled/disabled terminal access badges as currently implemented.

Green ink and soft fill report Paid, Paid out and configured payout accounts. Amber reports Processing, Pending, setup needed and test-mode text. Red reports failed payments. Informational notices use a blue tint; errors use a pale red tint and explanatory copy. Live/test mode uses a small dot plus a visible text label.

**The Worded State Rule.** Pair semantic color with a status word or explanatory message; color alone never states the payment outcome, payout state or environment.

## Typography

**Heading and Body Font:** the Inter/platform sans stack in frontmatter. No remote font file is supplied; platform fallback is expected. There is no separate display or monospace family in the merchant implementation.

Page headlines and panel titles use the documented roles. Body paragraphs use line height (1.7); supporting page descriptions use (13px). Tables use compact text, with headers and secondary record dates at (10px). Form labels use (13px), weight (550); buttons use (13px), weight (600). Status badges use the badge role. Desktop financial metrics use the metric role, with (22px) at the intermediate layout and (23px) on mobile. Page headings become (25px) on mobile.

Summary amounts and numeric table columns use tabular numerals; financial columns align right and avoid wrapping. Detail amounts use (32px), weight (650). The larger login introduction uses a local clamp (36px, 4vw, 58px), weight (650), line height (1.2) and tracking (-0.035em); it is not the operational headline scale.

## Layout

The desktop shell has a fixed sidebar (236px), white topbar (66px), and centered main content up to (1550px) with (34px) padding. Five destinations remain explicit: Overview, Payments, Settlements, Terminals and Business settings. The business selector sits above navigation. The account and sign-out controls occupy the sidebar footer.

The built overview uses a four-part summary strip followed by a flexible primary column and payout/terminal rail (285px), separated by (23px). At widths from (1600px), the rail becomes (320px). Summary cells share one bordered container rather than separate elevated tiles. Business details and payout account use a two-column grid with (24px) gap. Tables own their header and row padding inside unpadded ledger panels.

At widths up to (1200px), the sidebar narrows to (215px), main padding becomes (28px 24px), overview rail becomes (250px), and its gap becomes (18px). Up to (1000px), the overview becomes one column, the rail becomes a two-column row, summary metrics use two columns, filters stack, and business settings use one column.

Up to (720px), the sidebar becomes a static header with business selection and a horizontally scrollable navigation row. Navigation links keep icons and text; each has minimum width (74px) and text size (11px). Account/sidebar guidance is hidden and sign-out appears in the topbar. Main padding becomes (24px 18px), headings and actions stack, date controls share available width, and the rail stacks vertically below the primary content. Tables keep a minimum width (570px) inside a local horizontal scroller. Interactive buttons, range controls and icon actions have minimum height (44px); icon actions also have minimum width (44px).

The login splits into a pale blue introduction and white form on desktop. The form is at most (370px) wide. On mobile the introduction becomes a compact brand header; the form allows up to (420px). Login inputs and submit button have minimum height (46px).

## Elevation & Depth

The workspace uses flat tonal layering, one-pixel borders and spacing. Panels, navigation, summary and payout surfaces have no shadows. The payment detail modal is the exception: shadow (`0 18px 70px #14213a35`) and a dark translucent backdrop (`#14213a65`) identify its temporary layer. Keyboard focus uses a three-pixel outline with three-pixel offset; it is an interaction signal rather than elevation.

## Shapes

Use the frontmatter radius roles: small status rectangles, gently rounded fields and controls, broader panel corners, and a slightly rounder modal. Mobile navigation has top-rounded corners (7px 7px 0 0). The small environment dot and loading spinner are circular. Icons use outline SVG geometry in a (24 × 24) viewBox, stroke width (1.7), with round caps and joins; ordinary controls use icons around (16–22px).

## Components

### Buttons and inputs

Primary blue buttons carry white text; secondary white buttons use dark ink and a cool border, tinting on hover. Both share control corners, minimum height (42px) and padding (11px 16px); compact variants use minimum height (36px) before the mobile touch-target override. Icon buttons tint pale blue on hover. Disabled buttons retain their label, use opacity (0.55) and a wait cursor. Busy labels include Signing in… and Exporting…; no pressed-state transform or decorative transition is implemented.

White, bordered inputs and native selects use field corners, minimum height (42px), padding (10px 12px) and explicit labels. Login fields expose browser autocomplete. Date-range shortcuts use a muted segmented background with a white selected segment and blue text; explicit From/To inputs apply through a labelled submit button. Payment lookup pairs status selection with an exact-reference field.

### Navigation and containers

Default navigation uses muted text, pale blue active fill and stronger blue active text. Hover uses the canvas tone. Current destinations expose `aria-current="page"`. The skip link appears on focus and targets the main content. Main panels use white fill, quiet border and padding (23px), becoming (20px) on mobile. Ledger panels use an unpadded scroller and independently padded heading. The payout rail uses a pale blue fill, explicit account setup state, masked account ending and a View settlements action.

### Financial records and chart

**The Separate Money States Rule.** Keep payment receipt and bank settlement explicitly separate in labels, summaries and detail views.

Payment `settled` displays as **Paid**; provider settlement `success` displays as **Paid out**. The summary labels received money as successful card charges and excludes failed attempts. Settlement tables identify Paystack as their source, use the provider effective amount for the payout column, and explain that bank posting can take additional time. Payout setup is not itself a settlement amount. Money is formatted as NGN with two decimals from minor units. Record timestamps use Africa/Lagos; the footer exposes the update time and timezone. Terminal views show access and last contact separately.

The daily-payment SVG has a blue line, pale area fill, quiet horizontal guides and a labelled image role. Mouse movement reveals the nearest daily value; an expandable semantic table exposes the daily values for keyboard and touch access. Payment table rows lead with a shortened reference and timestamp, then terminal, worded status, right-aligned amount and a labelled detail action. The full reference remains available in the native modal.

### Detail dialog, states and accessibility

Payment details use a native modal dialog labelled by its visible heading. `showModal()` supplies modal keyboard behavior; explicit close buttons and the native close event keep application state in sync. Content scrolls within maximum height (90dvh), maximum width (viewport minus 32px), and a nominal width (460px). Long reference and business values may wrap. The detail view repeats the payment/settlement distinction and exposes the record environment.

Loading is text-labelled with a status role. The spinner rotates linearly every (0.8s); reduced-motion preference disables animations and transitions. Empty payment, settlement and terminal states explain the missing records or setup and suggest the relevant next step. Errors expose an alert with Try again; unavailable payout data stays explicitly unavailable. Informational notices expose a status role. Refresh and payment export keep their action labels; export is scoped to the selected business and filters. The app refreshes visible records on focus and every (30 seconds). Test mode includes an explicit simulated-money notice; browser-fixture banners and data remain test evidence.

## Do's and Don'ts

### Do:

- Do keep PayByPalm blue, white surfaces and the cool neutral canvas.
- Do label controls, preserve visible focus and keep the skip link available to keyboard users.
- Do keep payments, provider settlement and terminal contact as distinct facts.
- Do format money as NGN with two decimals and present record dates in Africa/Lagos.
- Do preserve table columns in a horizontal scroll region on small screens.
- Do show unavailable, loading and error states with explanatory text.

### Don't:

- Don't treat a paid card payment as a completed bank settlement.
- Don't replace provider errors with zero balances or empty-success reports.
- Don't interpret a last-contact timestamp as a live online status.
- Don't turn read-only business or payout information into editing controls.
- Don't promote browser fixture records or their demonstration banner into production design content.
