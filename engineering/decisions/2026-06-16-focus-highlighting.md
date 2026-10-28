---
status: proposed
summary: Design model for a universal, CSS-driven, cross-format per-element focus/highlight capability splitting targeting from treatment
---

# Focus & highlighting — a universal, CSS-driven, cross-format model

**Status:** design ratified 2026-06-16 (rendered mockups reviewed and the
defaults confirmed). This note owns the **model and execution plan**; it is the
spec the implementation lands against. First cut scope, the treatment defaults,
and the authoring grammar are all locked below.

---

## 1. Why now — dense slides need a "look here"

The best presenting habit on a dense slide is to **focus the room on one
thing**. A slide heavy with a table, a long list, or a card grid is really a
*reading* slide; when you present it live you walk the audience through it one
element at a time. Lattice had no way to express that: every styling directive
is **slide-scoped** (`<!-- _class: X -->`), there is zero per-element
addressing, and the only "things worth focusing" anyone had named were the
three obvious collections (list / table / grid).

This adds a first-class **focus** capability that is:

1. **Universal** — one grammar addresses any focusable surface, not a
   per-component bolt-on.
2. **CSS-driven** — the visual is pure `var(--token)` CSS; the engine only tags
   nodes. Palette-blind, theme-tunable.
3. **Cross-format** — survives PDF **and** PPTX identically, because of how
   export actually works (§6).

## 2. The core split — Targeting ⟂ Treatment

The one design move that makes this scale: **separate *what* you focus from
*what focus looks like*.** They are orthogonal. The author names a target with
one grammar; a small CSS contract renders it. Any treatment works on any
target, so we never write "highlight a row" code — we write a resolver that
tags a node and CSS that styles a tag.

## 3. Targeting — an ordinal grammar, axes declared per bucket

There is no inline-attribute syntax in the engine (`markdown-it-attrs` is off),
and markdown table syntax has **no place to hang a class off a row or a
column** — which is fatal to any "co-locate the marker with the content"
approach the moment you want to focus a *column*. So targeting lives where
directives already live: a slide directive with an **ordinal selector** that
reads like speech and counts from 1.

```markdown
<!-- _focus: row 4 -->        # table / grid body row
<!-- _focus: item 3 -->       # list / card / grid item
<!-- _focus: col 5 -->        # table / grid column
<!-- _focus: cell 4,5 -->     # row × column intersection
<!-- _focus: line 3-4 -->     # code lines (range)
<!-- _focus: row 2, row 4 --> # compare two
<!-- _focus: item 2-4 -->     # range
```

The universal form is **`_focus: <axis> <ordinal>`**, where each component
**bucket declares which axes it supports** (the part that makes one grammar
cover everything):

| Bucket | Axes (first cut **bold**) |
|---|---|
| inventory (list / cards / grid) | **`item N`**, `row N`, `col N` |
| comparison (tables, columns) | **`row N`**, **`col N`**, **`cell R,C`**, `panel N` |
| code | **`line N`**, **`line A-B`** |
| progression (timeline / steps) | `step N` |
| evidence (stats, quote) | `stat N`, `quote` |
| chart | `series N`, `bar N` |
| diagram | `node "Label"`, `edge` |
| legal | `clause N` |

**First cut (locked):** the grammar engine + `item` (list/grid), `row`/`col`/
`cell` (table), and `line` (code). The remaining buckets are deferred but cost
nothing new — they only declare an axis and a primary-collection selector.

### 3.1 Wiring — directive → data attr → resolver → tagged nodes

1. **Directive recognition.** Add `focus`, `focusStyle`, `focusSteps` to
   `KNOWN_DIRECTIVES` (`lib/engine/directives.js`). The existing apply step
   (`lib/engine/slides.js`, `lattice_directives_apply`) already emits a
   `data-<kebab>` attribute for every recognised directive, so `_focus: row 4`
   becomes `data-focus="row 4"` on the `<section>` for free.
2. **Resolver transformer.** New `lib/transformers/focus.js`, registered in
   `lib/transformers/registry.js`, runs at the HTML-string level **after**
   structural transforms settle (same slot discipline as `pill-tag`). For each
   `section[data-focus]` it:
   - parses the selector(s),
   - finds the slide's **primary collection** for that axis (per-bucket
     selector map: `compare-table → tbody tr / th,td`, `cards-grid → > ul > li`,
     `list → > :is(ul,ol) > li`, `code → pre > code`),
   - tags the matched node(s) `.lat-focus` and their siblings `.lat-recede`,
   - stamps `data-focus-axis="row|col|cell|item|line"` on the section (drives
     the content-aware default in §5),
   - is a **no-op with a build-time warning** if the ordinal is out of range or
     the axis is unsupported by the layout (never silently mis-tags).
3. **CSS does the rest.** Both classes are explicit, so the stylesheet never
   needs `:has()` / `:not(:has())` — banned in theme CSS for the Marp preview
   Chromium (HARD RULE 12). Plain `.lat-recede` / `.lat-focus` selectors only.

