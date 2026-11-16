- **Every brand theme now curates its own status colors.** On a light slide each status gets a deep fill in the
  theme's own hue, the slide's paper as the text on it, and the fill as its border, clearing 4.5:1 against every
  surface it sits on (the slide, a card, a hero tile, its own row tint, a kanban card), so it reads at the back of a
  hall. On a dark slide a status matches the category colors beside it, in the theme's own hues and at its palette's
  strength, with white text and a rim in the status color, so a status chart and a category chart read as one design
  language. Blocked is red on every theme, and on a light slide at risk sits visibly lighter than blocked,
  except on concrete, whose mid-gray slide forces every fill near-black. Done is a deep sage in the theme's own green, deferred a gray in the theme's own neutral (warm on cuoio, mustard and
  burgundy). Before, the status fills were near-identical across themes (warn was the same color in eight of fourteen).
  The `a11y-*` palettes keep their tokens. Decks need no edits.
  (engineering/decisions/2026-11-16-status-triplets.md; `node tools/curate-status-triplets.js`)
- **Status fills are no longer dimmed on top.** On a dark slide the risk matrix's bands and key, and a slope chart's
  signal lines, wear the status fill as the theme curated it instead of one taken 28-42% toward the slide, on every
  palette, the `a11y-*` ones included.
- **Under the tone finish a status keeps its curated color.** A tone status chart used to show each status as a 30% /
  35% wash, faded next to its pie on a light slide and all but gone on a dark one. It now wears the curated fill on a
  light slide and 88% of it on a dark one, with the status's own text ink on both.
- **Concrete's light status rows are a quieter tint** (10%), so a status disc stands off its row on concrete's
  mid-gray slide.
