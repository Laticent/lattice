---
---

Studio decks now live in Lattice's on-device storage instead of the browser's small localStorage, so a large workspace no longer stops saving long before the disk is full, and a full disk says so. Two tabs editing one deck now merge their edits instead of the last save winning. Closing or reloading the Studio while photos or decks move into storage no longer stops that move for good after three tries; only a crash, or the system closing a background tab, counts.

A Studio-only change, so no package is named (`.changeset/README.md`).
