---
status: in-progress
summary: >
  Three baked-in accent treatments — the SPECTRUM ribbon, the heading UNDERLINE,
  and the EYEBROW kicker — become first-class, selectable "accent finishes":
  sibling registers of the Finish axis (like spectrum:/stamp:/tone:), each a thin
  front-matter key mapping to a `<x>-<value>` class on every section, deck-wide
  with per-slide override, palette-blind, defaulting to today's look (zero-config
  unchanged). SPECTRUM splits into two orthogonal sub-controls — STYLE (the
  gradient identity, which flows to EVERY spectrum-derived accent via the shared
  `--spectrum` token: table rails, timeline spines, code strips, hr) and EDGE
  (where the section-edge brand bar sits: top/left/right/bottom/off, which touches
  ONLY the bar, preserving the white-label decision that `off` must not kill
  structural rules). HEADING RULE gains none/full/short/accent variants; EYEBROW
  gains plain/dot/bar/tick/bracket. No new DOM injection — pure class-on-section
  toggling custom properties and pseudo-elements on existing chrome. Restraint is
  the load-bearing constraint: small curated sets, individually tasteful, defaults
  = current render, no franklin-stone combinatorics.
---

# Accent finishes — promoting three baked-in treatments to selectable finishes

> **Design model, written before any CSS/transform work** (CLAUDE.md
> "design-before-code"). It names the axes, lists candidate moves, and recommends
> one per axis; the genuine forks are bundled into a single confirmation round
> before implementation begins. It does **not** touch the backdrop `finish:`
> register — these are *accent* finishes (marks on chrome), not backdrops (fields
> behind content). Both live in the Finish axis; they are siblings, not the same
> register.

## The problem

Three decorative treatments are **baked in** today — hard-coded at each paint
site, with no single control:

1. **The spectrum ribbon.** The rainbow 3-stop gradient (`--spectrum` /
   `--spectrum-vertical`, defined per theme) is painted on the section top border
   (`base.elements.css:29`), the `.dark` top line (`base.modifiers.css:370`), the
   `divider` left rail (`divider.styles.css:15`), the centered `hr`
   (`base.elements.css:73`), the `list-steps` timeline spine
   (`list-steps.styles.css:108`), code-panel accent strips (`code`,
   `compare-code`, `highlight-js`), card underlines (`compare-table`,
   split-cover signature), and **five** table-header rails (`compare-table`,
   `glossary`, `statute-stack`, `obligation-matrix`, `roadmap`). The `spectrum:`
   register (`resolve-spectrum.js`) exists but is a narrow white-label toggle
   (`on`/`off`/`solid`) that **deliberately touches only the three brand-bar
   sites** and never the shared token — so it cannot restyle the ~12 other accents,
   offers no alternate gradients, and has no placement control.

2. **The heading underline.** Base headings carry `border:none`
   (`base.elements.css:41-46`). An underline appears in exactly two opt-in places
   — the `form` masthead hairline (full-width 1px `--border`, `masthead.css:47`)
   and the split-panel right-column `h3` rule (`split-panel.styles.css:26`). It is
   a flat hairline; there is no way to ask for a short rule, an accent rule, or
   none.

3. **The eyebrow.** The mono-caps kicker (matched by `p:has(>code:only-child)+h*`,
   `base.modifiers.css:123-146`) is deliberately **undecorated** — it strips
   background, border, padding. There is no way to give it a leading dot, a rule,
   or a tick.

The ask: consolidate spectrum behind **one selection** with multiple
styles/gradients and **placement** (top/left/right/bottom); give the heading
underline its **own** finish (full / short / …); and give the eyebrow a finish
(dot / border / accent / arrow). All **tasteful and controlled** — no
"franklin-stone" ransom-note deck.

## The model — three sibling "accent finish" registers

Each is a **new author register on the Finish axis**, following the exact pattern
the repo already ships eight times (`finish:`, `mode:`, `spectrum:`, `stamp:`,
`lift:`, `claim:`, `split:`, `palette:`):

