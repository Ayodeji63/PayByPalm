---
name: PayByPalm
description: Royal blue, clear financial information, and softly rounded wallet surfaces.
colors:
  accent: "#3b68e8"
  accent-strong: "#2c51c9"
  accent-soft: "#6b8ef0"
  accent-tint: "#eaf0fe"
  accent-deep: "#1e3a8a"
  ink: "#0f1729"
  ink-muted: "#6b7690"
  ink-faint: "#9aa3b8"
  surface: "#ffffff"
  canvas: "#f8fafc"
  hairline: "#e6eaf5"
  danger: "#d92d20"
  danger-tint: "#fdecea"
  warning: "#b25e02"
  warning-tint: "#fef4e6"
  success: "#0f9d58"
  success-tint: "#e6f9f0"
typography:
  balance:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: "36px"
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "24px"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    lineHeight: "24px"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
rounded:
  logo: "12px"
  control: "16px"
  card: "24px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  content: "20px"
  roomy: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0 20px"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 20px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "20px"
  pill-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "6px 16px"
---

# Design System: PayByPalm

## Overview

PayByPalm's incumbent identity combines royal blue, Inter typography, white cards, and a pale cool canvas. Clear amounts, familiar controls, and generous rounding give the customer wallet a calm, approachable financial interface.

This document records the implemented system in `wallet/src/index.css` and `wallet/src/components/ui.tsx`; it does not establish a replacement identity. Product constraints live in `PRODUCT.md`. Landing composition and illustration decisions live in `.impeccable/surfaces/landing.md`.

**Key Characteristics:**
- Royal blue actions and clear ink text.
- Softly rounded white surfaces on a cool canvas.
- Stable financial figures and visible keyboard focus.

## Colors

Primary colors are the accent family above: royal blue for actions, stronger blue for hover, tint for informational surfaces, and deep blue for richer brand areas. Neutral colors separate content, supporting labels, surfaces, and hairlines. Danger, warning, and success pairs express semantic feedback; pair color with text or icons.

**The Source Rule.** Reuse the global CSS variables rather than sampling a route illustration. The welcome route scopes its own blue (`#2851c5`) and deep blue (`#1a3a9e`); these do not replace the global accent. Some existing navigation details also use the darker blue locally.

## Typography

Inter is the shared display and body family, with the system fallback stack recorded above. Body and controls use the body size; field labels and supporting text step down to the label size. Page headers use the title role. Wallet balances use the balance role and tight tracking.

**The Stable Figures Rule.** Use tabular numerals (`font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1`) for naira amounts and other changing figures. Preserve the shared bold Wordmark, including its quieter “By”, and the existing PalmIcon SVG.

## Layout

The shared Screen centers a full-width mobile column capped at 448px with 20px horizontal padding. Spacing usually follows a 4px rhythm. Main controls use a minimum height of 48px. Fixed bottom navigation requires content clearance of `104px + env(safe-area-inset-bottom)`; preserve safe-area insets.

Public landing layouts can expand beyond the wallet column; their container, breakpoint choices, and reading order remain surface decisions. Do not force a marketing grid onto transaction screens.

## Elevation & Depth

White surfaces, fine hairlines, and blue tints provide most separation. Shared Cards have a border and no default shadow. Bottom navigation uses a restrained upward shadow (`0 -4px 16px rgba(0,0,0,0.05)`); modal sheets use stronger elevation and a dimmed backdrop. The wallet balance card retains its existing blue gradient rather than applying a gradient to every card.

Shared entrance and press motions are short; the common spring-like easing is `cubic-bezier(0.32, 0.72, 0, 1)`. Preserve reduced-motion handling. The welcome route also disables smooth anchor scrolling for that preference.

## Shapes

Cards use the card radius; buttons and fields use the control radius. Pills and quick actions are circular or fully rounded. The logo tile uses its smaller radius. The welcome hero photograph's 16px frame is route-specific and does not redefine shared Cards.

## Components

Primary buttons use the accent, white semibold text, and a stronger hover. Secondary buttons use a white surface and hairline border. Existing ghost and danger variants retain their semantic roles. Loading and disabled buttons preserve understandable state feedback.

Fields have persistent labels, hairline borders, accent focus treatment, and a danger border with textual errors. Pills use a filled accent when selected and a bordered neutral surface otherwise. Shared Cards provide a simple padded container. Navigation retains five destinations and the raised central scan action. Brand assets are the existing PalmIcon and Wordmark, not a recreated mark.

The sidecar contains seven standalone HTML/CSS previews extracted from these shared primitives. Previews illustrate appearance and states; application routing, form handling, and payment behavior remain in the source components.

## Do's and Don'ts

- Do reuse global color variables and shared UI primitives.
- Do preserve visible keyboard focus, readable labels, and comfortable touch targets.
- Do keep financial figures stable with tabular numerals.
- Don't promote route-specific illustration colors, radii, or composition into global rules.
- Don't communicate financial or biometric status through color alone.
- Don't replace the existing PalmIcon or Wordmark during a surface refinement.
