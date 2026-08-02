# Part 1: Design Principles

## 1.1 Visual Hierarchy (strict, never violated)

```text
Display title (48-72px)
  > Slide heading (32-42px)
    > Subheading / card title (18px)
      > Body content (16px)  ← smallest readable text
        > Eyebrow labels / captions (13px)  ← orientation only
          > Page numbers (13px)  ← reference only
```

Every level must be visibly distinct from adjacent levels. If two levels look the same size, the hierarchy is broken.

Content text (16-20px) is the floor for readable text. Everything above it is bigger. Everything below it is not content — it's navigation or decoration.

## 1.2 Spacing Scale

All spacing uses an 8px base scale:

| Token      | Size | Usage                                        |
| ---------- | ---- | -------------------------------------------- |
| `--sp-xs`  | 8px  | Tight: inside compact cards                  |
| `--sp-sm`  | 16px | Default: between related elements            |
| `--sp-md`  | 24px | Comfortable: between sections within a slide |
| `--sp-lg`  | 32px | Generous: between major blocks               |
| `--sp-xl`  | 48px | Dramatic: slide padding from edges           |
| `--sp-2xl` | 64px | Maximum: title slide breathing room          |

Never use arbitrary values. Pick from the scale.

## 1.3 Color Token System

Every deck defines these base tokens. Slide classes inherit from them — they never define colors from scratch.

| Token            | Purpose                                    |
| ---------------- | ------------------------------------------ |
| `--bg`           | Slide background (light)                   |
| `--bg-alt`       | Card / container background                |
| `--bg-dark`      | Dark slides (title, closing, dividers)     |
| `--border`       | Card borders, dividers                     |
| `--text-display` | Display titles on dark backgrounds         |
| `--text-heading` | Slide headings                             |
| `--text-body`    | Body content                               |
| `--text-muted`   | Labels, captions, page numbers             |
| `--accent`       | Stat numbers, key highlights, accent lines |
| `--accent-soft`  | Accent tint for backgrounds                |

Accent colors for categories, levels, or themes extend this palette — they don't replace it.

## 1.4 Typography Rules

- One font stack for all outputs (HTML, PDF, PPTX, images)
- Fonts must be available on Google Fonts
- Define explicit PPTX fallback if exact font unavailable (e.g., Cormorant Garamond → Georgia)
- Display/heading font: serif or distinctive sans
- Body font: clean sans-serif
- Mono font (optional): for labels, code, badges
- Slide-level body anchors at 24 pt (the projection-floor minimum)
- Card / table / dense-list body is the compact tier (18 pt = 24 px)
- Eyebrow / pagination / footer chrome is the meta tier (16 pt = ~21 px)
- See `engineering/typography.md` for the full 11-token contract

### Font Pairing Suggestions

| Style           | Display Font       | Body Font     | Mono Font      |
| --------------- | ------------------ | ------------- | -------------- |
| Warm editorial  | Cormorant Garamond | Nunito Sans   | —              |
| Modern refined  | Playfair Display   | Outfit        | JetBrains Mono |
| Clean corporate | Libre Baskerville  | Source Sans 3 | —              |
| Contemporary    | DM Serif Display   | DM Sans       | DM Mono        |

## 1.5 Content Limits

- Maximum ~40 words of body text per slide
- If content overflows, split into two slides — never shrink font
- Diagrams should occupy at least 50% of slide area
- One main idea per slide
- Maximum 6 bullet points per list slide
- Maximum 4 cards per grid slide
- Maximum 6 steps per timeline
- Maximum ~25 words in a quote slide

## 1.6 Contrast & Readability

- All text must have sufficient contrast against its background
- Light text on dark backgrounds: use `--text-display`
- Dark text on light backgrounds: use `--text-heading` / `--text-body`
- Card text must contrast against `--bg-alt`, not just `--bg`
- Never place muted-color text on similarly muted background
- Test readability at actual presentation scale, not zoomed in

## 1.7 Slide Structure

- **Spectrum bar:** every content slide has a 4px rainbow gradient border at the very top (`border-top: 4px solid; border-image-source: var(--spectrum); border-image-slice: 1`). Dark slides (`title`, `divider`, `closing`) suppress this (`border-top: none`) and instead render a 1px top spectrum line via `background` if the `dark` modifier is used.
- Dark bookend slides: title (first) and closing (last) use `--bg-dark`
- Section dividers may also use `--bg-dark` or a strong accent
- Content slides: light background using `--bg`
- Consistent slide padding: 48-64px from all edges
- Content must never overflow into page number zone
- Page numbers: bottom-right, `bottom:24px; right:30px` — same vertical anchor as footer (`bottom:24px; left:30px`)
- Page number font, size, weight, letter-spacing, and color are identical to the footer
- Header: top area, consistent across content slides
- Footer: bottom-left, consistent across content slides

## 1.8 Cards & Containers

