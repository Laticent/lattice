# Set up Lattice in a coding agent (Claude Code, Cursor, Codex, Windsurf, Cline, Zed, Aider)

## What to paste

Put [`paste/lattice-instructions-standard.md`](../paste/lattice-instructions-standard.md) in the instructions box.

## What to upload

Nothing to upload — but do not paste `paste/` text by hand either. Copy a drop-in
from [`repo/`](../repo/) instead: each one already carries the instructions AND the
link to the catalog, which the bare paste text assumes you were given separately.

## Notes

Copy the drop-in that matches your tool out of `repo/`:

| Tool | Copy to |
|---|---|
| Claude Code | `CLAUDE.md` (or `AGENTS.md` plus a one-line `@AGENTS.md` import) |
| Codex, Zed, Jules, Junie, Cline | `AGENTS.md` at the repo root |
| Cursor | `.cursor/rules/lattice.mdc` — a plain `.md` there is ignored |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Windsurf | `.windsurf/rules/lattice.md` — 12,000 chars per file, truncated silently past it |
| Aider | any path, then `aider --read lattice.md` |

`repo/AGENTS.md` is deliberately small. Codex budgets the whole `AGENTS.md` chain at
32 KiB and stops adding files once it is spent, so a fat root file starves the nested
one that actually describes your project.

For Claude Code specifically, `plugin/` installs the same thing as a plugin with a
skill, so the catalog loads only when a deck is actually being written.

---

Render and check what it writes: [`render/lattice-render-a-deck.md`](../render/lattice-render-a-deck.md).
