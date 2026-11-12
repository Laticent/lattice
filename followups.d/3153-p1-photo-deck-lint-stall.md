---
origin: 3153
priority: P1
recorded: 2026-11-12
area: website
severity: medium
swimlane: engineering/gotchas/studio-playground.md
deferred: large — the editor's lint pass and the Coach's assessment each lint the whole deck on the main thread; sharing one pass or moving it off the thread is a Studio architecture change, not a test fix
source: https://github.com/Laticent/lattice/pull/3153
---

# A deck of phone photos still freezes the Studio for up to 11 s in Firefox

why now   — PR #3153 cut the worst stall on a three-photo deck (16 MB of data URI) from 28.7 s to 11.2 s by fixing two
            per-edit costs (the slide-metadata memo copied every photo slide; `splitSlideChunks` re-cut the deck 35 times).
            What remains, measured in a Gecko profile of `export-photo-size.spec.ts`'s own deck: two full lint passes per
            edit, about 5 s each in Firefox, plus React rendering and layout. The editor's linter
            (`docs/src/components/studio/Editor.tsx`, `core.lintTextWith`) and the Coach (`coach-core.ts` `assessDeck`)
            lint the same text with slightly different vocabularies, both on the main thread. The longest stalls after the
            fix were 11.2 s and 6.5 s.
where     — `docs/src/components/studio/Editor.tsx` (the CodeMirror linter), `docs/src/components/studio/StudioShell.tsx`
            (the assessment effect), `docs/src/components/studio/coach/coach-core.ts`, and lint-core's per-character scans
            over a data URI (the inline-code scanner walks every character of a 5 MB `![bg](data:…)`).
done when — on the same deck in Firefox, no main-thread stall after an edit exceeds 2 s (one lint pass shared by the
            editor and the Coach, or the pass moved to a worker, and lint-core skipping a `data:` URI's payload), and
            `export-photo-size.spec.ts`'s deck-work ceiling (`DECK_WORK_MS`) is lowered to match.
evidence  — a Gecko profile before and after (MOZ_PROFILER_STARTUP, as `engineering/gotchas/studio-playground.md` describes)
            and the stall list from an in-page lag sampler.
verify    — tier 2, maker-checker: the change moves Studio lint off its current thread or merges two passes.
