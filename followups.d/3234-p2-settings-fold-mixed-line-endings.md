---
origin: 3234
priority: P2
recorded: 2026-11-22
area: engine
severity: low
swimlane: engineering/decisions/2026-08-04-line-endings-lf-boundaries.md
deferred: off-path — logged from a session archive sweep; the fold and its callers (lint, the Marp-bleed reader) are not touched by the PR that records it
source: https://github.com/Laticent/lattice/pull/3234
---

# `foldSettingsBlock` leaves a CRLF bundle with mixed line endings

why now   — `lib/core/settings-block-fold.js` splits the deck on `\n` and writes whole new lines for the seam
            (`#` for the old fence and the `<script>` line, `---` for `</script>`, and `class: …` for the union).
            Those lines lose their `\r`; every other line keeps it. Measured on main (164ecfa), a CRLF bundle
            of ten lines folds to lines 0-2 and 7-8 ending `\r` and lines 3-6 ending bare `\n`.
            The engine is safe: `lib/engine/index.js` normalizes to LF before it folds. Two callers fold the
            source as given: `lib/authoring/lint-core.js` (`fixLineIndex`, and the lint read) and
            `lib/export/marp-bleed-ink.js` `deckClassesOf`. Pre-existing; nothing is known to misread today.
where     — lib/core/settings-block-fold.js `foldSettingsBlock` (the `out[i] = '#'`, `out[end] = '---'` and
            `out[at] = 'class: …'` writes); `settingsBlockAt` already reads `\r?`.
done when — a CRLF bundle folds to a source whose every line ends the way its input line did (each rewritten
            line keeps the `\r` of the line it replaces), or every caller hands the fold LF text and the fold
            is listed as LF-only in `SANCTIONED_EOL_BOUNDARIES`' terms; a unit test pins the CRLF case.
evidence  — node -e with a CRLF bundle (`---`, `theme`, `class: a`, `---`, the open tag, `class: b`,
            `</script>`, a slide) on main: lines 3-6 of the output end without `\r`.
verify    — `node --test test/unit/core/settings-block-fold*.test.js` with the new CRLF case; `npm run lint:deck`
            on a CRLF bundle reports the same findings, on the same lines, as on its LF copy.