### 3.2 Code-line focus needs line-wrapping first

Confirmed against the rendered DOM: a fenced block emits
`<pre><code>…</code></pre>` with the lines as **newline-separated text, not
elements** (highlight.js colours tokens inline; it does not wrap lines). So
`line N` is **not** addressable until each line is wrapped. The resolver's
code path must first split `<code>` into per-line `<span class="ln">` elements
(preserving the inline hljs spans within each line), then tag the Nth. This is
the one axis that needs DOM surgery rather than just class-tagging; everything
else is already element-addressable.

## 4. Progressive steps — walk the slide (locked: yes)

A reading slide is walked one element at a time, so focus is inherently
sequential. `_focus-steps` expands **one authored slide into N rendered
slides**, each focusing the next target — the static-format equivalent of a
live build.

```markdown
<!-- _focus-steps: row 2 | row 3 | row 4 -->
```

- **Semantics:** *replace* (the focus moves; one thing at a time) — the model is
  "spotlight walks down," not "accumulate highlights." Cumulative/additive mode
  is a documented future option, not first cut.
- **Mechanism:** a plugin running at slide-container time clones the slide's
  token run once per step, injecting `data-focus="<step>"` on each clone.
  Pagination and counts treat them as ordinary slides (so PDF page-count and the
  PPTX slide-per-image pipeline need no special casing). This is the one
  invasive piece — it touches slide splitting — so it lands as its own commit
  with its own page-count integration test.

## 5. Treatment — content-aware default + named variants

All treatments are pure CSS over `var(--token)`; the engine only supplies the
`.lat-focus` / `.lat-recede` tags and `data-focus-axis`. **No hex, no
mask-image** (§6).

### 5.1 The catalog (rendered and reviewed, `.scratch/focus-mock.pdf`)

| Style | Move | Reads best on | Ships first cut |
|---|---|---|---|
| **spotlight** | recede the rest (dim `.lat-recede`), lift the target | lists, grids, code, prose | ✅ |
| **ring** | accent outline on target, **no dimming, no layout shift** | data tables (keeps comparison legible) | ✅ |
| **list-fill** | accent-soft **fill** on the target item, rest untouched | lists / cards where dimming is too much but you want a "selected" read | ✅ |
| **blur** | recede the rest by **defocus** (`filter: blur`), target stays sharp **and in place** | the literal camera-focus; opt-in (added post-ratification, verified to survive PDF + PPTX). Its target lift (a 1.02 scale plus a hard accent shadow) was removed on 2026-10-27 for the fault that removed `pop`: at 1280px it sheared outer cards by up to 14.75px at the stage clip and moved the cards by up to 23px | ✅ |
| **highlight** | accent **tint + edge** on the target (cards, rows, columns, cells, code lines; an edge on a chart mark and a heavier line on a series), rest untouched, no weight or size change; the `verdict-grid` `preferred` look without the spark (added 2026-10, replacing `pop`) | when dimming is too much and a bare ring or fill is too faint | ✅ |
| pointer | margin caret at the target, nothing dimmed/filled | tables where even a fill is too much | deferred |
| lift | fill + weight + accent bar on target | tables, middle ground | deferred |
| both | spotlight + ring | a single "this one number" climax | deferred |

### 5.2 The default is content-aware **by axis**

The rendered mockups exposed the key nuance: on a **comparison table**,
Spotlight dims the other rows and **destroys the comparison the table exists
for** — whereas on a **list or grid** the non-focused items genuinely are
secondary and the dim is the strongest look. So a single global default is
wrong. The default keys off `data-focus-axis` (stamped by the resolver), which
is the precise signal:

- `axis ∈ {row, col, cell}` (table-like) → **ring** (keep every cell legible).
- `axis ∈ {item, line}` (list / grid / code) → **spotlight** (dim the rest).
- Author overrides per slide with `<!-- _focus-style: spotlight | ring |
  list-fill -->`; the named style always wins over the auto default.

This is the confirmed decision: *content-aware default, with `spotlight`,
`ring`, and `list-fill` as explicit variants.* (`blur` and `highlight` joined later; `pop` was removed before GA because it scaled the target and cast a shadow past its edge, which moved the layout and clipped at the stage.)

### 5.3 CSS contract & tokens

A focus block in `lattice.css`, gated entirely on the tags + style attribute:

```css
/* role tokens — themes may retune; defaults live in lattice.css */
:root { --focus-dim: 0.24; --focus-ring: var(--accent); --focus-fill: var(--accent-soft); }

/* content-aware auto (no explicit _focus-style) */
section[data-focus-axis="item"]:not([data-focus-style]) .lat-recede,
section[data-focus-axis="line"]:not([data-focus-style]) .lat-recede { opacity: var(--focus-dim); }
section[data-focus-axis="row"]:not([data-focus-style]) .lat-focus td,
section[data-focus-axis="col"]:not([data-focus-style]) .lat-focus { /* ring */ }

/* named variants */
section[data-focus-style="spotlight"] .lat-recede { opacity: var(--focus-dim); }
section[data-focus-style="ring"]      .lat-focus  { /* accent outline */ }
section[data-focus-style="list-fill"] .lat-focus  { background: var(--focus-fill); }
```

