- **Every chart figure is 128px wider and every diagram now lines up with its own
  title.** The stage owns the outer inset — a body owns only the spacing between its own
  elements — is now a named Forms invariant (`design/forms.md` §6.1). Chart and diagram were
  both re-deriving the frame inset with the same `calc(100cqi - 2 * var(--sp-2xl))` expression,
  and the chart stacked its own padding on top: a chart's figure sat 192px from the slide edge
  and a diagram's 128, against prose's 64. Both calc copies retire, `.chart-body` and the
  mermaid box fill their container exactly, and the chart's five per-chart inset tunings move
  to `.cell-stage` verbatim — so a chart's **berth is unchanged** and the block axis is
  neutral to the pixel (the `cqh` basis is the same number, subtracted one box higher), while
  the inline duplicate is reclaimed. A diagram's body now shares one left edge with its title,
  dek and Key Insight for the first time. The opt-in `canvas` glass panel keeps its inset and
  owns it in the `.canvas` rule, where a box that paints a surface earns one. Kept by two gates: `checkStageInsetOwnership`
  (`tools/check-ownership.js`, via `build:check`) and a measured inset assertion in
  `check-chart-fit.js` at landscape/portrait/square.
  The change is **inline-only**: a body's BLOCK padding turned out to be a clip margin, not an
  inset (`overflow` cuts at the padding box), and removing it clipped nine decks that had never
  clipped — so it stays, renamed for its job. The adversarial trio caught four override paths
  that had to be re-checked against the new tie (`no-form`, `canvas`, `claim-hero`/`claim-bleed`,
  a tall/strip `state-chart`), each now measured byte-identical to its pre-change render; and
  the reclaim exposed two boxes that were bigger than their container by construction —
  **gantt**'s SVG (a `max-height: 100%` that never bound) and **matrix-grid**'s figure
  (`width: 100%` plus a `padding-left` under content-box sizing) — both fixed here.
  `npm run overflow:check` is clean: zero newly-clipping pages across 268 decks.
  `engineering/decisions/2026-08-11-stage-owns-the-outer-inset.md`. (#1598)
