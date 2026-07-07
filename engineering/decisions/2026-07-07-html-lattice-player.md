---
status: proposed
summary: >
  The HTML Lattice player — the shippable half of the 2026-06-16 export format. A single
  self-contained .html carries THREE views of one deck: Present (the flagship fit-scaled
  presentation transport), Read·Slides (the real slide DOM stacked into a scrollable column —
  full-fidelity fallback, nearly free), and Read·Article (a Typora-style prose document with a
  sticky left table of contents, backed by a component-aware prose projection). Resolves the
  open questions held in 2026-06-16 — size = Floor (~0.9 MB, zero new deps), colour = both
  modes + prefers-color-scheme toggle, notes included by default with a strip toggle,
  un-inlinable assets warn-and-degrade behind an honesty report — and scopes the app-hosted
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

**Progressive enhancement is preserved.** With JS disabled the file degrades to the pre-rendered slides
stacked and scrollable (effectively Read·Slides as the floor); the player *enhances* into Present and
mounts the article. The player remains a ~15–30 KB transport that only navigates static DOM — never the
rendering engine (2026-06-16 §2a).

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
   with its own visual review, until Read·Article is Typora-grade. Sequenced separately so it never
   blocks Present or the static viewer — stack wins, each phase independently shippable.

---

## Decision B — the carried open questions, resolved

The 2026-06-16 doc held four. This doc closes them (defaults chosen for the emotional job — "one
exceptional file that IS my deck" — reversible where noted):

| Open Q (2026-06-16) | Resolution | Why |
|---|---|---|
| **Size tier of v1** (Floor ~0.9 MB vs Minimal ~120–300 KB) | **Floor.** Inline full font set + full CSS bundle, zero new deps. Glyph-subsetting + used-selector CSS prune become a later size phase (2026-06-16 §Phase 5). | Ship the experience first; ~0.9 MB is fine for email/share today. Minimization is a pure optimization with no UX change — defer, don't gate. |
| **Colour mode** (bake chosen vs both + system) | **Both + toggle.** Bake dark and light; the player honours `prefers-color-scheme` and offers a toggle. | The prototype proved it is *nearly free*: the themes are `light-dark()`-based, so flipping `:root` `color-scheme` re-themes the whole document — slides AND article — with a sliver of JS the player already ships. A real delight for recipients. |
| **Notes on export** (strip toggle vs default-in) | **Included by default, with an explicit "strip notes" toggle** that **scrubs notes from BOTH the presenter view AND the embedded source envelope.** | The point of the file is presenting from it, so notes ride by default. But a strip that only hides notes from the presenter view is **cosmetic**: notes are HTML comments living in the verbatim LFM source the envelope carries (2026-06-16 §3a; the parent's `--embed-source` help already warns the source "ships your speaker notes"), so they stay trivially extractable. Strip must re-serialize the envelope source with the note comments removed (via the `notes-core` boundary — the one place that knows what a note is). Tradeoff, stated: a stripped file re-imports **without** notes — correct for a privacy strip. |
| **Un-inlinable asset** (hard-fail vs warn) | **Warn-and-degrade behind an honesty report.** Export succeeds; the report lists every asset that could not be inlined (404'd remote image, unreachable-CDN font) and how it degraded. | A failed export helps no one; an honest, visible report lets the author decide. (Note: this sandbox MITMs CDN webfonts — fonts fall back to serif here — so the honesty report is also our own dev-loop signal.) |

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
writes a self-contained HTML sidecar; only two portability gaps remain — see Phasing) and delivers the
whole "double-click, it's my deck" job with zero server cost. The hosted player is scoped here but
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

## Security model (the file:// blind spot)

The self-contained `.html` runs its player JS at a `file://` (or hosted) origin with full script
capability. HARD RULE #22's `sanitizeSlideHtml` gate does **not** cover this artifact — that gate scans
`docs/src` preview-frame builders only; the export player is engine code under `lib/export/`. So the
threat model is stated here, not enforced by that gate:

1. **The exported file must carry NO secrets.** No `OPEN_ROUTER_KEY`, no auth token, nothing server-side
   (aligns with HARD RULE #24). The file is author-trusted content the author chose to serialize and send
   — it embeds their deck source (and, unless stripped, their notes), and nothing else.
2. **A recipient opening a *stranger's* `.html` faces the same trust model as any downloaded HTML file** —
   it can run arbitrary JS. We do not (and cannot, offline) sandbox it. The mitigation is provenance: the
   file announces itself as a Lattice export (the manifest envelope), the player is a small auditable
   transport, and we publish what it does. This is the accepted, explicit boundary — not an oversight.
3. **Author-supplied slide content is baked at export by us** (we control the assembler), so the XSS-into-
   our-frame path #22 guards against does not apply the same way; but if the app-hosted player (Decision C)
   ever renders *another user's* deck, that path re-opens and MUST route through `sanitizeSlideHtml` there.

## Phasing (extends 2026-06-16 §Phasing; P1 partly shipped)

- **P1 — `.lattice` project zip + native re-import.** *(shipped 2026-07-04: `deck.md` + `manifest.json`
  + re-import.)* Note the manifest-envelope **kernel** the parent names (`lib/core/lattice-doc.js`) and
  the `.html` envelope path are **not yet built** — P2 lands them.
- **P2 — self-contained `.html` static viewer.** Pre-rendered semantic slides + inlined
  fonts/images/SVG/CSS + embedded source envelope; **both colour modes baked**. Close the two known
  portability gaps: images → data-URIs (today `file://`), KaTeX CSS → inlined (today a `file://` `<link>`).
  Ships Read·Slides for free (stacked scroll) and the Read·Article *shell* (Typora TOC over the
  article-from-headings projection). No Present transport yet.
- **P3 — the Present player.** Extract the headless transport kernel (+ refactor Present/`presenter-window.js`
  onto it, contract test); overlay controls, keyboard/swipe, the universal notes sheet (default-in +
  strip toggle), three capability tiers, `dvh` viewport-fill + orientation re-fit; the three-view toggle.
- **P4 — component-aware prose projection.** Implement the Decision A2 mapping bucket by bucket, each with
  its own visual review, until Read·Article is Typora-grade.
- **P5 — dual-screen presenter.** `window.open` + `postMessage`; Window Management API auto-place as
  enhancement (from parent §2d).
- **P6 — size minimisation.** Glyph-subsetting + used-selector CSS prune → the Minimal tier (from parent
  §Phase 5), if/when the Floor default is revisited.
- **Separate track — the app-hosted `lattice.style/deck/{id}` player** (Decision C): its own decision doc,
  built on the shared kernels once P2–P4 exist.

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

## Prototype evidence (2026-07-07)

`.scratch/player-proto/` built a self-contained `.html` from the real `examples/speaker-notes.md` and
validated the direction: Present (fit-scaled real deck), Read·Slides (real slides as scrollable cards,
full fidelity), and Read·Article (Typora prose + sticky left TOC + scroll-spy, dark mode via
`color-scheme`). It also surfaced the two decisions this doc turns on — the naive-flatten artifacts that
mandate the **component-aware** projection (Decision A1), and the near-free colour toggle (Decision B).
Throwaway; not shipping code.

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
