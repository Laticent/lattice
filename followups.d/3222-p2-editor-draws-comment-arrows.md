---
origin: 3222
priority: P2
recorded: 2026-11-15
area: website
severity: low
swimlane: engineering/decisions/2026-11-13-studio-autocomplete-audit.md
deferred: off-path — the deck editor's font, not the panes this PR changed
source: https://github.com/Laticent/lattice/pull/3222
---

# The Studio editor draws `<!--` as an arrow

why now   — The mono font's ligatures redraw `<!--` and `-->` as arrows in the deck editor body (visible in every
            Studio screenshot). The autocomplete menu already turns ligatures off for this exact reason
            (editor-theme.ts, `.cm-tooltip-autocomplete > ul`), but `.cm-content` does not, so the text an author
            reads is not the text in the file.
where     — docs/src/components/studio/editor-theme.ts (.cm-content), docs/src/playground/editor.js.
done when — `.cm-content` in both editors sets `fontVariantLigatures: 'none'`, and a screenshot shows `<!--`.
evidence  — PR 3222 screenshots at 1440 and 1100.
verify    — tier 0 plus one screenshot.
