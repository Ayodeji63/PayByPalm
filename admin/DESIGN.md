---
name: PayByPalm Administration
description: The established PayByPalm blue identity for clear merchant and terminal operations.
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
  danger-ink: "#a12a25"
  danger-soft: "#ffedeb"
typography:
  headline:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  body:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
    fontWeight: 400
  field:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "13px"
  label:
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12px"
    fontWeight: 550
  identifier:
    fontFamily: "ui-monospace, monospace"
    fontSize: "12px"
rounded:
  badge: "5px"
  field: "7px"
  control: "8px"
  panel: "12px"
spacing:
  compact: "8px"
  control-gap: "10px"
  group-gap: "12px"
  section: "20px"
  panel: "25px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "11px 17px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "#273d61"
    rounded: "{rounded.control}"
    padding: "11px 17px"
  button-destructive:
    backgroundColor: "#fff5f4"
    textColor: "#a32424"
    rounded: "{rounded.control}"
    padding: "11px 17px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "12px 13px"
  badge-neutral:
    backgroundColor: "#f0f3f8"
    textColor: "#52617b"
    rounded: "{rounded.badge}"
    padding: "5px 8px"
  badge-blue:
    backgroundColor: "{colors.primary-soft}"
    textColor: "#234eae"
    rounded: "{rounded.badge}"
    padding: "5px 8px"
  badge-green:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success-ink}"
    rounded: "{rounded.badge}"
    padding: "5px 8px"
  badge-red:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger-ink}"
    rounded: "{rounded.badge}"
    padding: "5px 8px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
---

# Design System: PayByPalm Administration

## Overview

**Creative North Star: "PayByPalm administration"**

The established PayByPalm blue identity carries a clean, restrained operational interface. White work surfaces sit on a cool neutral canvas; blue identifies actions and navigation, while content and status words carry the information.

Density supports scanning and editing merchant and terminal records. Compact supporting text accompanies stronger page and panel headings, gently rounded controls and consistent outline icons. This records the completed application, merging the provisional design direction with the implemented CSS; the current surface composition remains in `.impeccable/surfaces/admin.md`. Source: [`src/style.css`](src/style.css) (root tokens, headings, shell, controls and media queries), [`src/main.tsx`](src/main.tsx) (Button, Field, Badge and workspace markup), and [`src/icons.tsx`](src/icons.tsx) (SVG geometry).

**Key Characteristics:**

- Royal blue actions and pale blue active states.
- White, bordered work surfaces on a cool neutral canvas.
- Compact UI typography with explicit labels and readable status words.
- Full-page forms, visible focus and responsive inventory tables.

## Colors

One royal blue accent organizes a cool, neutral operational palette. Frontmatter is the normative value source; semantic colors indicate state rather than introduce another brand accent.

### Primary

- **PayByPalm blue** (`primary`): main actions, links and icon accents; `primary-hover` deepens button hover.
- **Pale blue** (`primary-soft`): active navigation, contextual setup and blue badges.

### Neutral

- **Cool canvas** (`canvas`) and **white work surface** (`surface`): page background and panels, sidebar, topbar and fields.
- **Deep ink** (`ink`): primary content. **Muted slate** (`muted`): supporting copy, timestamps and identifiers.
- **Quiet dividers** (`line`), **field stroke** (`field-line`) and **control stroke** (`control-line`): separate rows, fields and secondary controls.
- **Focus blue** (`focus`): visible keyboard outlines.

### Named Rules

**The Action and Selection Rule.** Use blue for actions, selected navigation and contextual guidance; use named semantic treatments for success and danger.

**The Worded State Rule.** Pair semantic color with an explicit status word or explanatory message. Color alone does not state device access or request outcome.

Success uses green text on a pale green fill; disabled access and errors use red text on a pale red fill. Notices also have distinct informational, warning and success treatments. Their text explains the actual outcome.

## Typography

**Heading and Body Font:** Inter when installed locally, followed by the platform sans stack in the frontmatter. The application supplies no remote Inter font file; fallback rendering is expected.

**Label/Mono Font:** UI monospace for identifiers and configuration material.

**Character:** One compact UI family creates continuity. Weight, size and restrained negative heading tracking establish hierarchy; labels stay in sentence case.

### Hierarchy

- **Headline:** page headings use the frontmatter headline role; mobile headings reduce to (25px).
- **Title:** panel headings use the title role; subsection headings use (14px) with (1.5) line height.
- **Body:** the root size is the body role; paragraphs use (1.65) line height. Supporting descriptions and field contents commonly use (13px), while table contents and labels use (12px).
- **Label:** medium labels identify controls; buttons use (13px), weight (600), line height (1.3).
- **Identifier:** monospace separates machine identifiers from business names; compact table identifiers are smaller than detail identifiers.

The login introduction has a larger heading as a local composition choice. It does not establish a general display type scale for operational pages.

## Layout

The desktop shell uses a fixed left sidebar (236px), a white topbar (70px) and a centered main region with maximum width (1500px), padded (35px 38px 18px). Workspaces combine a flexible main region with contextual guidance. The current register pairs its table with a (232px) setup rail and (25px) gap. Forms pair a main column up to (760px) with a (240px) context column; two-column field groups collapse on mobile.

