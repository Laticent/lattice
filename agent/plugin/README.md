# Lattice — Claude Code plugin

Adds a `lattice-decks` skill that teaches Claude Code to author Lattice decks.
The skill costs about 100 tokens of context until a deck is actually being
written, which is the reason to install this rather than paste the catalog into
`CLAUDE.md`.

## Install

Copy `skills/lattice-decks/` — the `SKILL.md` and its `references/` — into your
project's `.claude/skills/`, or into `~/.claude/skills/` to have it everywhere.

```sh
cp -r skills/lattice-decks ~/.claude/skills/
```

`.claude-plugin/` here is the manifest pair for installing this as a marketplace
plugin. **`/plugin marketplace add` does not work against this kit yet:** that command
resolves `.claude-plugin/marketplace.json` at a repository's default-branch root, and
these files publish to the `dist-kits` branch under `agent/plugin/`. The copy above is
the route that works today.
