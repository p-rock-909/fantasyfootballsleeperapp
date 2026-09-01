<!-- Source: VoltAgent/awesome-design-md @ main (2026-04-04) | Security-audited: 2026-04-04 (3.2/10 risk) -->
<!-- Pin to specific commit hash before production use -->

# Linear Design System

## 1. Visual Theme & Atmosphere

Linear employs a "dark-mode-first" approach on a near-black canvas (`#08090a`). The design treats darkness as the native medium, managing information density through subtle gradations of white opacity rather than color variation.

Typography uses Inter Variable exclusively, with OpenType features `"cv01"` and `"ss03"` enabled globally for a cleaner, geometric character. The system spans weights 300-590, with 510 as the signature emphasis weight. Display sizes (72px, 64px, 48px) use aggressive negative letter-spacing (-1.584px to -1.056px).

The color palette is almost entirely achromatic — dark backgrounds with white/gray text — punctuated by a single brand accent: indigo-violet (`#5e6ad2` for backgrounds, `#7170ff` for interactive accents). Borders use ultra-thin, semi-transparent white (`rgba(255,255,255,0.05)` to `rgba(255,255,255,0.08)`).

## 2. Color Palette & Roles

### Background Surfaces
- Marketing Black: `#010102` / `#08090a` (deepest background, hero sections)
- Panel Dark: `#0f1011` (sidebars and panels)
- Level 3 Surface: `#191a1b` (elevated surfaces, card backgrounds)
- Secondary Surface: `#28282c` (lightest dark surface, hover states)

### Text & Content
- Primary Text: `#f7f8f8` (near-white, default text)
- Secondary Text: `#d0d6e0` (cool silver-gray for body)
- Tertiary Text: `#8a8f98` (muted gray for placeholders)
- Quaternary Text: `#62666d` (most subdued, timestamps)

### Brand & Accent
- Brand Indigo: `#5e6ad2` (primary CTA backgrounds)
- Accent Violet: `#7170ff` (interactive elements, links)
- Accent Hover: `#828fff` (hover states)
- Security Lavender: `#7a7fad` (security-related UI)

### Status Colors
- Green: `#27a644` (primary success, "in progress")
- Emerald: `#10b981` (secondary success, completion)

### Borders & Dividers
- Border Primary: `#23252a` (solid dark border)
- Border Secondary: `#34343a` (slightly lighter solid)
- Border Tertiary: `#3e3e44` (lightest solid variant)
- Border Subtle: `rgba(255,255,255,0.05)` (ultra-subtle semi-transparent)
- Border Standard: `rgba(255,255,255,0.08)` (standard semi-transparent)

### Light Mode Neutrals
- Light Background: `#f7f8f8`
- Light Surface: `#f3f4f5` / `#f5f6f7`
- Light Border: `#d0d6e0`
- Pure White: `#ffffff` (card surfaces)

### Overlay
- Overlay Primary: `rgba(0,0,0,0.85)` (modal backdrop)

## 3. Typography Rules

### Font Family
- Primary: Inter Variable (fallbacks: SF Pro Display, -apple-system, system-ui)
- Monospace: Berkeley Mono (fallbacks: ui-monospace, SF Mono, Menlo)
- OpenType Features: `"cv01", "ss03"` enabled globally

### Hierarchy

| Role | Size | Weight | Line Height | Letter Spacing |
|------|------|--------|-------------|----------------|
| Display XL | 72px | 510 | 1.00 | -1.584px |
| Display Large | 64px | 510 | 1.00 | -1.408px |
| Display | 48px | 510 | 1.00 | -1.056px |
| Heading 1 | 32px | 400 | 1.13 | -0.704px |
| Heading 2 | 24px | 400 | 1.33 | -0.288px |
| Heading 3 | 20px | 590 | 1.33 | -0.24px |
| Body Large | 18px | 400 | 1.60 | -0.165px |
| Body Emphasis | 17px | 590 | 1.60 | normal |
| Body | 16px | 400 | 1.50 | normal |
| Body Medium | 16px | 510 | 1.50 | normal |
| Body Semibold | 16px | 590 | 1.50 | normal |
| Small | 15px | 400 | 1.60 | -0.165px |
| Small Medium | 15px | 510 | 1.60 | -0.165px |
| Caption | 13px | 400-510 | 1.50 | -0.13px |
| Label | 12px | 400-590 | 1.40 | normal |
| Micro | 11px | 510 | 1.40 | normal |
| Mono Body | 14px (Berkeley Mono) | 400 | 1.50 | normal |

### Principles
- **510 as signature weight**: between regular (400) and medium (500), creating subtle emphasis without heaviness
- **Compression at scale**: display text uses progressively tighter letter-spacing; below 24px, spacing relaxes toward normal
- **OpenType as identity**: `"cv01", "ss03"` transform Inter into Linear's geometric variant
- **Three-tier weight system**: 400 (reading), 510 (emphasis/UI), 590 (strong emphasis)

## 4. Component Stylings

### Ghost Button (Default)
- Background: `rgba(255,255,255,0.02)`
- Text: `#e2e4e7`
- Radius: 6px
- Border: `1px solid rgb(36, 40, 44)`
- Focus shadow: `rgba(0,0,0,0.1) 0px 4px 12px`

### Primary Brand Button
- Background: `#5e6ad2`
- Text: `#ffffff`
- Padding: 8px 16px
- Radius: 6px
- Hover: `#828fff` shift

### Icon Button (Circle)
- Background: `rgba(255,255,255,0.03)` or `rgba(255,255,255,0.05)`
- Radius: 50%
- Border: `1px solid rgba(255,255,255,0.08)`

