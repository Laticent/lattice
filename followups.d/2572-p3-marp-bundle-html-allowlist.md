---
origin: 2572
priority: P3
recorded: 2026-10-07
source: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md § 11
---

# Replace the Marp bundle's HTML denylist with an allowlist

why now   — the bundle now strips a deck's own script with a denylist (lib/core/live-author-html.js
            `withoutLiveAuthorHtml`). The red team found no evasion, but a denylist breaks quietly
            on the tag nobody remembered (`<base>` nearly was one).
where     — lib/core/marp-bundle.js (`marpConfigCjs`, the runtime `<script>` tags); a marp-cli
            `engine:` plugin that loads the runtime; marp-core's `html` allowlist option.
done when — the bundle renders with `html` set to an allowlist of the tags and attributes Lattice
            decks use, the runtime loads without raw `<script>` tags, and the 418 shipped decks
            render the same through the bundle.
evidence  — the § 11 marp-cli listener probe, before and after; a per-deck diff of the bundle HTML.
verify    — tier 2 trio: it changes an exported artifact on a security boundary.
