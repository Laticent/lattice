- **Charts now sit at the frame inset — the same 64px margin as prose, code and diagrams.**
  #1598 removed one of the chart's three inline insets and left the second, on the belief that
  a chart's wider berth was a deliberate design choice. It was not: the retired width calc's own
  comment justified it as a *sizing* workaround, the padding line carried no comment at all, and
  the nearest thing to a defense was the opt-in glass panel adopting "its **existing** padding" — a
  value already there for an unrecorded reason. Two measurements retired it, cutting in opposite
  directions. A **height-bound** SVG chart letterboxes to its box, so the inset was dead space —
  a quadrant renders pixel-identical at 64 and at 128. A **width-bound** one was *losing drawing
  size* to it: gantt's SVG grows 1024×238.9 → 1152×268.8, and gantt, map and word-cloud each
  repaint 5–10% of the slide. And it was an **alignment defect**: the masthead's hairline spans
  the full frame, so a chart at 128 read visibly narrower than the rule directly above it — the
  same misalignment the diagram had. Bars, kanban lanes, table columns and status pills now share
  edges with the rule and the title, and the opt-in **canvas** glass panel follows the frame with
  them (landscape 1024→1152, portrait 864→972), its own internal berth unchanged. Three per-chart
  overrides were **deleted** rather than added: the family's tall/strip value pulled *in* from the
  landscape default; state-chart's held a specificity tie whose both sides are now zero;
  timeline-list-tall's pushed *out* to three times the family's tall/strip berth, which is
  precisely the extra room this retires.
- **`claim-bleed` on a card- or table-bodied chart now warns, and no longer runs content to the
  trim edge if you do it anyway.** The house rule is that prose-dense layouts opt out of bleed via
  their manifest `excludes`, which makes `lint:deck` warn you off to `claim-hero` — but only
  matrix-grid had ever declared it. **progress, kanban, timeline-list, roadmap and journey now
  declare it too**, so the warning finally fires for them. And because that is a warning rather
  than an error, the render is made safe as well: those six floor at the frame's safe inset, the
  same berth the header and footer bands use, while SVG charts and the self-scaling state-chart
  bleed as intended. Before this, a `kanban claim-bleed` sliced its first card's corner and shadow
  at x=0 and a `journey claim-bleed` put an actor badge 4px from the paper — invisible until now
  because the chart's own 64px inset had been silently flooring every bleed.
- **Fixed: a journey mood marker no longer hangs off its own track — and still lands on its own
  gridline.** The portrait variant plotted the face at `left: ((mood − 1) / 4) × 100%`, so a mood-5
  face was centered **on** the track's right edge with half of it outside; the old chart padding was
  simply wider than the overhang. The 1–5 scale now maps across the track less one face width, and
  the gridlines are inset by that same half-face, so a face still sits exactly on the line for its
  value — a mood chart's whole contract is that position *is* the value. `npm run check:chart-fit`
  is down to 3 clips (from 4, and 5 before this line of work); `overflow:check` is clean across all
  268 decks. `engineering/decisions/2026-08-11-stage-owns-the-outer-inset.md`. (#1598)