- a pure, fs-free `lib/core/resolve-<x>.js` mapping a front-matter value to a
  `<x>-<value>` class token appended to **every** `<section>`, read identically by
  all three render paths (emulator / `plugins.js` / `runtime`);
- **deck-wide** via front matter, **per-slide** override via `<!-- _class:
  <x>-<value> -->`, **typo caught** as `unknown-<x>` by the linter;
- **palette-blind** CSS in `lib/base/` keyed off `section.<x>-<value>`, reading
  only `var(--spectrum/--accent/--border/--ink)` — a theme swap or `dark` recolors
  it automatically;
- **default = today's render** (the zero-config value paints exactly what ships
  now, so no existing deck moves a pixel).

Crucially — **unlike the backdrop finish, these need no DOM injection.** No
`.backdrop` div, no compositor. They toggle custom properties and pseudo-elements
on chrome that already exists (the section edge, the masthead hairline, the
eyebrow `<code>`). That makes them cheap and low-blast-radius.

They are grouped in docs and the Studio as **Accent finishes** (a named
sub-family of the Finish axis), distinct from **Backdrops** (`finish:`) — so a
designer sees "atmosphere behind the words" and "accents on the words" as two
shelves, not one soup.

### Restraint is the load-bearing constraint

The brief's explicit fear is a garish, over-decorated deck. So the design rule is
**curated-small, default-quiet**:

- Each register ships a **small** set (4–5 values), each independently
  boardroom-tasteful — not a parts bin.
- The **default value reproduces today's look** exactly.
- Accents **compose from the same token** (`--spectrum`/`--accent`), so a deck
  reads as one system even when an author turns two of them on.
