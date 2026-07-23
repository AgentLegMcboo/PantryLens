---
name: Warm Pantry
colors:
  surface: '#fff8f5'
  surface-dim: '#e5d7d1'
  surface-bright: '#fff8f5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fff1ea'
  surface-container: '#f9ebe5'
  surface-container-high: '#f3e5df'
  surface-container-highest: '#ede0d9'
  on-surface: '#211a16'
  on-surface-variant: '#56423d'
  inverse-surface: '#362f2b'
  inverse-on-surface: '#fceee7'
  outline: '#89726c'
  outline-variant: '#dcc1b9'
  surface-tint: '#9d4327'
  primary: '#9c4226'
  on-primary: '#ffffff'
  primary-container: '#bc5a3c'
  on-primary-container: '#ffffff'
  inverse-primary: '#ffb59f'
  secondary: '#47672c'
  on-secondary: '#ffffff'
  secondary-container: '#c7efa4'
  on-secondary-container: '#4c6d31'
  tertiary: '#99452b'
  on-tertiary: '#ffffff'
  tertiary-container: '#b85d40'
  on-tertiary-container: '#110100'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbd1'
  primary-fixed-dim: '#ffb59f'
  on-primary-fixed: '#3a0a00'
  on-primary-fixed-variant: '#7e2c12'
  secondary-fixed: '#c7efa4'
  secondary-fixed-dim: '#acd28a'
  on-secondary-fixed: '#0c2000'
  on-secondary-fixed-variant: '#304f16'
  tertiary-fixed: '#ffdbd0'
  tertiary-fixed-dim: '#ffb59e'
  on-tertiary-fixed: '#3a0a00'
  on-tertiary-fixed-variant: '#7a2f16'
  background: '#fff8f5'
  on-background: '#211a16'
  surface-variant: '#ede0d9'
  card-surface: '#FEFBF6'
  border-soft: '#E5DBCB'
  text-muted: '#6B6259'
  status-good: '#5B8C51'
  status-warning: '#E39A3B'
  status-critical: '#C0392B'
  cat-grain: '#C9A227'
  cat-veg: '#5B9C4E'
  cat-protein: '#A6432B'
  cat-breakfast: '#D98A2B'
  cat-snack: '#8E6FC4'
  cat-hygiene: '#3AA0A0'
  cat-baby: '#D46A9F'
  cat-unknown: '#8A8880'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  space-xs: 4px
  space-sm: 8px
  space-md: 16px
  space-lg: 24px
  space-xl: 32px
  space-touch: 48px
  container-margin: 20px
  gutter: 16px
---

## Brand & Style

The design system is built on a foundation of **Utilitarian Empathy**. It acknowledges that the user—often an older or hurried volunteer—is working in high-pressure, low-resource environments like crowded storage rooms or poorly lit pantries. The brand personality is human, trustworthy, and deeply community-oriented, moving away from cold, sterile "tech" aesthetics toward a "cozy kitchen" feel.

The chosen design style is **Modern Tactile**. It utilizes clear, high-contrast boundaries and large touch targets to ensure accessibility for non-technical users. It avoids complex layers in favor of a "One screen, one job" philosophy, using subtle depth to make interactive elements feel physical and reliable. The goal is to feel like a "fast, fallible assistant" that respects the human's role as the final decision-maker.

## Colors

