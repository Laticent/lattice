- **Every brand theme now curates its own status colors.** On a light slide each status gets a deep fill in the
  theme's own hue, the slide's paper as the text on it, and the fill as its border, clearing 4.5:1 against every
  surface it sits on (the slide, a card, a hero tile, its own row tint, a kanban card), so it reads at the back of a
  hall. On a dark slide a status matches the category colors beside it, in the theme's own hues and at its palette's
  strength, with white text and a rim in the status color, so a status chart and a category chart read as one design
  language. Blocked is red on every theme, and on a light slide at risk sits visibly lighter than blocked,
  except on concrete, whose mid-gray slide forces every fill near-black. Before, the status fills were near-identical across themes (warn was the same color in eight of fourteen).
  The `a11y-*` palettes keep their tokens. Decks need no edits.
  (engineering/decisions/2026-11-16-status-triplets.md; `node tools/curate-status-triplets.js`)
- **Status fills are no longer dimmed on top.** On a dark slide the risk matrix's bands and key, and a slope chart's
  signal lines, wear the status fill as the theme curated it instead of one taken 28-42% toward the slide, on every
  palette, the `a11y-*` ones included.
- **Under the tone finish a status reads beside its category shades.** A status keeps its own hue under tone at one
  level, now 40% on a light slide and 88% on a dark one (was 30% and 35%), so a tone status chart no longer looks faded
  next to its pie, and no longer all but vanishes on a dark slide.
- **Concrete's light status rows are a quieter tint** (10%), so a status disc stands off its row on concrete's
  mid-gray slide.
