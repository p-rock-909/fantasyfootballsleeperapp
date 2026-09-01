<!-- Source: VoltAgent/awesome-design-md @ main (2026-04-04) | Security-audited: 2026-04-04 (3.2/10 risk) -->
<!-- Pin to specific commit hash before production use -->

# Stripe Design System

## 1. Visual Theme & Atmosphere

Stripe's design achieves a balance between technical precision and luxury through clean white backgrounds (`#ffffff`), deep navy headings (`#061b31`), and signature purple (`#533afd`). The custom `sohne-var` variable font with OpenType `"ss01"` stylistic set defines the visual identity. Display headlines use weight 300 at sizes like 56px with tight negative letter-spacing (-1.4px), creating an "ethereal, almost whispered authority" rather than bold convention.

The system uses multi-layer blue-tinted shadows combining `rgba(50,50,93,0.25)` with `rgba(0,0,0,0.1)` for atmospheric depth. Conservative border-radius (4px-8px) maintains design restraint throughout.

## 2. Color Palette & Roles

### Primary Colors
- Stripe Purple: `#533afd` (CTAs, links, highlights)
- Deep Navy: `#061b31` (headings)
- Pure White: `#ffffff` (backgrounds)

### Brand & Dark
- Brand Dark: `#1c1e54` (dark sections, footers)
- Dark Navy: `#0d253d` (darkest neutral)

### Accents
- Ruby: `#ea2261` (icons, alerts)
- Magenta: `#f96bee` (gradients)
- Magenta Light: `#ffd7ef` (surfaces)

### Interactive
- Purple Hover: `#4434d4`
- Purple Deep: `#2e2b8c`
- Purple Light: `#b9b9f9`
- Purple Mid: `#665efd`

### Neutrals
- Label: `#273951`
- Body: `#64748d`
- Success Green: `#15be53`
- Success Text: `#108c3d`
- Lemon: `#9b6829`

### Borders & Shadows
- Border Default: `#e5edf5`
- Border Purple: `#b9b9f9`
- Border Soft Purple: `#d6d9fc`
- Border Magenta: `#ffd7ef`
- Border Dashed: `#362baa`
- Shadow Blue: `rgba(50,50,93,0.25)`
- Shadow Dark Blue: `rgba(3,3,39,0.25)`
- Shadow Black: `rgba(0,0,0,0.1)`
- Shadow Ambient: `rgba(23,23,23,0.08)`
- Shadow Soft: `rgba(23,23,23,0.06)`

## 3. Typography Rules

### Font Family
- Primary: `sohne-var` (fallback: SF Pro Display)
- Monospace: `SourceCodePro` (fallback: SFMono-Regular)
- OpenType Features: `"ss01"` globally; `"tnum"` for financial data

### Hierarchy

| Role | Size | Weight | Line Height | Letter Spacing |
|------|------|--------|-------------|----------------|
| Display Hero | 56px (3.50rem) | 300 | 1.03 | -1.4px |
| Display Large | 48px (3.00rem) | 300 | 1.15 | -0.96px |
| Section Heading | 32px (2.00rem) | 300 | 1.10 | -0.64px |
| Sub-heading Large | 26px (1.63rem) | 300 | 1.12 | -0.26px |
| Sub-heading | 22px (1.38rem) | 300 | 1.10 | -0.22px |
| Body Large | 18px (1.13rem) | 300 | 1.40 | normal |
| Body | 16px (1.00rem) | 300-400 | 1.40 | normal |
| Button | 16px (1.00rem) | 400 | 1.00 | normal |
| Button Small | 14px (0.88rem) | 400 | 1.00 | normal |
| Link | 14px (0.88rem) | 400 | 1.00 | normal |
| Caption | 13px (0.81rem) | 400 | normal | normal |
| Caption Small | 12px (0.75rem) | 300-400 | 1.33-1.45 | normal |
| Code Body | 12px (0.75rem) | 500 | 2.00 | normal |

### Key Principles
- Weight 300 at display sizes signals luxury through lightness
- `"ss01"` stylistic set creates geometric, contemporary letterforms
- Progressive tracking tightens proportionally with size
- Two-weight simplicity: 300 (body/headings) and 400 (UI/buttons)

## 4. Component Stylings

### Primary Purple Button
- Background: `#533afd`
- Text: `#ffffff`
- Padding: 8px 16px
- Radius: 4px
- Font: 16px sohne-var weight 400, `"ss01"`
- Hover: `#4434d4`

