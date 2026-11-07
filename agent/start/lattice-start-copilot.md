# Set up Lattice in GitHub Copilot or Microsoft 365 Copilot

## What to paste

Put [`paste/lattice-instructions-standard.md`](../paste/lattice-instructions-standard.md) in the instructions box.

## What to upload

All 10 files from [`upload/`](../upload/). They are numbered in reading order and
each has a globally unique name, so they survive an uploader that discards folders.

## Notes

**In a repository:** copy `repo/AGENTS.md` to your repo root, or paste
`lattice-instructions-standard.md` into `.github/copilot-instructions.md`. Copilot adds
that file to every request as soon as it is saved.

**In a Copilot Space:** put the `standard` text in the instructions field and attach the
`upload/` files.

**In an M365 declarative agent:** paste `lattice-instructions-max.md` into the
instructions — the cap there is 8,000 characters and it is hard. Do **not** move
instructions into a knowledge file to get around it: Microsoft routes knowledge content
through cross-prompt-injection classifiers that can block, truncate or sanitize
directive language, so "read the rules in file X" is unreliable there by design.

---

Render and check what it writes: [`render/lattice-render-a-deck.md`](../render/lattice-render-a-deck.md).
