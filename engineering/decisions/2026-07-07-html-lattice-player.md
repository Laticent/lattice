---
status: proposed
summary: >
  The HTML Lattice player — the shippable half of the 2026-06-16 export format. A single
  self-contained .html carries THREE views of one deck: Present (the flagship fit-scaled
  presentation transport), Read·Slides (the real slide DOM stacked into a scrollable column —
  full-fidelity fallback, nearly free), and Read·Article (a Typora-style prose document with a
  sticky left table of contents, backed by a component-aware prose projection). Resolves the
  open questions held in 2026-06-16 — size = Floor (honest ~1.8 MB floor + a size ceiling; glyph-
  subsetting pulled into v1), colour = both modes + prefers-color-scheme toggle, notes default-in with a
  strip-all-copies toggle, un-inlinable assets warn-and-degrade (external refs stripped so the file never
  phones home) — hardened by the full adversarial trio (checker + red team + Munger inversion): security
  is a v1 GATE (sanitize baked HTML, escape the whole envelope, sha256-pinned CSP). Scopes the app-hosted
  lattice.style/deck/{id} player as its own later track (net-new server infrastructure; nothing
  exists today). The prose projection is a SHARED semantic-DOM kernel (HARD RULE #1), consumed by
  both the export player and the future app player; the transport player is export-specific,
  frozen, and versioned under lib/export/ (HARD RULE, 2026-06-16 §4).
version: 1
supersedes: none
extends: 2026-06-16-lattice-export-format.md
last-status-update: 2026-07-07
---

# The HTML Lattice player — Present + Typora-style Read, in one self-contained file

**Date:** 2026-07-07 · **Status:** design-decision (proposed) · **Owner:** Sharmarke

> **This doc extends [`2026-06-16-lattice-export-format.md`](2026-06-16-lattice-export-format.md),
> it does not replace it.** That doc settled the container architecture (a self-contained `.html`
> *share* format + a `.lattice` *project* zip sharing one manifest envelope; pre-render, don't ship
> the engine; the reuse boundary). Phase 1 shipped only as the `.lattice` project zip + re-import — the
> manifest-envelope kernel and the `.html` path remain unbuilt. This doc picks up the
> unbuilt half — the `.html` **player** — adds the **read-mode dual view** the original didn't cover,
> **resolves its carried open questions**, and **scopes the app-hosted player** as a separate track.
> When this note and a shipped surface disagree, the shipped surface wins.

Related: [`2026-06-16-lattice-export-format.md`](2026-06-16-lattice-export-format.md) (the parent —
container, envelope, reuse boundary), [`2026-07-03-studio-succession.md`](2026-07-03-studio-succession.md)
(the Studio + the in-app Present overlay this shares a transport kernel with),
`docs/src/playground/presenter-window.js` (the shipped dual-screen presenter — the transport's
nearest sibling), `lib/authoring/notes-core.js` (the note boundary — a language fact, single-sourced).

---

## The reframe: one file, three views of the same deck

The 2026-06-16 doc designed a *presentation* player. The brief has since sharpened: the exported
file should be excellent to **present** AND excellent to **read** — and "read" has a concrete target,
**Typora's export-to-HTML with a table of contents on the left**. A deck is two things at once (a
talk and a document); the file should be both, and let the recipient choose. So the `.html` carries
three views behind a small toggle:

| View | What it is | Built from | Cost |
|---|---|---|---|
| **Present** | The flagship. One slide at a time, FIT-scaled to the viewport, keyboard/swipe nav, the three capability tiers + dual-screen presenter of 2026-06-16 §2c–2d. | pre-rendered `<section>` DOM + the transport player | the bulk of the player work |
| **Read · Slides** | The real slides **stacked** into a scrollable column (each stays fixed 16:9 and scales — it is a linearization, not a true reflow). Full component fidelity. A guaranteed zero-loss fallback and a print/a11y-friendly linear order. | the SAME `<section>` DOM, a CSS `data-view` switch | **nearly free** (pure CSS; card sizing is an open Q) |
| **Read · Article** | A Typora-style prose document — flowing article, reading typography, a sticky **left TOC** with scroll-spy. The stated ideal for reading. | a **component-aware prose projection** of the semantic DOM | its own phase (the real read-mode engineering) |

**Why keep all three** (validated against the `.scratch/player-proto` prototype, 2026-07-07):
Read·Slides costs almost nothing — it is a `data-view="read-slides"` attribute and a stylesheet over
DOM already in the file — and it is the escape hatch if the prose projection ever mishandles an exotic
component. Present and Read·Article are the two headline modes; Read·Slides rides along as a labelled
secondary ("Slides" vs "Article" so it never competes with the article for the "reading" job). Dropping
it would throw away a working, zero-risk fallback for no saving.

