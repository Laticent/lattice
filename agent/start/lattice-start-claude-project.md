# Set up Lattice in a Claude Project

## What to paste

Put [`paste/lattice-instructions-standard.md`](../paste/lattice-instructions-standard.md) in the instructions box.

## What to upload

All 10 files from [`upload/`](../upload/). They are numbered in reading order and
each has a globally unique name, so they survive an uploader that discards folders.

## Notes

Open your project → **Set project instructions** → paste `lattice-instructions-standard.md`.
Then **Add content** and upload the numbered files from `upload/`.

**Upload ten, not ninety.** Claude Projects switch from holding files in context to
retrieving from them as the project grows, and community reproduction puts that switch
as low as ~13 files — Anthropic documents the behavior but not the trigger, so treat
the number as reported, not confirmed. Either way the ten bundles are the safe shape,
and Anthropic does state that well-named files help it retrieve the right one.

---

Render and check what it writes: [`render/lattice-render-a-deck.md`](../render/lattice-render-a-deck.md).
