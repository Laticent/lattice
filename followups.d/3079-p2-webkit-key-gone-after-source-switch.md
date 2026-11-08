---
origin: 3079
priority: P2
recorded: 2026-11-08
area: website
severity: medium
swimlane: engineering/decisions/2026-11-07-studio-model-spine.md
deferred: blocked — seen once on WebKit, then 30 reruns passed (6 solo, 24 under the same 4-project parallel load), so there is no failing run to bisect from yet
source: https://github.com/Laticent/lattice/pull/3079 (the chip's source switch e2e, first WebKit run after a fresh build:e2e)
---
# WebKit once read "needs a key" for a stored OpenRouter key after a source switch

why now   — `model-spine.spec.ts` › "the chip reaches every source" failed ONCE on webkit-tablet:
            after OpenRouter → Browser built-in → OpenRouter, the chip read "Add a key or choose
            on-device" for 5 s. The selection resolves `needs-key` only when
            `providerKeyState('openrouter')` is `none`, which means `lattice-db-or-key` was GONE
            from storage, not still opening. Deleting a stored key is the worst outcome the key store
            has, so the one-off is worth chasing even though it did not recur.
where     — docs/src/lib/openrouter-key.js: the two paths that write the key to null are
            `load()` on `unseal → { gone: true }` (no sealing key found in IndexedDB) and the
            `writeKey` catch. Suspect: an `unseal` whose `sealingKey(false)` lookup reads IndexedDB
            before the first `seal`'s `add` of the sealing key has committed (the spec seeds a
            PLAINTEXT key, so the page seals it on boot), which reads as "gone" and deletes the key.
done when — a deterministic test (hold the sealing key's `add` transaction open, then trigger a
            load) either reproduces the delete and the fix makes `gone` require a committed
            lookup, or proves the window cannot open; the e2e is run with --repeat-each 20 on
            webkit-tablet and webkit-phone with no failure.
evidence  — the unit test above; the repeat run's output.
verify    — tier 1 checker.
