---
origin: 2354
priority: P2
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2354
---

# Markdown export/import: the front matter drives the style, not an embedded <style>

why now   — on the owner's Windows run (2026-10-05), importing a deck saved with Share >
            Markdown brought the exporter's theme CSS with it, overriding the front matter.
            The owner: "this is bad. it should rely on the front matter to drive the style."
            The embed is deliberate since 2026-06-11 (a recipient without a library theme
            still sees its palette), so this reverses a decision; the owner chose a separate
            PR for it.
where     — docs/src/components/studio/export/deck-export.js (embedThemeInMarkdown,
            exportMarkdown), docs/src/components/studio/share-export.ts
            (embedFinishInMarkdown, shareMarkdown), the import path (StudioShell's "Import
            deck..."), engineering/decisions/2026-06-11-workbench-export-bridge.md.
done when — the owner has picked the shape (stop embedding for built-in themes; or keep the
            embed for other tools but have import drop it when the front matter names a
            theme; or both), and a round trip Share > Markdown > Import deck restyles from
            the front matter alone.
evidence  — exported .md before and after, and the re-imported deck rendered in dark and
            light for the owner's export sign-off (QUALITY BAR: exported bytes change).
verify    — maker-checker.
