- `tools/audit-diagram-contrast.mjs` — an on-demand audit of what Mermaid actually paints
  across every palette in both color schemes. Reports the **non-text** contrast tier
  (WCAG 1.4.11's 3:1 floor on strokes, edges, axis rules and grid lines), which no gate
  covers, judging a shape by whether *any* of its candidate edges clears the floor rather
  than by a single pair. Also runs a **lever census** against Mermaid's own
  `base.getThemeVariables`: it sends a sentinel for every color key, alone and alongside
  the engine's full `themeVariables` set, and reports which survive — so "can we control
  this?" is a measurement instead of a guess.
