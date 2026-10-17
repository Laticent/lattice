---
origin: 2749
priority: P4
recorded: 2026-10-17
source: https://github.com/Laticent/lattice/pull/2749
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-npm-plugin-threat-model.md §6
---

# Decide how a plugin that returns data is bounded, before the npm door admits one.

why now   — the owner said on 2026-10-17 that plugins can return data, with or without a
            rendered fragment, and that the data can become attributes on the page or in the
            shared context beyond the plugin's own fragment. The plugin plan has no such point
            (the nearest are `data`, `services`, `registers` and `providers`), and the note's
            sanitizer and harness only cover a rendered fragment.
where     — engineering/decisions/2026-10-16-npm-plugin-threat-model.md §6 decision 10 (the
            proposed bounds); engineering/decisions/2026-09-27-plugin-system.md §4.3 (the
            contribution points); lib/plugins/resolve.js (declared equals contained);
            docs/src/lib/sanitize-slide-html.js and lib/core/sanitize-style-text.mjs (HARD RULE
            #22).
done when — the limits on attachable data are fixed (names, lengths, which elements; the owner decided on 2026-10-17 that the host sanitizes and attaches, never the plugin); the plugin plan names the new
            contribution point; the host disables a plugin that injects script and alerts the user; CSS from a plugin
            goes through sanitizeStyleText; the canary's data-return case exists and goes red when a
            bound is removed.
evidence  — the owner's recorded decision, then the canary run red with a bound removed and green
            with it restored.
verify    — tier 2 adversarial trio, because it adds a channel into the page that bypasses the
            fragment sanitizer.
