---
status: in-progress
summary: Scalable live preview for huge decks — incremental-patch path landed, viewport virtualization the remaining layer
---

# Drawing Board — scalable live preview (incremental, then virtualized)

> **Design-of-record + build log.** Diagnosis and architecture are settled
> (measured). Build is in progress: the pure kernel + the incremental-patch path
> have landed; viewport virtualization is the remaining layer. The DOM changes
> need a real browser to verify (the cloud sandbox can't run the Astro app).
> When this note and a shipped surface disagree, the shipped surface wins.
>
> **Superseded for the Playground (2026-09-28).** `content-visibility:auto` skipped paint but
> not the runtime's transform pass, the style recalc against the engine sheet, or the memory:
> a 522-slide deck still took 8.5s to its first slide. The Playground now mounts only the
> slides in view and keeps the rest as sized placeholders — see
> `2026-09-28-playground-virtual-filmstrip.md`. The Studio's single-slide preview is unaffected.

## The problem (one sentence)

Typing in a large deck (150+ slides) freezes the Drawing Board for 1–2s because
the preview **rebuilds every slide on every keystroke**. We want it to redo only
what changed.

## Diagnosis — measured

- **Not the Architect:** `lint-core` + `review-core` + `scorecard` run <20ms at
  800 slides / 282 KB.
- **Not the markdown render:** marp-core does 200 slides in ~58ms, 800 in ~286ms.
- **It's the browser-side rebuild.** `drawing-board.astro` did
  `frame.srcdoc = PG.render(getSource())` on every edit — a fresh browsing
  context that re-parses the doc, re-runs the runtime DOM transforms over *every*
  section, FIT-scales and lays out *all N* fixed 1280×720 slides. O(N) per
  keystroke.

## Architecture decision — persistent iframe, not shadow DOM

The preview lives in an **iframe** for CSS/JS isolation (the deck theme CSS uses
global selectors that would collide with the Starlight docs page). The question
was whether to virtualize *inside* the iframe or move slides into **shadow DOM**.

**Keystone finding (`lib/runtime/index.js:978`):** the runtime registers
`new MutationObserver(scheduleRun).observe(document.body, {subtree,childList})`
and re-applies *every* transform — global (badges, slot-labels) and
component-scoped (charts, split-panels, state-chart) alike — to any `<section>`
inserted into its document, **idempotently** (each skips slides it already did).
Patch-on-insert is the runtime's native model.

That decides it:
- **Iframe:** the runtime's transforms fire on inserted/replaced slides for
  free. Zero runtime changes.
- **Shadow DOM:** `document.querySelectorAll` can't see into a shadow root and
  the `document.body` observer doesn't watch it → would force a pervasive
  root-aware refactor of a file shared by all three render paths.

So: **keep the iframe, make it persistent, patch only changed slides.** (An
earlier draft of this note recommended shadow DOM, before the observer finding;
that recommendation is withdrawn.)

## Build status

**Landed — kernel (unit-tested in Node):**
`docs/src/playground/preview-virtual.js` + `test/.../preview-virtual.test.js`:
`splitSections`, `diffSections` — the two pieces the patch path uses.

> A first cut of this kernel also shipped JS-windowing math (`windowRange`,
> `spacers`, `rangeChanged`) for a hand-rolled virtual list. We went with
> `content-visibility:auto` instead (below), so that math had no runtime
> consumer and was removed as dead code — recoverable from git history if a
> mega-deck ever needs DOM-node-reducing JS windowing.

**Landed — incremental patch (`drawing-board.astro`, needs browser verify):**
the persistent-iframe path. `render()` now full-writes the srcdoc only on first
render and on palette/mode change (theme CSS + Mermaid theming bake into the
document); on every other edit it `patchFrame()`s — splits the freshly-rendered
HTML into per-slide strings, replaces only the `<section>` nodes whose HTML
changed (`replaceChild`), and re-applies FIT + sync via exposed
`window.__latticeFit` / `__latticeTag` hooks. A slide insert/delete rebuilds the
`.marpit` body only (no script re-eval). The runtime observer transforms the
replaced sections; export/cursor-sync/pagination are untouched because all
sections stay mounted. Edit cost → O(changed slides).

**Landed — virtualization via `content-visibility:auto` (needs browser verify):**
slides are fixed 1280×720, so `content-visibility:auto` +
`contain-intrinsic-size:1280px 720px` on `.marpit>section` is the right
virtualization primitive — the browser skips layout/paint of off-screen slides
(fast initial render + smooth scroll on huge decks) while **every node stays in
the DOM**, so export / cursor-sync / incremental patch are untouched. Two
overrides keep it correct: `content-visibility:visible!important` in the print
CSS, and forcing it visible per-section in `drawing-board-export.js`
`rasterizeSection` (off-screen `content-visibility` content is otherwise dropped
from print + html-to-image).

This is the right tool for *fixed-size* items: a JS virtual list (Virtuoso-style)
earns its complexity on *variable-height* lists and when DOM-node count must
shrink. Here layout/paint was the cost, not node count. If a chart-heavy
mega-deck ever does need JS windowing (to also defer off-screen transform work),
note the constraint: export reads all sections from `contentDocument`
(`drawing-board-export.js:48`), so it would have to materialize the full deck.

## Verification (browser, 2026-06-10/11)

The sandbox **can** run the site: `npm install` in `docs/` works (network is
available), `npm run dev` serves it, and the puppeteer-cached Chrome
(`$CHROME_PATH`) drives it headless. (An earlier claim that it couldn't be run
here was wrong.)

**Proven — incremental patch:** loaded a generated 200-slide deck (481 ms), then
edited exactly one slide. Result: the iframe document **persisted** (a marker set
on `contentWindow` survived the edit) and **200 of 201 section nodes kept their
test tags** — i.e. exactly one `<section>` was replaced, not the deck rebuilt.
Edit reflected in ~400 ms (incl. the 220 ms debounce). Screenshots confirm
correct rendering (dark title slide + filmstrip; verdict-grid badges drawn = the
runtime observer transforms patched/mounted sections).

**Export:** the PDF path enumerates **every** slide (reached "Rendering slide 7
of 13" before the probe timed out) — `content-visibility` does not hide slides
from export. It's slow here only because html-to-image fetches Google Fonts from
a CDN the sandbox proxy blocks (an environment artifact, not the change).

**Not verifiable headless — `content-visibility` skipping:** a *clean control*
(plain divs with `content-visibility:auto`, no Drawing Board code) also reports
far off-screen items as "rendered" via `checkVisibility({contentVisibilityAuto})`
— so headless Chrome ('new') doesn't engage viewport-based content-visibility
skipping, and this harness can't measure the paint/scroll benefit. The CSS is
applied (computed `content-visibility:auto`), renders correctly, and doesn't
break export; the actual off-screen-skipping win needs a **headed** browser to
observe (no display in the sandbox). The technique is standard for fixed-size
scroll items; this is a measurement limit, not evidence it fails.
