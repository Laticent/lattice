---
origin: 2959
priority: P3
recorded: 2026-10-29
area: website
severity: low
swimlane: engineering/decisions/2026-10-27-filo-undo-history.md §5
deferred: off-path — the deck's boot load predates Filo and this PR does not touch it; the undo probe now waits for it
source: https://github.com/Laticent/lattice/pull/2959
---

# Typing into the Studio before its deck loads is replaced by the deck

```text
  P3 · [no ticket] keep an edit made before the Studio's boot deck lands, or block editing until it does
       why now   — the ios-safari-undo probe on macOS Safari (2026-10-29, runs on 2175187 and
                   bba49c9) pasted into the editor before the boot deck had loaded; the deck then
                   replaced the paste. A person on a slow machine who types in that moment loses
                   the text the same way.
       where     — docs/src/components/studio/StudioShell.tsx (the boot load and the editor's
                   first mount)
       done when — text typed before the boot deck lands survives it, or the editor is read-only
                   until it does; an e2e with a delayed boot load shows which.
       evidence  — that e2e, failing before and passing after.
       verify    — tier 1 checker.
```
