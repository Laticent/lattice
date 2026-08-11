- **Charts now sit at the frame inset — the same 64px margin as prose, code and diagrams.**
  #1598 removed one of the chart's three inline insets and left the second, on the belief that
  a chart's wider berth was a deliberate design choice. It was not: the retired width calc's own
  comment justified it as a *sizing* workaround, the padding line carried no comment at all, and
  the only defense anywhere was the opt-in glass panel adopting "its **existing** padding" — a
  value already there for an unrecorded reason. Two measurements retired it. For the eight
  SVG-bodied charts the inset bought **nothing** — they letterbox to their box, so a quadrant
  renders pixel-identical at 64 and at 128. And it was an **alignment defect**: the masthead's
  hairline spans the full frame, so a chart at 128 read visibly narrower than the rule directly
  above it — the same misalignment the diagram had. Bars, kanban lanes, table columns and status
  pills now share edges with the rule and the title. Three per-chart overrides were **deleted**
  rather than added (tall/strip's pulled *in* from the old default; state-chart's and
  timeline-list-tall's held a specificity tie whose both sides are now zero).
- **Fixed: a journey mood marker no longer hangs off its own track.** The portrait variant plotted
  the face at `left: ((mood − 1) / 4) × 100%`, so a mood-5 face was centered **on** the track's
  right edge with half of it outside — always, at every deck size; the old chart padding was
  simply wider than the overhang. The 1–5 scale now maps across the track less one face width, so
  a marker at either extreme sits inside it. `npm run check:chart-fit` is down to 3 clips (from 4,
  and 5 before this line of work); `overflow:check` is clean across all 268 decks.
  `engineering/decisions/2026-08-11-stage-owns-the-outer-inset.md`. (#1598)
