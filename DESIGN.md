---
name: Fiscal Precision Intelligence
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#3d4947'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#6d7a77'
  outline-variant: '#bcc9c6'
  surface-tint: '#006a61'
  primary: '#00685f'
  on-primary: '#ffffff'
  primary-container: '#008378'
  on-primary-container: '#f4fffc'
  inverse-primary: '#6bd8cb'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#006947'
  on-tertiary: '#ffffff'
  tertiary-container: '#00855b'
  on-tertiary-container: '#f5fff6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#89f5e7'
  primary-fixed-dim: '#6bd8cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#005049'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-numeric-lg:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.02em
  label-numeric-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.01em
  code-badge:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.04em
  code-badge-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 12px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-sm: 0.5rem
  margin: 1rem
  margin-tablet: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
---

## Brand & Style

The design system embodies modern European fiscal intelligence, tailored for Romanian accounting professionals, SMB founders, and enterprise finance controllers. It communicates mathematical accuracy, sovereign compliance (e-Factura / ANAF alignment), and instantaneous data extraction. 

The aesthetic sits at the intersection of **High-Precision Modern Fintech** and **Technical Utility**. The emotional tone must feel calm, unshakeable, and authoritative-eradicating the friction and anxiety of physical document management. Visual weight relies on balanced whitespace, micro-hairlines, monospaced tabular identifiers, and high-visibility status indicators. Every extracted value is presented with transparent confidence signals, ensuring human-in-the-loop validation feels effortless and verifiable.

## Colors

The palette delivers strict enterprise contrast alongside semantic state clarity tailored to OCR and fiscal auditing workflows:

- **Primary Teal (`#0D9488`)**: The intellectual focal point. Applied to primary calls-to-action, scan affordances, active extraction highlights, and interactive fiscal tools.
- **Deep Navy (`#0F172A`)**: The anchor of trust. Deployed for dominant navigation surfaces, high-emphasis typographic layers, headers, and container contrast.
- **Emerald Green (`#10B981`)**: Semantic affirmation. Strictly reserved for verified statuses, validated ANAF e-Factura payloads, matched bank reconciliations, and high-confidence OCR extractions (≥95%).
- **Amber Warning (`#F59E0B`)**: Semantic triage. Indicates pending human review, borderline OCR confidence levels (<85%), and unmatched CUI/CIF tax identifiers.
- **Crimson Error (`#EF4444`)**: Immediate structural failures, invalid tax checksums, corrupted scan buffers, or ANAF transmission rejections.
- **Neutrals & Surfaces**: Background slate canvas is cast in `#F8FAFC`, stepping into pure `#FFFFFF` for data cards, complemented by hairline borders in `#E2E8F0` and muted secondary copy in `#64748B`.

## Typography

The typographic hierarchy implements a three-family structure to guarantee scannability across dense fiscal payloads:

1. **Plus Jakarta Sans (Headlines)**: Delivers an open, contemporary geometric structure for screen headers, modal titles, and fiscal summary dashboards without visual fatigue.
2. **Inter (Body & Values)**: Drives transactional density. Financial totals use Inter with `font-feature-settings: "tnum" on, "cv05" on` to ensure perfect vertical alignment across multi-line expense listings and Romanian Lei (RON) breakdowns.
3. **JetBrains Mono (Fiscal Codes & Metadata)**: Dedicated to technical verification targets-including CUI/CIF, IBAN numbers, Bon Fiscal IDs, Series/Number values, and machine-readable confidence scores.

## Layout & Spacing

The mobile layout system operates on an 8pt base grid with a 4pt sub-grid for dense fiscal data fields.

- **Mobile Viewport**: Implements a 4-column fluid layout with `16px` outer margins and `12px` inner column gutters. Edge containers hug `100vw` with standard mobile safe-area insets (`env(safe-area-inset-bottom)` applied systematically).
- **Tablet / Split OCR Inspector**: Adapts to an 8-column layout. When displaying side-by-side document views (original scan vs. extracted form), the canvas splits into a 50/50 ratio using an explicit `24px` gutter.
- **Rhythm**: Component interiors apply strict internal padding: standard cards use `space-lg` (`16px`), while compact list items and receipt line-items scale down to `space-md` (`12px`) vertically and `space-lg` (`16px`) horizontally to prioritize vertical density on mobile screens.

