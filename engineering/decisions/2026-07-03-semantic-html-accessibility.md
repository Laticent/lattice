---
status: proposed
summary: Retag structural divs to native AA-sensible elements (change the tag, keep the class, keep the styling — never wrap), governed by a promotion rubric that stops both under-tagging (Studio has no `<main>`) and over-tagging (landmark noise). Two surfaces — the app (website/Studio/Playground) and the decks (web preview + HTML export). The full Form/Cell/Tile → semantic HTML map (§4A) is adopted: the DECK is a self-contained composition → `<article class="lattice">` (with `<main>` as the shell/host landmark — where vs. what); a SLIDE stays `<section>` (a section of the deck-article; measurement + all CSS bind to it); the masthead/footer Cells become `<header>`/`<footer>`; the stage Cell stays `<div>`; liftable leaf cards become `<article>` (scoped, not every `<li>`). `<article>` plays its role at exactly the two liftable boundaries (deck + leaf card), never per slide. The container change is TWO edits on TWO render paths — a sanctioned `<main><article>` wrapper in the export shell (section-scoped CSS there) AND the engine/preview `div.lattice → article.lattice` retag with its lockstep `css.js` kernel edit — DECISION: do both. `<figure>` for charts folds into the SAME change (DECISION: one combined, export-signed PR). Headingless slides (quote/big-number) get a front-matter aria-label; presentational divs stay div (restraint). Owner call: best practice, don't settle. A THIRD adversarial round (§14) tested the worked example against the full "accessible to all, any device" goal: the semantic base is confirmed solid, but it surfaced a tracked GAP REGISTER above the HTML — the shipped PDF (untagged) + PPTX (image-only, no alt) artifacts (the doc's own "out of scope" premise was factually wrong and is corrected), fixed-canvas reflow (1.4.10), forced-colors, color-only tone (1.4.1), bare-`<title>` SVG naming (needs aria-labelledby cross-AT), a missing `<title>` (2.4.2), pagination context (1.3.1), and no axe gate. Each tagged foundation vs later baby step. Direction hardened by a red-team, an inversion pass, and an independent checker — which caught a shipped-regression aria-hidden defect, the two-path container reality, and that slides are mostly `<h2>` not `<h1>`; all folded in (§10). Guard rails get real gates, not prose. Forks resolved §13. REFRESH 2026-07-10 (§15) after ~119 commits: foundation intact + reinforced (Form-default shipped/audited; CVD textures now work in runtime), but a THIRD render surface appeared — the HTML Lattice player (now the primary shared artifact) — which re-poses the landmark problem and owns G1/G3/G6/G9 via its own AA+AXE docs; §5 Studio citations stale (activity-bar restructure, still no `<main>`); gap deltas G5 (partial, audio-only) / G6 (Read·Article reflows) / G9 (player TOC) / G11 (captions shipped); +menus→nav finding.
---

# Semantic HTML for accessibility — retag, don't wrap

