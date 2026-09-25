---
origin: 2367
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2367
---

# premise's modifier-effects entry drifted from the render

why now   — `node tools/check-modifier-effects.js --only=premise` measures `surfaces: [heading]`, `inert: [eyebrow]`; the committed `lib/core/modifier-effects.generated.json` says `surfaces: []`, `inert: [eyebrow, heading]`. The editor's `_class:` completion reads this file, so it hides heading modifiers on premise slides that do change the render. Found on `main` at 53e3591 while re-blessing for #2367, which does not touch premise.
where     — `lib/core/modifier-effects.generated.json` (the `premise` entry); find which commit changed premise's heading so a re-bless is justified, not blind.
done when — `npm run check:modifier-effects -- --only=premise` agrees with the committed entry, and the PR names the commit that moved it.
evidence  — the check's output before and after.
verify    — tier 0; `npm test` covers the file's shape only.