- No new hex, no `url()`, no `margin` (HARD RULES #3/#20); every value survives PDF
  export (a flat rule or a token gradient — none of the alpha-fade export hazard
  that backdrops carry, so **no RICH/OPAQUE dual is needed here**).

---

## Axis 1 — SPECTRUM (expand the existing register; do not add a parallel one)

The consolidation the brief wants already has a natural home: **every accent
already reads one token, `--spectrum`.** The reason `spectrum:` can't restyle them
today is a *deliberate scope choice*, not a missing mechanism — the register was
built to leave the token alone so `spectrum: off` wouldn't nuke an author's `---`
rule. We reconcile the brief with that prior decision by splitting spectrum into
**two orthogonal sub-controls**, mirroring the multi-key `logo:`/`logo-on:`/
`logo-style:` precedent:

### 1a. `spectrum:` = **STYLE** (the gradient identity — flows to *all* accents)

Redefines `--spectrum` / `--spectrum-vertical` at the section level, so **every**
site that reads the token (bar, rails, spine, strips, hr) follows automatically —
*that* is the consolidation.

| Value | Gradient | Notes |
|---|---|---|
| `rainbow` | today's 3-stop theme ribbon | **default** (omit the key) |
| `solid` | a single `--accent` bar | today's `solid`, now token-level so it flows everywhere |
| `duo` | two-tone `--brand-bright → --brand-alt` | quieter than rainbow, still gradient |
| `mono` | `--accent → --accent-soft` tint ramp | most restrained |
| `off` | no accent | see interaction note |

### 1b. `spectrum-edge:` = **PLACEMENT** (where the section-edge bar sits)

Touches **only** the section-edge brand bar — never the structural accents — so it
preserves the white-label invariant that turning the *bar* off leaves table rails
and timelines intact.

| Value | Bar placement |
|---|---|
| `top` | **default** (today's top border) |
| `left` | left rail (the divider's existing look, generalized) |
| `right` | right rail |
| `bottom` | bottom rail |
| `off` | no section-edge bar (structural accents survive) |

**The `off` reconciliation (the one real tension).** Two "off"s now exist and they
are *different on purpose*: `spectrum-edge: off` removes the section-edge bar only
(today's `spectrum: off` behavior, preserved); `spectrum: off` (STYLE) blanks the
shared token so *all* accents drop — the "kill every rainbow" hammer the brief
also asks for, now available but never the default. This is the crux fork below.

**Placement feasibility:** `right`/`bottom` are new paint directions. The bar is a
`border-image`/background-line today; a `left`/`right`/`bottom` variant paints the
line on the corresponding edge via the same `background: var(--spectrum…) <edge> /
<size> no-repeat` idiom the `divider` and table rails already use — no new
primitive, and it measures cleanly (no `margin`, HARD RULE #20).

---

## Axis 2 — HEADING RULE — new register `rule:`

Controls the underline beneath a slide's heading. **System key `rule:`, human word
"Heading rule."** (`rule` is the typographic term for a printed line; it does not
collide with `hr`/`---`, which authors write as content, not a register.)

| Value | Underline |
|---|---|
| `auto` | today's behavior — full hairline where the masthead/split-panel already draw one, nothing on a plain content slide. **Default.** |
| `full` | a full-width hairline under any heading |
| `short` | a short rule (~8cqi) left-aligned under the heading |
| `accent` | a short rule painted in `--spectrum`/`--accent` instead of `--border` |
| `none` | no underline anywhere |

Restraint: `auto` keeps every existing deck identical; `short`/`accent` are the
opt-in "give it a signature" moves; `none` is the clean-slate escape.

---

## Axis 3 — EYEBROW — new register `eyebrow:`

Controls the decoration on the mono-caps kicker. **System key `eyebrow:`, human
word "Eyebrow"** (already the shipped author term, `base.docs.md:46`; the Form
model's Tile name "kicker" stays the internal structural word — no new synonym,
§2.5-clean).

| Value | Decoration |
|---|---|
| `plain` | today's bare mono-caps label. **Default.** |
| `dot` | a small filled `--accent` dot before the label |
| `bar` | a short leading `--accent` bar (vertical tick) before the label |
| `tick` | a leading `›`/chevron glyph |
| `bracket` | a hairline underline or side-rule framing the label |

Mechanism: a `section.eyebrow-<v>` class drives the eyebrow `<code>`'s `::before`
(dot/bar/tick) or `border`/`padding` (bracket). The existing `:has()` selector
already matches the relocated masthead eyebrow, so one rule covers both the plain
and `form` cases; split-panel's `.panel-eyebrow` can opt in in the same change.
Glyph marks (`tick`) use a CSS `content` string, never a `url()`.

---

## Why three registers, not one umbrella

The brief says the heading underline "should have a **separate** finish" and the
eyebrow "**doesn't have** a finish" — i.e. distinct, independently selectable
controls. §2.5 ("one concept, one name") also favors three concepts with three
words over one overloaded key. They are *grouped* (the "Accent finishes" shelf)
but *selected* independently, exactly like `spectrum:`/`stamp:`/`tone:` are today.

## Invariants (by inversion — "assume it shipped ugly; what did it?")

| The failure that would kill it | The invariant it forces |
|---|---|
| A deck turned into a ransom note — five accents all shouting | **Default-quiet, curated-small.** Defaults = today; accents share one token so they read as one system; ~4–5 values each. |
| `spectrum: off` silently killed an author's `---` rule / table rails (the prior white-label bug this register was built to avoid) | **STYLE vs EDGE split.** `spectrum-edge:` touches only the bar; only the explicit `spectrum: off` STYLE blanks the shared token. |
| An existing deck moved a pixel on upgrade | **Zero-config = current render.** Every register's default value paints exactly what ships now (verified by golden/integration decks). |
| A new gradient looked great in one theme, muddy in another | **Palette-blind, AA-audited across the theme surface** (the #19/#21 ratchet pattern); every value is `color-mix()` of `--spectrum/--accent/--border`. |
| An accent broke the PDF (the backdrop gray-cloud trap) | **Flat rules + token gradients only** — no full-bleed alpha fade, so **no RICH/OPAQUE dual needed**; still export-signed-off because bytes change. |
| Three keys drifted from three render paths | **One resolver each, shared by all three paths** (the shipped register contract); a rot-guard test + lint vocabulary, like every sibling register. |
| A right/bottom bar corrupted the Fit Spine height math | **No `margin`** (HARD RULE #20) — edges paint via `background`/`border`, which measure cleanly. |

## Sequencing options (the delivery fork)

- **A — one cohesive PR** delivering the "Accent finishes" family (three registers,
  three commits, one demo deck, one doc). Matches HARD RULE #17 (one feature = one
  branch) if we treat the family as the feature; ships the whole idea at once.
- **B — spectrum first** (the biggest, highest-impact, and the branch's namesake),
  then heading-rule and eyebrow as a fast follow. Banks the consolidation win
  early; smaller review surfaces.

Both honor #8 (gallery isolation) and #9 (per-feature demo deck). Recommendation
below.

## Gates each slice honors

- **#1** all three render paths emit identical classes (resolver is shared).
- **#3 / #20 / #21** no hex, no `margin`, US-English throughout.
- **#9 / #10 / #6** per-feature demo deck (+ PDF); CHANGELOG + `base.docs.md` +
  `design-system.md` (register table) + this doc updated in the same change.
- **Export sign-off (Quality Bar)** — accents change exported bytes, so a
  representative demo renders in **dark + light through both export engines** for
  human approval before done.
- **Studio catalogs** (`spectrum-catalog.ts` + two new) kept in step with the
  resolvers (rot-guard).

## Recommendation

Adopt the three-register "Accent finishes" family with the value sets above,
**defaults reproducing today's render**.

## Confirmed (2026-07-15)

The confirmation round resolved all three forks:

- **Consolidation — all accents follow.** A `spectrum:` STYLE change redefines the
  shared `--spectrum` / `--spectrum-vertical` token at the section level, so every
  spectrum-derived accent (bar, table rails, timeline spine, code strips, hr)
  follows as one system. `spectrum: off` flattens them to a quiet `var(--border)`
  hairline (matching the established print convention) **and** removes the prominent
  section-edge/divider bar — a full, tasteful de-brand. The separate
  `spectrum-edge:` register touches ONLY the section-edge bar (top/left/right/
  bottom/off), so removing or moving the bar never disturbs structural accents.
  *This widens `solid`'s blast radius (it now flows to structure, not just the bar)
  and changes `off` (structure goes neutral, not rainbow) — logged **Breaking** in
  the CHANGELOG.*
- **Breadth — curated small set.** 4–5 values per register, each defaulting to
  today's render; no combinatorial franklin-stone surface.
- **Delivery — one cohesive PR.** The three registers ship together as the "Accent
  finishes" family: three commits, one demo deck (`examples/accent-finishes.md`),
  one doc, one review; maker-checker on the diff, then dual-engine export sign-off.

## Follow-up (2026-07-16) — `spectrum-card:` opt-in card rail

Review question: the spectrum STYLE *recolors accents that already exist* (via the
shared token) but does not *paint a spectrum border on a card that never had one*.
So the consolidation reached only the ~9 components + section edge + `hr` that
already read `--spectrum` — a generic card (`cards-grid`, `stats`, `pricing`, …)
got nothing. Added a fourth spectrum sub-register to close that gap:

- **`spectrum-card:`** (`off` default / `on`) + per-slide `spectrum-card` /
  `spectrum-card-off`, modeled on `lift:`. **Opt-in** — a card carries no rail unless
  asked (a rail on every card by default is the ransom-note look).
- The rail is a **left `background-image` layer** on the card surface — adds no
  layout (no box-shift, HARD RULE #20), respects the card's `border-radius`, and
  preserves its `--bg-alt` fill without needing its token. It reads the shared
  `--spectrum` token, so it inherits the deck's STYLE automatically.
- Covers both card forms — the post-processed `.card` div AND the native
  nested-list `> .cell-stage > ul|ol > li` tile — across cards-grid / cards-stack /
  compare-prose / stats / pricing / verdict-grid. A card component added later opts
  in by extending the selector list (documented in `base.accent-finish.css`).
