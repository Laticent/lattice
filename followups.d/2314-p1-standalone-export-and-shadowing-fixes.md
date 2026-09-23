---
origin: 2314
priority: P1
recorded: 2026-09-23
source: https://github.com/Laticent/lattice/pull/2314
---

# Fix the four export/shadowing bugs the packages note found (phase 0)

Spec: `engineering/decisions/2026-09-23-portable-packages.md`.

```text
why now   — each ships wrong output today, and none waits on the spine.
where     — share-export.ts:772 (Markdown drops components); deck-export.js exportMarp (saved theme falls back to indaco); theme-library.ts:88 + StudioShell.tsx:2945 (no reserved-name guard for themes/components); asset-bundle.ts (no zip size caps).
done when — a Markdown and a Marp export of a deck using a saved theme + component render both; saving a theme named `indaco` is renamed; an oversized zip is refused.
evidence  — a unit test per fix, plus a real Studio export opened on the real surface (#23).
verify    — unit tests + one exported deck rendered.
```
