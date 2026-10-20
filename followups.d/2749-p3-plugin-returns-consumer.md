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
decided   — HOST SLOTS (owner, 2026-10-20): "host slots for d3 ( i am thinking `${ket}` gets replaced)". The plugin's
            drawing holds `${key}` where a returned field should show, and the host swaps in the checked value: a
            text, word, number or flag value as plain text (so `<b>` shows literally), a markdown value as the
            host's own rendered, sanitized HTML. Default unless the owner says otherwise: a placeholder works in
            visible text only, never inside an attribute such as `href` or `style`, so a returned value cannot
            become a link or a style.
done when — `${key}` slots are filled on every surface (CLI and Studio) with the rule above; a `${name}` that is
            not a declared field stays as written; and a plugin's `styles.css` reaches every export through
            `sanitizeStyleText` (HARD RULE #22).
evidence  — a demo deck (HARD RULE #9) whose plugin shows a word as a styled badge and a markdown value as a table,
            rendered dark and light.
verify    — maker-checker; the adversarial trio if the slot adds a new markup sink.
