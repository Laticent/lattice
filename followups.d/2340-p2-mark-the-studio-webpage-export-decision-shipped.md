---
origin: 2340
priority: P2
recorded: 2026-09-24
---

# Mark the Studio "Download as webpage" decision note as shipped

why now   — the note still reads `status: proposed` and its index row is still `☐`, but the Share
            sheet's Webpage row and `WebpageOptionsPanel.tsx` shipped it. A session that trusts
            the index will think the Studio has no webpage export and plan to build one.
where     — engineering/decisions/2026-07-08-studio-html-player-export.md (front matter) and its
            row in engineering/decisions/README.md; the shipped code is
            docs/src/components/studio/ShareSheet.tsx + WebpageOptionsPanel.tsx
done when — the note's status says what shipped (and which phases, P1–P3, actually landed, checked
            against the code rather than assumed), and the README row matches it
evidence  — the diff to both files, plus a one-line citation of the PR or commit that shipped each
            phase
verify    — tier 0 gates, because it is a docs-status edit with no runtime surface
