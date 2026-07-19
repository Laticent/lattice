---
status: shipped
summary: After the #1059 divider merged, on-device use surfaced four issues — the first slide had no line (inconsistency), the controls had no physical grouping, the context-sensitivity was shallow (a body slide offered H1, a title slide would offer a list), and the look wasn't settled. We ran a 5-way VISUAL design competition (Editorial hairline · Segmented control · Floating command pill · Spectrum trim rail · Notched tab), rendered all five live in a comparison artifact, and the user picked a HYBRID: Register's circular structural caps on the line + Halo's floating content pill. The shipped divider is a COLUMN — a full-width hairline carrying circular caps (collapse left, delete right) on EVERY slide (the structural register), and, only on the ACTIVE slide, a floating rounded pill (context Format group · divider · insert · settings — the content register). SHAPE (circle vs rounded pill), not color, tells the two registers apart, so the split is colorblind-safe (load-bearing, per the user). Only the active slide's pill ever shows, so the accent bloom never becomes a column of glows. Separately, the HEADING register is now grammar-driven: the slide `_class`'s heading slot (from `dist/docs/grammar.json`, built from the component manifests) decides H1 (title family) vs H2 (body) — never both — threaded studio.astro → StudioShell → ComposeView → registers.ts; unknown classes stay permissive; eyebrow/subtitle/insight/note stay block-driven (they're base modifiers the engine renders on any class). Verified on the real Studio surface at 390/1440, light+dark: caps on every slide, pill only on active, H1-only on the title, H2-only on content, collapse/delete-confirm/apply all work. registers.test.ts covers the grammar cases (19 pass).
---

# Compose divider — the design competition, the hybrid, and grammar-driven registers

