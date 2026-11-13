---
origin: 3095
priority: P1
recorded: 2026-11-09
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-09-type-voices.md
deferred: large — exemplars per sector, scored, plus the `minimal` set and its preset mapping; the four sets themselves shipped
---

# Curated type: score the sets on real decks per sector, and ship `minimal`

why now   — `typography:` and its four sets (classic, ledger, poster, festival) shipped with the theme × set gate (type-voices note § Shipped). Two things the owner's ruling named are still open. Sector defaults are a hypothesis, not a ruling (§ Decided, item 8): nobody has rendered real exemplar decks per sector in their proposed set and scored them. And `preset: minimal` still gets classic type, because its own set (Inter throughout) is not one of the first four (item 3).
where     — `exemplars/` (two or three decks per sector); `tools/type-voice-audit.mjs --typography` to score them; for `minimal`, lib/core/resolve-typography.js, lib/base/base.typography.css and the preset table in lib/core/front-matter-key.js.
done when — each sector has two or three exemplars rendered in its proposed set, light and dark, scored with the study's §8 formulas, and the owner has said which set each sector defaults to (or that none does); a `minimal` set passes `test/integration/type-voices/typography-sets.test.js` and `preset: minimal` carries it.
evidence  — the scored table in the type-voices note; PDF renders of the exemplars.
verify    — tier 1 checker on the `minimal` set; the owner's taste call on the exemplars.
