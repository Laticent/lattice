---
status: shipped
summary: Reader-mode tools ("summarize this page", Firefox Reader View, Safari Reader, the Edge/Chrome reading modes) could not see a Lattice deck on any live web surface, because every one of them renders slides inside a same-origin srcdoc iframe and those tools only read the TOP-LEVEL document. Measured on the built site, the hydrated /studio holds 0 <p>, 0 <article> and 1118 characters of text, all of it UI chrome. The fix is NOT to dress the slide stack up as an article — measured, that flips Readability's eligibility check but its extractor then keeps one subtree and discards the rest, so 45-76% of the deck reaches the summarizer. The prose projection is the right artifact (66-100%, four of six test decks at 100%), and Lattice already had it: projectDeckToProse, shared by the CLI export, shipped in the browser bundle, with zero callers on the website. Adds a Studio Read · Article view; fixes the exported player, which was feeding the deck to summarizers TWICE.
builds-on: 2026-07-11-manifest-speech-contract.md, 2026-07-03-semantic-html-accessibility.md, 2026-08-17-studio-dynamic-loading-audit.md
---

# Reader mode cannot see a deck, and the slide stack is the wrong thing to show it

## What triggered this

"Lattice Studio and possibly the website don't support Firefox's shake-to-summarize.
My expectation in the Studio is that the active deck gets summarized. We have the HTML
structure with sections and articles — can we support this without hacks?"

The HTML structure was never the problem, and that is the useful part of this note.

## What those tools actually require

