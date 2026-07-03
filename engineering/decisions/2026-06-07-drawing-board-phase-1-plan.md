---
status: shipped
summary: Slice-by-slice Phase 1 walking-skeleton plan for the Drawing Board, shipped gate-green across all six slices in PR #79
---

# The Drawing Board — Phase 1 walking-skeleton build plan (2026-06-07)

> **FROZEN (2026-07-03).** The Drawing Board is development-frozen and will be
> removed; the Studio succeeds it. No further phases land on this surface. See
> `2026-07-03-studio-succession.md`.

> Status: **✅ COMPLETE & gate-green** on branch
> `claude/github-pages-slide-editor-6zJe3` (PR #79). All six slices shipped:
> 0 route+shell · 1 editor↔engine · 2 filmstrip+sync · 3 IndexedDB persistence ·
> 4 export MD/PDF/PPTX · 5 deterministic Architect (live review + auto-fix +
> onboarding). Phase 2 continues in
> `engineering/decisions/2026-06-08-drawing-board-phase-2-plan.md`.
>
> Companion to the proposal
> `engineering/decisions/2026-06-07-drawing-board-architect.md` (read that first
> for the architecture, naming, and Architect/voice decisions). This doc turned
> that proposal's §9 **Phase 1** into a concrete, slice-by-slice plan.

## Goal & definition of done

A **walking skeleton**: one thin thread through *every* architectural seam —
route, three-panel shell, engine wiring, full-deck preview, persistence, export,
and the **deterministic Architect** — deployed to GitHub Pages and demoable, with
the heaviest/riskiest piece deliberately stubbed: **zero language model.**

Phase 1 is **done** when, on the live `/drawing-board` route, a user can:

1. open the Drawing Board, type Lattice Markdown, and see the whole deck render
   live in a scrollable filmstrip that stays in sync with the cursor;
2. have their work autosaved to IndexedDB, see it in a deck list, and
   create/restore checkpoints;
3. export the deck to Markdown, PDF, and PPTX;
4. get **deterministic** authoring help from the Architect panel — linter
   findings + quick-action fixes + the fixed-question onboarding — *with no model
   downloaded*.

Everything model-shaped (generation, embeddings, chat history, focus edit modes,
mobile polish) is **Phase 2/3** and explicitly out of scope here (see end).

## Guiding principle: front-load the unknowns

Most of Phase 1 is assembly over parts that already run client-side (the
playground engine bundle, CodeMirror 6, the linter). Only two things are genuinely
unproven, so they are **spikes inside the early slices**, not late surprises:

- **Spike A — full-deck filmstrip.** The playground renders *one* fixed 1280×720
  specimen iframe today (`docs/src/playground/live-render.js`). A whole-deck,
  scrollable preview with cursor↔slide sync is the one new render surface.
  Resolved in Slice 2.
- **Spike B — export fidelity.** Print-to-PDF and rasterize-each-slide→PptxGenJS
  are the riskiest non-model work; fidelity is bounded by what a browser can do
  without headless Chrome. Resolved in Slice 4.

If either spike fails its acceptance bar, we learn it in week one, not at the end.

## Pre-work: make the linter browser-pure

The author linter (`lib/authoring/lint.js`) is exactly the right shape — a pure
`lintText(source)` built for the no-Chromium edit→check loop — **but** it
`require('../components')`, which loads component manifests off the filesystem, so
it cannot be imported as-is in the browser.

**Decision: refactor `lintText` to accept the prebuilt catalog rather than reach
into `lib/components`.** `dist/docs/components.json` already ships as the machine
catalog (component names, modifiers, card-style/split/statement-OL membership —
everything the rules need). Thread that data in as an argument (or a small
injected resolver) so `lintText(source, catalog)` is dependency-free and bundles
clean. Fallback if the data shape doesn't cover a rule: esbuild a `lib/authoring`
browser bundle the way `tools/build-playground.js` bundles the engine, and stage
it via the same `sync-playground-assets` mechanism.

This is the only change Phase 1 makes *outside* `docs/`. It must keep the Node CLI
(`tools/lint-deck.js`) and the unit tests green — same function, data now passed
in rather than required.

## The slices

Each slice is independently demoable (via the deployed route or `SendUserFile`
of a screen capture) and has an explicit acceptance bar. Order is dependency- and
risk-driven.

### Slice 0 — Route + shell
- **Build:** `docs/src/pages/drawing-board.astro` at `/drawing-board`. A
  three-panel CSS-grid (Architect · editor · preview) + left rail, drag-resizable
  with persisted widths, responsive collapse to a segmented tab control under
  ~1024px; the rail becomes a drawer. Palette/dark topbar reused from the
  playground. No behavior yet — static panels with placeholder content.
- **Reuses:** `docs/src/styles/`, the playground's palette/mode bootstrap.
- **Kills:** "does the route deploy, lay out, and respond?" The skeleton stands up.
- **Acceptance:** route live on the Pages preview; panels resize; collapses
  cleanly on a phone viewport.

### Slice 1 — Editor ↔ engine heartbeat
- **Build:** grow `docs/src/playground/editor.js` (CodeMirror 6, markdown +
  Mermaid highlighting already present) into the center panel; wire
  `window.LatticePlayground` (already bundled in
  `docs/public/playground/lattice-playground.js`) + the runtime into the right
  panel. Debounced re-render on edit. Start from a seeded sample deck.
- **Reuses:** the full marp client-side render path (render path #2) and
  `live-render.js`'s theme-ensure / scale logic.
- **Kills:** "does the engine drive an arbitrary multi-slide deck, not just a
  specimen?"
- **Acceptance:** typing Lattice Markdown updates rendered slides live in the
  chosen palette.

### Slice 2 — Filmstrip + sync scroll (Spike A)
- **Build:** replace the single specimen with a scrollable vertical stack of all
  slides. Map cursor line → slide index by splitting source on `---`; scroll the
  filmstrip to the active slide and highlight it; reverse on slide click
  (slide → first source line of that slide). Throttle to keep scroll smooth.
- **Kills:** line↔slide mapping accuracy + filmstrip scroll/render performance —
  the riskiest render piece.
- **Acceptance:** moving the cursor across `---` boundaries scrolls the preview to
  the matching slide; clicking a slide moves the cursor; no jank on a ~30-slide
  deck.

### Slice 3 — Persistence + history (IndexedDB)
- **Build:** `idb` (or Dexie) wrapper with object stores `decks`, `revisions`,
  `settings` (a `chats`/`messages` schema is declared but unused in Phase 1).
  Autosave the active deck; deck list + rename/delete in the rail; checkpoint
  **create** and **restore** (append-only revision log + periodic full snapshot
  to bound storage; restore forks rather than destroys). An explicit **Export
  deck** action as the durability guarantee.
- **Kills:** the revision model and the eviction stance
  (`navigator.storage.persist()` prompt vs. rely-on-export).
- **Acceptance:** reload preserves the deck; checkpoints list, restore, and fork;
  deleting a deck is recoverable until a checkpoint is pruned.

### Slice 4 — Export MD / PDF / PPTX (Spike B)
- **Build:**
  - **MD** — serialize the source (trivial).
  - **PDF** — a one-slide-per-`@page` print stylesheet over the rendered slides +
    `window.print()`. UI states the fidelity bound (browser render, not the
    puppeteer pipeline).
  - **PPTX** — rasterize each rendered slide to PNG (foreignObject→canvas) and
    assemble with **PptxGenJS** as full-bleed slide backgrounds. UI states it is
    image-slides (editable container, non-editable content).
- **Kills:** the export-fidelity bet; surfaces the PptxGenJS bundle-size cost.
- **Acceptance:** all three download; PDF paginates one slide per page; PPTX opens
  in PowerPoint/Keynote with each slide as a full-bleed image; fidelity caveats
  shown at the export action.

### Slice 5 — The deterministic Architect panel
- **Build:** the left panel runs the now-browser-pure `lintText` on the live deck
  → a findings list (severity, message, location). Quick-action buttons apply
  **real CodeMirror transactions** (e.g. the card-style nested-format fix, the
  `_class` typo correction). Onboarding = the fixed three-question form (the
  templated-floor performance from the proposal's Appendix A); empty-state asks
  *what · who · the one outcome*, then keyword-matches `components.json` to
  propose a starter outline and scaffolds on approval.
- **Reuses:** `lib/authoring/lint.js` (post-pre-work), `dist/docs/components.json`,
  the component skeletons.
- **Kills:** "does the Architect panel + quick-action plumbing work with **no
  model**?" — the templated floor *is* Phase 1's assistant.
- **Acceptance:** editing a deck surfaces live findings; clicking a quick action
  applies a correct edit; onboarding produces a scaffolded starter deck from the
  three answers; **all of it runs offline with zero model.**

## Cross-cutting (confirmed against the repo)

- **Build/deploy already accommodates this.** `.github/workflows/docs.yml`
  deploys on `docs/**`, `dist/**`, `themes/**`, `lib/**`, `marp.config.js`;
  `docs/scripts/sync-playground-assets.mjs` stages the engine + themes into
  `public/playground/` at build time. A new route — plus a staged linter bundle if
  the esbuild fallback is taken — rides this with **no CI changes**.
- **Deps land in `docs/package.json` only** (`idb` or `dexie`, `pptxgenjs`) — not
  the engine package, so the npm tarball stays lean (proposal §7).
- **Engine gates are untouched.** Phase 1 adds no component CSS, no transformer,
  no render path; the only non-`docs/` change is the linter data-injection
  refactor. So `check:ownership` and the three-renderer parity gate don't move,
  and the 334-test unit suite + integration tier are unaffected (the linter
  refactor must keep its existing unit tests green).
- **Testing posture:** Astro build check + a light smoke test of the route and the
  IndexedDB round-trip. No new heavy test tier.
- **Workflow note:** the Drawing Board is a docs-site app, so the repo's standard
  "ship a feature deck" conventions (`examples/<slug>.md` + committed PDFs, the
  long-running-gallery isolation rule) **do not apply** — there is no deck
  artifact to baseline. The deliverable is the deployed route; review happens on
  the Pages preview, not via a `.pdf` in the PR.

## Out of scope for Phase 1 (Phase 2/3)

Generation models + the `ArchitectModel` adapter, Transformers.js embeddings +
semantic catalog retrieval, conversational chat history, the built-in Prompt
API / WebLLM tiers, focus edit modes (Mermaid/math), Rewriter/Summarizer
quick-actions, and the full mobile-polish pass.

## Dependencies to add (docs/package.json)

- `idb` (lightweight) or `dexie` (richer querying) — persistence.
- `pptxgenjs` — PPTX assembly.
- (PDF and PNG rasterization need no new dep — `window.print()` + canvas.)

## Open decisions to settle while building

- **Persistence lib:** `idb` (thin, ~1KB) vs. `dexie` (queries/migrations). Lean
  `idb` unless the revision log wants real querying.
- **Eviction stance:** prompt for `navigator.storage.persist()` up front, or rely
  on explicit **Export deck** as the durability promise (proposal §10).
- **Route prominence:** how prominently `/drawing-board` is surfaced in the docs
  nav vs. the playground (the slug is settled; the nav placement is not).
- **Linter browserization:** data-injection refactor (preferred) vs. esbuild
  bundle (fallback) — confirm the `components.json` shape covers every rule first.

## Suggested sequencing

Pre-work (linter) can run in parallel with Slice 0. Then 1 → 2 (Spike A) → 3 →
4 (Spike B) → 5. Slices 0–2 establish the visible end-to-end thread (type → see a
synced deck); 3–5 thicken it into something you'd actually keep work in. Each
slice is a small PR against the feature branch, demoable on the Pages preview.
