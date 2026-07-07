---
status: proposed
summary: The Lattice export format — a portable self-contained .html player plus a lossless .lattice project zip sharing one manifest envelope
version: 1
supersedes: none
last-status-update: 2026-06-16
---

# The Lattice export format — a portable, self-contained deck that re-imports losslessly

**Date:** 2026-06-16 · **Status:** design-decision; **project-format MVP shipped
2026-07-04** · **Owner:** Sharmarke

> **Partially shipped (project format MVP).** The `.lattice` **project zip** now
> exists — `docs/src/components/studio/lattice-file.ts`: `deck.md` (verbatim source,
> lossless round-trip) + `manifest.json` (metadata + the deck's review **comments**),
> exported via Share → "Lattice project (.lattice)" and re-imported (source +
> comments restored). This delivers the "comments travel with the deck" job
> (`2026-07-04-comments-layer.md`). Still design-only: the self-contained **`.html`
> player** (Decision 2), the full **theme/asset envelope** (fonts/images/CSS
> inlining), and LFM `grammar.json` packaging. When this note and a shipped surface
> disagree, the shipped surface wins.
>
> **Extended 2026-07-07** by
> [`2026-07-07-html-lattice-player.md`](2026-07-07-html-lattice-player.md): adds the read-mode
> dual view (Present · Read·Slides · Typora-style Read·Article), **resolves the carried open
> questions** (size = Floor, colour = both + toggle, notes default-in + strip toggle,
> un-inlinable = warn-and-degrade), and scopes the app-hosted `lattice.style/deck/{id}` player as
> its own later track. Read that doc for the player + read-mode design; this one remains canonical
> for the container/envelope/reuse-boundary.

Related: [`2026-06-13-export-to-marp.md`](2026-06-13-export-to-marp.md) (the
Marp bundle — the dev-render sibling this reframes), [`2026-06-13-lfm-standard.md`](2026-06-13-lfm-standard.md)
(LFM — the dialect the envelope carries), [`2026-06-14-presentation-import.md`](2026-06-14-presentation-import.md)
(the *foreign*-format import door — explicitly a different door from this one),
[`2026-06-12-workbench-export-bridge.md`](2026-06-12-workbench-export-bridge.md)
+ [`2026-06-12-workbench-component-bridge.md`](2026-06-12-workbench-component-bridge.md)
(the theme/component embed reused by the envelope), `drawing-board-practice.js`
(the player's behavioural ancestor — extracted, not imported), and now
`drawing-board-present.js` (shipped: the **in-app Present mode**, a live
presentation player carrying this design's §2c/§2d shape — clean navigation,
three capability tiers, the universal speaker-notes slide-up sheet, and the
dual-screen presenter — against the live engine. It is the export player's
nearest sibling; when the export artifact lands, the pure transport/notes facts
get extracted into the shared kernel of §4, with Present and the export player
as two consumers of it).

---

## The question

We want **"Lattice"** as an export format — the top entry on the Drawing Board's
export dropdown. The brief raised the real tension: *what does it mean to package
Lattice?* It has to be a **shareable file** that works for someone who doesn't
know Node and won't `npm install` anything; it has to be usable by an **LLM**;
and (separate but co-designed) we have to be able to **re-import our own export
losslessly** rather than reverse-engineer it.

## The reframe: "Lattice format" is three jobs, not one

The word hides three consumers who want incompatible things. Naming them is the
whole design:

| Consumer | Wants | Artifact |
|---|---|---|
| **Recipient** ("just let me see/present it") | double-click, no install, looks perfect, presents | single self-contained **`.html`** player |
| **Author** ("keep working on it later, maybe elsewhere") | a file that re-opens *into Lattice* with theme + assets + settings intact | **`.lattice`** project (zip) |
| **Developer / CI** ("render it in my pipeline") | `npx … --config` reproducible render | the existing Marp bundle (now inside `.lattice`) |
| **LLM / agent** ("read or write Lattice decks") | plain-text LFM + a self-describing grammar | the **source envelope** + `grammar.json` |

The current export menu (Markdown · PDF · PowerPoint · Print · Export chart ·
Marp bundle) serves rows piecemeal and nothing serves the emotional default —
*"give me the one file that **is** my deck."* That file is what earns the top
slot.

## What already exists (reuse the facts, not the fixtures)

Most of the raw material is built; the gap is naming and assembling it:

- **Marp bundle** (`lib/core/marp-bundle.js`) already packages baked `---`
  splits + `lattice.css` + palette + minified engine/runtime/mermaid + config +
  README. It is "the dev-render row" — it gets **reframed/renamed** under
  `.lattice`, not rebuilt.
- **LFM** (`spec/LFM-1.0.md`) is the named, versioned dialect + a generated
  `grammar.json` + a frozen diagnostic protocol — the LLM-facing asset already
  exists.
- **Speaker notes are a first-class LFM construct** — `lib/authoring/notes-core.js`
  (`notesFromHtml`): a non-directive HTML comment on a slide *is* its note,
  single-sourced (HARD RULE #1).
- **The whole presenter transport** lives in `docs/src/playground/drawing-board-practice.js`:
  single-slide FIT-scale stage, cross-browser fullscreen, keyboard nav, a
  pointer-capture overlay (swipe + tap + edge arrows), the iOS landscape-compact
  fallback. The player is *this, minus the rehearsal brain* — **extracted, never
  imported** (see §4).
- **The theme/component bridge** (`exportMarkdown` → `embedThemeInMarkdown` +
  `embedComponentsInMarkdown`) already inlines a custom Workbench theme + library
  components into the source, so round-trip already survives bespoke themes.
- **The engine is publish-ready but unpublished** (`@slidewright/lattice` 1.0.0,
  MIT, `bin`/`exports`/`main` wired) — "no npm package" is an unflipped switch.

## Decision 1 — two artifacts, layered

- **`.html` = the *share* format** (single self-contained file). The flagship,
  top of the dropdown.
- **`.lattice` = the *project* format** (zip; re-open in Lattice). Below it.

They are two encodings of **one logical document** (§3), so import is one path,
not two.

## Decision 2 — the self-contained `.html` is a portable presentation *player*

### 2a. Pre-render the slides; don't ship the engine

Two ways to build the file; "bare minimum + zero external calls" picks the
winner:

- **Rejected:** inline `lattice-runtime` + mermaid + KaTeX and render on open.
  Big, JS-dependent, ships executable engine code.
- **Chosen:** **pre-render** the slides (serialize the already-rendered
  `<section>` DOM the PDF path rasterizes), inline only what the pixels need, and
  **bake diagrams to inline SVG / math to pre-rendered KaTeX**. The whole engine
  + mermaid + KaTeX libs drop out — a diagram becomes the ~10 KB SVG it renders
  to, not the 3 MB library that draws it.

**Progressive enhancement** keeps the best of both: the pre-rendered slides are
viewable with **JS disabled** (stacked, scrollable — survives a locked-down
preview); an inlined **player** *enhances* with navigation/fullscreen/presenter.
The player is **not** the Lattice rendering engine — it's a purpose-built
~15–30 KB transport that only *navigates* static DOM.

### 2b. Zero-external-calls hit list (what "self-contained" requires)

In priority order — every one is a thing that would otherwise phone home or break
offline:

1. **Fonts** — strip the theme CSS's Google-Fonts `@import`; replace with
   `@font-face` data-URIs (`font-embed.js` already does face-subset). Glyph-
   subsetting is the big size win and a *new dependency* (open Q).
2. **Images** → data-URIs (local *and* remote, fetched at export; optionally
   downscaled to the slide box).
3. **Diagrams/charts** → inline SVG (drop the mermaid lib).
4. **Math** → pre-rendered KaTeX HTML + its small font subset.
5. **CSS** → minified, ideally tree-shaken to used selectors (the biggest CSS
   lever — a deck touches ~10–15 % of the rules). Keep the rendered HTML
   **semantic** (`<section class="…">` intact) — never flatten to inline-styled
   divs.

An **honesty report** at export lists anything un-inlinable (a 404'd remote
image, a font behind an unreachable CDN — note: this sandbox MITMs CDN webfonts,
fonts fall back to serif here). Open Q: hard-fail vs warn-and-degrade.

### 2c. The player — three capability tiers (capability, not device)

Feature-detect and pick a tier; never UA-sniff.

| Tier | Detect | Notes | "Fullscreen" | Nav |
|---|---|---|---|---|
| **Desktop, dual-screen** | `getScreenDetails` (Window Mgmt API) | **second window** auto-placed on laptop, slides on the big screen | real Fullscreen API on the external display | keys + controls, both windows synced |
| **Desktop, single-screen** | `requestFullscreen` exists, no 2nd screen | the universal **slide-up sheet** | real Fullscreen API | keys + swipe + overlay controls |
| **Mobile / tablet (degraded)** | no element-fullscreen / coarse pointer | **slide-up sheet** via toggle button | **CSS viewport-fill** (not the API) | swipe + overlay controls |

- **Mobile "fullscreen" is CSS, not the Fullscreen API.** iOS Safari has no
  element-fullscreen (practice.js documents the no-op). The degraded stage is
  `position:fixed` filling `100dvh`/`100svh` (**dynamic viewport units** so the
  collapsing URL bar doesn't jump — the #1 mobile-player jank source), scroll
  locked.
- **Orientation = re-fit, not re-layout.** The 16:9 box FIT-scales to the
  viewport (the scale practice already uses); portrait letterboxes, landscape
  fits-height. Re-measure on `resize` / `orientationchange` / `visualViewport`.
- **Notes-as-slide-up-sheet is universal** — present on every tier (drag handle,
  swipe-down dismiss, scrollable). The **dual-screen presenter view is a pure
  desktop enhancement layered on top**, not a separate notes system. One notes UI
  everywhere.

### 2d. Dual-screen presenter — the reveal.js speaker-view pattern, file-safe

`window.open()` spawns a presenter window (same file, `#presenter` hash);
the two sync over **`postMessage` on the held window handle** — *not*
`localStorage`/`BroadcastChannel`, which are partitioned/disabled under
`file://`. Messages are tiny (index + timer) since both windows already carry all
slides + notes. The user drags the slide window to the big screen and fullscreens
it. The **Window Management API** (`getScreenDetails`, Chromium) auto-places the
slide window on the external screen for true Keynote-style mode — enhancement
only, manual-drag is the floor. Open from a user gesture (popup-blocker-safe).

### 2e. Held decisions (open Qs, owner deferred)

- **Size tier** of v1 (Floor ≈ 0.8–1.5 MB/deck, zero new deps · vs Minimal
  ≈ 120–300 KB with a font subsetter + CSS prune). — *held.*
- **Colour mode:** bake the chosen mode only (smaller, zero-JS-pure) vs ship both
  + honour `prefers-color-scheme` (a sliver of JS). — *held.*
- **Strip-notes-on-export toggle** vs notes-included-by-default (the whole point
  is presenting from it; but notes ride as plain text in a shared file).

## Decision 3 — the round-trip envelope (import *our own* export, losslessly)

This is a **different door** from `2026-06-14-presentation-import.md` (PDF/PPTX →
lossy IR → AI-mapped draft). Re-importing our own export is **deterministic,
zero-model, zero-loss**, because we control the format.

### 3a. The one rule: carry the source, never scrape the render

Import **must not** reconstruct markdown from rendered `<section>` DOM (that *is*
the lossy PDF problem). The exporter carries the **exact LFM source verbatim** in
a known versioned slot; import reads *that*. Rendered slides + SVG + fonts are a
*projection* for viewing; the embedded source is the *truth* for editing.
Round-trip is lossless **by construction** — the truth was carried, not
transformed.

### 3b. One manifest schema, two container encodings

A single JSON — the **Lattice document manifest** — fully describes a restorable
project; both containers encode the same shape:

```jsonc
{
  "format": "1.0",          // envelope version → migration / forward-compat
  "lfm": "1.0",             // dialect version
  "engine": "lattice-engine", "build": "…",  // provenance (already stamped today)
  "deck": "Q3 board review",
  "source": "<base64 LFM>", // the source of truth — verbatim, base64'd
  "theme":  { "name": "indaco", "palette": "indaco", "mode": "dark", "css": null },
  "components": [ /* library components: {name, css} */ ],
  "assets":  { "img1": "data:image/…" },     // or file pointers in the zip
  "config":  { /* frontmatter / deck settings */ },
  "notes":   true
}
```

- **HTML:** inlined in **one** non-executable node —
  `<script type="application/lattice+json" id="lattice-doc">…</script>`. Import
  finds it by id, decodes, hydrates. Rendered slides + player are ignored on
  import.
- **`.lattice` zip:** the manifest is **`manifest.json` at the root**; large
  blobs (`assets/`, `themes/*.css`) may live as *files* the manifest points to,
  to keep the zip lean.

Import collapses to **detect container → extract manifest → `hydrate()`** — one
parser, two wrappers. The manifest is also the **LLM contract** (one documented
JSON + a `grammar.json` pointer).

### 3c. Three things to design for now

1. **Escape-safety / byte-exact round-trip.** Base64 the embedded `source` (and
   the inlined JSON) so a literal `</script>` in a code fence or `-->` in a
   comment can't terminate the envelope. Golden test:
   `parseManifest(buildManifest(deck))` reproduces the deck byte-for-byte.
   **Correction (2026-07-07, `2026-07-07-html-lattice-player.md` §Security):** the
   §3b schema above base64s **only** `source`, but `deck`/`config`/`theme.name`/
   `assets` keys inline as plaintext JSON — a hostile deck *title* with `</script>`
   is then stored XSS. Base64 (or entity-encode) the **entire** envelope, and make
   this a hostile-field golden, not just source-verbatim.
2. **Versioning is the forward-compat hinge.** `format` + provenance let an old
   `.html` reopen: migrate known-older versions; refuse newer-than-known with a
   clear message.
3. **Native vs foreign dispatch.** Sniff on import — zip magic (`PK\x03\x04`) +
   `manifest.json` or `.html` with `#lattice-doc` → native lossless path; bare
   `.md` → existing open; PDF/PPTX → the *foreign* lossy IR path. Never let our
   own export fall into the lossy route. A degraded recovery (reconstruct from
   semantic `_class:` DOM if the manifest is hand-stripped) is a *fallback*, not
   the primary.

## Decision 4 — the reuse boundary: facts, not fixtures

The export artifact **must never `import` a live Drawing Board module**
(`docs/src/playground/drawing-board-*`). We extract and share the **pure
semantic kernel** underneath; the player itself is **new, export-specific code**.
This is the **same** pattern as HARD RULE #1, not a softening of it: the export
player is another **sibling consumer** of the shared kernels, exactly like the
CLI, the docs playground, and the vscode runtime.

**Why export-specific is non-negotiable:**

1. **Exported files are frozen artifacts in the wild** — a `.html` exported today
   carries its player *forever*; you can't patch it when the app refactors. The
   player needs its own **frozen, versioned** surface.
2. **The standalone file has zero access to the docs bundle** — opened from
   `file://`, the playground modules don't exist there.
3. **The practice controller is wired to things that must never ship** — the
   IndexedDB store, the model ladder, the budget gate, the tour.

**Where the line falls:**

| Shared kernel (extract, single-source, build-time inline) | Export-specific (new, frozen, versioned, under `lib/export/`) |
|---|---|
| `notes-core.js` — note boundary is a *language fact* | the player runtime: transport UI, overlay bar, notes sheet |
| slide-box / FIT-scale **math** (pure part of `frame-css`) | the dual-screen `window.open` + `postMessage` pairing |
| split/section boundaries (`heading-split-core`) | `dvh` viewport-fill, orientation re-fit, swipe/keys DOM wiring |
| **new** `lib/core/lattice-doc.js` — manifest envelope (exporter **and** importer) | the HTML assembler (inline fonts/images/SVG, write envelope + player) |

- **Anti-drift on transport behaviour:** extract a **headless transport kernel**
  (pure state machine — `index`, `next/prev/go`, bounds, the keymap *table*) that
  *both* practice and the export player consume, each binding its own UI. Refactor
  practice onto it in the same change (de-fork, don't triple-source) and add a
  **contract test** asserting both honour the same keymap/bounds.
- **Build-time guard:** an ownership/lint check fails if anything under
  `lib/export/player/` imports `docs/src/playground/*` — the boundary is enforced
  by the machine, not memory.

**Where code lives:** export source under `lib/export/` (engine package — beside
`pptx-export.js`), consuming `lib/` kernels only. The Drawing Board export *menu*
stays in docs and calls the engine builder via `window.LatticePlayground`, as
`drawing-board-export.js` already does — no new coupling.

## Phasing (recommended)

1. **Envelope kernel + `.lattice` zip + native re-import.** `lib/core/lattice-doc.js`,
   `buildManifest`/`parseManifest`, the golden round-trip test, container
   dispatch, and the Drawing Board "Open"/drag-in path. Reframe the Marp bundle
   under `.lattice`. *Delivers lossless round-trip — the highest-leverage half.*
2. **Self-contained `.html` — static viewer.** Pre-rendered semantic slides +
   inlined fonts/images/SVG/CSS + embedded source envelope. Floor size tier. No
   player yet (slides stacked + scrollable).
3. **The player.** Headless transport kernel (+ practice refactor onto it),
   overlay controls, keyboard/swipe, the universal notes sheet, the three
   capability tiers, CSS viewport-fill + orientation.
4. **Dual-screen presenter** (`window.open` + `postMessage`; Window Mgmt API
   auto-place as enhancement).
5. **Size minimisation** (glyph-subsetting, used-selector CSS prune) — if the
   held "Minimal from day one" call goes the other way.

## Non-goals

- Round-tripping a *foreign* deck (PDF/PPTX) losslessly — that stays the separate
  lossy AI-mapped door (`2026-06-14-presentation-import.md`).
- Live interactivity inside an exported deck beyond presentation transport.
- Making the stock marp-vscode preview reproduce structural components (inherited
  from the Marp-bundle non-goals).

## Verification bar (when code lands)

Per CLAUDE.md §responsive: every player tier gets `tools/screenshot.js` evidence
at **390 / 820 / 1440**, both orientations on the mobile tier, **icon-only**
controls on mobile, **no CLS** (the `dvh` units + reserved control-bar space buy
it). Export changes are MY-inspection-gated: a representative demo deck rendered
**dark and light**, both files sent for sign-off (CLAUDE.md §"Export changes
require MY inspection").

## Open questions (carried)

- Size tier of v1 (§2e) — *held.*
- Colour mode: chosen-only vs both + system (§2e) — *held.*
- Strip-notes-on-export toggle vs notes-by-default (§2e).
- Un-inlinable asset: hard-fail vs warn-and-degrade (§2b).
- **`.lattice` as a desktop document type** — register the extension with the
  SlideWright Tauri app so double-click opens the deck natively (turns the format
  from "a zip you drag into a web tool" into "the native document type"). Ties
  this decision to the desktop wrapper; worth resolving with the import work.
