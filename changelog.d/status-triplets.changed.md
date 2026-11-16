- **Every brand theme now curates its own status colors: a fill, the text on it, and its border.** Status pills,
  progress bars, gantt bars, state tiles, checklist and roadmap discs, kpi pills, policy badges, regulatory-update
  tiers and the risk matrix read the theme's triplet. The fills are deep on the light face and glow on the dark one,
  each clearing 4.5:1 against every surface a status mark sits on (the slide, a card, a hero tile, its own
  row tint and a kanban card), so a status still reads at the back of a hall in a lit room. Before, the
  dark faces measured 2.1-2.6:1 there, and the status fills were near-identical across themes (warn was the same
  color in eight of fourteen). The hues come from each theme's own brand and chart colors. The text on a status is
  the slide's paper on light and its night on dark, at AA. Carbone's dark status rows and concrete's light ones are quieter tints (12% and 10%), and
  kanban's dark cards sit a step closer to the slide, so a status disc or pill stands off what it sits on. The `a11y-*` palettes are unchanged. Decks need no
  edits. (engineering/decisions/2026-11-16-status-triplets.md; `node tools/curate-status-triplets.js`)
