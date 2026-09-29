---
origin: 2498
priority: P3
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2498
---

# The Print drawer builds one preview document per open

#2498 moved the Print drawer's preview cells onto the preview pool, so paging and reprinting
build no documents. One per open remains, two if that open printed on desktop: the drawer unmounts
with the Share sheet, and its pool and its print frame go with it. WebKit never frees either.

```text
why now   — low: one document per open of a drawer people open rarely. Add slide paid 12–14
            per open, which is what justified PersistentSurface there.
where     — docs/src/components/studio/ShareSheet.tsx (the view switch and the PanelSheet),
            PrintOptionsPanel.tsx; docs/src/components/ui/keep-mounted.tsx has the pieces.
done when — reopening the drawer builds 0 documents (and a reprint after a reopen reuses the
            print frame), a hidden drawer does not re-render the deck
            on each keystroke (Frozen), and each open starts from the default paper, layout and
            color, as today.
evidence  — documentsMade before/after across three reopens; RSS on Playwright WebKit if it
            can be installed.
verify    — tier 0 gates plus the e2e spec, because it changes when a surface mounts.
```