### Pill Button
- Background: transparent
- Text: `#d0d6e0`
- Padding: 0px 10px 0px 5px
- Radius: 9999px
- Border: `1px solid rgb(35, 37, 42)`

### Cards & Containers
- Background: `rgba(255,255,255,0.02)` to `rgba(255,255,255,0.05)`
- Border: `1px solid rgba(255,255,255,0.08)` or `rgba(255,255,255,0.05)`
- Radius: 8px (standard), 12px (featured), 22px (large panels)
- Shadow: `rgba(0,0,0,0.2) 0px 0px 0px 1px` or layered multi-shadow

### Inputs & Forms
- Background: `rgba(255,255,255,0.02)`
- Text: `#d0d6e0`
- Border: `1px solid rgba(255,255,255,0.08)`
- Padding: 12px 14px
- Radius: 6px

### Badges & Pills
- Success: `#10b981` bg, `#f7f8f8` text, 50% radius, 10px weight 510
- Subtle: `rgba(255,255,255,0.05)` bg, 2px radius, 10px weight 510

### Navigation
- Dark sticky header on near-black background
- Links: 13-14px weight 510, `#d0d6e0` text
- Active/hover: text to `#f7f8f8`
- CTA: Brand indigo button or ghost button

## 5. Layout Principles

### Spacing System
- Base unit: 8px
- Scale: 1px, 4px, 7px, 8px, 12px, 16px, 20px, 24px, 28px, 32px, 35px
- Values 7px and 11px suggest micro-adjustments for optical alignment

### Grid & Container
- Max content width: ~1200px
- Hero: centered single-column with generous vertical padding
- Feature sections: 2-3 column grids
- Full-width dark sections with internal max-width constraints

### Whitespace Philosophy
- "Darkness as space": near-black background IS the whitespace
- Compressed headlines sit within vast dark padding
- Section isolation: 80px+ vertical padding, no visible dividers

### Border Radius Scale
- Micro (2px): inline badges, toolbar buttons
- Standard (4px): small containers
- Comfortable (6px): buttons, inputs
- Card (8px): cards, dropdowns
- Panel (12px): panels, featured cards
- Large (22px): large panel elements
- Full Pill (9999px): chips, filter pills
- Circle (50%): icon buttons, avatars

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat (0) | No shadow, `#010102` bg | Page background |
| Subtle (1) | `rgba(0,0,0,0.03) 0px 1.2px 0px` | Toolbar buttons |
| Surface (2) | `rgba(255,255,255,0.05)` bg + border | Cards, inputs |
| Inset (2b) | `rgba(0,0,0,0.2) 0px 0px 12px 0px inset` | Recessed panels |
| Ring (3) | `rgba(0,0,0,0.2) 0px 0px 0px 1px` | Border-as-shadow |
| Elevated (4) | `rgba(0,0,0,0.4) 0px 2px 4px` | Floating elements |
| Dialog (5) | Multi-layer stack | Popovers, modals |

Shadow Philosophy: On dark surfaces, elevation uses background luminance stepping instead of shadow darkness — each level increases white opacity (`0.02` → `0.04` → `0.05`).

## 7. Do's and Don'ts

### Do
- Use Inter Variable with `"cv01", "ss03"` on ALL text
- Use weight 510 as default emphasis — Linear's signature
- Apply aggressive negative letter-spacing at display sizes
- Build on near-black backgrounds: `#08090a` (marketing), `#0f1011` (panels), `#191a1b` (elevated)
- Use semi-transparent white borders instead of solid dark borders
- Keep button backgrounds nearly transparent: `rgba(255,255,255,0.02)-0.05`
- Reserve brand indigo (`#5e6ad2` / `#7170ff`) for primary CTAs only
- Use `#f7f8f8` for primary text — not pure white
- Apply luminance stacking: deeper = darker bg, elevated = slightly lighter bg

### Don't
- Use pure white (`#ffffff`) as primary text
- Use solid colored backgrounds for buttons — transparency is the system
- Apply brand indigo decoratively
- Use positive letter-spacing on display text
- Use visible/opaque borders on dark backgrounds
- Skip OpenType features (`"cv01", "ss03"`)
- Use weight 700 (bold) — maximum is 590
- Introduce warm colors into UI chrome

## 8. Responsive Behavior

### Breakpoints
- Mobile Small: <600px (single column, compact padding)
- Tablet: 640-768px (two-column grids begin)
- Desktop: 1024-1280px (standard desktop)
- Large Desktop: >1280px (full layout, generous margins)

### Collapsing Strategy
- Hero: 72px → 48px → 32px display text
- Navigation: horizontal → hamburger at 768px
- Feature cards: 3-column → 2-column → single column
- Section spacing: 80px+ → 48px on mobile

## 9. Agent Prompt Guide

### Quick Color Reference
- Primary CTA: `#5e6ad2`
- Page Background: `#08090a`
- Panel Background: `#0f1011`
- Surface: `#191a1b`
- Heading text: `#f7f8f8`
- Body text: `#d0d6e0`
- Muted text: `#8a8f98`
- Accent: `#7170ff`
- Accent Hover: `#828fff`
- Border: `rgba(255,255,255,0.08)`

### Implementation Keys
1. Always set `font-feature-settings: "cv01", "ss03"` on all Inter text
2. Letter-spacing: -1.584px at 72px, -1.056px at 48px, -0.704px at 32px, normal below 16px
3. Three weights: 400 (read), 510 (emphasize), 590 (announce)
4. Surface elevation via background opacity: `rgba(255,255,255, 0.02 → 0.04 → 0.05)`
5. Brand indigo (`#5e6ad2` / `#7170ff`) is the only chromatic color
6. Borders always semi-transparent white, never solid dark colors
7. Berkeley Mono for code/technical content
