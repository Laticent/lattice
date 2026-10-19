---
origin: 2749
priority: P3
recorded: 2026-10-19
source: https://github.com/Laticent/lattice/pull/2800
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-npm-plugin-threat-model.md §6.1
---

# Give a plugin's returned values a surface that shows them.

why now   — the returns channel is built and checked in both doors, but nothing the host draws reads it. A deck's own
            CSS can select on `data-returned-<plugin>--<field>`; the plugin's own `styles.css` cannot, because the CLI
            embeds component sheets only (`lattice.js`, the plugin loop delivers none) and the Studio keeps a zip
            plugin's sheet "for a later step" (`asset-bundle.ts`). Markdown values are never rendered, although owner
            decision 11 says the host renders them; `renderReturnMarkdown` has no caller. Found by the inversion review.
where     — lib/packages/plugin-returns.mjs `renderReturnMarkdown`; lattice.js (plugin styles); docs/src/components/studio/asset-bundle.ts.
done when — the owner has picked the surface (recommended: the host fills a named slot the plugin's own fragment
            leaves, `<lattice-value name="summary">`, with the rendered markdown or the text, through the slide
            sanitizer), and a plugin's `styles.css` reaches every export through `sanitizeStyleText` (HARD RULE #22).
evidence  — a demo deck (HARD RULE #9) whose plugin shows a word as a styled badge and a markdown value as a table,
            rendered dark and light.
verify    — maker-checker; the adversarial trio if the slot adds a new markup sink.
