---
status: proposed
summary: Captures every workitem deferred or discovered late during the design-system-foundation branch, tracked as next
---

# Post-foundation follow-ups

Captures every workitem surfaced during the `design-system-foundation`
branch that we either chose to defer, discovered too late to fold in,
or only landed via a transitional hack. Companion to
[`design-system.md` §13](../../design/design-system.md) (which tracks "shipped"
and "ratified") — this note tracks "next."

Each item carries:

- **What** — the change in one line
- **Why** — the value or the pain it removes
- **Effort** — rough order of magnitude (1 session ≈ a half-day)
- **Risk** — what could go wrong, and the guardrail
- **Depends on** — anything that has to land first

Items are tiered by risk / effort so a future session can pick a
coherent batch without designing the order from scratch.

---

## Tier 1 — low-risk cleanup (~1 session total)

### 1.1  Delete stub READMEs

- **What.** ~40 of the 57 `lib/components/<name>/README.md` files are
  stubs that just repeat the manifest description. Delete the
  empty ones; keep only the ones with genuine prose.
- **Why.** Drops the component-folder file count ~14% with zero
  semantic loss. Manifest description is the single source of truth.
- **Effort.** 1 hour. `grep -l "^Add prose here" lib/components/*/README.md`
  then `git rm`.
- **Risk.** None — manifests + example.md remain.
- **Depends on.** Nothing.

### 1.2  ~~Migrate `lib/journey.js` → `lib/components/journey/transform.js`~~ ✓ DONE

Shipped in commit `f3a6df0` during PR prep. `lib/` root no longer
holds any per-component transforms; `chart-family.js` remains as
genuinely shared infrastructure.

### 1.3  Re-baseline `component-gallery.pdf`

- **What.** Re-snapshot the post-foundation `component-gallery.pdf` so
  the pre-phase-5b baseline (which lacks the journey + math slides
  added mid-branch) stops showing 27 pages of "leftover" diff.
- **Why.** Keeps the pixel-check gate signal honest. Today a `pixel-check
  diff pre-phase-5b` reports 28 pages changed even on byte-identical
  bundles, which trains us to ignore that deck's diffs.
- **Effort.** 5 minutes. `node tools/pixel-check.js snapshot baseline-2026-05-16`.
- **Risk.** None.
- **Depends on.** Nothing.

### 1.4  Tighten stale `_legacy.css` comments in `tools/build-css.js`

- **What.** Four narrative comments still reference `_legacy.css` as
  if it exists. Code is correct; just stale prose.
- **Why.** Confusing for next contributor.
- **Effort.** 15 minutes.
- **Risk.** None — comment-only.
- **Depends on.** Nothing.

### 1.5  Update `design/design-system.md` §13

- **What.** §13 currently lists "in progress" items that all shipped.
  Move them to "shipped"; remove the destination-map references (the
  destination map header in `_legacy.css` is gone with the file).
- **Why.** Doc-of-record drift.
- **Effort.** 30 minutes.
- **Risk.** None — prose only.
- **Depends on.** Nothing.

---

## Tier 2 — structural fixes (~2-4 sessions, each its own commit)

### 2.1  Activate `@layer` and retire the specificity-bump hacks

- **What.** Wrap each per-component CSS in its own sub-layer; wrap
  cross-cutting modifiers in their own layer. Layers cascade by
  declaration order, so the modifier-vs-component collision that
  forced the specificity-bump hacks goes away.
- **Why.** Removes the transitional hacks in `citation-card`,
  `redline`, `regulatory-update`, and the `split-*` family. Components
  no longer need duplicated-class selectors (`section.X.X > …`) to
  beat modifier defaults. Future components get isolation for free.