- All cards use rounded corners (border-radius: 10-16px)
- Cards have visible but subtle borders using `--border`
- Cards have internal padding (16-24px)
- Optional subtle box-shadow (blur 8-16px, opacity 0.03-0.06)
- Diagram containers: at least 0.8" margin from slide edges
- Cards never touch slide edges — always padded inside
- Card headers are auto-bolded by CSS on all card layouts — no `**...**` required in the Markdown. Writing `**text**` still works as a compatibility shim (it becomes a `<strong>` which CSS suppresses the redundant bold on)
- Card body is regular weight

## 1.9 Centering & Alignment

- Title, divider, sub-topic, closing, quote, big-number slides: all content centered vertically and horizontally
- Content and list slides: left-aligned or centered, consistent within the deck
- Card grids: centered as a group on the slide
- Stats rows: centered with even spacing
- Diagrams: centered within their container
- Nothing should feel off-center or floating to one side unless the layout explicitly calls for asymmetry (e.g., split panel, image)

---

# Part 2: Deck Directives

## 2.1 Frontmatter

```yaml
---
theme: uncover
paginate: true
html: true
header: "Deck Title or Brand"
footer: "Subtitle or Date"
style: |
  /* Full CSS theme here */
---
```

## 2.2 Per-Slide Directives

| Directive                   | Scope             | Effect               |
| --------------------------- | ----------------- | -------------------- |
| `<!-- _class: X -->`        | This slide only   | CSS class on section |
| `<!-- _paginate: false -->` | This slide only   | Hide page number     |
| `<!-- _header: '' -->`      | This slide only   | Hide header          |
| `<!-- _footer: '' -->`      | This slide only   | Hide footer          |
| `<!-- header: 'New' -->`    | This slide onward | Change header        |
| `<!-- footer: 'New' -->`    | This slide onward | Change footer        |

Underscore prefix = this slide only. No underscore = this slide and all following.

Title, divider, and closing slides should suppress header, footer, and pagination:

```markdown
<!-- _class: title -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->
```

## 2.3 Header, Footer & Pagination CSS

All three chrome elements share the same font, size, weight, and color. They differ only in position.

```css
section header {
  position: absolute;
  top: 24px;
  left: 30px;
  right: 30px;
  font-family: var(--font-mono);
  font-size: var(--fs-meta);
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}

section footer {
  position: absolute;
  bottom: 24px;
  left: 30px;
  right: 80px;
  font-family: var(--font-mono);
  font-size: var(--fs-meta);
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

/* Pagination — single mechanism across both rendering paths.
   The owned engine emits `data-lattice-pagination="N"` on each <section>
   (lib/engine/css.js); the browser runtime reads the identical attribute. Both
   paths render the page number via the same `section::after` pseudo-element rule. */
section[data-lattice-pagination]::after {
  content: attr(data-lattice-pagination);
}
section::after {
  position: absolute !important;
  bottom: 24px !important;          /* same vertical anchor as footer */
  right: 30px !important;
  padding: 0 !important;            /* REQUIRED: cancels Marp scaffold's
                                       padding:inherit (would otherwise inherit
                                       section's padding-bottom:88px and push
                                       the number ~88px above its anchor) */
  margin: 0 !important;
  font-family: var(--font-mono) !important;
  font-size: var(--fs-meta) !important;
  font-weight: 500 !important;
  line-height: 1 !important;
  letter-spacing: 0.06em !important;
  color: var(--text-muted) !important;
}
```

**Critical — !important is deliberate.** Marp's scaffold CSS injects `section::after { padding: inherit; }` and font defaults that load *after* the theme stylesheet at equal specificity, so the cascade order favours the scaffold. `!important` on padding, position, and font properties is the override that makes the theme rule win regardless of load order. This is one of the few places in the system where `!important` is the right tool.

**Single mechanism — no DOM span.** Earlier versions of lattice-emulator.js injected a `<span class="marp-slide-pagination">N</span>` element with its own positioning CSS, creating two divergent pagination paths. That has been removed: the engine emits a single `data-lattice-pagination` attribute (`lib/engine/slides.js`) — the Lattice-namespaced counterpart of Marpit's own `data-marpit-pagination` — and the single `section::after` rule handles both paths. Any new pagination styling lives on `section::after` only.

**CSS variables:** `--marp-slide-pagination-color` and `--marp-slide-pagination-font-size` are defined in `:root` for reference but the values above are set directly so the !important overrides apply. Update both if the variables are ever wired through.

In the owned engine: parse header/footer from front matter, inject into each slide's HTML, position via CSS. Respect per-slide overrides.

---

# Part 3: Slide Hierarchy

Slides in a deck follow this nesting:

```text
Title (1 slide)
  └─ Section Divider (marks major section boundary)
       └─ Sub-Topic (introduces specific topic)
            └─ Content slides (the material)
       └─ Sub-Topic
            └─ Content slides
  └─ Section Divider
       └─ Sub-Topic
            └─ Content slides
Closing (1 slide)
```

Not every deck needs all levels. A short deck might just be: Title → Content → Content → Closing. A long deck with multiple sections needs dividers and sub-topics for orientation.

---
