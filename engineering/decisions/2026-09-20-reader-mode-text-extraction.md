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

> **This paragraph describes the design that shipped FIRST, and the second half of it was
> falsified before merge. Read § "The two paths" below before relying on it.** "Set only
> from JS" held on the live-DOM path and did nothing on the re-fetch path, where the player
> still handed a reader both copies. What is in the tree is `#lp-doc` shipping `hidden` in
> the markup, with `setView` maintaining it. The paragraph is kept rather than rewritten
> because the claim and its falsification are the whole lesson of this note — but a reader
> who came here for *what is in the tree* was getting the wrong answer from the section
> named "What shipped", which is the one section that should never need a caveat.

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

## The two paths, and why one of them nearly ate this change

**An extractor reaches a document two different ways, and they disagree about JavaScript.**
This was found late, by installing a real Firefox rather than trusting the library, and it
falsified a claim this note had already made.

- **Firefox for iOS readerizes the LIVE DOM.** It calls `readerize()` inside the webview
  (`webView.evaluateJavaScript`), so whatever the page's own scripts have done to the DOM
  is what it sees. This is the path shake-to-summarize takes.
- **Firefox on the desktop RE-FETCHES.** `about:reader?url=` issues a fresh request and
  parses the server HTML with **no scripts run at all.**

Measured against Firefox 142 with a purpose-built probe page: a paragraph added by page JS
**never appears** in the reader, and a `hidden` attribute set by page JS is **ignored
outright** — the element is extracted as if unmarked.

**What that cost.** The player fix above originally set `hidden` only from `setView`, i.e.
only from JavaScript. On the live-DOM path it worked, measured. On the re-fetch path it did
nothing, and the player still handed the reader both copies: **2291 words for a 1080-word
deck** in a real Firefox — exactly the defect the fix claimed to have removed. Every
measurement behind that claim had been taken in Chromium against the library, which is the
live-DOM path, so nothing in the original evidence could have caught it.

**The fix, and the tradeoff it forces.** `#lp-doc` now ships carrying `hidden`, and
`setView` maintains it. That reads 1099 words, single copy, on the re-fetch path. It has to
be `#lp-doc` and not `#lp-stage`: the no-JS floor needs the slides laid out when no script
runs, so the stack can never ship hidden. The cost is that a re-fetching reader always gets
the SLIDES rather than the richer article — one copy of a partial deck, which beats two
copies of a whole one. A live-DOM reader still gets whichever view is open.

**`--read` is the only one of the three that is unconditional.** Its article is the single
copy in the static markup with no JavaScript involved, so both paths agree: Firefox's own
reader rendered it at 1057 words. **The Studio view is inherently live-DOM only** — it is a
client-rendered app, so a re-fetching reader sees the pre-paint shell and no prose. That is
not a defect to fix; it is what a single-page app is.

The lesson worth keeping: *running the library Firefox uses is not the same as running
Firefox.* The library was right about eligibility and silent about which DOM it would be
handed.

## What an independent checker found, after all of the above

The maker-checker pass (CLAUDE.md § MAKER-CHECKER) was skipped on the first pass and run
late. It found three confirmed defects, all in `lattice-emulator.js`, all in code the
measurements above had already "verified". Worth recording because of what they have in
common: **every one of them sat in a composition the happy path never exercised.**

