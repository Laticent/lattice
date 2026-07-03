---
status: proposed
summary: Retag structural divs to native AA-sensible elements (change the tag, keep the class, keep the styling — never wrap), governed by a promotion rubric that stops both under-tagging (Studio has no `<main>`) and over-tagging (landmark noise). Two surfaces — the app (website/Studio/Playground) and the decks (web preview + HTML export). The slide stays `<section>` (measurement + all CSS select it); the deck container `div.lattice` becomes `<main>`; the export shell gains `lang` + skip link; app landmarks/region-names are filled. `<figure>`/`<figcaption>` for charts is a semantic win but carries UA-margin + export-byte cost, so it's carved into its own export-signed phase. Byte-neutral for block-box swaps. Direction hardened by a red-team, an inversion pass, and an independent checker.
---

# Semantic HTML for accessibility — retag, don't wrap

**Date:** 2026-07-03
**Status:** design proposal (design-before-code; no CSS/transform written yet)
**Branch:** `claude/semantic-html-accessibility-qdht2a`
**Scope:** the app (docs site: marketing, Studio, Playground, Components) **and**
the decks (live web preview + HTML export). **Out of scope:** the export-to-Marp
bundle (`lib/core/marp-bundle.js` — the recipient's Marp owns that HTML shell),
and PDF/PPTX tag trees (raster/print artifacts, not a DOM a screen reader walks).

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
  work region is a `<div class="grid">` (`StudioShell.tsx:1524,1542`). A screen
  reader offers the user no way to jump to the content; there is no "main" to skip
  to.
- **Every exported deck is a landmark desert.** The HTML export shell
  (`lattice-emulator.js:1449-1461`) has **no `lang`**, **no `<main>`**, **no skip
  link**, and no document title — just `<body>` with a flat pile of slide
  `<section>`s. A screen-reader user opening a shared deck link lands in an
  unlabeled, language-unset document.

The good news the recon turned up: **we are not starting from zero, and the fix is
cheap.** The slide is *already* a `<section>`; the deck already emits per-slide
`<header>`/`<footer>`; 43 of 56 components already emit native markdown
(`<h1>/<p>/<ul>/<table>`); the home page is already a clean
`<main>`/`<section>`/`<footer>` reference. And critically — **all styling is keyed
on classes, not element types** (zero bare `div` selectors, zero `> div`
combinators across both `lib/**/*.css` and `docs/src/styles/`). So we can change
what a box *is* without changing how it *looks*.

---

## 2. What we want — and the one instruction that shapes everything

**One sentence:** *give every surface a landmark skeleton and sensible regions a
screen reader can navigate, by changing elements — never by adding wrapper
`<div>`s.*

The "never wrap" instruction is not a style preference — it is load-bearing, for
three reasons the code forces on us:

1. **Wrapping breaks the height math.** HARD RULE #20: the layout measures via
   `getBoundingClientRect`/`scrollHeight` (the overflow probe, the Fit Spine).
   Every extra wrapper is another box the probe and the fit-scale must account
   for, and a wrapper that carries any margin corrupts the measurement outright. A
   *retag* adds zero boxes.
2. **Wrapping changes exported bytes.** A new DOM node shifts layout by a hair;
   PDF/PNG/PPTX are pixel-diffed against goldens. A block-for-block retag
   (`div`→`section`/`article`/`header`/`footer`) is the *same box model* — byte-
   neutral. (The one exception, `<figure>`, is quarantined in §7.)
3. **Wrapping fights the class-keyed CSS.** Since every rule targets `.funnel-figure`
   / `.cell-stage` / `.pg-pane`, moving the class onto a *different tag* keeps every
   rule; inserting a *new* wrapper needs new CSS and risks descendant-combinator
   surprises.

So the whole design reduces to: **for each structural node, either promote its tag
to the native element that carries its role, or leave it alone — and add the small
set of genuinely-missing landmarks/attributes that no existing node can carry.**

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
> | Promote to | …when the node is | Role it gains |
> |---|---|---|
> | `<main>` | the one primary-content region of a document | `main` (skip target) |
> | `<nav>` | a set of navigation links/controls (slide rail, primary nav) | `navigation` |
> | `<header>` / `<footer>` | the intro/meta strip of a document *or* section | `banner`/`contentinfo` **only at page top level**; generic inside a section |
> | `<section>` | a thematic region a user would want to jump to, **that can be named** | `region` (only if it has an accessible name) |
> | `<aside>` | complementary content beside the main flow (Inspector, Architect) | `complementary` |
> | `<figure>`/`<figcaption>` | a self-contained graphic + its caption (a chart) | `figure` |
> | `<article>` | a self-contained, independently-meaningful unit (a carousel card) | `article` |
> | **leave `<div>`** | a **presentational** box: a layout cell, a backdrop, a scrim, a positioning wrapper | none — correct as-is |

The rubric's most important row is the last one. `.cell-stage` (the body cell),
`.backdrop`, `.image-scrim`, `.lattice-bg`, the split-panel columns — these are
**presentational** boxes. They stay `<div>` (decorative ones also get
`aria-hidden`). Promoting them would manufacture landmark noise for zero
navigational gain. **Restraint is part of the design, not a gap in it.**

The rubric also encodes a subtle, load-bearing fact about `<header>`/`<footer>`:
nested inside a `<section>` (or `<article>`/`<main>`/`<aside>`) they are **not**
`banner`/`contentinfo` landmarks — they degrade to generic. This is *why* the
per-slide `<header>`/`<footer>` we already emit don't pollute the landmark map with
40 banners: each lives inside a slide `<section>`. It's also the guard rail that
lets a slide keep its own header/footer without hijacking the document-level ones.

---

## 4. The mapping — decks (the engine)

Applying the rubric to what the engine emits. **Bold = a change; the rest is
"confirmed correct, leave it."**

| Node (today) | File | Verdict |
|---|---|---|
| slide wrapper `<section>` | `lib/engine/slides.js:99` | **Keep `<section>`.** Already correct; measurement + hundreds of `section.<name>` CSS rules depend on it. Non-negotiable (§8). |
| deck container `div.lattice` | `lib/engine/slides.js:229` | **→ `<main class="lattice">`.** The one missing document landmark. Always the top-level content of its own document (export = standalone; preview = isolated `srcdoc` iframe), so exactly one `<main>` per document — safe. |
| per-slide `<header>` / `<footer>` | `slides.js:210,216` | **Keep.** Already semantic; generic (not landmarks) because nested in the slide `<section>` — correct. |
| `<h1>`/`<p>`/`<ul>`/`<table>` from 43 native components | (markdown) | **Keep.** Already native semantics — the payoff of being a markdown engine. |
| chart figure wrappers `.funnel-figure`, `.quadrant-figure`, `.radar-figure`, `.state-chart-figure`, … | 13 `*.transform.js` | **→ `<figure>` + `<figcaption>`** — a chart is the textbook `<figure>`. **Carved into its own phase (§7): UA-margin + export-byte cost.** |
| `.cell-stage` (body cell) | `masthead-lift.js:63` | **Leave `<div>`.** Presentational layout cell; the probe keys on its *class*. Promoting adds a nameless region. |
| `.backdrop`, `.image-scrim`, `.lattice-bg` | plugins/bg-image/scrim | **Leave `<div>` + `aria-hidden="true"`.** Pure decoration behind content — actively *should* be hidden from the AOM. |
| split-panel columns `.panel-left/.panel-right` | `split-panels.js` | **Leave `<div>`.** Two columns of one comparison are not two landmarks; the *content* inside carries its own semantics. |
| carousel card `.ct-card` | `carousel.js:329` | **Keep `<article>`.** Already correct — a self-contained card. |

Plus three **document-level additions** to the export shell
(`lattice-emulator.js:1449-1461`) — these are net-new, not swaps, and the rubric
says they're the landmarks no existing node can carry:

- **`lang="en"`** on `<html>` (WCAG 3.1.1). Sourced from the deck's `lang`
  front-matter when set, else `en`.
- **A skip link** — a visually-hidden "Skip to slides" `<a href="#…">` as the first
  body child, targeting the `<main>` (WCAG 2.4.1 Bypass Blocks).
- **A document title / accessible name** for the deck `<main>` — from the deck
  title front-matter, so the landmark isn't anonymous.

Deliberately **not** doing at the deck level: per-slide `aria-label`s naming every
slide (the slide's own `<h1>` already names it — see §6), and any `role=`
attributes on native elements (redundant-role is its own anti-pattern; a
`<section>` already has `region`).

---

## 5. The mapping — the app (docs site)

The home page is already the reference (one `<main>`, real `<section>`s, `<header>`,
`<footer>`, `<nav aria-label="Primary">`). The work is bringing the app surfaces up
to it. **Bold = change.**

| Surface | Change |
|---|---|
| **Studio** (`StudioShell.tsx`) | **`<div class="grid">` → `<main id="main-content">`** (both focus + desktop branches, `:1524/:1542`; the mobile branch too). This is the single highest-value fix in the whole design — the flagship surface gains a main landmark. Its `<section>`/`<aside>`/`<nav>` regions already exist; **give each an accessible name** via `aria-labelledby` pointing at its existing styled label (add an `id` to the `.pg-pane-label`/eyebrow `<div>`), or `aria-label`. |
| **Playground** (`PlaygroundApp.tsx`) | Already has `<main>` + `<section>` panes. **Name the panes** (`aria-labelledby` → the `.pg-pane-label`). Add a **skip link**. Optional **`<footer>`** for parity. |
| **All standalone pages** | Add a **skip-to-content link** as the first focusable element, targeting each page's `<main id="main-content">`. None exist today. The page skeleton is duplicated per page, so this is applied per surface (home, `playground.astro`/`PlaygroundApp`, `StudioShell`, `ComponentsLayout`) — *unless* we first extract a shared skeleton (a follow-up, not this change). |
| **SiteHeader** (`SiteHeader.astro`) | **No change** — already `<header>` + `<nav aria-label="Primary">`. This is the one shared top-nav; leave it. |
| Preview iframe | **No change to landmark structure** — it's a separate `srcdoc` document (isolated tree), and its *content* is governed by the deck mapping (§4). Host references it accessibly already (`<iframe title="Rendered slides preview">`). |

One element-coupling watch-item the recon flagged: `.db-edit-diff > div`
(`drawing-board.css:1023`) is the **only** element-combinator selector in the whole
docs-site style tree — and it's on the **frozen** Drawing Board, off the path of
every surface we're touching. Noted, not touched (HARD RULE #18: off-path, logged
not pulled in).

---

## 6. The genuine forks (what I need you to decide)

Three real decisions the rubric doesn't settle on its own. My recommendation first
in each.

**Fork A — the heading outline of an exported deck.** Every slide emits its own
`<h1>` today, so a 40-slide export is 40 `<h1>`s in one document. Options:
- **(A1, recommended) Keep per-slide `<h1>`; each slide `<section>` is named by its
  own heading.** Multiple `<h1>`s scoped one-per-section is legitimate and is how
  virtually every slide-export tool (reveal.js, Marp) behaves; a screen reader's
  heading list becomes a clean slide index. Byte-neutral, zero authoring change.
- (A2) One hidden document `<h1>` (deck title) + demote slide headings to `<h2>`.
  "Textbook" single-outline, but it changes deck heading semantics *and* the CSS
  that sizes `h1`, and the HTML5 outline algorithm that would auto-demote was never
  implemented in any browser AOM — so it buys little for real cost.

**Fork B — when do we do the `<figure>` conversion for charts?** It's a real
semantic win (a chart becoming a `<figure>`+`<figcaption>` is exactly right for a
screen reader), but it is the *one* part that (a) needs a `margin:0` UA reset
(allowed under #20 as a bare reset), (b) risks matching existing `:is(…figure…)`
CSS, and (c) **changes exported bytes → your export sign-off** (QUALITY BAR).
- **(B1, recommended) Two phases.** Ship the byte-neutral landmark/retag work first
  (main, lang, skip link, Studio main, region names) — no sign-off needed, fast
  win. Then the `<figure>` conversion as its own branch with a rendered dark+light
  demo deck for your sign-off.
- (B2) One change, one sign-off round covering everything.

**Fork C — confirm the restraint stance.** The rubric deliberately **leaves
`.cell-stage`, the split columns, backdrops, and scrims as `<div>`.** I'm confident
this is right (they're presentational; promoting them manufactures landmark noise),
but it's the judgment most likely to read as "you didn't finish." Confirm you want
**restraint** (promote only what carries a role), not **maximalism** (every box gets
an element).

---

## 7. Carve-out — `<figure>` is real work, quarantined on purpose

`<figure>`/`<figcaption>` for the ~13 chart transforms is the highest-semantic-value
change *and* the highest-risk, so it does not ride in the byte-neutral phase:

- **UA margin.** Browsers default `figure { margin: 40px 0 }`. Without a reset the
  chart shifts, the overflow probe's `scrollHeight` changes, and the fit-scale /
  overflow-ring can trip. Every `<figure>` swap ships a co-located `margin:0` reset
  (a bare reset — explicitly allowed by #20; it adds no space).
- **CSS leak.** ~56 existing selectors already say `:is(svg, figure, .functionplot)`
  etc.; a newly-`<figure>`'d node starts matching them. Each conversion is verified
  against the per-component gallery (light + dark page counts) + `pixel-check.js`.
- **Export bytes.** Margin/layout deltas change PDF/PNG/PPTX rasters → **human
  sign-off on a rendered demo deck in both modes** before merge (the QUALITY BAR
  export gate). This is the reason it's phase 2, not smuggled into phase 1.

The `<figcaption>` also *upgrades* the caption from a styled `<div>` to the caption
role — a genuine win, not just a tag change.

---

## 8. Guard rails — the invariants that keep this from backfiring

Inversion asks: *what would guarantee we make accessibility (or the render) worse?*
Each answer is turned into a rule:

1. **The slide wrapper stays `<section>`, always.** The overflow probe selects
   `section[data-lattice-slide]` (`overflow-probe.js`, injected into both emulator
   and runtime); every component CSS is rooted at `section.<name>`. Retagging the
   slide silently kills overflow detection and unstyles every component. **Never
   touch it.**
2. **Exactly one `<main>` per document.** The `div.lattice`→`<main>` swap is safe
   *only because* the container is always the top-level content of an isolated
   document (standalone export or `srcdoc` iframe). **Guard:** never render the
   `.lattice` container directly into a host page that already owns a `<main>` — if
   a future surface embeds slides without an iframe, the container must fall back to
   a plain `<div>` there. (Today: no such surface exists; this is a tripwire for the
   future.)
3. **No nameless landmarks.** A `<section>`/`<region>` with no accessible name is
   noise. Every promoted `<section>`/`<aside>`/`<nav>` ships with an
   `aria-label`/`aria-labelledby` in the *same* change — the promotion and its name
   are one edit, never two.
4. **No redundant/false ARIA.** Don't add `role="main"` to `<main>`, `role="navigation"`
   to `<nav>`, etc. — the native element carries it. Don't label a decorative box as
   content; label decorative boxes `aria-hidden` (backdrops, scrims) so they *leave*
   the AOM.
5. **No nested bare `<section>` with a colliding class.** A raw `<section class="x">`
   inside slide content will match `section.x` component rules. Promotions inside a
   slide use *named-but-non-colliding* classes, or non-`section` elements
   (`figure`/`article`), so descendant `section …` rules can't leak (the form plugin
   already guards this pattern, `plugins.js:475`).
6. **Byte-neutrality is verified, not assumed.** Phase 1 (block-box retags) is
   pixel-diffed against goldens to *prove* the "same box model → same bytes" claim
   before merge; any drift is a bug, not an accepted cost.

---

## 9. The cost, priced

| Change | You gain | You spend |
|---|---|---|
| `div.lattice` → `<main>` + `lang` + skip link | every exported deck gets a skip target, a language, a named main | ~10 lines in the emulator shell; a golden re-diff (should be zero-delta) |
| Studio `<div class="grid">` → `<main>` + region names | the flagship app surface becomes navigable; regions get names | a handful of JSX tag swaps + `aria-labelledby` ids; visually free |
| Playground/pages skip links + region names | keyboard users bypass chrome; regions named | per-surface edits (skeleton isn't shared yet) |
| chart `<div>` → `<figure>`/`<figcaption>` (phase 2) | charts + captions gain the figure/caption roles | UA-margin resets, CSS-leak audit, **export sign-off** |
| **leaving presentational divs alone** | a *usable* landmark menu (no noise) | the temptation to "finish" by tagging everything — deliberately not spent |

The design's value isn't "more semantic elements." It's a **navigable structure
that's honest** — real landmarks where they help, plain `<div>`s where they don't,
and not one byte of export drift in the phase that doesn't need sign-off.

---

## 10. Adversarial passes (folded in)

*(This section is filled after the red-team / inversion / independent-checker
agents report; the design above is the artifact they attack.)*

---

## 11. Rejected alternatives

- **Wrap content in new semantic wrappers.** The obvious move, and wrong here:
  breaks the measurement math (#20), changes export bytes, needs new CSS. Retag beats
  wrap on every axis *because* our CSS is class-keyed. (This is the user's own
  instruction, and the recon proves it's the cheaper path too.)
- **Maximal semanticization (every `<div>` → `<section>`).** Manufactures landmark
  noise; a 40-region menu is worse than none. Rejected in favor of the promotion
  rubric (§3).
- **Change the slide element to `<article>`** (a slide is "self-contained"). Tempting
  semantically, catastrophic mechanically: kills the overflow probe and every
  `section.<name>` rule. A slide is a *section of a presentation*, not a syndicated
  article — `<section>` is also the honest choice. Rejected (§8 #1).
- **ARIA-first (sprinkle `role=`/`aria-*` onto the existing divs).** ARIA is the
  fallback for when no native element fits; here native elements fit almost
  everywhere. "No ARIA is better than bad ARIA" — use the real element, reserve ARIA
  for names and the few genuine gaps. Rejected as the primary tool.
- **Do the whole thing including `<figure>` in one pass.** Couples the byte-neutral
  fast win to the export-sign-off slow path. Rejected in favor of two phases (§7),
  pending your call on Fork B.

---

## 12. File map (for whoever implements)

**Phase 1 — byte-neutral landmarks & retags (no export sign-off):**
- Export shell + `lang` + skip link + `<main>`: `lattice-emulator.js:1449-1461`.
- Deck container element: `lib/engine/slides.js:229` (`div.lattice` → `<main>`),
  with the §8 #2 host-embed tripwire documented at the call site.
- Decorative `aria-hidden`: `lib/integrations/markdown-it/plugins.js` (`.backdrop`),
  `lib/core/bg-image.js` (`.lattice-bg`/`.image-text`), `image-scrim.js`.
- Studio `<main>` + region names: `docs/src/components/studio/StudioShell.tsx`
  (`:1524`, `:1542`, mobile branch; `aria-labelledby` on `<section>`/`<aside>`).
- Playground names + skip link: `docs/src/components/playground/PlaygroundApp.tsx`,
  `docs/src/pages/playground.astro`.
- Skip links on standalone pages: `docs/src/pages/index.astro`,
  `docs/src/layouts/ComponentsLayout.astro`.
- `CHANGELOG.md` `## Unreleased` (HARD RULE #10); a11y note in
  `engineering/development.md`.

**Phase 2 — `<figure>`/`<figcaption>` for charts (export sign-off gated):**
- The ~13 `lib/components/**/*.transform.js` figure wrappers + co-located
  `margin:0` resets; CSS-leak audit against the `:is(…figure…)` selectors; a
  rendered dark+light demo deck for sign-off.

**Docs to update in the same change(s):** `engineering/gotchas.md` (the
`<figure>` UA-margin trap; the one-`<main>`-per-document tripwire), a short
`engineering/accessibility.md` if one doesn't exist (the landmark contract + the
promotion rubric as the canonical reference).

---

## 13. Decisions (to be resolved at sign-off)

Pending the three forks in §6 and the adversarial passes in §10. Everything else
(the rubric, the retag-not-wrap principle, the slide-stays-`<section>` invariant,
the restraint stance, the two-phase split) is proposed as settled unless a pass
overturns it.
