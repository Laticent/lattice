---
status: proposed
summary: Deferred design for splitting a slide's single speaker note into speaker / author (private) / reader (leave-behind) notes — needs engine directive-vocab + export-labeling work FIRST, so the Studio UI never ships a private-note leak
---

# Author / reader / speaker notes — deferred (engine work first)

**Ask (2026-07-03):** in the Studio's per-slide Notes tab, let an author keep three
genuinely-distinct notes: what you **say** live (speaker), a **private** working note
(author), and a written note for whoever opens the exported file (reader).

**Why this is deferred, not built:** the note boundary is engine-owned and a naive UI
would leak "private" notes into every export. Today one non-directive HTML comment on a
slide **is** the speaker note (Marp-faithful): `notesFromHtml` (`lib/authoring/notes-core.js`)
collects **every** surviving non-tooling comment and joins them into the presenter note
that lands in the PDF text annotation and the PPTX presenter-notes field. `_author` /
`_reader` are **not** in the directive vocabulary (`DIRECTIVE_KEYS`, docs
`slide-directives.ts`; engine directive set in the markdown-it plugin), so a
`<!-- _author: … -->` comment would survive rendering and be exported as a speaker note —
the *opposite* of private. And "reader note, labeled" has no separate channel:
`notesFromHtml` has no notion of note *kind*, so a reader note is indistinguishable from
the speaker note in any artifact. Shipping the 3-field UI over today's engine ships a
data leak. (Red-teamed 2026-07-03; the settings-polish PR ships the pill-tab Notes tab
with the single speaker note only.)

## The model to build (engine, then UI)

Three note kinds, distinguished by a directive-style prefix and by export target:

| Kind | Storage | Present (read-aloud) | PDF/PPTX notes | On-slide |
|---|---|---|---|---|
| **Speaker** | `<!-- note: … -->` (today) | yes | yes (presenter notes) | no |
| **Author** (private) | `<!-- _author: … -->` | no | **no — dropped** | no |
| **Reader** (leave-behind) | `<!-- _reader: … -->` | no | yes, **labeled** ("For the reader") | no |

## Engine work required (the gate before any UI)

1. **Directive vocabulary.** Add `author` / `reader` as recognized directive keys so the
   render paths CONSUME them (like `_class`) and they never reach `notesFromHtml` as raw
   speaker notes. Mirror in the shared `slide-directives.ts` `DIRECTIVE_KEYS` + the engine
   directive set (HARD RULE #1 — one boundary, all paths).
2. **A kinded note channel.** `notesFromHtml` (and the emulator's PDF-annotation + PPTX
   export) must return notes *by kind*, not one blob: speaker + reader (reader labeled),
   author dropped. This is the load-bearing change — the current one-string return can't
   express it. Parity test must cover all three kinds across the paths.
3. **Export labeling.** Decide the reader label format in the PDF/PPTX notes field
   (e.g. a `— For the reader —` divider) so a leave-behind recipient can tell speaker
   from reader.

## UI (only after the engine gate)

The Notes tab (already shipped as a single speaker note) grows to three fields — Speaker /
Author / Reader — each reading + writing its own comment kind through the kinded channel.
A per-kind provenance is unnecessary (notes aren't inherited), but the private-note
guarantee (author never exported) must have a test that renders an export and asserts the
author text is absent.

## Do-not-ship-before

- Never surface an author/reader field in the UI until `notesFromHtml` drops author from
  every export path — otherwise "private" leaks. This is the one hard gate.
