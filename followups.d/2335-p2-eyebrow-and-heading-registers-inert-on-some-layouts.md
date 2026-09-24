---
origin: 2335
priority: P2
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2335
---

# The eyebrow, heading and table registers do nothing on some layouts

why now   — `npm run check:modifier-effects` measured it: an author's `eyebrow:` / `rule:` / `headline:` / `with-period` / `table-*` choice silently does nothing on these layouts, and the editor now hides those modifiers there, so the gap is invisible rather than fixed. Eyebrow: contact, premise, scatter, split-compare, split-panel, video, wifi. Heading (`rule-*`, `head-*`, `with/no-period`): compare-code, contact, image, premise, split-compare, split-panel, video, wifi. Table: contact, split-compare, video, wifi.
where     — `lib/base/base.accent-finish.css` (the eyebrow rule matches a code-only `<p>` FOLLOWED by a heading/list/pre; these layouts place the kicker elsewhere) and each layout's own heading styles; measurement in `lib/core/modifier-effects.generated.json` (`inert`).
done when — each listed layout either honors the register (and `check:modifier-effects --only=<name> --bless` drops it from `inert`) or its docs say the register does not apply there, by decision.
evidence  — PR #2335 decision note, engineering/decisions/2026-09-24-positional-class-completion.md §What the proof found.
verify    — `npm run check:modifier-effects -- --only=contact,premise,scatter` and read the `inert:` column.