- **Effort.** 1 session.
- **Risk.** `@layer` REVERSES `!important` priority — any surviving
  `!important` rule in a per-component file would flip its win.
  Prerequisite is an audit-and-remove pass. There are ~12 `!important`
  declarations in component CSS today (mostly `featured`'s `display:
  none !important;`); each needs a non-`!important` replacement or an
  explicit decision that the layer reversal is the intended outcome.
- **Depends on.** Item 2.2 (`!important` audit).

### 2.2  `!important` audit

- **What.** Catalog every `!important` in `lib/components/*/styles.css`
  and `lib/_*.css`. For each, decide: rewrite to a non-`!important`
  pattern, OR document why it must stay.
- **Why.** Prerequisite for `@layer` activation (2.1). Also
  independently valuable — `!important` is usually a flag for
  unresolved cascade design.
- **Effort.** **2-3 sessions** (corrected from earlier estimate).
  Actual count after PR-prep audit: **352 declarations** —
  150 across component styles.css files (heaviest: `image` 55,
  `timeline` 25, `kanban` 24, `radar` 22, `math` 16), 202 across
  shared `lib/_*.css` files. Most are likely small categories: Mermaid
  SVG overrides (where `!important` IS the right answer because we're
  defeating mmdc's inline styles), and component-specific `display:
  none !important` patterns. Group by category first, then audit
  per-group rather than per-declaration to compress the work.
- **Risk.** Some `!important` rules may be load-bearing in ways the
  test suite doesn't catch. Per-category pixel-check after each rewrite.
- **Depends on.** Nothing.

### 2.3  State / Tone / Chrome universal-variant CSS

- **What.** The `state` (wip / draft / tbd / confidential / redacted /
  archived / pinned / revised), `tone` (tone-pass / -warn / -fail /
  -skip), and `chrome` (silent / no-header / no-footer / no-paginate)
  universal-variant *metadata* shipped in §6.5 but the matching CSS
  rules never landed. The classes are declared in
  `lib/components/index.js` `UNIVERSAL_GROUPS` but render as no-ops.
- **Why.** Half-shipped feature. Authors who try `<!-- _class: content
  wip -->` get no visual signal.
- **Effort.** 1 session — needs design (what should each variant look
  like?), implementation in `_universal.css`, demo slides in
  `examples/state-tokens.md` (which already exists but only exercises
  the existing state grammar).
- **Risk.** Visual design choices; pixel-check on new demo slides will
  necessarily show diffs (they're new content).
- **Depends on.** Nothing. Could fold into 2.1 since both touch the
  modifier/universal layers.

### 2.4  Component-namespace variant classes

- **What.** Rename variant classes that collide with component names.
  Today `<!-- _class: regulatory-update timeline -->` uses `timeline`
  to mean both "the timeline component" and "the timeline variant of
  regulatory-update." Pick a convention — e.g., prefix variants with
  the parent component (`ru-timeline`) or use a separate frontmatter
  field (`_variant: timeline`).
- **Why.** Eliminates the entire class of cascade collisions that
  produced the specificity-bump hacks AND the `regulatory-update`
  27k-pixel mystery. With @layer (2.1) the bug is contained; with
  namespacing, the bug is impossible.
- **Effort.** 1 session if shorthand stays compatible; 2 sessions if
  authoring grammar changes.
- **Risk.** Author-facing change. Every example.md and every gallery
  deck needs updating. The current `<!-- _class: A B -->` shorthand
  is established and clean; replacing it touches every authored
  artifact.
- **Depends on.** A design decision on which convention to adopt.
  Worth bundling with a broader review of the manifest's `variants`
  field semantics.

### 2.5  Promote `pixel-check` to a documented contributor tool

- **What.** `tools/pixel-check.js` was built mid-branch and got us
  through ~30 commits, but it's undocumented. Add it to
  `engineering/development.md` alongside the test scripts. Decide
  whether it should be a pre-commit hook (today only `pdf-freshness`
  is wired in).
- **Why.** Other contributors will benefit. The pre-commit option
  prevents "I forgot to pixel-check before committing" mistakes.
- **Effort.** Half-session for docs; another half-session if we wire
  the hook (needs care so a slow pixel-check doesn't block commits
  unreasonably).
- **Risk.** Pixel-check takes ~2 min on full sweeps; making it a
  pre-commit hook needs scope-detection (only diff decks that the
  staged changes affect) to be usable.
- **Depends on.** Nothing.

---

## Tier 3 — speculative / longer-horizon

### 3.1  CSS `@scope` for nested-component isolation

- **What.** Wrap component CSS in `@scope (section.X) { :scope > … }`.
- **Why.** Today no component contains another, so cascade leakage
  isn't a problem. But if/when we add a "container" component that
  embeds others, `@scope` is the idiomatic answer.
- **Effort.** Speculative — depends on whether nesting becomes a
  requirement.
- **Risk.** `@scope` browser support is recent (Chrome 118+, Safari
  17.4+, Firefox 128+). Marp-vscode's bundled Chromium might lag.
- **Depends on.** A real use case for nested components.

### 3.2  Migrate to `data-*` attributes

- **What.** Stop using `class` for component identity. Renderer emits
  `<section data-component="regulatory-update" data-variant="timeline">`
  and selectors become `[data-component="X"][data-variant="Y"]`.
- **Why.** Strongest possible isolation — namespace collisions become
  impossible. The `regulatory-update.timeline` bug class disappears
  by construction, not by mitigation.
- **Effort.** 2-3 sessions: rewrite every selector in `lib/`, update
  three render paths, lots of pixel-check iteration.
- **Risk.** Big refactor. Worth doing only if cascade-collision bugs
  recur after Tier 2 fixes don't hold.
- **Depends on.** Tier 2 outcomes — if (2.1) + (2.4) eliminate the
  recurring problem, this becomes overkill.

### 3.3  Per-component pixel-baseline tests in CI

- **What.** For each component, snapshot the rendered slide(s) and
  CI-assert no pixel diff on PRs. Extends `test/integration/screenshot/`
  from a smoke test into a regression baseline.
- **Why.** Today the regression baseline is only three canonical
  galleries (gallery / mermaid-gallery / kpi-gallery) and only their
  page counts. A per-component pixel baseline would catch silent
  visual regressions much faster than the gallery rebuild.
- **Effort.** 1 session. Build infrastructure (snapshot storage,
  CI-friendly diff thresholding for mmdc non-determinism). Per-
  component snapshots can use the `examples/component-gallery.pdf`
  pages.
- **Risk.** Storage cost (PNGs in repo). Could store in git-LFS or
  compute baseline hashes only.
- **Depends on.** Nothing.

### 3.4  Third-party library boundary documentation

- **What.** Per §13, the four-substance plugin contract (prose /
  structure / series / graph) is abstract. The first real third-party
  integration — D2 for graphs, Vega-Lite for series — should be code-
  reviewed for boundary shape and the contract written up explicitly.
- **Why.** Future integrations need a contract to code against;
  current contract is illustrative only.
- **Effort.** Deferred until first real candidate.
- **Risk.** None until integrating.
- **Depends on.** A specific integration project.

### 3.5  Visual component catalog (`docs/catalog.html` or desktop panel)

- **What.** Build a visual picker — every component as a thumbnail
  with its name, function family, and variants. Could be a generated
  static HTML, or a panel inside the Laticent desktop wrapper.
- **Why.** Most mature design systems ship one (Storybook, Chakra
  docs, shadcn site). Authors who don't know component names by
  heart can pick visually.
- **Effort.** 2-3 sessions for a static HTML version; longer if it
  integrates with the desktop app.
- **Risk.** Maintenance burden — thumbnails need to regenerate on
  every component-CSS change.
- **Depends on.** Nothing technical. Mostly a priority call.

### 3.6  `dataShape` manifest field (variant guardrail mechanization)

- **What.** Add a `dataShape` field to manifests (e.g. `flat-list`,
  `tree`, `key-value`, `tabular`) so the loader can flag variants
  whose shape drifts from their parent.
- **Why.** Phase B ratified the variant guardrail as a doc rule.
  Codifying it as a field is the mechanical alternative.
- **Effort.** 1 session for the schema + validator + retroactive
  classification of all 57 components.
- **Risk.** Premature formalization. The doc rule may suffice for
  years without a `dataShape` field; introducing one creates new
  decision points.
- **Depends on.** Evidence that review judgement is starting to drift.

### 3.7  Strict-mode bundler — detect cascade collisions at build time

- **What.** `tools/build-css.js` could parse selectors and warn when
  two source files set the same property on selectors at equal
  specificity. Would surface the `regulatory-update`-style bugs
  *before* they hit pixel-check.
- **Why.** Caught all our specificity-bump-needs early in the
  pipeline. Better than pixel-check (which finds the symptom, not
  the cause).
- **Effort.** 1-2 sessions. Needs a CSS parser (postcss?) and a
  simple cross-source specificity comparator.
- **Risk.** False positives — many "collisions" are intentional
  (modifier-on-component). Need an allowlist or annotation.
- **Depends on.** Nothing. Would meaningfully simplify Tier 2 (2.1)
  work if it lands first.

---

## Open design questions (no clear right answer yet)

### Q1  What is the right cascade ordering principle for modifiers vs components?

Today: source order. After (2.1): declared layer order. The next
question is *which order* — should modifiers always win at equal
specificity (the historical default), or should components always
win (the more isolated default)?

The current branch's answer is "modifiers win, components opt out via
specificity bumps." The opposite is "components win, modifiers opt in
via explicit layer-bump." Both are defensible. Picking one shapes
all future component+modifier work.

### Q2  Should we accept `journey.js` and `chart-family.js` as permanent shared infra, or push toward zero-shared-infra?

Today: both stay at `lib/` root because they're used by all three
render paths. Moving them into component folders would require either:
- A new "shared component" concept (e.g. `lib/components/_chart-family/`)
- Or every renderer importing from `lib/components/<name>/transform.js`,
  which feels inverted (renderers shouldn't depend on components).

The current arrangement is fine; this question only matters if we
discover a shared-infra pattern we want to apply more broadly.

### Q3  Is the per-folder layout actually the right grain?

This branch committed to "one folder per component" (design-system.md
§9). It's roughly 6× the file count of the previous monolith. Mature
libraries do this; Lattice authors aren't the same audience as React
component-library authors.

Worth revisiting in 6 months: do contributors find the per-folder
layout easier to navigate, or have we created friction we don't see?
A "fewer files" alternative isn't designed yet — but the question is
worth keeping open.

---

## Suggested batching for the next branch

If we tackle this list as a single branch:

1. **Remaining Tier 1 cleanup** (single commit at the top — 30 min;
   items 1.1, 1.2, 1.5 already shipped during PR prep)
2. **`!important` audit** (Tier 2.2 — 2-3 sessions; 352 declarations,
   batch by category not per-declaration)
3. **`@layer` activation** (Tier 2.1 — 1 session, blocked on 2.2)
4. **Retire specificity-bump hacks** (Tier 2.1 follow-up — half
   session)
5. **State / Tone / Chrome CSS** (Tier 2.3 — 1 session)
6. **Pixel-check tooling** docs + optional hook (Tier 2.5 — half
   session)

That's **~5-6 sessions** for a coherent "consolidation" branch
(was ~4 in the original estimate; the !important audit grew once
the actual count came in). Tier 3 items each become their own branch
as priorities clarify.
