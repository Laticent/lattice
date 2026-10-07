---
origin: 2358
priority: P3
recorded: 2026-09-29
area: website
severity: low
swimlane: engineering/decisions/2026-07-08-studio-html-player-export.md
source: https://github.com/Laticent/lattice/pull/2495
---

# Cancelling a webpage export does not stop its picture downloads

why now   — with "Embed pictures from other sites" on, the export fetches every picture a deck
            names (up to 200, 20 s each, 6 at a time). The export panel's cancel signal reaches
            the narration bake only, so a cancelled export keeps downloading pictures in the
            background until each one finishes or times out. Found by the maker-checker pass on
            PR #2495.
where     — `shareHtmlPlayer` in docs/src/components/studio/share-export.ts: pass the run's
            AbortSignal (today `narration.signal`) into `browserFetchDataUri` and abort its
            per-request controllers with it (lib/export/inline-url-media.mjs).
done when — cancelling during "Embedding images…" stops every in-flight picture request, pinned
            by a unit arm on the transport and one e2e arm.
evidence  — the network log of a cancelled export, before and after.
verify    — tier 1 checker.
