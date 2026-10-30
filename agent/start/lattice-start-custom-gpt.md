# Set up Lattice in an OpenAI Custom GPT

## What to paste

Put [`paste/lattice-instructions-max.md`](../paste/lattice-instructions-max.md) in the instructions box.

## What to upload

All 10 files from [`upload/`](../upload/). They are numbered in reading order and
each has a globally unique name, so they survive an uploader that discards folders.

## Notes

In the GPT editor: paste `lattice-instructions-max.md` into **Instructions**, then
upload the `upload/` files under **Knowledge**.

**Use the `max` text here, not `standard`.** Custom GPT instructions are capped at a
reported 8,000 characters and `max` is built to sit just under it, so you get the trap
list as well as the mechanics.

The uploader is flat — it keeps no folders. Every file in `upload/` already has a
globally unique name for exactly this reason.

---

Render and check what it writes: [`render/lattice-render-a-deck.md`](../render/lattice-render-a-deck.md).
