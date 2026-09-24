---
origin: 2355
priority: P2
recorded: 2026-09-24
---

# Let an author choose the state chart's edge style and flow per slide

```text
  P2 · [no ticket] Author controls for how a state chart's edges look and which way it flows.
       why now   — the owner asked for it on review of #2355 ("change edge style and how edge
                   lines flow via inline code above the diagram or via a modifier like lr/tb").
                   Today an author has one edge-style switch (`curved`) and two direction pins
                   (`lr`, `tb`); everything else is chosen by the fit.
       where     — state-chart.transform.js: STATE_CHART_VARIANTS, buildDefault (stamps
                   data-sc-style / data-sc-fit), the routers (gridLayout, dagrePositions, the
                   `curved` branch of the path painter); state-chart.manifest.json variants;
                   lib/authoring/lint-core.js if a new token needs a lint (HARD RULE #7).
       done when — an author can set, per slide and without CSS, at least: the edge style
                   (orthogonal, curved, and straight point-to-point) and the flow (lr, tb, and
                   the reversed rl / bt), plus whether a long chain may wrap. The docs, gallery
                   and a demo deck (HARD RULE #9) show each setting.
       evidence  — renders of every style × flow on a 4-, 8- and 12-state machine; the
                   crossing and label-collision probes from #2355 (.scratch/rt/lab.cjs) clean.
       verify    — tier 1: render + probe; the real Playground for the edit path.
```

## Design questions to settle before code (design-before-code)

1. **Where the setting lives.** Modifiers on the `_class` line (`state-chart tb curved`)
   are the component's existing channel, and every other chart takes its options this way.
   "Inline code above the diagram" collides with the EYEBROW: a leading inline-code line
   on a slide is already the kicker (`lib/base/base.docs.md`). Options: (a) more modifiers
   (`straight`, `rl`, `bt`, `nowrap`); (b) a key/value line INSIDE the chart's list, e.g. a
   first bullet `` `edges: curved · flow: tb` ``, which the transform consumes; (c) a
   deck-level `state-chart:` front-matter register for a house style. A modifier set is
   the cheapest and matches `lr`/`tb`; (b) or (c) scale better if the list grows.
2. **What "flow" means.** Direction (lr / tb / rl / bt) and wrap (allowed / never / fixed
   line count, e.g. `rows-2`) are separate axes. The fit should still pick whatever the
   author leaves unset.
3. **Straight edges on a grid.** A point-to-point diagonal crosses nodes on a wrapped grid;
   either straight edges disable wrapping or they route around nodes.
4. **Per-edge style.** Whether one transition can be styled on its own (e.g. a dashed
   "exception" edge), or only the whole chart.