**Date:** 2026-07-19
**Status:** Shipped (branch `claude/rich-editor-mobile-ux-uendce`, follow-on to #1059).
**Surface:** `docs/src` Studio Compose editor (`ComposeView.tsx`, `registers.ts`, `studio.astro`, `StudioShell.tsx`).

## Problem

#1059 shipped the "divider is the control bar" rework, but device testing surfaced four issues the
user named directly:

1. **Inconsistency** — the first slide had no line; every other slide did.
2. **No physical grouping** — the controls floated with no button-group container or dividers.
3. **Shallow context-sensitivity** — the Format group keyed on the caret's block type only, so a body
   slide offered **H1** (breaking the single-title rule the user hit on slide 2) and a title slide
   would offer constructs its grammar forbids.
4. **Unsettled look** — the flat grouped bar wasn't the intended feel.

## The design competition

The user asked for "5 killer 10/10 designs" for the line + icon-button look, in a FIXED layout they
specified (line on top, collapse left / delete right on the line, a centered compact pill below,
grouped or divided, same-size icons). Because the named `design-competition` workflow returns design
*documents* (and the user had been burned before by ASCII-instead-of-visuals), we ran a **visual**
variant: 5 parallel agents, each committing to a distinct visual thesis, each returning injectable
HTML+CSS (scoped to a prefix) rendered against the real studio tokens. The five:

1. **Editorial hairline** — whisper rule, monochrome, accent only on the active register's underline.
2. **Register** — a native segmented control; the active register a solid filled segment.
3. **Halo** — a floating command pill on a soft accent bloom; the active register a solid accent chip.
4. **Spectrum trim rail** — the line becomes the deck's spectrum ribbon.
5. **Notched tab (Cradle)** — the line dips into a bracket that seats the pill (line+pill as one).

All five were assembled into one live, theme-toggleable comparison artifact (both a title and a
content slide, real prose, real tokens) for the human pick — not a wall of code.

## The pick: a hybrid, and why the shape split is load-bearing

The user picked a **hybrid**: **Register's circular structural caps on the line** + **Halo's floating
content pill**. When first scored, the reviewer flagged the circle-vs-rounded-rect mismatch as an
inconsistency — the user corrected this, and the correction is the key design insight:

> The collapse toggle and delete are a genuinely different register than formatting and settings.
> Distinguishing them by **shape** is deliberate and **colorblind-safe** (color would not be); the
> shape distinction is load-bearing.

So the shipped divider encodes **two registers by shape, not color**:

- **Structural register** — collapse (left) and delete (right) as **circular** caps sitting on the
  hairline of **every** slide. Structural/destructive, deliberately quiet; delete reddens only on
  hover/confirm.
- **Content register** — the context Format group, a grouping divider, then insert + slide-settings,
  as a **rounded pill** floating below the line, shown **only on the active slide**, with a soft accent
  bloom. Only the active slide's pill is ever rendered, so a long deck never becomes a column of glows
  (the "always-on halo" worry dissolves). The active register is a **solid accent chip** — the block
  style in effect is always legible.

This directly answers all four complaints: consistency (line on every slide, first included), physical
grouping (pill container + divider), the shape-coded register split, and a settled, boardroom look.
"Caps on every line, pill on active" was the user's explicit call.

## Grammar-driven heading register

The context-sensitivity fix the user asked for: *"driven by the grammar and semantics of how the slide
is authored."* Research (`engineering/` scratch) confirmed a machine-readable per-class grammar already
exists — each component manifest's `slots` (surfaced in `dist/docs/grammar.json`) declares its heading
slot: `title` → `h1`, `content`/`cards-grid`/`closing`/`divider`/`split-compare` → `h2`, `big-number`
→ none. So the **heading register** is now grammar-driven:

- At the docs-site build, `studio.astro` reads `grammar.json` and derives `slideHeadings: Record<class,
  'h1'|'h2'>` from each class's heading/title slot selector. Threaded → `StudioShell` → `ComposeView` →
  each `SlideView` (a `getHeadings` closure over a ref, read live in `syncFormat`).
- `applicableRegisters(state, headings)` calls `slideClassOf(ctx.slide.attrs.directives)` and offers
  the class's heading: `'h1'` → `[H1]`, `'h2'` → `[H2]`, **never both**. So you cannot apply an H1 on a
  body slide or an H2 on a title. A class **not in the map** (unknown, or one with no heading slot)
  stays **permissive** (both) — the control is never silently dropped on an unrecognized class.
- **Scope decision:** only the HEADING register is grammar-gated. Eyebrow / subtitle / key-insight /
  below-note are BASE modifiers the engine renders on *any* class (not per-component slots), so gating
  them by slots would diverge from what the engine actually renders — they stay driven by the caret's
  block context (a code label adjacent to a heading, a trailing blockquote, a trailing em-dash).

One source of truth (HARD RULE #1): Compose reads the same slot contract the engine renders from, so
the two can't drift.

## Verification

**Verified on the real Studio surface** (built docs, real Playground, real `page.mouse` clicks that
move the ProseMirror selection — a DOM range does not, HARD RULE #23), at **390 px and 1440 px, light
and dark**:

- Line + circular caps on **every** slide (first included); the floating pill only on the **active**
  slide.
- **Grammar:** the title slide (h1) offers **only H1**; every content slide (h2) offers **only H2** —
  probed per-slide on the live editor.
- Collapse toggles (chevron flips), the in-place delete confirm shows and cancels, and applying H2 on a
  paragraph converts it — all still work after the DOM restructure.
- `registers.test.ts` — 19 cases incl. the grammar heading map and the permissive-unknown fallback;
  existing no-map callers keep the permissive default. Typecheck + biome + build:check clean.

## Adversarial trio (red team · Munger inversion · independent checker)

Run against the shipping state (`d5a2ff9`). Findings folded in:

- **CRITICAL (red team + checker) — prototype-chain crash → silent data loss.** A slide classed
  `<!-- _class: constructor -->` (or `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`) made
  `headings[cls]` resolve to a FUNCTION up `Object.prototype`; the unguarded `[...gh]` threw, propagated
  out of `view.updateState`, and **skipped the source emit on every keystroke** — the author's edits
  never reached `source`/preview/persistence (or, on slide 0, downgraded the editor to the raw textarea).
  Fixed: `headingKeysFor` guards with `Array.isArray(gh)` and only gates an EXPLICITLY-classed slide
  (classless → permissive, so an author isn't stranded from H1), using the LAST `_class` (engine
  semantics). Plus defense-in-depth: `formatSyncPlugin` wraps each `syncFormat` in try/catch so no
  kernel throw can ever wedge the emit again. Verified on the real surface (no crash, no textarea
  fallback, zero throws, permissive keys). `registers.test.ts` covers all four prototype names + the
  classless + last-wins cases.
- **MINOR (inversion + red team) — classless slide stranded from H1.** An unclassed slide defaulted to
  `content`→H2-only, blocking H1 from the pill. Now classless → permissive (same fix as above).
- **MINOR (red team) — non-active delete displaced the caret.** With the delete cap on every line,
  deleting a slide OTHER than the caret's flung the caret to doc start (full-doc replace). `commit` now
  re-anchors the caret to its slide by node identity across the rebuild.
- **a11y (inversion) — disclosure + grouping not in the tree.** Added `aria-expanded` to the collapse
  cap and `role="group" aria-label="Slide"` to the line (the structural register as a named set).

**Surfaced as decisions / logged (not silently changed):**
- **Layout jump → RESOLVED (user chose "reserve the space").** The pill appeared on focus, pushing
  content down ~37px. Raised as a decision; the user chose to reserve the pill's space on every slide
  (`visibility:hidden`+`opacity:0`, not `display:none`, so it fades in place) — the bar height is now
  constant and focusing a slide reflows nothing (verified: a reference slide's top is pixel-identical
  whichever slide is active). Trade-off accepted: each non-active slide's line sits in a slightly taller
  zone.
- **Grammar gate is on the pill, not the `#` input rule** — an author can still type `# ` on a body
  slide and produce an H1 the grammar forbids (the live preview + deck lint still flag it). Design gap,
  logged.
- **H3–H6 headings** show as "H2" in the pill and normalize to a paragraph on click (`activeRegister`
  maps `level>1`→h2; the register vocab is H1/H2). Pre-existing, low value; logged.
- **Shape distinguishes register, not safe-vs-destructive** — delete and collapse share the circular
  cap; the two-step in-place confirm (not shape) is the mis-delete safeguard, which is correct.

## Follow-ups (logged, not blocking)

- The orphan code-label affordance from the #1059 checker (a `` `code` `` paragraph cut off from its
  heading can't clear its mark from the divider) remains open — a "clear label" affordance is the fix.
- A class KNOWN to have no heading slot (e.g. `big-number`) currently falls to the permissive both-
  headings default rather than offering neither. Acceptable today; revisit if it misleads.
