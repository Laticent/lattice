---
origin: 3079
priority: P2
recorded: 2026-11-08
area: website
severity: medium
swimlane: engineering/decisions/2026-11-07-studio-model-spine.md
deferred: blocked — 2 failures in about 270 WebKit runs, and 0 in the 220 of them that carried a probe (a Storage hook, a failure-time snapshot, console logging on every key-deleting path), so there is no failing run with a trace to fix from
source: https://github.com/Laticent/lattice/pull/3079 (the chip's source switch e2e, first WebKit run after a fresh build:e2e)
---
# WebKit sometimes reads "needs a key" for a stored OpenRouter key after a source switch

why now   — `model-spine.spec.ts` › "the chip reaches every source" failed twice on webkit-tablet
            (the first run after a fresh build:e2e, and run 3 of a 20x repeat):
            after OpenRouter → Browser built-in → OpenRouter, the chip read "Add a key or choose
            on-device" for 5 s. The selection resolves `needs-key` only when
            `providerKeyState('openrouter')` is `none`, which means `lattice-db-or-key` was GONE
            from storage, not still opening. Deleting a stored key is the worst outcome the key store
            has, so the one-off is worth chasing even though it did not recur.
where     — docs/src/lib/openrouter-key.js: the two paths that write the key to null are
            `load()` on `unseal → { gone: true }` (no sealing key found in IndexedDB) and the
            `writeKey` catch. A suspected race (an `unseal` reading IndexedDB before the first
            `seal`'s `add` committed) was REFUTED by an independent checker: in one document the
            envelope reaches storage only after the add commits, a concurrent read joins the
            running load, and a 20-round harness holding `generateKey` open never lost the key.
            What is left: a second same-origin document, or WebKit's IndexedDB `get` of a stored
            CryptoKey answering nothing after the memo reset.
done when — a failing run names the path that removed the key, which is then fixed with a test.
            Tried on PR #3079 without a hit: a `Storage.prototype` hook with stacks (100 runs), a
            snapshot of storage at failure (60), and a console line on each of the three deleting
            paths in openrouter-key.js (60). Next: keep the console probe in a nightly WebKit run
            so a rare failure carries its trace. WebKit is not in per-PR CI, so this does not flake
            the merge queue.
evidence  — the trace from the failing run; the fix's regression test.
verify    — tier 1 checker.