Row ring = `box-shadow` insets on the row's cells (top/bottom on every cell,
plus the side edge on first/last) — draws a full rectangle with **zero layout
shift**. Verified in the mock; survives PDF + PPTX.

## 6. Cross-format truth — why blur/dim/ring all survive "off world"

The original worry was that web-only tricks (blur, dim) won't translate to
exported formats. They do, because of the pipeline (`engineering/pipeline.md`
§6, `lib/export/pptx-export.js`):

- **PDF** = Chromium print-to-PDF (`printBackground:true`) — whatever the
  browser paints, the PDF keeps. Opacity, filters, box-shadow, gradients,
  `::before` carets: all survive.
- **PPTX** = **each slide is rasterised to a full-bleed PNG screenshot of the
  Chromium render**, then placed in the slide. *Not* rebuilt as native shapes.
  So any effect that survives the screenshot survives PPTX — which is all of
  them.
- **Editable PPTX** (`--editable`, Calco) rebuilds the slide as native text and
  shapes, and a focused column's inset `box-shadow` ring and tint cannot be a
  native shape, so they become one picture spanning every row. Each focused
  cell's text is drawn free, above that picture (the reader's `underPicture`
  test, `docs/src/lib/calco/reader.ts`); before that fix the header and the last
  cell's text sat inside their rows' groups and the picture covered them. The
  cost: in the editable file, a focused cell's text no longer moves with its
  row. The test fires only for a picture drawn after the text's card, so a card
  over a gradient panel keeps its text grouped.
  Known limit: free text is drawn at the very top, so a positioned overlay on
  a focused cell would sit under that cell's text (no shipped deck does this).
  A highlighted card's edge is an inset `outline`; Calco draws it as a native
  inside stroke, so the card stays an editable shape grouped with its text.
  `blur` is the one treatment the editable PPTX bakes: the receded cards are a
  picture, because no office format blurs live text.
  Regression: `test/integration/export/calco-focus-column.test.js`.

The **only** fragile primitive is SVG `mask-image` (Apple PDFKit drops soft
masks — `engineering/gotchas.md`). The focus treatments deliberately use
**opacity / box-shadow / fill** and **never a mask**. A dark-mode render is in
the mock (slide 14) to prove the recede reads on both colour schemes.

## 7. First-cut scope & deferrals

**Ships (locked):**
- `_focus` ordinal grammar + resolver; axes `item` (list/grid), `row`/`col`/
  `cell` (table), `line` (code, with line-wrapping).
- `_focus-steps` progressive expansion (replace semantics).
- Treatments: content-aware-by-axis default + `spotlight` / `ring` /
  `list-fill` named styles.
- Lint (`lib/authoring/lint-core.js`): validate axis-vs-layout and
  ordinal-in-range; warn on mismatch.
- Per-feature demo deck `examples/focus.md` (+ committed `.pdf`), light **and**
  dark, per HARD RULE 9 and the export-inspection gate.
- Docs: `lib/base/base.docs.md` (cross-cutting authoring), the relevant
  component `*.docs.md` axis notes, `CHANGELOG.md` `## Unreleased`.

**Deferred (documented, cheap to add later):** `pointer` / `lift` / `both`
styles; the `step` / `stat` / `series` / `node` / `clause` axes; cumulative
step semantics; `markdown-it-attrs` inline addressing (rejected for first cut —
can't address a column).

## 8. Test plan / gates

- **Resolver unit tests** — each axis tags the right node(s); ranges &
  multiples; out-of-range → warn + no-op; code line-wrap preserves hljs spans.
- **Semantic-invariant** — focus classes present on the right nodes across both
  render paths (owned engine + `lattice-runtime`).
- **Integration** — `_focus-steps` expands to the expected PDF page count;
  PPTX still one image per (expanded) slide.
- **Pixel/visual** — `examples/focus.md` rendered light + dark, reviewed via
  `rasterize-for-review.sh`; the maker-checker fan-out per `visual-review.md`
  for the treatment sweep.
- **No regressions** to HARD RULE 12 (no `:has`/`:not(:has)` in the focus CSS).

## 9. Risks

- **Step expansion touches slide-splitting** — highest-risk piece; isolate in
  its own commit with the page-count test as the guard.
- **Row ring across collapsed table borders** — box-shadow insets are robust,
  but verify against every table-family layout (compare-table, glossary,
  obligation-matrix) before graduating.
- **Code line-wrap × existing code transforms** — must run after highlight.js,
  before tagging; guard the `compare-code` two-block case.
