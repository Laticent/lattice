- **The Playground's Mode row now renders.** It was listed in the panel's field profile
  but its host never passed the mode vocabulary the row is gated on, so the control was
  configured and never drawn.
- **Studio lists no longer waste ~40px of every row's left edge.** The scoped island reset
  stands in for Tailwind's Preflight but never zeroed list padding, so any structural `<ul>` —
  the Speech tab's lexicon and acronym rows among them — kept the browser's default indent. On
  a 390px phone that was a tenth of the screen. Prose lists in Architect replies keep their
  bullets.
