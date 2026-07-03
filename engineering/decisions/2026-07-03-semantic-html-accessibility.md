---
status: proposed
summary: Retag structural divs to native AA-sensible elements (change the tag, keep the class, keep the styling — never wrap), governed by a promotion rubric that stops both under-tagging (Studio has no `<main>`) and over-tagging (landmark noise). Two surfaces — the app (website/Studio/Playground) and the decks (web preview + HTML export). The slide stays `<section>` (measurement + all CSS select it). The deck `<main>` is TWO edits on TWO render paths — a sanctioned `<main>` wrapper in the export shell (theme CSS is section-scoped there) AND the engine/preview `div.lattice → main.lattice` retag with its lockstep `css.js` kernel edit (its CSS is tag-qualified to `div.lattice > section`); DECISION: do both. `<figure>` for charts is a semantic win folded into the SAME change (DECISION: one combined, export-signed PR — not two phases). Headingless slides (quote/big-number) get a front-matter aria-label; presentational divs stay div (restraint confirmed). Direction hardened by a red-team, an inversion pass, and an independent checker — which caught a shipped-regression aria-hidden defect, the two-path container reality, and that slides are mostly `<h2>` not `<h1>`; all folded in (§10). Guard rails get real gates, not prose. Forks resolved §13.
---

# Semantic HTML for accessibility — retag, don't wrap

