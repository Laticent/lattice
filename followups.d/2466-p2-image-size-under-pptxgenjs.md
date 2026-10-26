---
origin: 2466
priority: P2
recorded: 2026-10-26
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-14-dependabot-prs-never-merge.md
source: https://github.com/Laticent/lattice/issues/1958
---

# image-size 1.2.1 under pptxgenjs has three infinite-loop advisories and no fixed 1.x

```text
  P2 · [no ticket] decide how the PPTX export gets an image-size without the infinite loops
       why now   — npm audit on main (2026-10-26): image-size 1.2.1, reached through pptxgenjs
                   3.12.0 (`"image-size": "^1.0.0"`), carries GHSA-5p2g-fcmc-qvqq (JXL and HEIF
                   parsers loop forever) and GHSA-w3rx-r6r6-pgpr (ICNS). No 1.x release fixes
                   them; the fix is image-size 2.x, which pptxgenjs's range does not admit.
       where     — pptxgenjs's Node path (its package.json maps image-size to false only for the
                   browser); lib/export PPTX writer. First establish whether Lattice ever lets a
                   deck image reach pptxgenjs's own size probe, or always passes dimensions.
       done when — either a measured "unreachable" (a deck image never reaches image-size), or an
                   override to image-size 2.x with the PPTX export proven byte-identical on the
                   example decks, or a guard that refuses JXL/HEIF/ICNS before pptxgenjs sees them.
       evidence  — the call path, and for an override, PPTX bytes before/after.
       verify    — tier 1 checker; it touches export bytes, so the owner signs off.
```
