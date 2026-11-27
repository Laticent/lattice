---
origin: 3554
priority: P1
recorded: 2026-11-27
area: engine
severity: medium
swimlane: spec/EXTENDING-1.0.md §4
deferred: blocked — the owner kept dotted names refused in Segno 1.0 (#3591, SEGNO §8), so the record and note carriers wait for a 1.x; the front-matter carrier needs the plugin host's hand-off, which is not built
source: https://github.com/Laticent/lattice/pull/3554
---

# Readers accept plugin-prefixed names (`acme.tally=`, `@acme.recap{…}`, `acme.tally:`)

why now   — The owner ruled (2026-11-27, event `2f0c7a94`) that plugins may use prefixed names, sanitized. EXTENDING §4
            states it, and today the engine refuses or ignores every such name: Segno's `isName`
            (`docs/src/lib/segno/notation.ts:98`) and the fast bind in `schema.ts` make `{acme.tally=3}` a `bad-name`
            error, and only `@meta{` opens a door (`isRecordOpener`, `lib/core/meta-door.mjs:79`).
where     — `docs/src/lib/segno/notation.ts`, `docs/src/lib/segno/schema.ts`, `lib/core/meta-door.mjs`, the lint vocabulary
            (`unknown-key` must skip a prefix a loaded plugin owns), and the plugin host's hand-off of a prefixed value.
update    — 2026-11-27: #3591 keeps `{acme.tally=3}` a `bad-name` in Segno 1.0 by the owner's choice; EXTENDING §4 now
            marks record fields and notes "reserved" and front-matter keys and rule IDs "works". The record and note
            half of this item waits for a Segno 1.x that admits dotted names.
done when — a prefixed front-matter key, record field and note each reach only the owning plugin; with no such plugin
            each is ignored and kept on save; lint warns on an unprefixed unknown name and not on an owned prefixed one;
            and a prefixed value holding `</style><script>` appears nowhere raw in the rendered HTML, PDF text or exports.
evidence  — the Segno desk's read of `main` (2026-11-27) and the step E session's scope reply on #3554's thread.
verify    — a failing arm for each of the three carriers, then green; the sanitizer arm on the preview and the export.