## Elevation & Depth

Visual hierarchy avoids excessive drop shadows, favoring **structured tonal elevation paired with calibrated hairlines** to mirror modern high-precision financial instruments.

- **Flat Canvas**: Base background `#F8FAFC`.
- **Level 1 (Card & Document Row)**: Background `#FFFFFF`, border `1px solid #E2E8F0`, shadow `0 1px 2px 0 rgba(15, 23, 42, 0.04)`.
- **Level 2 (Interactive Floating Elements & OCR Drawers)**: Background `#FFFFFF`, border `1px solid #CBD5E1`, shadow `0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05)`.
- **Level 3 (Modal Sheets, Scan Camera HUD, Bottom Sheet Verification)**: Background `#FFFFFF`, shadow `0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.06)`.
- **Floating Action Overlay (Camera CTA)**: Elevated using a tinted radial drop shadow: `0 10px 15px -3px rgba(13, 148, 136, 0.35)`.

## Shapes

The design uses a refined rounded shape language (`0.5rem` / `8px` baseline) conveying structural precision without appearing rigid or clinical.

- **Core Elements (Inputs, Buttons, Cards)**: `8px` corner radius (`rounded-base`).
- **Container Surfaces (Bottom Sheets, Preview Modals)**: `16px` top corner radius (`rounded-lg`).
- **Data Badges, Metric Chips & Confidence Tags**: `4px` or `6px` radius to reflect technical labeling.
- **Floating Camera Action Button (FAB)**: Fully circular (`9999px`) to immediately distinguish document capture from static card structures.

## Components

### Buttons
- **Primary**: Solid Teal (`#0D9488`), text `#FFFFFF`, height `48px`, font `Plus Jakarta Sans` 15px weight 600. Active state transitions to `#0F766E`.
- **Secondary**: Deep Navy (`#0F172A`), text `#FFFFFF`, height `48px`, font `Plus Jakarta Sans` 15px weight 600.
- **Outline / Ghost**: Transparent fill, `1px solid #E2E8F0`, text `#0F172A`.

### Badges & Confidence Indicators
- **Verified (≥95%)**: Background `#ECFDF5`, border `1px solid #A7F3D0`, text `#065F46`, paired with an emerald check icon.
- **Review Required (<85%)**: Background `#FFFBEB`, border `1px solid #FDE68A`, text `#92400E`, displaying confidence percentage (e.g., `82% Conf`) in JetBrains Mono.
- **Fiscal Identifiers**: Background `#F1F5F9`, border `1px solid #E2E8F0`, text `#334155` with monospaced CUI/CIF prefix badges (e.g., `RO 3829104`).

### Document & Invoice Cards
- White `#FFFFFF` background, `1px solid #E2E8F0` border, `16px` padding.
- Top row: Vendor name (semibold) + relative date.
- Middle row: Extracted CUI / Serie & Numar in JetBrains Mono chip + Verification Status Badge.
- Bottom row: Total amount in bold tabular Inter font with explicit currency (`RON` / `EUR`), right-aligned.

### Input Fields (OCR Review Mode)
- Fixed label with an integrated confidence indicator.
- Field border switches contextually: Teal on focus (`#0D9488`), Amber if pending human confirmation (`#F59E0B`), and Slate (`#CBD5E1`) when verified.
- Direct tap-to-focus opens document bounding-box highlight in split view.

### Floating Scan CTA & Tab Navigation
- **Tab Bar**: Fixed mobile bottom bar with a background blur (`rgba(255, 255, 255, 0.92)` with `backdrop-filter: blur(12px)`), hairline top border `#E2E8F0`, and active icons tinted in `#0D9488`.
- **Floating Camera CTA**: Elevated center button (56px × 56px), solid Teal `#0D9488`, containing a crisp camera viewfinder icon in white `#FFFFFF`, cast with a teal ambient glow shadow.