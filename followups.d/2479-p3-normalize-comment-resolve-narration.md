---
origin: 2479
priority: P3
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2479
---

# Point normalize.ts's comment at resolve-narration, in the next engine-hash change

why now   — #2479 renamed `lib/core/resolve-captions.mjs` to `resolve-narration.mjs`, but
            `docs/src/lib/cadenza/normalize.ts` (the `acronyms` docblock, ~line 208) still names
            the old path. The file feeds the timing-engine content hash
            (`tools/lib/timing-engine-hash.js`), so a comment-only edit would move `ENGINE_HASH`
            and mark the committed `docs/src/lib/vetrina-exemplars/deictic.ltt.json` stale for
            no engine change.
where     — `docs/src/lib/cadenza/normalize.ts`: `lib/core/resolve-captions` →
            `lib/core/resolve-narration`.
done when — the comment names the new path, landed in a change that already moves the engine
            hash (then `npm run engine-hash:build` and re-measure the exemplar as that change
            requires anyway).
verify    — `node --test test/unit/tools/timing-engine-hash.test.js`.