**Progressive enhancement is preserved — but the JS-off floor must be CSS, not JS.** With JS disabled the
file should degrade to the pre-rendered slides stacked and scrollable (Read·Slides as the floor); the
player *enhances* into Present and mounts the article. **Caveat found in review:** today's FIT-scale is
**JS** (`presenter-window.js`/`practice` compute `transform:scale` from `clientWidth`), and 10 of 76
`examples/` decks author `size: 4K` (3840×2160) — so with JS off, those slides render at intrinsic size
and overflow, *not* a clean column. The JS-off floor therefore needs a **CSS-only responsive fit**
(`aspect-ratio` + a `width:100%` container so the box scales via `cqi`/percentage without JS), and it must
be **verified with JS actually disabled** (HARD RULE #23 — emulation doesn't count; attach the screenshot).
The player remains a ~15–30 KB transport that only navigates static DOM — never the rendering engine
(2026-06-16 §2a).

---

## Decision A — Read · Article is a component-aware prose projection

### A1. The target and the trap

Typora produces a clean article because its **input is already prose**. A Lattice deck's input is
**component markup** — a slide is `<!-- _class: comparison -->` with labelled slots, not paragraphs.
The prototype built the article the naive way (strip directives, concatenate slides, run markdown-it)
and the artifacts were immediate and instructive: stray backticks where the source wrapped code-spans,
card components (`- Title` / `  - body`) collapsing to nested bullet lists, eyebrows landing as loose
paragraphs. That is "markdown dumped to a page," not Typora-grade.

**So read mode's fidelity comes from knowing the component.** The projection runs over the **semantic
rendered DOM** — where the component type (`class`) and its slots are explicit — not the raw markdown.
Because we know a section *is* a `comparison`, we can emit the correct prose form for it.

### A2. Per-bucket prose mapping (the 13 buckets)

Each bucket has a canonical prose form. This table is the contract the projection implements; each row
is a small, testable transform, and each earns its own visual bar.

Bucket membership below is taken from the authoritative manifest (`dist/docs/components.json`), not
from memory — an earlier draft miswired four buckets.

| Bucket → components | Prose form in Read·Article |
|---|---|
| **anchor** — title, divider, closing | `<h1>` (title) / `<h2>` (divider — also a TOC entry) / closing paragraph. The heading spine of the article. |
| **statement** — big-number, content, quote, split-panel | `content` is already prose (paragraphs). `quote` → `<blockquote>` + `<cite>`. `big-number` → an inline stat callout/figure. `split-panel` → lead paragraph + adjacent figure. |
| **inventory** — actors, agenda, cards-grid, cards-stack, checklist, glossary, inventory, list, list-tabular, logo-wall, q-and-a | the list family: `<ul>`/`<ol>`; `<dl>` for glossary + q-and-a; `<table>` for list-tabular; a task list for checklist; logo-wall → a sentence + inline figures. Cards become `<dl>`/`<ul>`, **not bullets-of-bullets**. |
| **comparison** — compare-prose, compare-table, decision, matrix-2x2, pricing, redline, split-compare, verdict-grid | a `<table>` — the natural prose form for A-vs-B; `redline` keeps diff/ins-del formatting; `compare-prose` → parallel paragraphs. |
| **progression** — list-criteria, list-steps | an ordered `<ol>` (steps) or a definition list of criteria/stages. *(timeline/roadmap are NOT here — they are chart, below.)* |
| **evidence** — kpi, stats | numeric tiles → a `<figure>` or small stat `<table>`/`<dl>`. **Not a blockquote, not bullets.** |
| **imagery** — image, video | `<figure>` + `<figcaption>` at reading width; `video` → poster figure + link. |
| **chart** — funnel, gantt, journey, kanban, map, piechart, progress, quadrant, radar, roadmap, state-chart, timeline-list, word-cloud | the rendered SVG as a `<figure>`, caption from title/footer. **`state-chart` is runtime-JS-inflated, not static SVG — it must be baked headlessly at export (§A2b).** timeline-list + roadmap live here. |
| **diagram** — diagram | Mermaid inline SVG as a `<figure>` (already static). |
| **math** — math | pre-rendered KaTeX HTML inline. **`math.canvas`/function-plot is runtime-JS-inflated — bake headlessly at export (§A2b).** |
| **code** — code, compare-code | `<pre><code>`, highlighting preserved; `compare-code` → labelled stacked/side-by-side blocks. |
| **legal** — authority-chain, citation-card, obligation-matrix, regulatory-update, statute-stack | **mixed, not all prose:** `citation-card`/`regulatory-update`/`statute-stack` read as prose + references; `obligation-matrix` → `<table>`; `authority-chain` → an ordered/nested structure. |
| **connect** — contact, wifi | an inline list of links / a contact block; wifi/QR → a small figure. |

Reused facts, not re-derived: `diagram` (Mermaid SVG), `math` (static KaTeX), `code` (highlighted spans),
and most `chart` output are **already static** in the render, so those rows re-host the existing node. The
work is the *structural* buckets (comparison, inventory, progression, evidence, the tabular legal
components) where slide layout ≠ prose layout — plus the two **runtime-inflated** exceptions in §A2b.

### A2c. Spatially-encoded components: project the DATA, never the picture alone

Adversarial review found the naive "chart → `<figure>`" and "matrix-2x2 → `<table>`" rows produce
*misleading* documents (not merely plain ones) for components whose meaning is **2-D position**, not a
list:
- `map` (choropleth) authored as `- California \`48.2\`` carries a **data table** that reads far better as
  prose than a legend-less figure; a choropleth image stripped of its scale is meaningless inline.
- `quadrant` and `matrix-2x2` encode meaning by **x-axis × y-axis**. Flattening to a linear table or a
  reading-order list **asserts a ranking/sequence the scatter never claimed** — a *wrong* reading.
- `radar` → a figure discards the per-axis values that are the point.

Rule: for `map`, `quadrant`, `matrix-2x2`, `radar` (and kin), the projection emits the **underlying data
with explicit axis labels** (a table or `<dl>`), optionally *alongside* the figure — never the figure
alone. The A2 contract test adds a per-bucket question: **"does this prose assert anything false?"** —
graded, not just "does it render."

**The honest limit — re-hosted graphics are not prose.** The chart/diagram/imagery rows that "re-host the
existing node" are, by construction, slide graphics dropped into an article. That is acceptable for a
genuinely visual figure (a Mermaid flowchart), but a stack of embedded slide-pictures with captions is the
"slides mashed into a page" failure Read·Article exists to avoid. Where a component is picture-but-means-
data, A2c applies; where it is genuinely visual, it stays a captioned figure and we accept it — but the P4
exit rubric (§A4) must judge the *document as a whole* reads as a document, not an outline of slides.

### A2b. Runtime-inflated components must be baked (not "already static")

Two component types are **not** static SVG in the sidecar today — they ship a `file://` `<script>` that
inflates them in the browser: `state-chart` (chart bucket, `STATE_CHART_BROWSER_JS`) and `math.canvas` /
function-plot (math bucket, the function-plot `<script>` at `lattice-emulator.js:1436`). This is a **third**
`file://` reference beyond the two portability gaps (images, KaTeX CSS). For a self-contained file these
must be **pre-rendered headlessly at export** (run the inflater in the export Chromium, serialize the
resulting SVG) so the shipped file carries static SVG and no engine script — the same "bake, don't ship the
library" rule as Mermaid (2026-06-16 §2a).

### A3. Where the projection lives — a SHARED kernel (HARD RULE #1)

The prose projection is a **projection of the semantic document**, not an export-only convenience: the
app-hosted player will want the identical Read·Article view. So it is a **shared kernel** consumed by
multiple siblings, exactly like the render kernels — not a fork inside `lib/export/`.

- **New:** `lib/transformers/prose-projection.js` (name provisional) — pure, fs-free: it takes the
  semantic slide DOM and emits article-HTML + a TOC tree. Consumed by the export HTML assembler **and**
  the future app player. A contract test pins the per-bucket mapping.
- The **left-TOC UI + scroll-spy** is player chrome (export-specific, frozen, versioned) — it *renders*
  the TOC data the kernel emits, the same way Present chrome renders slides.

**The article is baked at export, not generated at runtime.** The exporter runs the projection once and
writes the resulting article HTML + TOC into the file (behind the `data-view="read-article"` container).
This preserves the load-bearing invariant that **the player only navigates static DOM and never runs a
transform** (2026-06-16 §2a) — Read·Article is pre-rendered exactly like the slides.

**No new Node DOM-parser dependency** (guarding the Floor "zero new deps" resolution). The projection
operates on a **live DOM**, not a hand-parsed string: at export it runs inside the headless Chromium the
emulator already drives (real `document`, real slot structure), and in the app player it runs in the
browser DOM. So "DOM in" means an actual DOM node in both hosts — no parse5/jsdom/cheerio added.

This keeps the export artifact from importing a live Drawing Board module (2026-06-16 §4) while making
read mode a first-class, reusable projection rather than a bag of export-time string hacks.

### A4. Fidelity ships in two steps (phased, not blocking)

1. **Article-from-headings** (in the static-viewer phase): the Typora shell — left TOC from `h1`/`h2`,
   reading column, scroll-spy, dark via `color-scheme` — over an early projection that handles the prose
   and figure buckets well and lists structural buckets acceptably. This is already ~80 % of the
   prototype and banks the win.
2. **Component-aware transform** (its own phase): implement the full A2 mapping bucket by bucket, each
   with its own visual review. Sequenced separately so it never blocks Present or the static viewer —
   stack wins, each phase independently shippable.

**"Typora-grade" needs a definition of done, or P4 sprawls forever.** The exit criterion for P4:
- a **per-bucket golden** (input component → expected prose HTML) for all 13 buckets, each passing the
  A2c "asserts nothing false" check;
- a **whole-document review** of ≥3 real decks (a narrative deck, a chart-heavy deck, a legal deck) judged
  as *documents* — does it read as prose, or as an outline of slides? (§A2c);
- **accessibility to WCAG AA**: the article and its TOC ship correct heading semantics + `aria`, keyboard-
  navigable TOC with visible focus, and pass an **AXE** run in the verification bar (the mode is pitched as
  a real document and Read·Slides as "a11y-friendly linear order" — that claim must be tested, not asserted);
- **TOC granularity**: headings are not anchor-only — an ordinary content slide's title/eyebrow also enters
  the heading spine, so a 40-slide/3-divider deck doesn't collapse to a 3-entry TOC.

Until those pass, Read·Article is "shipped shell, not yet Typora-grade" — stated honestly in the UI/docs so
the early article doesn't set a "Lattice read mode is meh" first impression that outlives the fix.

---

## Decision B — the carried open questions, resolved

The 2026-06-16 doc held four. This doc closes them (defaults chosen for the emotional job — "one
exceptional file that IS my deck" — reversible where noted):

| Open Q (2026-06-16) | Resolution | Why |
|---|---|---|
| **Size tier of v1** (Floor vs Minimal ~120–300 KB) | **Floor — but the honest floor is ~1.8 MB empty, not 0.9 MB**, and it comes with a *ceiling*, not just a floor. | The 0.9 MB estimate was ~2× low (adversarial review, measured in `dist/`): the 37-face font set is 956 KB raw → **~1.27 MB base64**, plus the 440 KB min CSS bundle, player JS, pre-rendered slide DOM, and the base64 source envelope. Three corrections: **(a)** re-state the floor honestly (~1.8 MB empty); **(b) de-dupe theme CSS** — a bespoke theme is otherwise carried *twice* (once as the inlined render stylesheet, once inside the base64 `source` via `embedThemeInMarkdown`) — store CSS once, reference it; **(c)** pull **glyph-subsetting forward into v1** (was P6) since it is the single biggest lever and the honest floor makes it matter now. Add a **size ceiling + export-time warning** when a file crosses an email-hostile threshold (≈10 MB; Gmail 25 MB) — a photo/diagram-heavy deck balloons with no cap today. |
| **Colour mode** (bake chosen vs both + system) | **Both + toggle** — with a carve-out for the two headless-baked components. | Mostly *nearly free*: themes are `light-dark()`-based, so flipping `:root` `color-scheme` relights slides AND article via CSS. **But it is NOT free for `state-chart` and `math.canvas`/function-plot** (§A2b): those bake headlessly, and `state-chart` resolves tokens to **literal** colors via `getComputedStyle` at inflation — a dark-Chromium bake freezes them dark, so a recipient's light toggle relights everything *except* those figures (mode-mismatch on the exact slides §A2b names). Fix: **bake both modes of each inflated SVG** (double those bakes) *or* force the inflater to emit `var()`/`currentColor` and never resolve; add a test that toggles mode and asserts **no literal palette hex survives** in any baked SVG. §A2b and this row are now reconciled. |
| **Notes on export** (strip toggle vs default-in) | **Included by default, with an explicit "strip notes" toggle** that **scrubs notes from BOTH the presenter view AND the embedded source envelope.** | The point of the file is presenting from it, so notes ride by default. But a strip that only hides notes from the presenter view is **cosmetic**: notes are HTML comments living in the verbatim LFM source the envelope carries (2026-06-16 §3a; the parent's `--embed-source` help already warns the source "ships your speaker notes"), so they stay trivially extractable. Strip must re-serialize the envelope source with the note comments removed (via the `notes-core` boundary — the one place that knows what a note is). **Enumerate every baked copy:** notes live in ≥2 places — the envelope `source` comments AND the per-slide JS data payload (`presenter-window.js` ships `d.note` for the notes sheet + presenter). Strip scrubs *all* of them, with a test that greps the stripped file for note text and fails on any hit. Tradeoff, stated: a stripped file re-imports **without** notes — correct for a privacy strip. |
| **Un-inlinable asset** (hard-fail vs warn) | **Warn-and-degrade behind an honesty report — AND the file must never phone home.** Export succeeds; the report lists what could not be inlined (404'd remote image, unreachable-CDN font). Two additions from review: **(a)** on a failed inline, **strip the external reference** (`@import`/`<link>`/`src`) so the file cannot silently fetch from Google Fonts / a remote host on open — the honesty report goes to the *author* at export, but the *recipient's* privacy is what a leftover live reference violates; **(b)** render a **visible in-file placeholder** for the recipient where an asset dropped (a "missing image" figure, a `<title>` note), not just an author-side report. | A failed export helps no one; but a "warn" that leaves a live CDN reference turns a self-contained file into one that phones home — the exact failure the design exists to prevent. (Note: this sandbox MITMs CDN webfonts — fonts fall back to serif here — so the honesty report is also our own dev-loop signal.) |

Also folded in from the parent's §Phasing and §Open questions: **`.lattice` as a desktop document type**
(register the extension with the SlideWright Tauri app) stays an open question owned with the desktop
wrapper, tracked below — not resolved here.

---

## Decision C — the app-hosted player is a separate, later track

The brief has two delivery channels: the shareable `.html` (above) and an **app-hosted player** at
`lattice.style/deck/{id}` — "share a link by email, click it, land in a richer player." These are not the
same build, and conflating them would stall the tractable half.

**Today there is no infrastructure for the hosted player.** The docs-site survey was unambiguous: no
server-side deck sharing, no deck-by-URL/ID loading, no permalink, no persistence beyond browser-local
`localStorage`/IndexedDB. "Sharing" is 100 % local file export. So the hosted player is **net-new**:

- a **backend** (deck storage, an ID/slug service, the `/deck/{id}` route)
- **persistence** (where decks live; retention; the manifest envelope is the natural at-rest format)
- **auth & privacy** (who can view; unlisted vs public links; expiry; the OpenRouter-key threat model of
  HARD RULE #22/#24 applies if any AI feature rides along)
- **hosting/serving** on the `lattice.style` domain

**Relationship to the export player (the synergy):** the hosted player **reuses the same runtime** —
the shared headless transport kernel, the prose projection (Decision A3), the palette/site-chrome
contract — and *adds* what only a server can: no size ceiling (stream assets instead of inlining),
live/updatable decks, analytics, comments (the `.lattice` comment layer already exists), and the
Studio's richer surfaces (lens reshaping, read-aloud, rehearsal — all already in `PresentOverlay`). The
export `.html` is the frozen, offline, self-contained floor; the hosted player is the online, richer,
always-current ceiling. Same lens, two focal lengths.

**Decision: sequence the self-contained `.html` first.** It has a paved road (the emulator already
writes a self-contained HTML sidecar; three `file://` gaps remain — images, KaTeX CSS, and the §A2b
inflater scripts — see Phasing) and delivers the whole "double-click, it's my deck" job with zero server
cost. The hosted player is scoped here but
planned as its own decision doc + track once the export player and shared kernels exist to build on.

---

## Architecture summary (what's shared vs export-specific)

Inheriting 2026-06-16 §4's boundary, extended with the prose projection:

| Shared kernel (`lib/**`, single-sourced, consumed by many) | Export-specific (`lib/export/**`, frozen, versioned) |
|---|---|
| `lib/core/lattice-doc.js` — the manifest envelope (build + parse) *(from parent, still unbuilt)* | the HTML assembler: inline fonts/images/SVG, write envelope + player |
| **`lib/transformers/prose-projection.js` — the component-aware Read·Article projection (NEW)** | the transport player runtime: Present stage, overlay controls, notes sheet |
| headless transport kernel — `index`, `next/prev/go`, bounds, keymap table (extract; refactor `presenter-window.js`/Present onto it) | the left-TOC chrome + scroll-spy, the `data-view` mode switch |
| `notes-core.js` — the note boundary (language fact) | the dual-screen `window.open` + `postMessage` pairing; `dvh` viewport-fill, orientation re-fit |

**Build-time guard (from parent):** an ownership check fails if anything under `lib/export/player/`
imports `docs/src/playground/*`. The prose projection, being a shared `lib/` kernel, is fair game for
both the export assembler and the docs-site app player.

---

## Security model (the file:// blind spot) — a v1 GATE, not a footnote

The self-contained `.html` runs its player JS at a `file://` (or hosted) origin with full script
capability, and — once emailed — **can never be recalled or patched**. That combination (executable +
frozen + brand-normalized as "the one file that IS my deck," so recipients open it on reflex) makes
security a **hard v1 gate**, not a threat-model paragraph. The adversarial review (2026-07-07) found this
section, as first drafted, actively wrong — it waved away injection with "we control the assembler." It
does not. The corrected model has four non-negotiable requirements, each of which must land **before a
single `.html` leaves a machine**:

1. **Sanitize the baked HTML — slides AND the projected article — through `sanitizeSlideHtml` at export.**
   The engine renders markdown with `html:true` and **no** sanitizer; `sanitizeSlideHtml`
   (`docs/src/lib/sanitize-slide-html.js`, DOMPurify) runs today only at docs-site preview boundaries, and
   the #22 gate is scoped to `docs/src` — so `lib/export` bakes author `<script>` / `<img onerror=…>`
   **verbatim**, and it runs on the *recipient* (who is NOT the author). "We control the assembler" is
   false the moment the assembler concatenates author content. Fix: route baked slide HTML **and** the
   prose-projection output through `sanitizeSlideHtml` (it already strips `script`/`on*`/`iframe` while
   preserving chart SVG + MathML), and **extend the #22 ownership gate to cover the export assembler** so
   the machine enforces it, not memory.
2. **Escape the ENTIRE manifest envelope, not just `source`.** The parent's §3b base64s only the `source`
   field; `deck`, `config`, `theme.name`, and `assets` keys inline as **plaintext JSON** inside
   `<script type="application/lattice+json">`. `JSON.stringify` does not escape `<` or `/`, so a deck
   titled `</script><script>…</script>` breaks out of the envelope and executes — stored XSS (and on the
   hosted player, XSS against every viewer, straight into the #22/#24 key-theft model). The shipped
   `.lattice` exporter already clamps hostile titles; the `.html` design regressed it. Fix: **base64 the
   whole envelope** (decode → `JSON.parse` on import), or entity-encode `<`/`>`/`&`/` ` before
   inlining. This is the escape-safety golden test — not "source verbatim" alone. *(Amends parent §3b/§3c,
   which contradict each other on this point.)*
3. **Bake a `sha256`-pinned CSP `<meta>` into every export** — the one mitigation that survives the freeze.
   Put all player JS in a single inline block; ship
   `<meta http-equiv="Content-Security-Policy" content="script-src 'sha256-<hash>'; object-src 'none'; base-uri 'none'">`.
   Then even if requirements 1–2 are ever defeated, an *injected* script is refused by CSP while the
   legitimate hashed player still runs. Without this, findings above are un-patchable in every file already
   in the wild.
4. **The exported file carries NO secrets** (unchanged, correct): no `OPEN_ROUTER_KEY`, no token (HARD RULE
   #24). It embeds the deck source (+ notes unless stripped) and nothing else. A recipient opening a
   stranger's file still faces the general "downloaded HTML runs JS" trust model — requirements 1–3 shrink
   that surface to provenance + a hashed, sanitized, CSP-bound transport; they do not pretend it is zero.

**Hostile-input hardening on import** (mirrors the shipped `.lattice` guard): the `.html` envelope decode
must enforce a size cap (the zip importer uses `MAX_UNCOMPRESSED_BYTES = 64 MB`) so a base64-bomb `source`
can't OOM the importer, and re-import runs the same zip-slip / traversal guards (#617).

### The frozen player is a liability, not only a virtue

The parent frames "frozen, versioned" purely as upside (a file can't break when the app refactors). The
inverse it never states: **a file in the wild can't be *fixed* either.** A nav bug, a scroll-lock trap, or
a security defect in the player JS lives **forever** in every file already sent. The design must own this:

- **CSP (above) is the standing defense** against an injected-code defect surviving the freeze.
- **Re-bake is the remediation path:** because every file carries its verbatim source envelope, re-importing
  it into Lattice and re-exporting produces a *fresh* player. The app can detect an old `player-version`
  stamp on import and offer a one-click re-export. (An online "a newer player exists" nudge is reserved to
  the hosted track — the offline file must never phone home.)
- **`player-version` is stamped in every file** so both re-import migration and any future audit can reason
  about which frozen transport a file carries.

## Phasing (extends 2026-06-16 §Phasing; P1 partly shipped)

- **P1 — `.lattice` project zip + native re-import.** *(shipped 2026-07-04: `deck.md` + `manifest.json`
  + re-import.)* Note the manifest-envelope **kernel** the parent names (`lib/core/lattice-doc.js`) and
  the `.html` envelope path are **not yet built** — P2 lands them.
> **Honest phase weights (review correction).** P2 is the *heaviest* phase, not the lightest — it silently
> carries the **unbuilt envelope kernel** (`lib/core/lattice-doc.js`), the HTML assembler, all asset
> inlining, both colour modes, the §A2b headless baking, AND the security gate. And P2 delivers a *reader*,
> not a presenter — the emotional job ("present from it") is not met until **P3**. Weights and the
> reader-before-presenter reality are called out so the plan isn't read as "P2 is the easy one."

- **P2 — self-contained `.html` static viewer** *(the heavy phase)*. Build the envelope kernel
  (`lib/core/lattice-doc.js`); pre-render semantic slides + inline fonts/images/SVG/CSS + embed the source
  envelope; close the portability gaps (images → data-URIs; KaTeX CSS inline; **and the §A2b `file://`
  `<script>` for `state-chart`/function-plot — bake those headlessly here**, else "zero external calls"
  breaks the moment a deck uses them). **Both colour modes baked** (with the §A2b both-mode SVG bake).
  **Security gate lands here** (§Security): sanitize baked slide + article HTML via `sanitizeSlideHtml`,
  escape/base64 the whole envelope, bake the `sha256`-pinned CSP `<meta>`, envelope decode cap, extend the
  #22 gate to the assembler. **Glyph-subsetting also lands here** (moved up from P6 — the honest ~1.8 MB
  floor makes it v1, not deferred). CSS-only JS-off fit. Ships Read·Slides + the Read·Article *shell*
  (article-from-headings). No Present transport yet.
- **P3 — the Present player.** Extract the headless transport kernel and **refactor the two already-shipped
  Present transports onto it** (`presenter-window.js` + the in-app `PresentOverlay`/`drawing-board-present`)
  in the same change — see the anti-fork note below; contract test. Overlay controls, keyboard/swipe, the
  universal notes sheet (default-in + strip-all-copies), three capability tiers, `dvh` viewport-fill +
  orientation re-fit; the three-view toggle.
- **P4 — component-aware prose projection.** Implement the A2 mapping bucket by bucket to the **§A4 exit
  criterion** (per-bucket goldens + whole-document review + WCAG AA/AXE + A2c "asserts nothing false").
- **P5 — dual-screen presenter.** `window.open` + `postMessage`; Window Management API auto-place as
  enhancement (from parent §2d). Feature-detect and **degrade silently to single-window** — `file://`
  `window.open`/COOP rules are brittle and unpatchable once shipped; don't market dual-screen as reliable
  for the offline artifact.
- **P6 — further size minimisation.** Used-selector CSS prune (glyph-subsetting moved to P2) → toward the
  Minimal tier.
- **Separate track — the app-hosted `lattice.style/deck/{id}` player** (Decision C): its own decision doc,
  built on the shared kernels once P2–P4 exist.

**Anti-fork (review sharpening).** The build-time guard fails if `lib/export/player/` *imports*
`docs/src/playground/*` — but you satisfy it perfectly by **re-implementing** transport in `lib/export`,
which IS the fork. The guard blocks wrong-direction coupling, not duplication. The real anti-fork is
**discipline + the contract test**, and it must **reconcile the transports that already exist** (there are
already two Present implementations) onto the extracted kernel in P3 — healing a pre-existing fork, not
just avoiding a new one. This is the first thing to slip under deadline; it is a P3 acceptance criterion,
not a nicety.

Each phase is independently shippable and banks a standalone win; per HARD RULE #17 each is its own
branch → its own PR (this doc is the design PR that precedes them).

## Verification bar (per QUALITY BAR + 2026-06-16 §Verification)

Every player tier gets `tools/screenshot.js` evidence at **390 / 820 / 1440**, both orientations on
mobile, **icon-only** controls on mobile, no CLS. **Read·Article** is reviewed as a *document* (reading
comfort, TOC behaviour, scroll-spy, the per-bucket prose forms) at all three widths — the mobile TOC
must collapse to a drawer/top strip (the prototype confirmed the desktop layout overflows at 390px).
Export changes are **owner-inspection-gated**: a representative demo deck rendered **dark and light**,
both `.html` files sent for sign-off before merge. The per-feature demo deck (`examples/html-player.md`,
HARD RULE #9) is authored during P2 with full HARD RULE #6 compliance.

**Added gates from the adversarial review (each is a test, not a claim):**
- **Escape-safety golden** — a deck with `</script>`, `-->`, ` `, and hostile `deck`/`config`/`theme`
  values round-trips byte-exact AND injects no executable node (covers the envelope-XSS blocker).
- **Sanitizer coverage** — baked slide HTML and the projected article contain no `script`/`on*`/`iframe`
  after export; the #22 ownership gate is extended to the export assembler so this is machine-enforced.
- **CSP present + valid** — every exported file carries the `sha256`-pinned CSP `<meta>`; a test injects a
  script and asserts the CSP would block it while the hashed player runs.
- **JS-off floor** — screenshot with JavaScript actually disabled (HARD RULE #23) at 390/1440, incl. a
  `size:4K` deck, showing a clean stacked column (not overflow).
- **Colour-mode integrity** — toggle to light and assert **no literal palette hex** survives in any baked
  SVG (catches the §A2b one-mode-freeze).
- **Cross-version migration fixture** — build a v_N file, open it with a v_{N+1} importer: migrate known-
  older, refuse newer-than-known with a clear message (tests §3c's forward-compat hinge, not just same-
  version bytes).
- **Notes-strip leak test** — grep a stripped file for note text across *all* baked copies; fail on any hit.
- **Accessibility** — AXE pass + WCAG AA on Read·Article and Read·Slides (heading semantics, TOC focus,
  reduced-motion).
- **Print** — a `@media print` stylesheet for Read·Article + Read·Slides is designed and screenshot-checked
  (people Ctrl-P a document; Present is unprintable and must fall back to a readable form).
- **Size ceiling** — export warns when a file exceeds the email-hostile threshold; the honest floor
  (~1.8 MB) and per-asset budget are recorded.

## Prototype evidence (2026-07-07)

`.scratch/player-proto/` built a self-contained `.html` from the real `examples/speaker-notes.md` and
validated the direction: Present (fit-scaled real deck), Read·Slides (real slides as scrollable cards,
full fidelity), and Read·Article (Typora prose + sticky left TOC + scroll-spy, dark mode via
`color-scheme`). It also surfaced the two decisions this doc turns on — the naive-flatten artifacts that
mandate the **component-aware** projection (Decision A1), and the near-free colour toggle (Decision B).
Throwaway; not shipping code.

## Adversarial review (2026-07-07) — the full HARD RULE #25 trio

This design is genuinely novel, high-leverage, and governs a **frozen, in-the-wild executable artifact**,
so it got the full adversarial trio, not just maker-checker:
- **Independent checker** (pre-merge) — caught four miswired A2 buckets, the notes-strip privacy hole, and
  the "already static" overstatement (§A2b). Folded before the first merge.
- **Red team** (post-merge) — found the **blocker-severity security holes** this revision closes: the
  envelope-`</script>` XSS (§Security 2), unsanitized author HTML baked for the recipient (§Security 1),
  the ~2×-low size floor (Decision B), the one-mode-freeze colour bug (§A2b/Decision B), the JS-off floor
  breaking on `size:4K` decks, and the misleading prose for spatially-encoded components (§A2c). The
  freeze-surviving CSP mitigation (§Security 3) is its most valuable contribution.
- **Munger inversion** (post-merge) — surfaced the **frozen-player liability** (§Security), the missing size
  *ceiling* + print + a11y bars (Decision B, §A4, Verification), the P2 weight-hiding (§Phasing), and the
  asymmetric anti-fork guard (§Phasing).

All material findings are folded into the sections above. The two security blockers are now **v1 gates**
(§Security), not backlog. This record exists because applying the trio *and showing what it changed* is the
HARD RULE #25 obligation for work of this blast radius.

## Non-goals (inherited + added)

- Round-tripping a *foreign* deck (PDF/PPTX) losslessly — stays the separate lossy AI-mapped door.
- Live interactivity inside an exported deck beyond presentation transport + reading.
- Editing inside the exported `.html` (it carries the source for *re-import into Lattice*, not an in-file editor).
- The app-hosted player's server/auth/persistence — scoped here (Decision C), designed in its own doc.

## Open questions (carried)

- **`.lattice` as a desktop document type** — register with the SlideWright Tauri app (from parent).
- **Hosted-player track**: storage backend, ID scheme, auth/privacy model, retention — deferred to its
  own decision doc (Decision C).
- **Read·Slides card sizing** — fixed 16:9 aspect vs natural component height in the reflow column (the
  prototype used `aspect-ratio:16/9`; some components may read better at natural height). Resolve during P2.