**Date:** 2026-07-03
**Status:** design proposal (design-before-code; no CSS/transform written yet)
**Branch:** `claude/semantic-html-accessibility-qdht2a`
**Scope:** the app (docs site: marketing, Studio, Playground, Components) **and**
the decks (live web preview + HTML export). **Out of scope:** the export-to-Marp
bundle (`lib/core/marp-bundle.js` — the recipient's Marp owns that HTML shell).

> **Scope correction (2026-07-03, third adversarial round — §14).** An earlier
> draft also put "PDF/PPTX tag trees" out of scope with the parenthetical *"raster/
> print artifacts, not a DOM a screen reader walks."* **That premise is wrong** — a
> **tagged PDF's structure tree *is* exactly the DOM a screen reader walks.** The
> PDF and PPTX are the artifacts people actually ship, and today they are
> inaccessible (untagged PDF with no `lang`/`title`; image-only PPTX with no alt).
> They are back **in scope as tracked gaps** (§14). This decision note's
> *implementation* still starts with the HTML/app semantic base (the solid
> foundation), but the goal "accessible to all, on any accessible device" is not
> earned until the shipped artifacts are addressed — so they are named, not
> disowned.

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
> | `<article>` | a self-contained, independently-meaningful unit — **the deck**, or a liftable leaf card (§4A) | `article` | keeps role; only at the two liftable boundaries |
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
Retagging the container here therefore **cannot** be done in `slides.js` alone — it
requires editing `css.js` (the `scaffold()` rules `:104-153` and `packSelector`
`:243`) to emit the new tag at the same specificity, in lockstep across the shared
kernel (HARD RULE #1), proven by pixel-diff.

**Decision (Fork D, §13): do BOTH paths, and the container becomes `<article>`, not
`<main>`.** The refinement (§4A): the deck is a *self-contained composition* →
`<article class="lattice">`; the `<main>` **landmark** is supplied by the document
shell/host (the export shell wraps `<main><article class="lattice">…`; the app host
page already owns its `<main>`). `<main>` says *where the primary content is*;
`<article>` says *what it is* — orthogonal, and both correct. Path B carries the
lockstep `css.js` edit (`scaffold()` + `packSelector` → `article.lattice > section`
at the same (0,1,2) specificity — `article` is a type selector exactly like `div`,
so zero specificity cost), a pixel-diff, and a maker-checker pass. `<article>` has
no UA margin, so it stays byte-neutral in box terms; it is still one of the
export-bytes surfaces the single sign-off (Fork B) covers.

The per-node mapping (Path-independent). **Bold = a change; the rest is "confirmed
correct, leave it."** The structural model this table realizes is §4A.

| Node (today) | File | Verdict |
|---|---|---|
| slide wrapper `<section>` | `lib/engine/slides.js:99` | **Keep `<section>`.** Already correct; measurement + hundreds of `section.<name>` rules + `div.lattice > section` packing depend on it. Non-negotiable (§8-#1). |
| deck container `div.lattice` | `slides.js:229` | **→ `<article class="lattice">`** (Path B) *with* the `css.js` lockstep edit (`article.lattice > section`) + pixel-diff. The deck is a self-contained composition (§4A). |
| export shell `<body>` slides | `lattice-emulator.js:1463` | **Wrap in `<main id="deck" tabindex="-1"><article class="lattice">…`** + `lang` + skip link. The sanctioned wrap — `<main>` is the landmark, `<article>` is the deck. |
| masthead Cell `.cell-masthead` | `masthead.transform.js:191` | **→ `<header class="cell-masthead">`.** It *is* the slide's header (title + eyebrow). Generic (not a banner landmark) because nested in the slide `<section>`. Class-keyed CSS + no UA margin → byte-neutral. |
| footer Cell `.cell-footer` | forms footer cell | **→ `<footer class="cell-footer">`.** The slide's footer (running text · progress rail · page number). Generic when nested; byte-neutral. |
| running `header:`/`footer:` directive | `slides.js:210,216` | **Reconcile to one per slide.** Today emitted as a second section-level `<header>`/`<footer>`; fold into the masthead/footer Cell as a chrome Tile so a slide has **exactly one** `<header>` and one `<footer>` (§8-#8). |
| headings from native components | (markdown) | **Keep authored levels.** Reality (§10-R1): mostly `<h2>`, one `<h1>` (`title`), a couple headingless (`quote`, `big-number`). Do **not** synthesize an `<h1>` per slide. |
| chart figure wrappers `.funnel-figure`, `.quadrant-figure`, `.radar-figure`, `.state-chart-figure`, `.functionplot`, … | 13 `*.transform.js`, `plugins.js:969` | **→ `<figure>` + `<figcaption>`** — a chart is the textbook `<figure>`. Its own late commit (§7): UA-margin, a JS-selector hazard, and export-byte cost. |
| liftable leaf cards (comparison / inventory cards that stand alone) | component transforms | **→ `<article>` — scoped.** A card that is independently meaningful is `article #2` (§4A). **Not** every `<li>`: over-articling floods the AT rotor exactly as over-sectioning does (restraint, §3). |
| `.cell-stage` (body cell) | `masthead-lift.js:63` | **Leave `<div>`.** Presentational layout cell; the probe keys on its *class*. Promoting adds a nameless region. |
| `.backdrop`, `.image-scrim`, `.lattice-bg` | plugins / scrim / bg-image | **Leave `<div>` + `aria-hidden="true"`.** Pure decoration; `.image-scrim`/`.backdrop` are already hidden today. |
| **`.image-text`** | `lib/core/bg-image.js:150` | **Leave `<div>`, and NEVER `aria-hidden`** — it holds the author's `<h2>`/`<p>` on every image slide (§10-I1, the caught regression). |
| split-panel columns `.panel-left/.panel-right` | `split-panels.js` | **Leave `<div>`.** Two columns of one comparison aren't two landmarks; the *content* inside carries its own semantics. (Alternative named-regions considered and rejected, §10-R-Fork-C.) |
| carousel card `.ct-card` | `carousel.js:329` | **Keep `<article>`.** Already correct — the first instance of `article #2`. |

Deliberately **not** doing at the deck level: `role=` on native elements (redundant
role is its own anti-pattern), and — the reframed decision — per-slide
`aria-label`s naming every slide as a region (that would flood the rotor with 40
named regions; §10-R1, Fork A).

---

## 4A. Form/Cell/Tile → semantic HTML — the structural map

The deck's whole layout model is already a tree — a **Frame** carves the slide into
**Cells** (masthead · stage · footer), each Cell holds **Tiles** (title, meta,
logo, footer, pagination, the content component); the canonical model is
`design/forms.md`. Semantic HTML is *also* a nesting vocabulary. The mapping rule is
one line:

> **Map each Form noun to the element whose ARIA role matches the noun's job** — not
> by tag taste. Where a noun's job is "just group some boxes," the honest element is
> a `<div>`. Where its job is a *role* (a header, a footer, a self-contained
> composition, a figure), use that element.

### Where `<article>` plays its role — the two liftable boundaries

`<article>` means one specific thing: **a self-contained composition you could lift
out and it still makes sense.** In our tree that property is true at exactly two
boundaries, and false everywhere between them:

- **`article #1` — the whole deck.** A deck is the textbook self-contained
  composition → **`<article class="lattice">`** (the container, Path B). This is the
  container change of Fork D — `<article>`, wrapped by the document's `<main>`.
- **`article #2` — a liftable leaf card.** A card that stands on its own (a carousel
  card — already `<article>`; a self-contained comparison/inventory card) →
  **`<article>`**, *scoped* to genuinely-independent cards, never every `<li>`.

**A slide is deliberately NOT an `<article>`.** It's a *section of* the deck-article
— part of the narrative, not independently syndicated — so it stays `<section>`, on
both semantic grounds (sections of an article) and mechanical grounds (measurement +
CSS bind to `section`). `<article>`-ness attaches only where the sub-tree is truly
liftable, which mirrors the Form model's own Composite recursion ("a component is
this grammar one level up," `forms.md:176`).

### The tree, current → target

```
DOCUMENT  (export shell, or the app host page)
│
├─ <main>                               LANDMARK "primary content"  ── shell/host (WHERE)
│   └─ <article class="lattice">        THE DECK — self-contained composition  ◄ article #1
│       │                                  (div.lattice → <article>, css.js lockstep)
│       ├─ <section data-lattice-slide>  a SLIDE = the root Frame        (stays <section>)
│       │   ├─ <header class="cell-masthead">   masthead Cell — title+eyebrow   (div → <header>)
│       │   │      └─ .masthead-lede (h1/h2 + eyebrow) · .masthead-bay (meta/logo/status Tiles)
│       │   ├─ <div class="cell-stage">         stage Cell — the body box       (stays <div>)
│       │   │      └─ the CONTENT Tile = the author's component:
│       │   │            prose/list/table → native <h_/p/ul/table>   (already semantic)
│       │   │            a chart          → <figure> + <figcaption>  (§7)
│       │   │            a grid of liftable cards → each <article>   ◄ article #2 (scoped)
│       │   └─ <footer class="cell-footer">     footer Cell — nav strip         (div → <footer>)
│       │          └─ running footer · progress rail · <span class="lat-pagination">
│       └─ <section data-lattice-slide> … next slide …
│
(z-plane surface Tiles — .backdrop / .image-scrim / .lattice-bg / atmosphere —
 sit behind content as <div aria-hidden="true">, out of the accessibility tree)
```

### The table (the map, per noun)

| Form noun | Instance | Element | Why (role match) | Change? |
|---|---|---|---|---|
| *(collection)* | the deck | **`<article class="lattice">`** | self-contained composition — **article #1** | div → article |
| **Frame** (root) | a slide | `<section data-lattice-slide>` | a section *of* the deck-article; the measurement anchor | keep |
| **Cell** — masthead | title band | **`<header class="cell-masthead">`** | the section's header (its heading area); generic when nested | div → header |
| **Cell** — stage | body box | `<div class="cell-stage">` | presentational layout cell — no role; the Tile inside carries semantics | keep |
| **Cell** — footer | bottom band | **`<footer class="cell-footer">`** | the section's footer; generic when nested | div → footer |
| **Tile** — content | the component | native / **`<figure>`** / **`<article>`** | per component; a *liftable card* is **article #2** | per-component |
| **Tile** — chrome: title | the heading | `<h1>`/`<h2>` | it *is* a heading | keep |
| **Tile** — chrome: pagination | page № | `<span class="lat-pagination">` | already content, not decoration | keep |
| **Tile** — chrome: meta/logo/status | masthead bay | `<div>` (in the `<header>`) | grouping of small chrome; no landmark role of its own | keep |
| **Tile** — surface: backdrop/atmosphere | decoration | `<div aria-hidden="true">` | leaves the accessibility tree | hide |
| **Tile** — review: annotation | overlay | `<aside>` (preview-only) | complementary; preview-only, never exported | keep |

Two invariants this map introduces, both gated (§8): **exactly one `<header>` and one
`<footer>` per slide** (so the running `header:`/`footer:` directive folds into the
Cell rather than emitting a competing second element), and **`<article>` only at the
two liftable boundaries** (deck + scoped leaf cards) so the AT rotor isn't flooded.

Every promotion here is *byte-neutral* in the box model (`article`/`header`/`footer`
are all `display:block`, no UA margin — only `<figure>` isn't, §7) and *visually
free* (class-keyed CSS: `<div class="cell-masthead">` → `<header class="cell-masthead">`
keeps every rule). The only mechanical cost is the container's `css.js` lockstep edit
(Path B) — one shared-kernel change, pixel-diffed.

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

**Fork D — the deck container scope (from §4).** (D1) do the export `<main>` now and
**defer** the engine/preview container retag. **(D2) ← chosen, refined** — do both
now, and the container is **`<article class="lattice">`** (with `<main>` as the
shell/host landmark): the export wrapper *and* the engine-path `div.lattice →
article.lattice` kernel change, pixel-diffed and maker-checked. Carries the Cell →
`<header>`/`<footer>` promotions too (§4A).

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
   the packer emits `<container>.lattice > section`. Retagging the slide silently
   kills overflow detection and unstyles every component. **Gate:** a unit test on
   `render()` asserting the slide token is `section`.
2. **The deck is one `<article>`; the `<main>` landmark is the shell's, and there is
   exactly one per document.** The container renders `<article class="lattice">`; the
   single `<main>` comes from the document shell/host. **Gate/design:** make the
   container tag a *parameter* (`article` for the deck) and emit the `<main>` only at
   the export-shell / host call site, so a second `<main>` is *physically
   unemittable* rather than guarded by a comment. A tripwire you can't trip beats a
   note. (The `css.js` packer must move `div.lattice` → `article.lattice` in lockstep,
   §4/§4A.)
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
8. **One `<header>` and one `<footer>` per slide; `<article>` only at the two
   liftable boundaries.** The masthead Cell is the `<header>`, the footer Cell is the
   `<footer>`, and the running `header:`/`footer:` directive folds in as a Tile — not
   a competing second element (§4A). `<article>` appears only as the deck container
   and as scoped liftable leaf cards, never per slide and never per `<li>`. **Gate:**
   a jsdom test over rendered gallery HTML asserting ≤1 `<header>` and ≤1 `<footer>`
   per slide `<section>`, and that no slide `<section>` is itself an `<article>`.

---

## 9. The cost, priced

| Change | You gain | You spend |
|---|---|---|
| export shell `<main><article class="lattice">` wrap + `lang` + skip link (Path A) | every exported deck gets a skip target, a language, a named main, and a deck-as-article | ~a dozen lines in the emulator shell; a golden re-diff (block-box, should be zero-delta) |
| deck container `div.lattice → <article>` (Path B) + masthead/footer Cell → `<header>`/`<footer>` | the full Form/Cell/Tile semantic map (§4A): deck=article, slide=section, header/footer cells | the container's shared-kernel `css.js` lockstep edit + pixel-diff + maker-checker; the Cell swaps are class-keyed + byte-neutral |
| liftable leaf cards → `<article>` (scoped) | self-contained cards announce as articles | a per-component judgment (only genuinely-liftable cards); no `<li>` blanket |
| Studio `<main>` (editor+preview scope) + region names, all 4 views | the flagship app surface becomes navigable; regions named | JSX tag swaps + `aria-labelledby` spans; a region-label audit; visually free |
| Playground/pages skip links + region names | keyboard users bypass chrome; regions named | per-surface edits (skeleton isn't shared yet) |
| chart `<div>` → `<figure>`/`<figcaption>` (**same combined change**) | charts + captions gain the figure/caption roles | UA-margin resets, JS-selector fix, CSS-leak audit, **export sign-off + real SR pass** |
| the new a11y **gates** | the invariants can't silently rot (the #18 lesson) | ~5 small gate/test additions, one-time |
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
(gates → app/export landmarks → Cell retags → engine kernel → figures → sign-off
deck). The whole diff is export-bytes-changing, so it merges only after your sign-off.

**Commits 1–2 — gates + byte-neutral landmarks/retags:**
- Export shell `<main id="deck"><article class="lattice">` wrap + `lang` + skip link
  + inlined visually-hidden CSS + `tabindex="-1"`: `lattice-emulator.js:1450`
  (`lang`), `:1461-1463` (skip link + `<main>`/`<article>` wrap around
  `${slidesWithMeta2}`).
- Masthead/footer Cell → `<header>`/`<footer>` (class-keyed, byte-neutral):
  `lib/forms/cell/masthead/masthead.transform.js:191` (`.cell-masthead` element), the
  footer-cell emitter; reconcile the running `header:`/`footer:` directive
  (`slides.js:210,216`) so it folds into the Cell — **one `<header>`/`<footer>` per
  slide** (§8-#8).
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
- Gates/tests: slide-stays-`<section>` render test; container-tag parameter (deck =
  `<article>`, one `<main>` per document); one-`<header>`/`<footer>`-per-slide +
  no-slide-is-`<article>` test; nameless-landmark + landmark-count-budget jsdom test.
- `CHANGELOG.md` `## Unreleased` (HARD RULE #10); the landmark contract + promotion
  rubric + the §4A Form/Cell/Tile map into a new canonical
  `engineering/accessibility.md`.

**Commit 3 — Path B engine/preview container retag (pixel-diff + maker-checker):**
- `lib/engine/slides.js:229` (`div.lattice → <article class="lattice">`) **in lockstep
  with** `lib/engine/css.js` (`scaffold()` `:104-153`, `packSelector` `:243`
  → `article.lattice > section`), preserving (0,1,2) specificity over the
  preview-frame `.lattice > section` rule; pixel-diff proof; maker-checker (shared
  kernel, HARD RULE #1).
- Liftable leaf cards → `<article>` (scoped): the comparison/inventory card transforms
  where a card is independently meaningful; carousel already done.

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

**Overarching call (2026-07-03): employ the full best-practice mapping, don't settle
for the minimal landmark set because the fuller change is harder.** So the complete
Form/Cell/Tile → semantic HTML map (§4A) is adopted as canon — with the restraint it
builds in (the stage stays `<div>`, decoration stays hidden, `<article>` only at the
two liftable boundaries, not every `<li>`), because over-tagging is itself a
best-practice failure. The four forks (§6):

1. **Fork D — deck container: do BOTH paths, container → `<article>` (refined).** The
   export shell wraps `<main id="deck"><article class="lattice">`; the engine/preview
   container `div.lattice → <article class="lattice">` with the lockstep `css.js` edit
   (`scaffold()` + `packSelector` → `article.lattice > section`, preserving (0,1,2)
   specificity over the preview-frame `.lattice > section` rule), a pixel-diff, and a
   maker-checker pass (shared kernel, HARD RULE #1). *Refinement over the first
   resolution (`<main>` on the container): `<main>` is the shell/host **landmark**
   (where), `<article>` is the deck **composition** (what) — orthogonal and both
   correct, same specificity cost, byte-neutral.* Alongside it, the **Cell → element**
   promotions land: masthead Cell → `<header>`, footer Cell → `<footer>`, with the
   running directive folded to one-per-slide (§4A, §8-#8). *Rationale: "we don't
   settle" — the full map is the best-practice structure; the kernel change is bounded
   and gated.*
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

---

## 14. Accessibility gap register — "accessible to all, any device" (beyond the HTML)

A third adversarial round (red team · inversion · independent checker) tested the
worked example (§4A) against the **full** goal: *accessible to all, on any
accessible device and software.* It confirmed the **foundation is solid** — the
things below are verified correct: skip link + focusable `<main>`; `.image-text`
never hidden; `aria-hidden` only on decoration; `<figure>`/`<figcaption>` and a
nested `<svg>` compute **separate** names (one-name-per-node holds); multiple `<h2>`
under one `<h1>` is valid; `prefers-reduced-motion` is already respected for build
reveals (vestibular is the best-covered population); and the §8 gates are
well-designed. **The semantic base is the right thing to build on.**

**Credit where the CVD baseline is already strong (correction to an early
overstatement).** Lattice ships **5 colorblind themes** (`a11y-base`,
`-deuteranopia`, `-protanopia`, `-tritanopia`, `-achromatopsia`) AND
`lib/core/accessibility-textures.js` — a shared `<defs>` of **12 distinct SVG
`<pattern>` geometries** that texture **chart marks** (`chart-family.js:319`,
`fill:url(#latt-a11y-tex-N)`) **and their legend swatches** (`svg-legend.js:218`).
So categorical **chart series already carry a non-color channel *in the SVG***, and
the legend maps by texture — genuine WCAG 1.4.1 redundant encoding reaching the
charts, not just CSS. Two scoping facts: it is **opt-in via theme** (inert unless an
`a11y-*` theme wires the fills — a *normal*-theme deck's chart fills are still
color-only, and a viewer of a static export can't switch it on), and it covers chart
**series** — **not** the tone rail (G4) and **not** blind-user *data* equivalence
(G5, a different population). Bonus: the pattern **geometry survives forced-colors**
(hues forced, shapes remain distinct), so a11y-themed charts are more robust in
Windows HCM than G7 implies.

But the base is not the whole goal. The round surfaced gaps in **layers above the
HTML** — the shipped artifacts, low-vision reflow, forced-colors, and data
equivalence — plus **two factual corrections to this doc**. These are tracked here
as **baby steps to build on the foundation**, not blockers to the foundation
itself. Each is tagged **[FOUNDATION]** (get right now / it rots) or **[LATER]** (a
real gap, safe to sequence after the base lands).

### Two corrections to this doc (the round caught these in *our* design)

- **The scope premise was wrong (fixed, §Scope).** "PDF/PPTX aren't a DOM a screen
  reader walks" is false — a tagged PDF's structure tree *is*. PDF/PPTX are back in
  scope as gaps (G1).
- **`<svg role="img">` with bare child `<title>`/`<desc>` is NOT reliably announced
  cross-AT** (VoiceOver/Safari, older JAWS drop it). The durable pattern is
  `role="img"` **+ `aria-labelledby="{title-id}"` + `aria-describedby="{desc-id}"`**.
  The §4A worked example and §7 must use the id-referenced form, not bare
  `<title>`/`<desc>`. **[FOUNDATION]** — get the figure pattern right the first time.

### The register

| # | Gap | Who it fails | SC | Tag | The fix (baby step) |
|---|---|---|---|---|---|
| **G1** | **PPTX is image-per-slide with no `altText`** (`pptx-export.js:57-63`); **PDF is untagged** with no `lang`/`title`/structure (`lattice-emulator.js:1791`, `:1449`) | every AT user of the *shipped* files | 1.1.1, 1.4.5, 2.4.2, 3.1.1 | **✅ CHEAP WINS SHIPPED 2026-07-04; full tagging still LATER** | ~~Now: add `lang` + `<title>` to the shell (flows into Chrome's auto-tag `/Lang` + title); pass `altText` to PPTX `addImage`.~~ **DONE:** PPTX `altText` = the `describe:` description (descriptions PR); PDF shell now emits `<html lang>` + `<title>` → Chrome print carries `/Lang` + `/Title` (verified). **Still LATER:** a real tagged-PDF pipeline for per-image `/Alt` structure OR route AT users to the HTML export. **Don't claim full PDF/PPTX tagging until then.** |
| **G2** | **No `<title>` on the export shell** (`lattice-emulator.js:1450`) — even the target snippet omitted it | all AT + tabbed browsing | **2.4.2** (A) | **✅ SHIPPED 2026-07-04** | ~~Emit `<title>` from the deck title.~~ **DONE:** the shell emits `<title>` (front-matter `title:` → first heading → filename) + `<html lang>`; `buildSrcdoc` declares `lang` for the Studio Print + preview frames. |
| **G3** | **Pagination is a bare "2"** — no context | SR/braille orientation | **1.3.1** (not 4.1.2 — checker correction) | **[FOUNDATION]** | `aria-label="Slide 2 of 7"` (or visually-hidden "Slide "/" of 7"), sourced from deck length. Cheapest high-value win. |
| **G4** | **Tone rail is color-only** (`box-shadow`, `base.variants.css:95`); **status is a CSS `::after`** (`status.css`) — both AT-invisible. *(Note: this is the NON-chart residue — chart series ARE textured, see the CVD-credit above; tone/status are not.)* | colorblind (sighted!) + SR | **1.4.1** (A), 1.3.1 | **[FOUNDATION]** | Status → real DOM text (already in §4A). Tone → a **VISIBLE** non-color cue (icon/label/shape) — mirror the existing `accessibility-textures` idea onto the rail, don't leave it hue-only; `sr-only` helps SR (1.3.1) but does **NOT** satisfy 1.4.1 for sighted colorblind users (checker A7 correction to Finding #2). |
| **G5** | **SVG charts name the *type*, not the *data*** — `<desc>` is a conclusion, not equivalence | blind users on chart/diagram slides | **1.1.1** (A) | **[LATER]** | Emit a visually-hidden data table (quadrant: vendor×reach×depth) / ordered step list (diagram: nodes+edges) from the same structured source that draws the SVG (single source → can't drift). |
| **G6** | **Fixed-px canvas can't reflow**; the fluid viewer is opt-in, HTML-only, and clips dense slides (`base.fluid-view.css`) | low-vision zoom/reflow (the largest population) | **1.4.10, 1.4.4, 1.4.12** (AA) | **[LATER — architectural]** | Finish the fluid viewer as the reflow answer (default-on narrow, pair with re-pagination so dense slides reflow not clip); the *shared* PDF/PPTX can't reflow → route reflow users to HTML and mark PDF/PPTX non-conformant for 1.4.10. |
| **G7** | **Zero forced-colors handling** (grep: no `forced-colors`/`prefers-contrast` in `lib/**`); shadow/hue signals vanish in Windows HCM. *(Charts partly survive: the SVG texture geometry (§CVD-credit) stays distinct when hues are forced — but only under an `a11y-*` theme, and tone/status/scrim don't.)* | Windows High Contrast / photosensitivity | 1.4.1, 1.4.11 | **[LATER]** | A `@media (forced-colors: active)` pass: re-express shadow state as `outline`/`border` (kept in HCM), opaque backing behind `.image-text`, and — cheap win — make chart textures active in forced-colors regardless of theme. CVD-safe *palettes* don't cover this (though the texture engine partly does for charts). |
| **G8** | **Running head/foot repeated in the AT tree on every slide** | braille / swipe-nav verbosity | 1.3.1 (quality) | **[LATER]** | If it's print chrome (confidentiality notice), `aria-hidden` it (state it once at document level); else expose once, not per-slide. |
| **G9** | **One skip link, no TOC/inter-slide nav** for a long deck; generic slide sections | keyboard/switch/SR navigation | 2.4.1 (quality), 2.4.6 | **[LATER]** | Emit a `<nav aria-label="Slides">` table of contents. Note the Fork-A tension (checker A8): naming every slide `<section>` for the rotor is the *right* call at deck-scale even though §3 warns against it at slide-scale — revisit the threshold. |
| **G10** | **No automated a11y gate** (no axe/pa11y/jest-axe anywhere); §8 gates are structural-only | regression over time | governance | **[FOUNDATION]** | Add `axe-core` on rendered gallery HTML in CI (cheap; closes the "new component ships div-soup" hole) alongside the §8 structural gates. Later: a periodic tagged-PDF/PPTX-alt check. |
| **G11** | **Whole populations unaddressed:** video/audio has **no captions/transcript** requirement (`imagery/video/`); no cognitive/plain-language affordance | deaf/HoH; cognitive | 1.2.x | **[LATER]** | Name them in scope; require captions/transcripts the moment any audio ships (present narration, video, read-aloud); defer cognitive with a tracked owner. |

### Verification honesty (the round's #5 finding)

The planned "real NVDA/VoiceOver pass" (§7) must be widened, and its limits stated:
it has to cover the **shipped artifacts** (NVDA/JAWS on the **PDF**; PowerPoint on
the **PPTX**), not just the HTML; and a matrix of {NVDA, JAWS, VoiceOver-mac,
VoiceOver-iOS, TalkBack} × {HTML, PDF} × {prose, chart, image deck}. **This sandbox
cannot run iOS/macOS VoiceOver, JAWS, braille, or switch/voice control** — so those
surfaces are **UNVERIFIED** by definition here (HARD RULE #23) and must be marked so,
never converted to "tested." The SVG-naming reliability (correction above) is exactly
one of the things only a real VoiceOver pass can confirm.

**Bottom line:** the semantic HTML/app base is the correct foundation and is largely
right (the confirmed-fine list proves it). "Accessible to all, any device" is a
**layered** goal — G1 (artifacts) and G6 (reflow) are the two that most make the
headline false today, and both are sequenced **on top of** the foundation, not
instead of it. Baby steps, in order: the **[FOUNDATION]** rows land with the base
(G2, G3, G4-status, G10, the SVG-id fix, G1's cheap `lang`/`title`/`altText`); the
**[LATER]** rows are the tracked backlog.

---

## 15. Refresh — the codebase moved (~119 commits); what changes for us (2026-07-10)

This note was written as #736 and merged; `main` then advanced ~119 commits before
we revisited. Several landed on the exact surfaces this doc maps. **The foundation
is intact and, in two ways, reinforced.** But there is a **new render surface**, the
**§5 citations are stale**, and **five gap-register rows move**. This section is
authoritative where it contradicts the body above; the body's *principles* stand.

### 15.1 A THIRD render surface — the HTML Lattice player (now the primary HTML deliverable)

§4 modeled two paths (export shell + engine/preview). There is now a **third**: the
**HTML Lattice player** (`lib/export/player-core.mjs`, `assemblePlayer()`), the
"Download as webpage" self-contained `.html` (#834/#831). It is **built from** the
emulator HTML but **extracts the bare `section[data-lattice-slide]` nodes and
re-wraps them in its own `lp-*` chrome** — so it is the artifact users now actually
share. Its shell (`player-core.mjs:358-395`) already emits `<html lang>` + `<title>`
(G2 partly met there) but:

- **No `<main>`** — slides sit in `<div id="lp-app"> → <div id="lp-stage">`.
- **A nameless `<nav id="lp-toc">`** (violates §8-#3) and a **second `<article
  id="lp-article">`** that is the *prose projection*, **not** §4A's `article #1`
  (deck). §4A's deck-level `<main>`/`<article class="lattice">` do **not** survive
  the player (it discards the container) — so the player **re-poses the landmark
  problem one level out**.
- **Its own chrome debt:** icon-only buttons (`☰ ⛶ ☾`) named only by `title` (weak);
  `#lp-count` renders bare "1 / 7" (reintroduces **G3**), not a live "Slide 1 of 7";
  no `prefers-reduced-motion` in `playerCss()` (small motion surface).

**Implication for §4A:** the map now has **three surfaces**, and the player-core
shell — not `lattice-emulator.js` — is where the deck-level `<main>` + labeled
toolbar/nav edits land. §4A's *slide-internal* retags (masthead→`<header>`,
chart→`<figure>`) still belong in the engine and **flow through** the player's
Present/Read·Slides views unchanged.

**Coordinate, don't duplicate.** The player has its own design records —
`2026-07-07-html-lattice-player.md` and `2026-07-08-studio-html-player-export.md` —
which **already commit Read·Article/Read·Slides to a WCAG AA + AXE acceptance pass**
(heading semantics, TOC focus, reduced-motion) as pending P4 work. Our a11y work
should **feed those acceptance criteria**, not open a parallel track. The player's
`<main>`, its `<nav aria-label>`, its icon-button `aria-label`s, and G3 belong on
*that* checklist.

### 15.2 §5 Studio citations are stale (activity-bar restructure, #826)

The Studio chrome was consolidated onto a **left activity bar**
(`2026-07-06-studio-activity-bar.md`). The **core finding holds — Studio still has
ZERO `<main>`** — but every line number in §5 moved. Current structure
(`StudioShell.tsx`):

- Split grid: `:2017` (mobile/focus) / `:2039` (desktop) — was `:1524/:1542`.
- Asides: `:2060` / `:2067` / `:2084` — was `:1560/:1574/:1583`.
- Headers: `:1761` / `:1773` — was `:1323/:1335`.
- **New:** `<nav aria-label="Studio panels">` (`:1740`, the activity bar) and the
  existing `<nav aria-label="Slide navigator">` (`:1685`). The panel launcher being a
  **named `<nav>`** is the "menus→nav" pattern done right (see §15.5).

§5's *action* is unchanged (add `<main>` scoped to the editor+preview subtree, keep
the asides as siblings) — only the citations refresh.

### 15.3 Two reinforcements to the foundation

- **Form-default is shipped + audited** (#848/#866 + ~8 "survives cell-stage wrap"
  fixes, e.g. #851/#852/#854/#856/#858). The §4A cell tree
  (`.cell-masthead`/`.cell-stage`/`.cell-footer`) is now the **canonical default**,
  not a proposal — so the masthead→`<header>` / footer→`<footer>` mapping sits on
  audited ground. (Line-number citations in §4/§4A may have shifted with the
  masthead-lift fixes — re-verify at implementation time.)
- **CVD textures now work in the live runtime** (#859 — the a11y-* pattern defs
  "never worked in live preview" until this fix). The §14 CVD credit is now real
  **cross-path**, not CLI-only.

### 15.4 Gap-register deltas

| Gap | Move | Now |
|---|---|---|
| **G1** (shipped-artifact accessibility) | **concrete vehicle** | The webpage **player** is the primary, self-contained, sanitized, `lang`+`title` HTML deliverable — the real answer to "route AT users to the HTML export." Still unfinished (its §15.1 debt), but no longer hypothetical. Reframe G1's HTML answer around the player + its AA/AXE docs. |
| **G5** (chart data equivalence) | **partial, audio-only** | #862 narrates **computed context** (journey % share, radar/quadrant **axis scale**, state-chart start/end) so an eyes-free listener gets the scale — but via **Present-mode read-aloud**, sourced through `slideToSpeech`, **not** a DOM text alternative in the exported `<figure>`. G5 stays open for the **static-export screen-reader** path (still no data table); the narration is a substrate a future figure-description could reuse. |
| **G6** (reflow) | **partially addressed, first time** | The player's **Read·Article** view genuinely reflows (prose projection, `#lp-article{max-width:740px}`). Present/Read·Slides stay fixed-canvas `transform:scale` (still fail 1.4.10). "Route reflow users to HTML" now has a **shipped** mechanism the PDF/PPTX can't offer. |
| **G9** (TOC / inter-slide nav) | **largely met in the player** | The player ships `<nav id="lp-toc">` with scroll-spy — but it is **nameless** (needs `aria-label="Slides"`) and **hidden below 820px** (mobile gap). |
| **G11** (audio/video captions) | **read-aloud limb met** | Narrated audio ships with a synchronized word-highlight **and** a first-class Share-sheet `.vtt` export (#845) + `--captions` CLI (#844). The `.vtt` is a **byte-neutral sidecar** (no export-sign-off impact). Still **[LATER]**: captions on the real `imagery/video/` media element, and cognitive/plain-language. |
| **(new) Player chrome debt** | **added** | Not in the original register: player needs a `<main>` around `#lp-stage`, `aria-label` on `<nav id="lp-toc">` + the icon buttons, "Slide N of M" for `#lp-count`, and a `prefers-reduced-motion` guard. Owned by the player's AA/AXE checklist (§15.1). |

### 15.5 Capture: navigation menus → `<nav>`, but action/command menus are NOT

A finding not in the merged doc. **A *navigation* menu is `<nav>`; an *action/command*
menu (a dropdown of commands, a ⌘K palette) is the menu-button pattern
(`<button aria-haspopup aria-expanded>` → `role="menu"`/`menuitem`), NOT a `<nav>`
landmark.** Wrapping a command menu in `<nav>` (or landmarking every dropdown) is
over-tagging. Two concrete instances:

- **Right:** the Studio activity bar is `<nav aria-label="Studio panels">` (§15.2) —
  it *is* navigation between panels. Correct.
- **Wrong (a tracked finding):** `SiteHeader.astro:65` puts **navigation links**
  (`primaryNav`, real page `href`s) inside `role="menu"` / `role="menuitem"`. That's
  the *inverse* error — the *action-menu* role for what are *page links*.
  `role="menu"` implies an app command menu with arrow-key semantics, not a link
  list. The Tools disclosure should be a `<nav>` (or a plain disclosure + list), not
  `role="menu"`. Add to the app-landmark (§5) work.

### 15.6 Verdict

The design is **not invalidated — it is extended.** Retag-not-wrap, the promotion
rubric, the slide-stays-`<section>` invariant, and the Form/Cell/Tile map all hold,
and Form-default shipping makes them firmer. What changed is **surface count** (now
three: export shell · engine/preview · **player**) and **who owns which gap** — the
player's AA/AXE acceptance work now owns G1/G3/G6/G9 for the shared artifact, and our
job is to (a) land the slide-internal retags in the engine so they flow through it,
(b) give the player shell its `<main>`/labeled-nav/icon-labels, and (c) refresh the
§5 Studio citations. No foundation rework; a coordination + citation refresh.
