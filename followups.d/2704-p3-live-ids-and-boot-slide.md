---
origin: 2704
priority: P3
recorded: 2026-10-15
area: website
severity: low
swimlane: engineering/decisions/2026-10-15-fuoco-focus-sync.md §11
source: https://github.com/Laticent/lattice/pull/2704
---

# Live awareness and the persisted boot slide store slide indices, not stable unit ids; collaborators' slide and line are not derived from their cursor

why now   — an insert above a collaborator's slide moves their marker; a reload after a reorder opens the wrong slide.
where     — docs/src/components/studio/StudioShell.tsx bootSlideRef and the Live awareness payload.
done when — both store a unit id and resolve it through the outline, falling back to an index; and each
            collaborator's slide, rendered slide, deck line and line within the slide are computed on the
            viewer's side from their shared y-codemirror cursor (relative position → absolute offset →
            CodeMirror `doc.lineAt` for the line, `unitAt`/`partAt` for the slide, minus the slide's first
            line), never sent as numbers, so they stay right while others type above them. The `slide`
            field remains only for peers who share their slide but not their cursor, and for Compose.
evidence  — a unit test across an insert above the stored slide, plus a two-tab Live check.
verify    — unit + a real two-tab session in which one tab inserts lines above the other's caret.
