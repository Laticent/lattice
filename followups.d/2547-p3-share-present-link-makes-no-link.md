---
origin: 2547
priority: P3
recorded: 2026-10-06
---

# The Share sheet's "Present link" row makes no link

Found while mapping the Studio for the live collaboration design; pre-existing and off
that PR's path.

why now   — the row says "a live, themed link" but `ShareSheet.tsx:246` only runs
            `close(); onPresent()`. No URL is made, so the label promises something the
            code does not do.
where     — `docs/src/components/studio/ShareSheet.tsx:246`, `share-menu.tsx:20-41`.
done when — the row is relabeled to say what it does, or it really produces a link.
evidence  — the row's label and handler side by side after the fix.
verify    — open Share in the Studio and click the row.
