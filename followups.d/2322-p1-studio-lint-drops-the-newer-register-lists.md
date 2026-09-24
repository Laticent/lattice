---
origin: 2322
priority: P1
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2322
---

# The Studio's inline lint drops 15 register value lists that the CLI lint checks

why now   — #2322 made `studio.astro` ship every `*Names` list to the Studio, and the
            editor now COMPLETES `guards:` / `cards:` / `claim:` / … values from them.
            The independent checker found that the lint half still sees six:
            `buildVocabSets` in `docs/src/playground/editor-diagnostics.js:59-86` forwards
            only finish, mode, split, stampStyle, toneStyle and spectrum. So `guards: strcit`
            gets value completion in the Studio but no inline `unknown-guards` warning,
            while `npm run lint:deck` flags it. Two readers of one vocab, disagreeing.
where     — `buildVocabSets` (shared by `Editor.tsx` and `coach/coach-core.ts`). Forward
            every `*Names` list, the same way `studio.astro` now packs them.
done when — each `findUnknown*` rule in `lib/authoring/lint-core.js:2553-2625` fires in the
            Studio editor on a bad value and stays silent on every valid value the engine
            reads. The Coach score moves only for decks that carry a bad value.
evidence  — a false-positive review per newly enabled rule, over the tracked decks
            (`examples/`, the galleries, the Studio starters) — this turns on ~15 rules in
            the editor AND the Coach. Plus the real Studio showing one new warning
            (HARD RULE #23), not only a unit test.
verify    — maker-checker: it changes what every Studio author sees and what the Coach
            scores.
