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
            sanitizer only covers a rendered fragment (the canary's data-return case is §5.2 part 4).
where     — engineering/decisions/2026-10-16-npm-plugin-threat-model.md §6 decision 10 (the
            open limits); engineering/decisions/2026-09-27-plugin-system.md §4.3 (the
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

Status 2026-10-19 (the npm-plugin-safety PR): still blocked on the owner's limits. No host surface exists for a
THIRD-PARTY plugin to return data: `meta` (2026-10-17-meta-record.md §5.7) is first-party, and its D11 defers which
field types a zip or npm plugin may declare to this item. The channel is now pinned shut by a hard canary test
(`DATA RETURN, SHUT TODAY`): the gate refuses a zip plugin that contributes `meta`, `registers`, `providers`,
`services` or `data`, and the real door draws nothing for a renderer that returns an object. A mutation that admits
`meta` turns it red. The `todo` test stays for the day the surface opens.

Proposed limits, for the owner to accept or change (taken from meta-record §5.7's per-type guards):
  - field types a third-party plugin may declare: enum or register word, flag or number, and text. Not CSS-valued and
    not URL: those are the two types with a fetch or a style sink behind them.
  - names: `[a-z][a-z0-9-]{0,31}`, never a core record field, emitted only as `data-<plugin>-<name>`.
  - at most 16 fields per plugin, 256 characters per text value after control and bidi characters are removed.
  - on the slide's own `<section>` only; never the deck context in v1.
  - a value that fails its type, a name outside the declared set, or anything shaped like markup in a text value
    disables the plugin for the render, with an alert naming it (decision 10's "detect and disable").