### Ghost/Outlined Button
- Background: transparent
- Text: `#533afd`
- Padding: 8px 16px
- Radius: 4px
- Border: `1px solid #b9b9f9`
- Hover: `rgba(83,58,253,0.05)`

### Cards & Containers
- Background: `#ffffff`
- Border: `1px solid #e5edf5` (standard) or `1px solid #061b31` (dark)
- Radius: 4px-8px range
- Standard Shadow: `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px`
- Ambient Shadow: `rgba(23,23,23,0.08) 0px 15px 35px 0px`

### Success Badge
- Background: `rgba(21,190,83,0.2)`
- Text: `#108c3d`
- Padding: 1px 6px
- Radius: 4px
- Border: `1px solid rgba(21,190,83,0.4)`

### Form Elements
- Border: `1px solid #e5edf5`
- Radius: 4px
- Focus: `1px solid #533afd`
- Label: `#273951`, 14px sohne-var
- Text: `#061b31`
- Placeholder: `#64748d`

### Navigation
- Clean horizontal nav on white with sticky positioning and blur backdrop
- Links: 14px sohne-var weight 400, `#061b31`, `"ss01"`
- Container radius: 6px
- CTA: purple button right-aligned

## 5. Layout Principles

### Spacing System
- Base unit: 8px
- Scale: 1px, 2px, 4px, 6px, 8px, 10px, 12px, 14px, 16px, 18px, 20px

### Grid & Container
- Max content width: ~1080px
- Hero: centered single-column with generous padding
- Features: 2-3 column grids
- Dark sections: full-width `#1c1e54` background
- Dashboard previews: contained cards with blue-tinted shadows

### Border Radius Scale
- Micro: 1px
- Standard: 4px
- Comfortable: 5px
- Relaxed: 6px
- Large: 8px

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat (0) | No shadow | Page background |
| Ambient (1) | `rgba(23,23,23,0.06) 0px 3px 6px` | Subtle lift |
| Standard (2) | `rgba(23,23,23,0.08) 0px 15px 35px` | Standard cards |
| Elevated (3) | `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px` | Featured cards |
| Deep (4) | `rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px` | Modals |
| Ring | `2px solid #533afd` | Keyboard focus |

Shadow philosophy: chromatic depth through blue-tinted colors echoing brand navy, paired with neutral shadows for parallax-like depth.

## 7. Do's and Don'ts

### Do
- Use sohne-var with `"ss01"` on every text element
- Use weight 300 for all headlines and body text
- Apply blue-tinted shadows for elevated elements
- Use `#061b31` for headings instead of black
- Keep border-radius 4px-8px
- Use `"tnum"` for tabular/financial numbers
- Layer shadows with blue-tinted far + neutral close
- Use `#533afd` purple for CTAs

### Don't
- Use weight 600-700 for sohne-var headlines
- Use large border-radius (12px+) or pill shapes
- Use neutral gray shadows
- Skip `"ss01"` on sohne-var text
- Use pure black for headings
- Use warm accent colors for interactive elements
- Apply positive letter-spacing at display sizes

## 8. Responsive Behavior

### Breakpoints
- Mobile: <640px (single column, reduced sizes)
- Tablet: 640-1024px (2-column grids)
- Desktop: 1024-1280px (full layout, 3-column grids)
- Large Desktop: >1280px (centered, generous margins)

### Collapsing Strategy
- Hero: 56px → 32px on mobile
- Navigation: horizontal → hamburger toggle
- Feature cards: 3-column → 2-column → single stack
- Section spacing: 64px+ → 40px mobile

## 9. Agent Prompt Guide

### Quick Color Reference
- Primary CTA: `#533afd`
- CTA Hover: `#4434d4`
- Background: `#ffffff`
- Heading: `#061b31`
- Body: `#64748d`
- Label: `#273951`
- Border: `#e5edf5`
- Dark section: `#1c1e54`
- Success: `#15be53`
- Accents: `#ea2261` (Ruby), `#f96bee` (Magenta)

### Implementation Keys
1. Always enable `font-feature-settings: "ss01"` on sohne-var
2. Weight 300 is default; 400 for UI/buttons/navigation only
3. Shadow formula: `rgba(50,50,93,0.25) 0px Y1 B1 -S1, rgba(0,0,0,0.1) 0px Y2 B2 -S2`
4. Use `"tnum"` for numbers in tables/charts/financial displays
5. Border-radius stays 4px-8px
6. Dark sections use `#1c1e54`
7. SourceCodePro for code at 12px/500 with 2.00 line-height
