---
origin: 2334
priority: P2
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2334
---

# The Studio never runs `claim-bleed-unsafe`, because it never receives `claimExcludes`

why now   — #2334 made the Studio lint check every `*Names` register list, the same
            way `lint:deck` does. One gap remains, and it isn't a `*Names` list:
            `claimExcludes` (the manifest opt-outs `buildVocab` collects, 13 components
            today) is never shipped by `studio.astro`. So `claim: bleed` on a table or
            prose-dense slide gets a `claim-bleed-unsafe` warning from `npm run lint:deck`
            and nothing in the Studio or the Coach.
where     — `studio.astro`'s `lintVocab` handoff (add `claimExcludes`), and
            `buildVocabSets` in `docs/src/playground/editor-diagnostics.js` (forward it).
            The rule itself is at `lib/authoring/lint-core.js` (`vocab.claimExcludes`).
done when — `claim: bleed` on an excluded component warns in the Studio editor, the
            tracked decks stay silent, and the `studio` htmlRaw budget in
            `docs/route-budget.json` still passes. The JSON is ~381 bytes before
            HTML escaping, and that route has ~1KB of headroom, so measure it.
evidence  — the real Studio showing the warning, as the `editor-lint.spec.ts`
            register arm does, plus a false-positive sweep over the tracked decks.
verify    — self-review with the gates. It's one rule, reusing the handoff #2334 proved.
