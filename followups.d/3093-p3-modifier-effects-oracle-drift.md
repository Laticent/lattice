---
origin: 3093
priority: P3
recorded: 2026-11-08
area: infra
severity: low
swimlane: lib/core/modifier-effects.generated.json
source: https://github.com/Laticent/lattice/pull/3093
deferred: off-path — four components this PR does not touch; re-blessing them needs the commit that moved each one
---

# Four modifier-effects entries drifted from the render

why now   — #3093 fixed the probe reading the page number as an effect (it set `paginate: false`). A full `node tools/check-modifier-effects.js` run after that still disagrees with the committed oracle on `gantt`, `radar`, `split-compare` and `video` (and on `premise`, which `2367-p3-premise-modifier-effects-drift.md` already tracks). Seven newer components are unmeasured, which the tool allows. The editor's `_class:` completion reads this file, so it offers or hides modifiers on those four by stale data.
where     — `lib/core/modifier-effects.generated.json`, the four entries; find the commit that changed each one so the re-bless is justified, not blind.
done when — `node tools/check-modifier-effects.js --only=gantt,radar,split-compare,video` agrees with the committed entries.
evidence  — the check's drift lines before and after.
verify    — tier 0; `npm test` covers the file's shape only.
