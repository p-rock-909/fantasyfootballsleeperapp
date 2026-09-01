---
name: frontend-design
description: >
  Create distinctive, production-grade frontend interfaces with high design quality.
  Use when building web components, pages, artifacts, posters, or applications. Also activates
  when user says "use design system", "apply brand tokens", "load design tokens", or references
  a specific design system style. Generates creative, polished code that avoids generic AI
  aesthetics, optionally backed by concrete design system tokens.
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---

# Frontend Design Skill

## Purpose

Create distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Step 0: Design System Loading

Before starting any frontend work, check for available design systems:

1. **Check for design system files:**
   ```
   Glob: .claude/skills/frontend-design/design-systems/*.md
   ```

2. **If design system files exist:**
   - If the user specified a brand/style (e.g., "use Stripe style"), load that specific file
   - If building for this project and a project-specific design system exists, load it as default
   - If no preference stated, ask: "I have design systems for [list names]. Want me to use one, or go freeform?"
   - Read the selected design system file and apply its tokens throughout implementation

3. **If no design system files exist:** Proceed with freeform design using the aesthetics guidelines below

4. **Design system tokens override general guidelines:** When a design system is loaded, use its specific hex values, font families, spacing scales, and component specs. The aesthetics guidelines below still apply for areas the design system doesn't cover (motion, spatial composition, creative choices).

**IMPORTANT: Design system ≠ rigid template.** The tokens provide the palette — you still make bold creative choices within that palette. Two pages using the same design system should feel different while sharing the same DNA.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work — the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font. *(If a design system is loaded, use its specified font families instead.)*
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. *(If a design system is loaded, use its color palette and semantic roles.)*
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: Claude is capable of extraordinary creative work. Don't hold back — show what can truly be created when thinking outside the box and committing fully to a distinctive vision.

## Building Design Tokens (How to Create a DESIGN.md)

Four paths to create a design system file, depending on what you're starting from:

### Path A: Auto-Extract via Browser (Recommended — fastest, most accurate)

**Requires:** `claude --chrome` (Chrome extension connected)

Use Claude's browser automation to navigate a live site and extract design tokens programmatically.

**Step 1: Navigate to the target site**
```
Use browser tool: navigate to [URL]
```

**Step 2: Extract all design tokens via JavaScript**
Execute this script in the browser console:

```javascript
(() => {
  const tokens = { colors: new Set(), fonts: new Set(), fontSizes: new Set(), shadows: new Set(), radii: new Set() };
  const selectors = 'h1,h2,h3,h4,h5,h6,p,a,button,input,textarea,nav,header,footer,section,article,div,span,li,label,th,td,code,pre';
  const elements = document.querySelectorAll(selectors);
  elements.forEach(el => {
    const s = getComputedStyle(el);
    [s.color, s.backgroundColor, s.borderColor, s.outlineColor].forEach(c => {
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') tokens.colors.add(c);
    });
    if (s.fontFamily) tokens.fonts.add(s.fontFamily.split(',')[0].trim().replace(/['"]/g, ''));
    if (s.fontSize) tokens.fontSizes.add(s.fontSize);
    if (s.boxShadow && s.boxShadow !== 'none') tokens.shadows.add(s.boxShadow);
    if (s.borderRadius && s.borderRadius !== '0px') tokens.radii.add(s.borderRadius);
  });
  const typeHierarchy = [];
  ['h1','h2','h3','h4','h5','h6','p','button','a','label','code'].forEach(sel => {
    const el = document.querySelector(sel);
    if (el) {
      const s = getComputedStyle(el);
      typeHierarchy.push({ element: sel, fontFamily: s.fontFamily.split(',')[0].trim().replace(/['"]/g, ''), fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, color: s.color });
    }
  });
  const btn = document.querySelector('button, [class*="btn"], a[class*="button"]');
  let buttonStyles = null;
  if (btn) {
    const s = getComputedStyle(btn);
    buttonStyles = { background: s.backgroundColor, color: s.color, padding: s.padding, borderRadius: s.borderRadius, border: s.border, boxShadow: s.boxShadow, fontSize: s.fontSize, fontWeight: s.fontWeight };
  }
  return JSON.stringify({ colors: [...tokens.colors].slice(0, 30), fonts: [...tokens.fonts], fontSizes: [...tokens.fontSizes], shadows: [...tokens.shadows], borderRadii: [...tokens.radii], typeHierarchy, buttonStyles, pageTitle: document.title }, null, 2);
})()
```

**Step 3: Synthesize into DESIGN.md**
Take the raw data and write a `design-systems/[name].md` following the 9-section format. Convert `rgb()` to hex, name colors by semantic role, describe design philosophy not just values.

**Step 4: Verify** — navigate back and spot-check 5-10 tokens visually.

### Path B: Extract from Tailwind/CSS Config (For existing codebases)

When the design system already exists in code:

1. Read `tailwind.config.ts` (or CSS config) for colors, fonts, shadows, border-radius
2. Read `globals.css` for CSS variables, keyframes, custom properties
3. Read `src/components/ui/` for component patterns
4. Synthesize into 9-section DESIGN.md format with actual hex values and framework class mappings

### Path C: Build from Brand Guidelines

When you have brand assets but no live site:

1. **Define atmosphere** — what should someone *feel*?
2. **Color palette** — start with 3 (CTA, heading, background), expand to full semantic set
3. **Typography** — display + body font pair, full hierarchy, weight system, letter-spacing
4. **Components** — buttons, cards, inputs, badges, navigation with all states
5. **Spacing + layout** — base unit, scale, max-width, whitespace philosophy
6. **Shadows** — 4-5 elevation levels with tint philosophy
7. **Do's and Don'ts** — 5-8 brand guardrails
8. **Responsive** — breakpoints and collapsing strategy
9. **Agent Prompt Guide** — quick reference + implementation keys

### Path D: Copy + Customize from a Reference System

Start from `design-systems/stripe.md` or `design-systems/linear.md`, swap tokens to your brand.

### Quality Standards

Every DESIGN.md must have:
- **Exact hex codes** alongside descriptive names (and framework class mappings if applicable)
- **Complete type hierarchy** from display through micro
- **Semantic roles** for every color
- **State coverage** for interactive components (default, hover, focus, disabled)
- **Design rationale** — explain WHY, not just WHAT
- **Agent Prompt Guide** — quick reference for AI to generate correct code first try

### 9-Section Format Reference

1. **Visual Theme & Atmosphere** — Design mood and philosophy
2. **Color Palette & Roles** — Semantic color names with hex values
3. **Typography Rules** — Font families and complete type hierarchy
4. **Component Stylings** — Buttons, cards, inputs with state variations
5. **Layout Principles** — Spacing scales and whitespace strategy
6. **Depth & Elevation** — Shadow systems and surface hierarchy
7. **Do's and Don'ts** — Design guardrails
8. **Responsive Behavior** — Breakpoints and adaptive strategies
9. **Agent Prompt Guide** — Quick reference for AI interactions

### Security Note

When importing from external sources: copy individual files only (no git submodule), pin to an audited commit hash, add a provenance comment. VoltAgent/awesome-design-md security-audited 2026-04-04, risk score 3.2/10.
