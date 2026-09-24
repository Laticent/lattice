---
origin: 2335
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2335
---

# The deck lint does not warn on a modifier with nothing to act on

why now   — the owner chose completion first, lint next (PR #2335). The editor no longer OFFERS `rule-none` on `big-number` or `lifted` on plain `kpi`, but a hand-typed or AI-written one still passes `lint:deck` silently. The linter and the completer should agree.
where     — `lib/authoring/lint-core.js` (HARD RULE #7: the rule lives there only); the surface data is `dist/docs/components.json` `surfaces` / `variantSurfaces` / `inertSurfaces`, which the lint vocab would need to carry.
done when — a warn-only lint rule flags a `_class:` modifier whose surface the component lacks, with the component and surface named in the message, and the count of hits on shipped decks is measured and stated in its PR before it lands.
evidence  — engineering/decisions/2026-09-24-positional-class-completion.md §Not done here.
verify    — `npm run lint:deck -- <deck with "_class: big-number rule-none">` reports it.