Firefox for iOS summarizes only pages that qualify for **Reader View**, then sends the
**Reader-extracted** text to the summarizer (≤3000 words on-device via Apple
Intelligence, ≤5000 via Mozilla's cloud). The gate is `isProbablyReaderable` from
Mozilla's Readability. Read from its source rather than inferred:

- Candidates are **`p`, `pre`, `article`** only, plus `div > br` parents. **`section` is
  not a candidate. Neither is `h2` or `li`.**
- Each candidate needs ≥140 characters; the page needs `Σ √(len−140) > 20`, so roughly
  540+ characters of real paragraphs.
- Visibility is read from the **`hidden` attribute, the inline `style` attribute and
  `aria-hidden`** — never computed style. This detail decides two of the three findings
  below.

Safari Reader wants a heading followed by ~2000+ characters in a block and responds to
`<article>`; Chrome's DOM Distiller additionally reads `og:` and schema.org `Article`
markup, which this repo emits nowhere. So Safari's bar is higher than Firefox's, and a
deck that clears one may not clear the other.

## The three findings, measured

Measured against the real `@mozilla/readability`, on real built artifacts, in Chromium.

**1. Live web surfaces cannot work at all, and no markup fix changes that.** The Studio,
the Playground and every embedded deck render into a same-origin `srcdoc` iframe — one
document per slide in the Studio. Reader-mode extractors read the top-level document.
Live `/studio` after hydration: 0 `<p>`, 0 `<article>`, 1 iframe, 1118 characters of body
text, all chrome. The deck is in another document.

**2. The website mostly already worked.** 112 of 127 built pages are reader-eligible. The
15 that are not are app shells (studio, playground, workbench, drawing-board, spec) and
card-grid pages — `/overview` is 13 `<article>` cards averaging ~104 characters with one
paragraph over 140, so Readability is arguably right to reject it.

**3. The exported player fed the deck to summarizers twice.** It carries the slide stack
(`#lp-stage`) and the prose article (`#lp-doc`) in one document and switches with a
stylesheet rule, which the visibility check above cannot see: 2255 extracted words for a
1080-word deck, every sentence duplicated. That also halves the deck that fits under the
3000-word cap.

## Why the obvious fix is the wrong one

The engine already wraps a deck in `<article class="lattice">`; the CLI export shell drops
it for `<main id="deck">`. Restoring it is a one-line change and it **works** — all six
test decks flip from ineligible to eligible.

It is still wrong. What `isProbablyReaderable` decides is only whether the icon appears;
what gets summarized is `Readability.parse()`, which picks one top candidate subtree and
discards the rest. Measured coverage of the deck's own text:

| What the page offers | Passes the gate | Deck text reaching the summarizer |
|---|---|---|
| Slide stack wrapped in `<article>` | 6 / 6 | **45–76%** |
| The prose projection as the page's article | 6 / 6 | **66–100%** (4 of 6 at 100%) |

An icon that promises a summary and delivers half the deck is worse than no icon. **The
summarizable artifact is the prose projection, not the slide DOM.**

## What shipped

**The player** (`lib/export/player-core.mjs`). `setView` mirrors the CSS view-hide onto
the inactive pane's `hidden` attribute, which extractors do respect. Two properties make
it safe and both are pinned by
`test/integration/invariants/player-text-extraction.test.js`: the attribute lands only
where the CSS already hides the pane (so it is a provable visual no-op, and never cloaks
content a reader can see), and it is set only from JS (so the shipped markup is unchanged
and the no-JS floor still lays out every slide). Verified in Chromium across all three
views — extraction drops to one copy, the gate still passes in every view, screenshots
pixel-identical.

A detail worth keeping: the gate and the extractor **disagree** about `hidden`.
`isProbablyReaderable` checks nodes individually, so hiding a container does not hide the
candidates inside it; `Readability.parse()` drops the hidden subtree. That asymmetry is
why this fix costs no reader-mode icon, which was not the expected result.

**The Studio** (`docs/src/components/studio/ReadArticle.tsx`,
`article-projection.ts`). A Read · Article view rendering the projection into the
top-level DOM, reached from the command palette. Live measurement on the built site:
`readerable` false → **true**, 0 → 7 `<p>`, 0 → 1 `<article>`, 7 TOC entries, 0 iframes.

The **transform** is the shared kernel and is not duplicated — `projectDeckToProse`, the
same function the CLI export runs, reached through the already-lazy player-core bundle.
The **styling** is deliberately the Studio's own rather than the player's: the player is a
standalone document sized to a reading window, this is a pane inside an app, and each
should look like its host. Both target the same `lp-*` class contract the projection
emits, so the markup stays one thing. Do not "unify" them by injecting `playerCss()` — it
carries `html,body{margin:0}`, a fixed-position bar and the whole Present stage.

**Cost.** The view is `React.lazy`, so the /studio route's eager payload grows only by its
entry point: measured twice off one tree, **+526 bytes gz and +127 bytes of HTML**. The
projection itself runs in 3.5–11.8 ms for 7–33 slides and adds ≤1600 DOM nodes.
`docs/route-budget.json` was raised in the same change with that attribution.

Lighthouse is untouched at load, because the article is built on view switch and
Lighthouse never switches views. Measured for the *eager* case anyway, as an upper bound
on doing it wrong: injecting the heaviest article (157KB, 1587 nodes) into `/studio` at
load costs **26 performance points, all of it CLS** (0.076 → 0.773). LCP (3751 → 3642 ms)
and TBT (25 → 24 ms) do not move — the article is inert markup with no JS and no blocking
resources.

**The `.html` export (`--read`).** A new flag writes the deck's prose *instead of* the
slide stack. "Instead of" is forced, not stylistic, and it is the finding that killed the
first attempt: appending the article *beside* the slides was built and measured, and it
re-created the player's defect in a worse place — 2123 extracted words for a 1080-word
deck, every sentence duplicated, in a document where both copies are visible so neither
can be hidden without cloaking. **A document gets one copy of the deck.** Either the
slides are the summary source (45–76%) or the prose is, and a document with two
switchable copies is `--player`, which already exists. With `--read` the same deck
extracts 1040 words, single copy, and the three test decks that previously failed the
eligibility check outright now score 46.9 / 52.5 / 99.3.

It runs after the raster, the placement `--fluid` already uses, so the PDF/PPTX/PNG are
rendered from the clean pre-article document — verified by rendering the same deck with
and without the flag and comparing PDF checksums, which match. That ordering is invisible
in the source, so it is pinned by `test/integration/invariants/read-export.test.js`
rather than left to a comment.

## What is not resolved

- **No device verification.** Every claim here is measured against the real Readability
  library and real artifacts in Chromium. Firefox for iOS on an actual iPhone was not
  reachable from the sandbox, so the end-to-end shake gesture is **UNVERIFIED**. Safari
  Reader's own heuristic (a heading plus ~2000+ characters) is stricter than Readability's
  and was not measured against a deck.
- **Readability drops part of short decks even from a clean article.** `examples/a11y.md`
  extracts 216 of 334 words (65%) from the projection alone, because its paragraphs are
  short. That is a floor in their algorithm, not something this change can move.
- **Card-style titles read oddly in prose.** A slide authored `- 0` / `  - boxes to drag —
  …` (HARD RULE #5's nested form) projects to `<li>0<ul><li>boxes to drag…` , which reads
  as a stray "0". Pre-existing behavior of the shared projection, visible in the player's
  Read view too; logged here rather than fixed, per HARD RULE #18's off-path rule.
- **The Studio's render is not baked.** `buildDeckRender`'s static output leaves a
  mermaid fence as a raw `<pre><code>`; the export path bakes those through a capture
  frame first. The Read view shows fence source where the player shows a drawing.
- **No JSON-LD or `og:type` anywhere on the docs site.** Chrome's DOM Distiller reads
  both. Adding them is a separate, cheap win that was not taken here.
- **The 15 non-eligible built pages** were left alone. The app shells should not be
  articles; `/overview` and `/features` are card grids, and making them eligible means
  changing what they are, not adding markup.