1. **`--read --captions` wrote zero caption files.** The flag reassigned the module's
   `cleanDocHtml` to the article document, and the caption projection reads that same
   string afterwards to find `section[data-lattice-slide]`. The article has none by
   design, so the sidecars vanished and the message blamed the deck ("nothing to
   narrate") rather than the flag. `--fluid` never had it because it writes without
   reassigning. Fixed by doing the same.

2. **A deck that merely WRITES a closing `main` tag kept a slide and duplicated it.** The
   engine passes an author's raw HTML through unescaped, so `<p>… with </main> before …</p>`
   ends that element where it sits. The first implementation regex-matched
   `main#deck … /main` non-greedily and mis-split there. The second replaced the `#deck`
   NODE and *still* mis-split, because by then the parser had hung the remaining slides
   outside it as siblings — which is exactly what a browser does with that markup. Both
   left a whole slide after the article, un-styled, with its text in the document twice:
   the one outcome this flag exists to prevent, on the deck most likely to carry the
   trigger. Fixed by keying on the SLIDES rather than on their container — but that first fix
   keyed on the STRING `#deck > section[data-lattice-slide], body > …`, and a CSS id selector
   matches ANY element carrying that id, so a deck pasting the whole export scaffold
   (`<main id="deck"><section data-lattice-slide=…>`) still minted a phantom slide: measured,
   the probe text twice and 3 article sections for a 2-slide deck.
   **What is in the tree** resolves `main#deck` ONCE as a node and asks it for its own
   children — `querySelector` returns the first in document order, and the real container
   always encloses a pasted one — with `body > …` beside it for the slides a closing `</main>`
   hangs outside, sorted back into document order. The article then REPLACES that container
   rather than dropping it when empty; the empty check could never fire, because by the time it
   ran the container held the whole article, which is how every `--read` document shipped a
   `<main>` inside a `<main>` (3 axe landmark violations). `measureOverflow` still carries the
   identical id-selector hole — pre-existing, off that change's path, and recorded here rather
   than widened into it.

3. **`read: true` front matter was a documented no-op.** `--help` and the changelog both
   promised it; `RENDER_TARGET_KEYS` did not carry `read`, so the key always read absent
   and `lint:deck` reported such a deck clean. Fixed by registering the key, which also
   buys the linter's on/off vocabulary.

Plus two that were real and quieter: `ReadArticle`'s effect depended on an `extraTheme`
wrapper object `StudioShell` rebuilds every render, so any unrelated re-render would
re-render the whole deck through the engine (`DeckPreview` had already solved this by
depending on `(name, css)`); and two of the three view arms in the player invariant
asserted identical state, so the `read-slides` arm could not have caught a button that
did nothing.

**The lesson is not "test more".** Defects 1 and 2 were invisible to every measurement
taken, because each measurement drove one flag on one well-formed deck. What found them
was someone asking what ELSE touches this string and what an author might legitimately
write. The regression tests now in `read-export.test.js` encode both questions.

## What is not resolved

- **No device verification.** Every claim here is measured against the real Readability
  library and real artifacts in Chromium. Firefox for iOS on an actual iPhone was not
  reachable from the sandbox, so the end-to-end shake gesture is **UNVERIFIED**. Safari
  Reader's own heuristic (a heading plus ~2000+ characters) is stricter than Readability's
  and was not measured against a deck.
- ~~**`journey` describes itself nowhere, so its content is in no article.**~~ **Resolved
  2026-09-21.** A visual-layout slide now contributes whatever description its visual already
  carries, which recovered `state-chart` immediately — its transform authors "States — 1. Draft
  (start); … Transitions — on submit, Draft to In Review" for the accessibility tree, and the
  article was throwing it away. `journey` had no equivalent, and that was a gap in the
  COMPONENT rather than the projection: a screen-reader user got actor initials and a run of
  bare digits. So `journeyDesc` was built where `stateChartDesc` lives, and the board carries
  it as an sr-only first child — "Actors — prospect, user. Discover — Search (prospect), mood 4
  of 5; …". Both readers are served by one sentence. Verified pixel-identical across all eight
  slides of `examples/chart-narration.md`, because an sr-only element that stopped being hidden
  would print on every journey slide and in every raster.
  The kernel reads three channels off the SECTION — the author's `describe:`, a component's
  `data-lattice-desc`, then an SVG `<desc>` — and the first of those was dead on arrival when
  scoped to the stage, since `describe:` is injected outside `.cell-stage`. Document order gives
  the author priority for free. Deliberately NOT synthesized from markup: measured, the generic
  block walk over a journey stage yields `PprospectSsalesUuserOonboarding` and
  `Pain12345Delight`, the index welded to its label. An invented description is worse than an
  absent one, so a component that describes itself nowhere still gets the note alone.
- **The bake's UTF-8 double-encoding now reaches the reading article.** A browser-drawn
  `function-plot` captured by the bake ships its axis label as `x²` double-encoded — it renders
  `XÂ²`. Pre-existing in the capture (`--player` has carried the identical bytes all along), and
  the net for that slide is still a plot instead of a placeholder, but `--read` is a surface
  that did not show it before. Off-path for the change that surfaced it; recorded rather than
  fixed. Same shape: a journey step labelled `R&D` reads `R&amp;D` in the article and to a
  screen reader, because the label arrives already entity-encoded and is escaped again — the
  visible chip on the slide has always done the same, so the description is consistent with
  shipped behavior rather than newly wrong.
- **Readability drops part of short decks even from a clean article.** `examples/a11y.md`
  extracts 216 of 334 words (65%) from the projection alone, because its paragraphs are
  short. That is a floor in their algorithm, not something this change can move.
- **Card-style titles read oddly in prose.** A slide authored `- 0` / `  - boxes to drag —
  …` (HARD RULE #5's nested form) projects to `<li>0<ul><li>boxes to drag…` , which reads
  as a stray "0". Pre-existing behavior of the shared projection, visible in the player's
  Read view too; logged here rather than fixed, per HARD RULE #18's off-path rule.
- ~~**The Studio's render is not baked.**~~ **Resolved 2026-09-21.** `buildDeckRender`'s
  static output leaves a mermaid fence as a raw `<pre><code>`, so the Read view showed fence
  source where the player shows a drawing. `article-projection.ts` now runs the same
  `bakeDeckSections` the webpage export runs, gated on the render actually carrying
  runtime-drawn content (the fence class, `data-sc-transitions`, `data-fp-config`) — the bake
  costs ~1.5 s and a deck without diagrams would pay all of it for a byte-identical result.
  Measured on `examples/mermaid-diagram-surface.md`: 4 raw fences and 0 SVGs become 0 fences
  and 4 SVGs carrying 19 native `<text>` labels; time from the palette row to a rendered
  article goes 480-678 ms to 2009-2320 ms, and a diagram-free deck stays at 485-687 ms.
  It needed one thing the export path does not: **`freezeTokens`**. The bake deliberately
  leaves a scheme-varying paint as `var(--token)` so a host shipping the deck CSS can
  re-theme it, and this pane ships none — every node, connector and label rendered BLACK.
  So the Studio caller opts into `applyCollectedTokens`, the same fix and the same shape as
  `flattenChartSvgs`; the export paths keep the reference and their toggle.
- **No JSON-LD or `og:type` anywhere on the docs site.** Chrome's DOM Distiller reads
  both. Adding them is a separate, cheap win that was not taken here.
- **The 15 non-eligible built pages** were left alone. The app shells should not be
  articles; `/overview` and `/features` are card grids, and making them eligible means
  changing what they are, not adding markup.