At widths up to (1190px), the sidebar narrows to (205px), main padding becomes (27px 24px 15px), and the register rail is hidden. At widths up to (760px), navigation becomes a horizontal row above the workspace, the sidebar becomes static, main padding becomes (25px 16px 12px), toolbars stack, and forms use one column. Tables retain a minimum width (560px) inside a horizontal scroller, preserving columns and row actions. The activity time moves below the event content. At widths from (1450px), table rows and the register rail gain space.

Spacing is contextual rather than a strict mathematical scale: compact control gaps recur at (8–12px), larger form groups at (20–25px). Main buttons and form inputs have minimum height (44px); mobile navigation reaches (46px). The login is split into a blue introduction and white form on desktop, becoming a compact brand header above the form on mobile.

## Elevation & Depth

**The Flat Surface Rule.** Separate work surfaces with background tone, borders and spacing. The implemented system uses no box shadows.

Panels, dividers and tonal fills provide the depth vocabulary. Focus outlines communicate interaction state; they are not ambient elevation. Provisioning code uses a subdued inset-looking background and border without a shadow.

## Shapes

Use modest rounded rectangles: compact badges, gently rounded fields and controls, and more open panel corners. The frontmatter records the repeated radius roles. Navigation has slightly rounder desktop corners (9px) and top-rounded mobile tabs. One-pixel borders define controls, panels and row separators. Outline SVG icons share round caps and joins with stroke width (1.7) in a (24 × 24) viewBox; ordinary UI icons are generally (16–20px).

## Components

### Buttons

Clear, compact text actions with a comfortable minimum height. Primary buttons use blue with white text; secondary buttons use white with a cool border and dark blue text; destructive buttons use a pale red fill, red text and red border. Each variant shares the same padding and control radius. Hover deepens the primary fill or adds a soft tint to the other variants. Background transitions last (0.15s). Disabled buttons use opacity (0.55) and a not-allowed cursor.

All keyboard-operable controls use the shared visible focus outline (3px), offset (3px). Reduced-motion preference removes transitions and animation. There is no implemented pressed-state transform to inherit.

### Chips

Compact, noninteractive status labels with medium weight (550) and text size (11px). Neutral, blue, green and red variants use soft fills and explicit text. They report status or counts; they do not replace actionable buttons.

### Cards / Containers

White bordered panels carry registers, forms, terminal details and activity. They share the panel radius and flat depth rule. Padding varies with content: form panels use (29px) on desktop and (22px 18px) on mobile; merchant and activity panels use (25px) on desktop. Register headers, toolbar, rows and footer own their padding rather than wrapping the whole table in another padded card.

### Inputs / Fields

Explicit labels sit above white fields with a quiet cool stroke, field radius, padding (12px 13px) and minimum height (44px). Supporting hints sit underneath in muted text. The search field combines an outline icon and borderless input inside one bordered wrapper; its focus-within outline is (2px), offset (2px). Request errors appear in an alert notice with explanatory text. Loading and disabled states retain their labels and context.

### Navigation

Blue text and a pale blue fill identify the current destination, with an explicit current-page attribute. Default destinations use muted slate; hover uses the canvas tone. Counts are small white badges. On mobile the three main destinations share a horizontal row, and sign-out remains available in the topbar. The skip link appears on keyboard focus and transfers focus to the main content without changing the route.

### Record register

Business or device identity leads each row, with a compact avatar or outline device mark, strong name and smaller identifier. Contact or assignment, explicit status and a trailing text action support scanning. Row hover adds a subtle near-white tint. Keep semantic table headers and a local horizontal scroll region on mobile.

### Guidance, notices and confirmation

Contextual guidance uses pale blue with an ordered setup sequence, sharing the same icon and label language as the workspace. Notices use an icon, semantic fill, border and explanatory copy; errors expose an alert role. Destructive credential changes use an inline warm-toned confirmation with explicit action labels. Provisioning completes in a dedicated view with a downloadable configuration, private-material notice and monospace code block.

## Do's and Don'ts

### Do:

- **Do** keep the established PayByPalm blue, white surfaces and cool neutral canvas.
- **Do** give fields explicit labels, preserve visible keyboard focus and expose the skip-to-content link on focus.
- **Do** keep status words beside semantic colors and last-contact timestamps distinct from a claim that a device is online.
- **Do** preserve horizontal table scrolling on small screens and keep forms in a single readable column.
- **Do** place credential replacement confirmation inline and show provisioning material in its dedicated completion view.

### Don't:

- **Don't** replace the established identity with an unrelated visual world.
- **Don't** add decorative charts, hero metrics or fabricated operational data.
- **Don't** hide essential merchant or device actions to make a narrow table fit.
- **Don't** replace the consistent outline SVG icons with text glyphs.

Not canonized: browser-test fixture banners and fixture records are test evidence, not production components or operational data; the larger login introduction is a local composition, not a reusable display scale. No approved visual comp or five-block HTML contract exists for this build.
