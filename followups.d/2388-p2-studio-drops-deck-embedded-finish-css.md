---
origin: 2388
priority: P2
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2388
---

# The Studio does not paint a finish the deck defines in its own `<style>` block

Found while verifying #2388 through the Studio's image export; not caused by it.

```text
  P2 · [no ticket] Deck-embedded finish CSS is dropped in the Studio.
       why now   — a deck that carries its own `section.finish.finish-<slug> { … }` rules
                   (the shape Fabricate's export writes, and what examples/finish-override.md
                   ships, with a comment claiming it keeps the finishes "where the saved
                   finishes are not installed") renders the finish in the CLI PDF but shows
                   NOTHING in the Studio preview or its Images (.zip) export.
       where     — the Studio preview frame: the slide gets `finish-<slug> finish` and the
                   `.backdrop` wrapper, but no `<style>` in the frame contains the slug, so
                   the wrapper's background resolves to `none, none`. Likely the Studio only
                   injects SAVED finishes' CSS (StudioShell.tsx, the usedSavedFinishes memo)
                   and does not carry the deck's own <style> for an unknown slug.
       done when — a deck-defined finish paints in the Studio preview and in its raster export,
                   or the Studio says plainly why it does not; decide which, since sanitizing
                   author CSS (HARD RULE #22) is part of the answer.
       evidence  — control on #2388's branch, NO backdrop key or token: one slide
                   `_class: finish-graph` with the finish-graph rules in a <style> block;
                   live-preview probe `styles: 0, bg: none, none`; preview and raster blank;
                   `node lattice-emulator.js` on the same source draws the grid.
       verify    — tier: Studio e2e (preview frame probe + Images export) on the built site.
```