**Date:** 2026-07-03
**Status:** design proposal (design-before-code; no CSS/transform written yet)
**Branch:** `claude/semantic-html-accessibility-qdht2a`
**Scope:** the app (docs site: marketing, Studio, Playground, Components) **and**
the decks (live web preview + HTML export). **Out of scope:** the export-to-Marp
bundle (`lib/core/marp-bundle.js` — the recipient's Marp owns that HTML shell),
and PDF/PPTX tag trees (raster/print artifacts, not a DOM a screen reader walks).

> **This is the second draft.** The first was put through the three adversarial
> passes the brief asked for — a red team, an inversion analysis, and an
> independent checker. They confirmed the *direction* (retag-don't-wrap, a
> restraint rubric, slide-stays-`<section>`) and every WCAG/ARIA fact it leaned
> on, but overturned four load-bearing *mechanics*. §10 records exactly what
> changed and why; the body below is already corrected.

---

## 1. The problem, in plain language

We already do well on the two accessibility axes people notice first: color is
palette-blind and CVD-safe, and text hits WCAG AA contrast. The axis we've barely
touched is the one a **screen-reader** user actually navigates by — **structure**.
A blind user doesn't scan the slide with their eyes; they jump between
**landmarks** ("skip to the main content"), **headings** ("what's on this slide"),
and **regions** ("the editor pane, the preview pane"). If the page is a soup of
`<div>`s, none of those jumps exist — the whole document is one undifferentiated
blob they must read top to bottom.

Two concrete holes, found by reading the code (not guessing):

- **The Studio — our flagship surface — has no `<main>` at all.** Its primary
  work region is a `<div class="group/split grid …">` (`StudioShell.tsx:1524,1542`).
  A screen reader offers the user no way to jump to the content; there is no "main"
  to skip to.
- **Every exported deck is a landmark desert.** The HTML export shell
  (`lattice-emulator.js:1449-1463`) has **no `lang`**, **no `<main>`**, **no skip
  link**, and no document title — just `<body>` with a flat pile of slide
  `<section>`s. A screen-reader user opening a shared deck link lands in an
  unlabeled, language-unset document.

The good news the recon turned up: **we are not starting from zero, and the fix is
mostly cheap.** The slide is *already* a `<section>`; the deck already emits
per-slide `<header>`/`<footer>`; 43 of 56 components already emit native markdown
(`<h1>/<h2>/<p>/<ul>/<table>`); the home page is already a clean
`<main>`/`<section>`/`<footer>` reference. And critically — **all *stylesheet*
selection is keyed on classes, not element types** (zero bare `div` selectors, zero
`> div` combinators across both `lib/**/*.css` and `docs/src/styles/`). So we can
change what most boxes *are* without changing how they *look*. (The two exceptions
where retag is *not* free — tag-qualified JS selectors and the engine's own packed
CSS — are the subject of §7 and §8, flagged by the checker and red team.)

---

## 2. What we want — and the one instruction that shapes everything

**One sentence:** *give every surface a landmark skeleton and sensible regions a
screen reader can navigate, by changing elements — not by adding wrapper `<div>`s.*

The "never wrap" instruction is not a style preference — it is load-bearing, for
three reasons the code forces on us:

1. **Wrapping breaks the height math.** HARD RULE #20: the layout measures via
   `getBoundingClientRect`/`scrollHeight` (the overflow probe, the Fit Spine).
   Every extra wrapper is another box the probe and the fit-scale must account
   for, and a wrapper that carries any margin corrupts the measurement outright. A
   *retag* adds zero boxes.
2. **Wrapping changes exported bytes.** A new DOM node shifts layout by a hair;
   PDF/PNG/PPTX are pixel-diffed against goldens. A block-for-block retag
   (`div`→`section`/`article`/`header`/`footer`/`nav`/`aside`/`main`) is the *same
   box model* — byte-neutral. (`<figure>` is the exception, quarantined in §7.)
3. **Wrapping fights the class-keyed CSS.** Since every stylesheet rule targets
   `.funnel-figure` / `.cell-stage` / `.pg-pane`, moving the class onto a
   *different tag* keeps every rule; inserting a *new* wrapper needs new CSS and
   risks descendant-combinator surprises.

So the whole design reduces to: **for each structural node, either promote its tag
to the native element that carries its role, or leave it alone — and add the small
set of genuinely-missing landmarks/attributes that no existing node can carry.**

**One honest exception up front (found by the red team, §10-R4):** the export
`<main>` *has* to be a wrapper, because the export shell throws the container away
(§4). That single wrap is sanctioned and safe (`<main>` has no UA margin; the
export's theme CSS is `section`-scoped, so a wrapper can't unstyle anything). It is
the *only* sanctioned wrap; everything else is a retag.

---

## 3. The one real design question: how far do we promote?

The naïve reading of "make it semantic" is "turn every `<div>` into a `<section>`."
That is a **trap**, and naming why is the spine of this design.

A screen reader turns landmarks and regions into a *navigation menu*. Ten genuine
regions is a useful menu. Forty `<section>`s — one for every visual box — is a menu
with forty items, most meaningless, which is **worse than none**: the user can no
longer find the three that matter. Over-tagging is an accessibility anti-pattern in
exactly the same way under-tagging is. (This is why WCAG 1.3.1 is about
*information and relationships* — real structure — not "use more elements.")

So "how semantic?" is not a dial you turn to maximum. It's a **judgment applied
per node**, and the design's job is to make that judgment a *rubric* instead of
taste. A `<div>` earns promotion only when a native element carries its **role**:

> **The promotion rubric.** Promote a `<div>` to element `E` only if the node's
> actual purpose matches `E`'s ARIA role, AND that role helps a user *navigate or
> understand*. Otherwise leave it a `<div>` — a plain grouping box is a correct,
> honest `<div>`.
>
> | Promote to | …when the node is | Role it gains | Nesting caveat |
> |---|---|---|---|
> | `<main>` | the one primary-content region of a document | `main` (skip target) | **exactly one per document** |
> | `<nav>` | a set of navigation links/controls (slide rail, primary nav) | `navigation` | keeps role when nested |
> | `<header>` / `<footer>` | the intro/meta strip of a document *or* section | `banner`/`contentinfo` at page top level; **generic inside a `section`/`article`/`main`/`aside`/`nav`** | degrades — this is a feature (§3 note) |
> | `<section>` | a thematic region a user would jump to, **that has an accessible name** | `region` — **only if named**; otherwise generic | must be named to count |
> | `<aside>` | complementary content beside the main flow (Inspector, Architect) | `complementary` | **keeps role even inside `<main>`** — so it must be a *sibling* of main, not a child (§10-R3) |
> | `<figure>`/`<figcaption>` | a self-contained graphic + its caption (a chart) | `figure` | UA margin — see §7 |
> | `<article>` | a self-contained, independently-meaningful unit (a carousel card) | `article` | keeps role |
> | **leave `<div>`** | a **presentational** box: a layout cell, a backdrop, a scrim, a positioning wrapper | none — correct as-is | — |

The rubric's most important row is the last one. `.cell-stage` (the body cell),
`.backdrop`, `.image-scrim`, `.lattice-bg`, the split-panel columns — these are
**presentational** boxes. They stay `<div>` (the genuinely-decorative ones also get
`aria-hidden` — but **never** a box that holds authored text; see §8-#4 and the
`.image-text` trap, §10-I1). Promoting the presentational boxes would manufacture
landmark noise for zero navigational gain. **Restraint is part of the design, not a
gap in it.**

Two nesting facts the rubric now states explicitly, because the first draft got the
second one wrong (§10-R3):

- **`<header>`/`<footer>` degrade to generic inside a sectioning element.** This is
  *why* the ~per-slide `<header>`/`<footer>` we already emit don't pollute the
  landmark map with 40 banners — each lives inside a slide `<section>`. A feature.
- **`<aside>` does NOT degrade.** A `<complementary>` stays a landmark wherever it
  sits, including inside `<main>`. So a `<main>` must never *contain* the Inspector
  or Architect asides — they belong beside it. This directly reshapes the Studio
  change (§5).

---

## 4. The mapping — decks (the engine), and the two-path reality

The single highest-value deck change is giving an exported deck a `<main>`, a
`lang`, and a skip link. The first draft treated "the deck container" as one node
to retag. The checker and red team proved there are **two independent render paths
with two different container realities** — so this is two edits, not one:

**Path A — the HTML/PDF/PNG/PPTX export (`lattice-emulator.js`).** The export does
**not** keep the `div.lattice` container. `splitTopLevelSections`
(`lattice-emulator.js:1133`) extracts bare `<section>` spans and **discards the
wrapper**; the shell injects those bare sections straight into `<body>`
(`:1463`), and re-applies slide geometry with a bare `section[data-lattice-slide]{…
!important}` rule (`:1457`). Its theme CSS is the raw, `section`-scoped
`lattice.css` (`:391`), *not* the engine's packed `div.lattice > section`. So:
- **Add a `<main id="deck" tabindex="-1">` wrapper around the injected slides**
  (`:1463`). This is the one **sanctioned wrap** (§2) — safe precisely because the
  theme CSS is `section`-scoped (a wrapper can't unstyle it) and `<main>` has no UA
  margin (byte-neutral). Changing `slides.js:229` would do **nothing** here.
- **Add `lang`** to `<html>` (`:1450`) — from the deck `lang` front-matter, else
  `en` (WCAG 3.1.1).
- **Add a skip link** as the first body child, `<a href="#deck">`, with the
  visually-hidden CSS *inlined* so it can never render visibly if a stylesheet is
  absent (§10-I7); the target `<main>` carries `tabindex="-1"` so focus actually
  moves (§10-I2 — the classic skip-link half-fix).

**Path B — the engine/preview render (`lib/engine`, used by the docs-site `srcdoc`
previews and the VS Code runtime).** Here the `div.lattice` container *is* present,
but the engine's own selector packer scopes **every** themed rule and the geometry
scaffold to `div.lattice > section`, deliberately tag-qualified to `div` for
(0,1,2) specificity that beats the preview-frame's `.lattice > section` sizing rule
(`lib/engine/css.js:104,243`, with the rationale in the comment at `:99-103`).
Retagging the container to `<main>` here therefore **cannot** be done in `slides.js`
alone — it requires editing `css.js` (the `scaffold()` rules `:104-153` and
`packSelector` `:243`) to emit `main.lattice > section` at the same specificity, in
lockstep across the shared kernel (HARD RULE #1), proven by pixel-diff.

**Decision (Fork D, §13): do BOTH paths in this feature.** Path A is where a real
user reads a deck standalone (the shared link); Path B makes the embedded previews
navigable too. The owner call ("we don't settle") takes the complete path: Path B
carries the lockstep `css.js` edit (`scaffold()` `:104-153` + `packSelector` `:243`
→ `main.lattice > section` at the same (0,1,2) specificity), a pixel-diff, and a
maker-checker pass (shared kernel, HARD RULE #1). It is one of the export-bytes
surfaces the single sign-off (Fork B) covers.

The per-node mapping (Path-independent). **Bold = a change; the rest is "confirmed
correct, leave it."**

| Node (today) | File | Verdict |
|---|---|---|
| slide wrapper `<section>` | `lib/engine/slides.js:99` | **Keep `<section>`.** Already correct; measurement + hundreds of `section.<name>` rules + `div.lattice > section` packing depend on it. Non-negotiable (§8-#1). |
| deck container `div.lattice` | `slides.js:229` | **Path B (in scope):** `div.lattice → main.lattice` *with* the `css.js` lockstep edit + pixel-diff. **Not** touched for the export (Path A wraps instead). |
| export shell `<body>` slides | `lattice-emulator.js:1463` | **Wrap in `<main id="deck" tabindex="-1">`** + `lang` + skip link. The sanctioned wrap. |
| per-slide `<header>` / `<footer>` | `slides.js:210,216` | **Keep.** Already semantic; generic (not landmarks) because nested in the slide `<section>` — correct. |
| headings from native components | (markdown) | **Keep authored levels.** Reality (§10-R1): mostly `<h2>`, one `<h1>` (`title`), a couple headingless (`quote`, `big-number`). Do **not** synthesize an `<h1>` per slide. |
| chart figure wrappers `.funnel-figure`, `.quadrant-figure`, `.radar-figure`, `.state-chart-figure`, `.functionplot`, … | 13 `*.transform.js`, `plugins.js:969` | **→ `<figure>` + `<figcaption>`** — a chart is the textbook `<figure>`. **Carved into its own phase (§7): UA-margin, a JS-selector hazard, and export-byte cost.** |
| `.cell-stage` (body cell) | `masthead-lift.js:63` | **Leave `<div>`.** Presentational layout cell; the probe keys on its *class*. Promoting adds a nameless region. |
| `.backdrop`, `.image-scrim`, `.lattice-bg` | plugins / scrim / bg-image | **Leave `<div>` + `aria-hidden="true"`.** Pure decoration; `.image-scrim`/`.backdrop` are already hidden today. |
| **`.image-text`** | `lib/core/bg-image.js:150` | **Leave `<div>`, and NEVER `aria-hidden`** — it holds the author's `<h2>`/`<p>` on every image slide (§10-I1, the caught regression). |
| split-panel columns `.panel-left/.panel-right` | `split-panels.js` | **Leave `<div>`.** Two columns of one comparison aren't two landmarks; the *content* inside carries its own semantics. (Alternative named-regions considered and rejected, §10-R-Fork-C.) |
| carousel card `.ct-card` | `carousel.js:329` | **Keep `<article>`.** Already correct. |

Deliberately **not** doing at the deck level: `role=` on native elements (redundant
role is its own anti-pattern), and — the reframed decision — per-slide
`aria-label`s naming every slide as a region (that would flood the rotor with 40
named regions; §10-R1, Fork A).

---

## 5. The mapping — the app (docs site)

The home page is already the reference (one `<main>`, real `<section>`s, `<header>`,
`<footer>`, `<nav aria-label="Primary">`). The work is bringing the app surfaces up
to it. **Bold = change.**

| Surface | Change |
|---|---|
| **Studio** (`StudioShell.tsx`) | **Add a `<main id="main-content" tabindex="-1">` scoped to the editor+preview subtree — NOT the whole split grid** (which contains the Architect/Inspector `<aside>`s; an `<aside>` keeps its landmark role inside `<main>`, so the asides must stay siblings of main, §10-R3). **Cover all four view branches** — mobile (`:1498`), focus (`:1521`), desktop (`:1537`), **and Fabricate (`:1494`)**, which the first draft missed (§10-R-M1); wrap once above the branch if cleaner. **Name each region** (`<section>`/`<aside>`/`<nav>`) via `aria-labelledby` pointing at a **dedicated `<span id>`**, not a label *container* (which would concatenate junk, §10-I2); Studio has **no** `.pg-pane-label` (that's Playground-only), so audit each region for a real label node first, else use `aria-label`. Regions that can collapse to a rail must be named by an always-present label or `aria-label` (§10-I8). |
| **Playground** (`PlaygroundApp.tsx`) | Already has `<main>` + `<section>` panes and `.pg-pane-label` anchors (`:584,603`). **Name the panes** (`aria-labelledby` → a text `<span id>` inside the label, not the label div). Add a **skip link** + `tabindex="-1"` on `<main>`. Optional **`<footer>`** for parity. |
| **All standalone pages** | Add a **skip-to-content link** as the first *tabbable* element, targeting each page's `<main id="main-content" tabindex="-1">`. None exist today. The page skeleton is duplicated per page, so this is applied per surface — *unless* we first extract a shared skeleton (a follow-up). |
| **SiteHeader** (`SiteHeader.astro`) | **No change** — already `<header>` + `<nav aria-label="Primary">`. The one shared top-nav; leave it. |
| Preview iframe | **No landmark change** — separate `srcdoc` document (isolated tree); its *content* is Path B of §4 (in scope). Host references it accessibly already (`<iframe title="Rendered slides preview">`). |
| Split panes | **No change — and record it so a future retag doesn't regress it:** the resize handle is already keyboard-operable (`ui/split.tsx`: `role="separator"`, `tabindex`, `aria-orientation/valuenow/valuemin/valuemax`, `onKeyDown`) (§10-R-L3). |

One element-coupling watch-item the recon flagged: `.db-edit-diff > div`
(`drawing-board.css:1023`) is the **only** element-combinator selector in the whole
docs-site style tree — and it's on the **frozen** Drawing Board, off the path of
every surface we're touching. Noted, not touched (HARD RULE #18: off-path, logged
not pulled in).

Form inputs are **already labeled** (CodeMirror `aria-label="Deck source"`; the
Playground pickers use `<label htmlFor>`/`aria-label`), so labeling is not a gap
here (§10-R credit).

---

## 6. The genuine forks (RESOLVED — see §13)

Four real decisions the rubric doesn't settle on its own; each is now **decided**
(§13). The options are kept below for the record — the chosen option is marked
**← chosen**.

**Fork A — headingless slides and the slide-as-region question.** The first draft
claimed "40 `<h1>`s"; the truth (measured) is ~1 `<h1>` (`title`) + mostly `<h2>` +
a couple **headingless** slide types (`quote`, `big-number`). So the real question
isn't de-duping h1s — it's what to do about slides with *no* heading and whether a
slide should be a *named region* at all.
- **(A1, recommended — ← chosen) Keep authored heading levels; leave slide
  `<section>`s generic (unnamed).** No 40-region rotor flood; the heading list is a
  clean slide index. For the headingless types, derive a lightweight `aria-label` on
  that slide's `<section>` from front-matter/first text so it isn't literally
  nameless-in-the-heading-rotor — a narrow, opt-in fix, not a blanket per-slide
  label.
- (A2) Name *every* slide `<section>` (aria-label per slide). Rejected: floods the
  region rotor with 40 entries — the exact over-tagging §3 forbids.

**Fork B — when do we do the `<figure>` conversion for charts?** A real semantic
win, but the one part that (a) needs a `margin:0` UA reset, (b) risks matching
existing `:is(…figure…)` CSS *and* the fluid-view owl rule, (c) will break the
`div.functionplot` JS selectors unless they're updated (§7), and (d) **changes
exported bytes → your export sign-off** (QUALITY BAR).
- **(B1, recommended) Two phases.** Ship the byte-neutral landmark/retag work first
  (export `<main>`/lang/skip link, Studio main + region names, Playground names +
  skip link) — no export sign-off. Then `<figure>` as its own branch with a
  rendered dark+light demo deck **and a real NVDA/VoiceOver pass** for your sign-off.
- **(B2) ← chosen** — One change, one sign-off round covering everything. The whole
  feature becomes an export-bytes change gated on one inspection; simpler to reason
  about as a single reviewable diff, at the cost of no early byte-neutral landing.

**Fork C — confirm the restraint stance.** The rubric deliberately **leaves
`.cell-stage`, the split columns, backdrops, and scrims as `<div>`.** I'm confident
this is right (they're presentational; promoting them manufactures landmark noise).
The one place it's a genuine judgment call is the split-panel columns — a
comparison's two columns *could* be `aria-label`d regions ("left/right panel") if
you read it as a true two-region compare. I recommend **not** (the content inside
already carries semantics), but flag it as the one arguable call. **← chosen:
restraint confirmed** (split columns stay `<div>`).

**Fork D — the deck `<main>` scope (from §4).** (D1) do the export `<main>` now and
**defer** the engine/preview container retag. **(D2) ← chosen** — do both now: the
export wrapper *and* the engine-path `div.lattice → main.lattice` kernel change,
pixel-diffed and maker-checked.

---

## 7. The `<figure>` conversion — real work, its own commit, the sign-off surface

`<figure>`/`<figcaption>` for the ~13 chart transforms is the highest-semantic-value
change *and* the highest-risk. It rides in the same branch (Fork B — one combined
change) but as its **own late commit**, because it is the export-bytes surface the
sign-off exists for. Its four hazards, each a checklist item:

- **UA margin.** Browsers default `figure` to `margin-block: 1em; margin-inline:
  40px` (**not** `40px 0` — the first draft swapped the axes; §10-R-M3). The
  dominant effect is a **40px horizontal inset** that shrinks a centered chart's
  width (and shifts the overflow-probe's width math), not a vertical shift. A bare
  `margin:0` reset fully neutralizes it (no UA padding/border on `figure`), and a
  bare reset is explicitly allowed by HARD RULE #20.
- **JS-selector hazard.** The runtime and export select `div.functionplot[data-fp-config]`
  **by tag** (`lib/runtime/index.js:1309`, `lattice-emulator.js:1406`). Promoting
  `.functionplot` to `<figure>` without changing those selectors **silently stops
  function plots rendering**. Each `<figure>` conversion must either change the JS
  to a class-only selector first, or stay off the do-not-retag list.
- **CSS leak.** ~56 existing selectors already say `:is(svg, figure, .functionplot)`;
  a newly-`<figure>`'d node starts matching them, and `base.fluid-view.css:58`'s
  `> :not(:is(header, footer, figure, …))` owl rule flips the node's flex-grow
  behavior — a real layout leak, not cosmetic. Each conversion is verified against
  the per-component gallery (light + dark page counts) + `pixel-check.js`.
- **Export bytes + SR verbosity.** Margin/layout deltas change PDF/PNG/PPTX rasters
  → **human sign-off on a rendered demo deck in both modes**. And a chart-heavy
  deck with ~13 figure types floods NVDA/JAWS/VoiceOver with "figure… figure end"
  announcements; the sign-off must include a **real screen-reader pass** (HARD RULE
  #23 — real surface, not spec reasoning), and a rule that a `<figcaption>` must
  **not duplicate** a heading/alt already inside the figure (double-announcement).

The `<figcaption>` also *upgrades* the caption from a styled `<div>` to the caption
role — a genuine win, provided it isn't a duplicate.

---

## 8. Guard rails — invariants **with gates**, not prose

Inversion asks: *what would guarantee we make accessibility (or the render) worse?*
Each answer is a rule — and, per HARD RULE #18 ("an invariant with no gate is a
future regression"), the load-bearing ones get an actual **gate or test**, using the
allowlist/ratchet machinery `tools/check-ownership.js` already has (§10-I6). The
first draft stated these as prose only; that was itself a #18 violation.

1. **The slide wrapper stays `<section>`, always.** The overflow probe selects
   `section[data-lattice-slide]`; every component CSS is rooted at `section.<name>`;
   the packer emits `div.lattice > section`. Retagging the slide silently kills
   overflow detection and unstyles every component. **Gate:** a unit test on
   `render()` asserting the slide token is `section`.
2. **Exactly one `<main>` per document.** **Gate/design:** make the container tag a
   *parameter* — `div` by default, `main` opt-in only at the export-shell and
   engine render call sites — so a second `<main>` is *physically unemittable*
   rather than guarded by a comment. A tripwire you can't trip beats a note.
3. **No nameless landmarks.** A promoted `<section>`/`<aside>`/`<nav>` ships with an
   `aria-label`/`aria-labelledby` **in the same edit**. **Gate:** a jsdom test over
   rendered app surfaces asserting every non-slide `<section>`/`<aside>`/`<nav>` has
   an accessible name — *and* a **landmark-count budget** (ratcheted like the other
   `check-ownership` budgets) so the N+1th region is a conscious decision, closing
   the "promote only if named is gameable" gap (§10-I1-noise).
4. **`aria-hidden` only decoration — never content.** **Gate:** a
   `checkAriaHiddenAllowlist` in `check-ownership.js` failing on any `aria-hidden`
   class outside `SANCTIONED_ARIA_HIDDEN = {.backdrop, .image-scrim, .lattice-bg}`.
   `.image-text` (and any prose wrapper) is barred — this is the caught regression
   (§10-I1). Also: don't add redundant native roles (`role="main"` on `<main>`).
5. **No nested bare `<section>` with a colliding class.** A raw `<section class="x">`
   inside slide content matches `section.x` component rules. Promotions inside a
   slide use non-colliding classes or non-`section` elements (`figure`/`article`).
6. **Byte-neutrality is verified per surface, not assumed.** Phase-1 block-box
   retags are pixel-diffed against goldens **on the surfaces goldens cover (emulator
   PDF/PNG)**; the runtime/VS-Code preview and the Studio `html-to-image` "Share
   image" path are **not** golden-covered, so any change touching them is either
   driven on the real surface or marked **UNVERIFIED** (HARD RULE #23) (§10-I7).
7. **Skip links actually move focus.** Target carries `tabindex="-1"`; the link is
   the **first tabbable** element on its surface; the visually-hidden CSS is inlined
   so it can't render visibly if a stylesheet is missing.

---

## 9. The cost, priced

| Change | You gain | You spend |
|---|---|---|
| export shell `<main>` wrap + `lang` + skip link (Path A) | every exported deck gets a skip target, a language, a named main | ~a dozen lines in the emulator shell; a golden re-diff (block-box, should be zero-delta) |
| Studio `<main>` (editor+preview scope) + region names, all 4 views | the flagship app surface becomes navigable; regions named | JSX tag swaps + `aria-labelledby` spans; a region-label audit; visually free |
| Playground/pages skip links + region names | keyboard users bypass chrome; regions named | per-surface edits (skeleton isn't shared yet) |
| deck container retag (Path B — **in scope**) | the embedded previews (docs-site, VS Code) get a main too | a shared-kernel `css.js` edit + pixel-diff + maker-checker |
| chart `<div>` → `<figure>`/`<figcaption>` (**same combined change**) | charts + captions gain the figure/caption roles | UA-margin resets, JS-selector fix, CSS-leak audit, **export sign-off + real SR pass** |
| the new a11y **gates** | the invariants can't silently rot (the #18 lesson) | ~4 small gate/test additions, one-time |
| **leaving presentational divs alone** | a *usable* landmark menu (no noise) | the temptation to "finish" by tagging everything — deliberately not spent |

The design's value isn't "more semantic elements." It's a **navigable structure
that's honest** — real landmarks where they help, plain `<div>`s where they don't,
gates so it stays that way, and every export-byte delta (container retag + figures)
surfaced for your sign-off rather than slipped in.

---

## 10. The adversarial passes (what changed and why)

Three independent passes ran against the first draft — a red team (attack the
design), an inversion analysis (enumerate how we'd ship a regression while believing
we improved things), and an independent checker (verify every technical/WCAG/code
claim). They **confirmed the direction and every WCAG/ARIA fact** the design leans
on (header/footer→generic when nested; `<main>` at most one per document;
`<section>`→`region` only when named; the HTML5 outline algorithm is dead so nesting
never auto-demotes headings; the SC-level mappings 3.1.1/2.4.1/1.3.1/2.4.6/4.1.2 are
right). They overturned four **mechanics**, each folded into the body above:

- **I1 (inversion, CRITICAL — a shipped regression in the draft):** §12 of the draft
  listed `.image-text` as an `aria-hidden` target, but `.image-text` holds the
  authored `<h2>`/`<p>` on every image slide (`bg-image.js:150`) — hiding it would
  blank out image-slide text for screen readers. **Struck**; `.image-text` is now
  explicitly barred, and an `aria-hidden` **allowlist gate** enforces it (§8-#4).
- **Checker (CRITICAL) + R4 (red team, HIGH) — the two-path container reality:** the
  draft's "retag `div.lattice → <main>` is a free class-keyed swap" was false on
  *both* paths, in opposite ways. The engine/preview CSS is tag-qualified to
  `div.lattice > section` (so the swap needs a lockstep `css.js` kernel edit); the
  export **discards** the container and injects bare sections (so the swap does
  nothing there — the `<main>` must be a wrapper). **Rewritten as two edits on two
  paths (§4); both are in scope (Fork D chosen "do both", §13).**
- **R1 (red team, HIGH) — "40 `<h1>`s" is false:** measured, the deck is ~1 `<h1>` +
  mostly `<h2>` + a couple headingless slides. Fork A was solving a non-problem;
  **reframed** around the real gap — headingless slides and whether a slide is a
  named region (§6-A, §4).
- **R3 (red team, HIGH) — Studio `<main>` over-scoped:** the split grid contains the
  Architect/Inspector `<aside>`s, and `<aside>` keeps its landmark role inside
  `<main>`. **Rescoped** to the editor+preview subtree with the asides as siblings;
  the rubric now states the aside-doesn't-degrade asymmetry (§3, §5).

Plus the medium/low findings folded in: skip-link targets need `tabindex="-1"` and
must be the first tabbable element (§8-#7); `aria-labelledby` must point at a text
`<span id>`, not a label container (§5); the Studio **Fabricate** view branch was
missed (§5); the `<figure>` UA margin is `1em 40px` and the `div.functionplot` JS
selector + fluid-view owl rule are real phase-2 hazards (§7); byte-neutrality is
only golden-verified on the emulator surface (§8-#6); the split-pane resize handle
is already keyboard-accessible and must not regress (§5); form inputs are already
labeled (§5).

---

## 11. Rejected alternatives

- **Wrap content in new semantic wrappers.** Breaks the measurement math (#20),
  changes export bytes, needs new CSS. Retag beats wrap *because* our stylesheet CSS
  is class-keyed. (The single sanctioned exception is the export `<main>`, forced by
  the shell discarding the container — §4.)
- **Maximal semanticization (every `<div>` → `<section>`).** Manufactures landmark
  noise; a 40-region menu is worse than none. Rejected for the promotion rubric (§3).
- **Change the slide element to `<article>`.** Kills the overflow probe and every
  `section.<name>` / `div.lattice > section` rule. A slide is a *section of a
  presentation*, not a syndicated article. Rejected (§8-#1).
- **ARIA-first (sprinkle `role=`/`aria-*` onto existing divs).** "No ARIA is better
  than bad ARIA" — use the real element; reserve ARIA for names and the few genuine
  gaps. Rejected as the primary tool.
- **Do the whole thing (incl. `<figure>` and Path B) in one pass.** Couples the
  byte-neutral fast win to two sign-off/kernel slow paths. Rejected for phasing
  (§6-B, §6-D).
- **Name every slide as a region / synthesize a per-slide `<h1>` (Fork A2).** Floods
  the rotor; built on the mismeasured "40 h1s." Rejected (§10-R1).

---

## 12. File map (for whoever implements)

One branch, many commits, one PR (HARD RULE #17); the commits are the §13 sequence
(gates → app/export landmarks → engine kernel → figures → sign-off deck). The whole
diff is export-bytes-changing, so it merges only after your sign-off.

**Commits 1–2 — gates + byte-neutral landmarks/retags:**
- Export shell `<main>` wrap + `lang` + skip link + inlined visually-hidden CSS +
  `tabindex="-1"`: `lattice-emulator.js:1450` (`lang`), `:1461-1463` (skip link +
  `<main>` wrap around `${slidesWithMeta2}`).
- Decorative `aria-hidden` (allowlisted only): `plugins.js` (`.backdrop`),
  `lib/core/bg-image.js` (`.lattice-bg` — **not** `.image-text`); `.image-scrim`
  already hidden. Add `checkAriaHiddenAllowlist` + `SANCTIONED_ARIA_HIDDEN` to
  `tools/check-ownership.js`.
- Studio `<main>` (editor+preview scope, all 4 view branches) + region names:
  `docs/src/components/studio/StudioShell.tsx` (`:1494` Fabricate, `:1498` mobile,
  `:1521` focus, `:1537` desktop; `aria-labelledby` → new `<span id>`s).
- Playground names + skip link: `docs/src/components/playground/PlaygroundApp.tsx`,
  `docs/src/pages/playground.astro`.
- Skip links on standalone pages: `docs/src/pages/index.astro`,
  `docs/src/layouts/ComponentsLayout.astro`.
- Gates/tests: slide-stays-`<section>` render test; container-tag parameter (one
  `<main>` per document); nameless-landmark + landmark-count-budget jsdom test.
- `CHANGELOG.md` `## Unreleased` (HARD RULE #10); the landmark contract + promotion
  rubric into a new canonical `engineering/accessibility.md`.

**Commit 3 — Path B engine/preview container retag (pixel-diff + maker-checker):**
- `lib/engine/slides.js:229` (`div.lattice → main.lattice`) **in lockstep with**
  `lib/engine/css.js` (`scaffold()` `:104-153`, `packSelector` `:243`), preserving
  (0,1,2) specificity over the preview-frame `.lattice > section` rule; pixel-diff
  proof; maker-checker (shared kernel, HARD RULE #1).

**Commit 4 — `<figure>`/`<figcaption>` for charts:**
- The ~13 `lib/components/**/*.transform.js` figure wrappers + `plugins.js:969`
  (`.functionplot`); co-located `margin:0` resets; the `div.functionplot` JS
  selectors (`runtime/index.js:1309`, `lattice-emulator.js:1406`) changed to
  class-only first; CSS-leak audit against `:is(…figure…)` + `base.fluid-view.css:58`.

**Commit 5 — the sign-off artifact:** a rendered dark+light demo deck
(`examples/<slug>.md` + committed `.pdf`, HARD RULE #9) + a real NVDA/VoiceOver pass;
this is what you inspect before merge (export sign-off gate).

**Docs to update in the same change(s):** `engineering/gotchas.md` (the `<figure>`
UA-margin + `div.functionplot` traps; the one-`<main>`-per-document tripwire; the
two-path container reality), and the new `engineering/accessibility.md` as the
canonical landmark/rubric reference.

---

## 13. Decisions (resolved at sign-off, 2026-07-03)

The four forks (§6) are decided:

1. **Fork D — deck `<main>`: do BOTH paths.** The export shell `<main>` wrapper
   *and* the engine/preview `div.lattice → main.lattice` retag land in this feature.
   The engine-path change is no longer deferred: it carries the lockstep `css.js`
   edit (`scaffold()` + `packSelector`, preserving (0,1,2) specificity over the
   preview-frame `.lattice > section` rule), a pixel-diff, and a maker-checker pass
   (shared kernel, HARD RULE #1). *Rationale: "we don't settle" — a preview a
   sighted user reads should be navigable to a screen-reader user too; the kernel
   change is bounded and gated.*
2. **Fork B — `<figure>`: one combined change.** No two-phase split. The chart
   `<figure>`/`<figcaption>` conversion ships in the same branch as the landmark
   work, under a single export sign-off round covering the whole diff. This makes
   the entire feature an **export-bytes change → your inspection is a hard gate
   before merge** (QUALITY BAR): a rendered demo deck in dark + light, plus a real
   screen-reader pass (§7), signed off by you.
3. **Fork A — headingless slides: generic sections + label the headingless.**
   Authored heading levels kept; slide `<section>`s stay generic; `quote` /
   `big-number` (and other heading-free types) get a front-matter-derived
   `aria-label` so they aren't invisible in the heading rotor.
4. **Fork C — restraint confirmed.** Presentational boxes stay `<div>`, split-panel
   columns included; promote only nodes that carry a navigational role.

Everything else — the retag-not-wrap principle, the promotion rubric, the
slide-stays-`<section>` invariant, the §8 gates, and the §10 corrections — was
settled in the second draft. What remains is **one branch, many commits, one PR**
(HARD RULE #17), culminating in the export sign-off gate. The precise
front-matter-derived `aria-label` wording for headingless slides and the exact
region-label copy for the Studio panes are left to the implementation branch (not
blockers to this proposal).

**Sequencing within the one branch** (so each commit banks a working slice and the
sign-off sees the whole picture): (1) the a11y **gates** first (they fail-safe the
rest); (2) the byte-neutral app + export landmarks; (3) the engine-path container
kernel change (pixel-diff); (4) the `<figure>` conversion (`div.functionplot` JS
selectors fixed first); (5) render the sign-off demo deck + SR pass. Steps 3–4 are
the export-bytes surface; the PR does not merge until they're signed off.
