---
status: shipped
summary: A full audit of the Form-default migration (triggered by suspicion that lib/runtime/index.js was neglected relative to lattice-emulator.js), run as a red team + Munger inversion + independent checker workflow (9 agents). Verdict on the original question: runtime/emulator parity for the CORE form-default chain (section.form, data-lattice-slide, masthead-lift, progress/watermark Tiles) is solid — the 2026-07-08 fix (#837) holds up under adversarial review. But the audit surfaced a much bigger, previously-unknown problem one layer down: masthead-lift's `.cell-stage` body-wrap (which ALL THREE render paths run identically) silently breaks several "universal auto-detected" authoring concepts — confirmed via live rendering with before/after computed styles — because lib/base/base.modifiers.css's Key Insight, below-note, annotation, and heat-overlay rules (and base.sketch.css's entire hand-drawn box treatment) were written before the cell-stage wrap existed and were never updated to reach through it. This is a CSS-completeness gap that predates and is orthogonal to the runtime-parity question, and it affects the engine/emulator export path too, not just the runtime. Plus five newly-found runtime-specific parity gaps (focus/build item axis, image `.lattice-bg` wrap, a11y texture defs, one-shot front-matter fetches, nested-section over-reach). All 9 remediation PRs shipped (#851, #852, #854–#860); a second adversarial pass on the fix branches themselves caught and hardened two real bugs (below-note and eyebrow-extraction substring/anchoring issues) before merge, plus added a missing regression test. The `bg-image` runtime gap (#860) is intentionally left as a documented known limitation, not fixed.
---

# Form-migration audit — runtime parity, CSS completeness, universal authoring concepts

**Date:** 2026-07-09
**Status:** shipped — all 9 remediation PRs merged (#851, #852, #854, #855,
#856, #857, #858, #859) plus the docs-only #860. Each fix branch also went
through a second adversarial pass (red team + Munger inversion + independent
checker) after this audit landed, which caught two real bugs the first pass
missed: below-note's `.cell-stage` detection (#851) and masthead-lift's
eyebrow extraction (#855) were both doing an unscoped/unanchored substring
match that a `<pre>`/nested-content case could fool — both hardened with a
depth-aware scan and regression tests before merge. #857 also gained a
permanent regression test for its runtime re-fire behavior, requested by
that same adversarial pass. The one exception is the `bg-image` runtime gap
(#860), intentionally left as a documented known limitation — see that PR's
rationale (no `marp-core` in this sandbox to verify a DOM-transform fix
against).
**Method:** 9-agent workflow — map (2) → live-render verify (2) → red team (3) → Munger inversion (1) → independent checker (1). Every "confirmed" finding below was reproduced by actually rendering (real engine / real jsdom execution of the real built `dist/lattice-runtime.js` / real headless Chromium computed styles), not by reading code alone.

## The question asked

> We did a lot of work in `lattice-emulator.js` migrating to Form. Did we neglect
> `lattice-runtime.js`? Is there parity? Is the CSS support for Form complete? Do we
> have gaps in universal authoring concepts (key insight blockquote, etc.)?

## Short answer

1. **Runtime neglected?** No, not for the core chain — `engineering/decisions/2026-07-08-runtime-form-default.md` (#837, shipped yesterday) already fixed the headline gap, and this audit's live-rendered re-verification confirms that fix holds. But the audit found **five more runtime-specific gaps** the 07-08 fix didn't cover (below).
2. **CSS support for Form complete?** **No.** This is the big finding. It's not a runtime-vs-emulator problem — it reproduces identically on `lattice-emulator.js` (i.e. the real engine export) too. `lib/forms/cell/masthead/masthead.transform.js` wraps a Form slide's body into `<div class="cell-stage">` for every `STAGE_MIGRATED` layout (cards-grid, list, kpi, decision, checklist, verdict-grid, and ~25 more), but several `base.modifiers.css` / `base.sketch.css` rules still assume the body sits as a **direct child** of `<section>`. Once Form (default since 2026-06-26) wraps the body one level deeper, those rules stop matching — silently, with no error.
3. **Key Insight / universal concepts?** Yes, confirmed broken, live-rendered with before/after computed-style proof, on the exact canonical example the docs point to (`test/integration/baseline-decks/gallery.md`, "Key insight + below-note · cards-grid").

## Part A — CSS completeness under Form (the bigger, more urgent finding)

All of these were verified by rendering real markdown through `lib/engine`/`lattice-emulator.js` and reading actual computed styles in headless Chromium — not just reading selectors.

| Concept | Breaks under Form? | Blast radius | Root cause |
|---|---|---|---|
| **Key Insight** (trailing `> blockquote`) | **Yes** | ~26 of 29 non-exempt layouts (corrected — see below) | `base.modifiers.css:174` direct-child selector; body now sits in `.cell-stage` |
| **Below-note** (trailing paragraph after list/table/blockquote) | **Yes** | Same ~13 layouts named in its CSS list | Root cause is **JS, not CSS**: `lib/transformers/registry.js` runs `mastheadLift` before `belowNote`, so `below-note.js`'s own wrap logic never even creates the `.below-note` div under Form (its end-anchor regex / `lastElementChild` check no longer matches once `.cell-stage`/`.cell-footer` follow) |
| **Annotation** (trailing italic footnote) | **Yes** | Same root cause as below-note, plus its own raw-form CSS fallback is *also* a direct-child selector | Compounds both bugs |
| **Universal Heat Overlay** (`.heat` state-color inversion) | **Yes**, for `ul`/`ol`-bodied layouts | `checklist`, `verdict-grid`'s list arm (table-based state marks are unaffected) | `base.modifiers.css:656-688` direct-child selector |
| **Sketch finish** (`mode: sketch`'s hand-drawn card boxes) | **Yes — the largest blast radius found** | ~14 layouts (cards-grid, cards-stack, verdict-grid, decision, matrix-2x2, pricing, compare-prose, citation-card, list-tabular, list, redline, checklist, actors, agenda) | `base.sketch.css` direct-child selectors never updated for `.cell-stage`; this silently guts sketch's headline visual feature (the boxes) across virtually every layout it targets, leaving only the handwriting fonts |
| **Subtitle** (h2 + trailing code-only paragraph) | **Yes — broader than first thought** | *Any* Form slide with an h2 title + subtitle, regardless of STAGE_MIGRATED/DEFERRED | Different mechanism: masthead-lift **unconditionally** extracts the h2 into the masthead band whenever a slide opts into Form, breaking `h2 + p` sibling adjacency even when the rest of the body is untouched (e.g. `diagram`, a STAGE_DEFERRED layout) |
| **Eyebrow** (leading code-only paragraph) | **Partially — a distinct correctness bug** | Any Form slide with both a genuine eyebrow and a trailing subtitle | `extractEyebrowP()` has no positional check against the h2 — it can misidentify a *trailing* subtitle as the *leading* eyebrow, reordering content in the DOM and mis-styling it |
| `dark`/`light`, `claim-hero`/`claim-bleed`/`claim-quiet` | **No — checked and confirmed fine** | — | These use descendant combinators (inherit through any nesting) or already ship the dual migrated/deferred selector pair |

**Two corrections the adversarial passes made to their own earlier findings** (this is what the red-team/inversion/checker structure is for):
- `redline` and `inventory` are **not** actually broken — both already ship their own dedicated, working `.cell-stage`-aware blockquote CSS (confirmed reading their `.styles.css`; `redline` even has a comment block titled "KEY-INSIGHT GATE" documenting the exclusion is deliberate). The initial "~28 of 30" count is corrected to ~26.
- Below-note's fix is **100% JS-side** — an already-existing, accidentally-unscoped `.below-note {}` rule in `compare-prose.styles.css` (no `.compare-prose` prefix) already styles the wrapper at any nesting depth, so once the JS wrap is restored, no CSS change is needed for below-note at all. (Flagged separately as its own fragility: that rule should be relocated/labeled so a future "scope this file" cleanup doesn't silently break 12 unrelated layouts.)

**A concrete fix-shape trap, flagged by inversion:** Marpit's CSS scoper rewrites a leading `:is(section.X, ...)` in a way that breaks under real Marp-preview rendering (documented gotcha already in the codebase). The correct fix for Key Insight/annotation/heat-overlay is a **literal comma-separated duplicate selector pair** — `section:not(...) > blockquote, section:not(...) > .cell-stage > blockquote` — mirroring the pattern already shipped for the Universal Pill rule (`base.modifiers.css:300-303`), **not** a collapsed `:is(section, .cell-stage)` shortcut.

**Also found, lower priority:**
- `.timeline` and `.principles` appear in the below-note/annotation selector lists but match no current layout token — dead code from a prior naming scheme, unrelated to Form (logged per HARD RULE #18, not folded into this audit).
- `below-note.js`'s JS-side `EXCLUDED` list and the CSS-side styled-allowlist have already drifted once (confirmed: `math` slides get wrapped in an unstyled `.below-note` div, detached from `math.styles.css`'s own rule family). A residual list of ~18 other layout names has the same on-paper exposure but wasn't individually verified.
- `masthead-lift.js`'s own file header comment ("Body is left as direct section children so components still compose") is **stale and contradicts its own code** below it — a genuine broken window, and plausibly *why* this whole bug class went unnoticed by readers trusting the comment.
- No existing test (`masthead-lift.test.js`, `below-note.test.js`, `focus.test.js`, `build.test.js`) combines Form with any of these concepts — that's the systemic reason none of this was caught.

## Part B — Runtime-specific parity gaps (new, beyond the 07-08 fix)

The core chain (`applyFormDefaultToDom` → `masthead-lift` → progress/watermark Tile docking) was re-verified live (real jsdom execution of the actual built `dist/lattice-runtime.js`, diffed against a real `lib/engine.render()` of the same markdown) and **holds up** — no regression there. But:

| Gap | Severity | Detail |
|---|---|---|
| `_focus: item N` / `_build: item` silently no-op on the runtime/DOM path | **Confirmed, high impact** | `focus.js`/`build.js`'s DOM axis resolver uses a strict `:scope > ul` selector; masthead-lift's now-correctly-firing `.cell-stage` wrap (itself only correct because of the 07-08 fix) moves the list one level deeper, so the DOM resolver finds nothing. The HTML/export path is unaffected (its string scan is depth-agnostic). This is a regression *exposed by* the 07-08 fix — before it, masthead-lift never ran on the DOM path at all, so this worked by accident. |
| `image` component has no DOM equivalent of `bg-image.js`'s `.lattice-bg`/`.image-text` wrap | **Confirmed** | Every image slide in live preview silently degrades to the "clean" floor composition. Directly contradicts a claim in `engineering/decisions/2026-06-25-runtime-emulator-consolidation.md` §2 that this kernel is fully shared. |
| Accessibility CVD texture `<defs>` never injected by the runtime | **Confirmed** | `lib/core/accessibility-textures.js`'s own header comment says "the runtime follows" — it never did. a11y-theme chart/diagram fills reference nonexistent pattern IDs in live preview. |
| `meta:`/deck-`logo:`/deck-`class:` front matter are one-shot boot-time fetches, never re-applied | **Confirmed** | Unlike progress/watermark (which the 07-08 fix explicitly moved into the recurring pass), these three fire once at boot and never again — a live edit can silently strip previously-shown chrome. Deck-logo is worse: its idempotency guard means an injected logo can never be updated *or removed* live once shown. |
| `masthead-lift.js`'s DOM selector (`section.form`) and `below-note.js`'s DOM selector (`section`, no class filter) aren't scoped to top-level sections | **Confirmed** | A literal nested `<section>` an author writes inside slide content gets double-processed on the live-preview path but is correctly left alone on the HTML/export path — the opposite of `form-default.js`, which does this correctly (`section:not(section section)`). |
| Titleless Form slide + per-slide `finish-*` class: `.backdrop` gets swept into `.cell-stage` on the runtime path only | **Confirmed, narrow scope** | Boot-order issue (`injectBackdrops()` runs before `runAllContentTransforms()`); the engine/export path is unaffected because its ordering is already correct. |

Six other capabilities (auto-split/pagination, `resolve-palette`, `resolve-token-expr`, `render-guard`, read-along build/VTT, prose-projection) were checked and confirmed **correctly** absent from the runtime by design — not gaps.

## Recommended sequencing (not yet started)

Per HARD RULE #17 (one feature = one branch → one PR), this is naturally several independent PRs, roughly in this priority order:

1. **Below-note JS fix** (registry ordering or end-anchor detection) — small, high-value, unblocks below-note + annotation together.
2. **Key Insight / Annotation / Heat-overlay CSS fix** — mechanical `.cell-stage`-aware selector-pair duplication, same shape as the shipped Pill rule. Bundle a rendered-output regression test (assert computed style, not just DOM shape) so future `STAGE_MIGRATED` growth can't silently reintroduce this.
3. **Sketch finish CSS fix** — same shape, larger surface area (14 layouts); arguably highest visual-impact item since it's a whole named finish's headline feature.
4. **Subtitle/eyebrow masthead-lift fix** — needs a small logic change (bound eyebrow extraction to before the h2; carry the subtitle into the band alongside h2, or add a `.masthead-lede h2 + p` selector arm).
5. **Runtime: focus/build item-axis fallback** — give the DOM axis resolver a `.cell-stage`-aware fallback.
6. **Runtime: meta/logo/deck-class re-fire on edit** — same fix shape as the already-shipped progress/watermark re-fire.
7. **Runtime: image `.lattice-bg`/`.image-text` DOM wrap**, **a11y texture defs injection**, **nested-section selector scoping** — three smaller, independent runtime-only fixes.
8. Housekeeping (log, don't fold in): dead `.timeline`/`.principles` selectors; below-note EXCLUDED-vs-CSS-allowlist drift audit for the ~18 unverified layout names; relocate the accidentally-unscoped `.below-note` rule out of `compare-prose.styles.css`; fix `masthead-lift.js`'s stale header comment.

## Verification artifacts

Live-render comparisons (Form vs. `no-form` control, on the real `test/integration/baseline-decks/gallery.md` fixture and a synthetic runtime fixture) were done via `node lattice-emulator.js` HTML sidecars + headless Chromium computed styles, and via loading the real built `dist/lattice-runtime.js` into jsdom. No permanent test files were added by this audit; a throwaway verification script was used and discarded (`.scratch/`, gitignored).