The palette is anchored by **Terracotta** (#BC5A3C), evoking warmth and clay-like stability, set against a comforting **Cream** (#FBF6EE) background to reduce eye strain. 

### Color Application Rules
- **Status Sanctity:** Status colors (Green, Amber, Red) are reserved strictly for stock levels and system warnings. They must never be used for decorative purposes or food categories to prevent cognitive load.
- **Contrast for Accessibility:** All primary text uses **Warm Brown** (#2B2420) on Cream or Off-white surfaces to ensure a high contrast ratio exceeding WCAG AA standards, critical for older volunteers.
- **Category Coding:** Food categories use a distinct set of muted but recognizable hues. When a category (like Protein) naturally sits near a status color (Red), use the specific dark-shifted `cat-protein` hex to maintain visual distinction.

## Typography

This design system uses **Plus Jakarta Sans** across all levels. It was selected for its friendly, rounded terminals which feel approachable, while maintaining high legibility in the "geometric sans" style.

### Typography Principles
- **Generous Sizing:** The base body size starts at 18px (`body-lg`) for primary reading tasks (item names, instructions) to accommodate users with varying visual acuity.
- **Information Hierarchy:** `label-lg` uses uppercase styling and increased letter spacing for metadata like "EXPIRING SOON" or "LIMITING CATEGORY" tags, creating a clear visual distinction from item names.
- **Readability First:** Line heights are set generously (1.5x for body text) to prevent text lines from blurring together during quick scans in warehouse environments.

## Layout & Spacing

The layout philosophy follows a **Mobile-First Fixed Grid**. Given the "one job per screen" principle, the design prioritizes a single-column vertical stack for most views (Inventory, Checklist, Review).

### Layout Rules
- **The 48px Rule:** No interactive element (button, checkbox, list item) should have a height or touch target smaller than 48px (`space-touch`). This prevents "fat-finger" errors during rushed donations.
- **Margins:** A consistent 20px side margin ensures content does not bleed into screen edges on mobile devices.
- **Grouping:** Use `space-lg` (24px) between logical sections (e.g., between "Protein" and "Grains" categories) and `space-sm` (8px) between items within a group.
- **Reflow:** On tablet/desktop, the single-column list may expand to a 2-column masonry grid, but information density must remain low to ensure clarity.

## Elevation & Depth

This design system uses **Tonal Layering** combined with **Low-Contrast Outlines** rather than aggressive shadows. This ensures visibility even on screens with low brightness or under heavy overhead lighting.

- **Surface Levels:** 
  - **Level 0 (Background):** Cream (#FBF6EE). Used for the main canvas.
  - **Level 1 (Cards/Lists):** Off-white (#FEFBF6) with a 1px Soft Tan (#E5DBCB) border. This defines the primary interactive area.
  - **Level 2 (Active/Floating):** Use a subtle, diffused amber-tinted shadow for elements that sit "above" the flow, such as the bottom navigation bar or camera-overlay prompts.
- **Interactive State:** Buttons should use a slight "press" effect (shifting from Level 1 to Level 0 visually) rather than complex 3D extrusions.

## Shapes

The shape language is **Rounded**, conveying friendliness and safety. 

- **Primary Actions:** Large buttons (Log Donation, Build Boxes) use 1rem (16px) corner radii to feel like tactile "blocks."
- **Inventory Cards:** Use 0.5rem (8px) radii to maintain a clean grid while softening the UI.
- **Status Badges:** Use "Pill" shapes (fully rounded) to differentiate them from clickable cards or input fields.
- **AI Feedback:** Bounding boxes in camera mode should use dashed strokes with 4px radii to signal that the data is a "draft" and requires human verification.

## Components

### Buttons
- **Primary:** Terracotta background with Off-white text. Use for the "happy path" (Confirm, Detect Items).
- **Secondary:** Sage background or Soft Tan outline. Use for secondary actions (Audit Shelf, Scan Barcode).
- **Destructive:** Deep Red outline. Use sparingly for "Delete Item."

### Cards & Lists
- **Inventory Items:** High-contrast list items with a clear horizontal split: Name/Count on the left, Category/Status Badge on the right.
- **Verification Cards:** AI-generated drafts use a dashed border until "Confirmed." Unsure items are highlighted with a Soft Tan background to draw immediate attention.

### Input Fields
- Labels must always be visible (no floating labels that disappear). 
- Use a 16px font size minimum to prevent iOS/Android zoom-on-focus.
- Stepper controls (+ / -) must be large and separated from each other to prevent accidental taps.

### Status Indicators
- **Icons:** Every status color must be accompanied by an icon (Checkmark for Good, Triangle for Warning, Octagon for Critical) to ensure the system is accessible to colorblind users.
- **Limiting Category Tag:** A special high-contrast badge used in the "Build Boxes" flow to show exactly what is stopping more boxes from being made.