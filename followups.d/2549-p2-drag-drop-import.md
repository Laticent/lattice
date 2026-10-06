---
origin: 2549
priority: P2
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2549
---

# Decide (with the owner) whether dropping a file on the Studio imports it

why now   — Import deck… now opens every format Lattice exports (#2532, CLI half #2549), but
            only through the deck switcher's menu. Dragging a PDF or .lattice onto the Studio
            does nothing. It was set aside on purpose (2026-10-05-reopenable-exports.md §6): a
            drop target over the whole shell is its own UX question, and the owner asked for
            the menu.
where     — `docs/src/components/studio/StudioShell.tsx` (`openLatticeImport`, the one funnel
            every import reaches); `deck-import.ts` › `readDeckFile` already reads any dropped
            File.
done when — the owner has picked a drop model (whole shell vs the switcher, what a drop on
            the editor means). If yes, a dropped file imports through `openLatticeImport`, with
            the same toasts and refusals as the menu.
evidence  — e2e on the built site that dispatches a real drop of a PDF and a .lattice; and
            `tools/screenshot.js` at 1440/820/390 of the drop affordance.
verify    — tier 1 checker, because it adds a new input path for untrusted files.
