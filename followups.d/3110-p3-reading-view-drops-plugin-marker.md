---
origin: 3110
priority: P3
recorded: 2026-11-09
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-media-plugins.md §4.5
source: https://github.com/Laticent/lattice/pull/3110
deferred: off-path — how plugin output reads in the reading view is #2725's P5 (withPlaceholderNotes, branch claude/plugin-inline-door-followups); reshaping the projection here would collide with that work
---

# The reading view copies a plugin's output as plain text and drops its `[data-lattice-plugin]` root

why now   — PR #3110's Studio attack spec exported the webpage (Share → Webpage) of a deck where a zip plugin writes
            `https://attacker.example/…` bullets. Every slide kept the plugin's output inside its root, and nothing built an
            address from it (0 requests, the only QR is the author's). But `#lp-article`, the reading document the
            projection builds (`lib/transformers/prose-projection.mjs`), repeats the plugin's bullets as ordinary `<li>`s,
            without the root. They are text today and no pass reads `#lp-article` for an address, so nothing leaks; but a
            later pass over the reading document could not tell them from the author's bullets (spec/LPM.md §10).
            The same happens on `main` for a plugin on any ordinary slide: this PR did not cause it.
where     — `lib/transformers/prose-projection.mjs` `projectGeneric` (the list and paragraph lift).
done when — the projection keeps a plugin's output inside an element carrying `data-lattice-plugin` (or leaves it out with a
            note), and `docs/e2e/plugin-address-attack.spec.ts`'s webpage check drops its `#lp-article` allowance.
evidence  — the webpage export of the attack spec's deck: no attacker address outside a plugin root, `#lp-article` included.
verify    — the real Studio (Share → Webpage), HARD RULE #23.
