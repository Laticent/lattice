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
            `writeKey` catch. A suspected race (an `unseal` reading IndexedDB before the first
            `seal`'s `add` committed) was REFUTED by an independent checker: in one document the
            envelope reaches storage only after the add commits, a concurrent read joins the
            running load, and a 20-round harness holding `generateKey` open never lost the key.
            What is left: a second same-origin document, or WebKit's IndexedDB `get` of a stored
            CryptoKey answering nothing after the memo reset.
done when — the e2e is run with --repeat-each 20 on webkit-tablet and webkit-phone with a
            storage-event and `localStorage.removeItem` trace on the key; a failing run names the
            path that removed it, which is then fixed with a test.
evidence  — the trace from the failing run; the fix's regression test.
verify    — tier 1 checker.
