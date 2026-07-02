# Contributing to Lattice

Lattice is **open source, with a sole-authored core** — in the spirit of
SQLite's "Open-Source, not Open-Contribution," stated up front so nobody's
work goes to waste. The reasons: it keeps the engine's design coherent, and
it keeps the licensing story simple enough that *you* keep everything you
make. There is **no CLA** — nothing here asks you to sign anything or give
up any rights. Full background:
`engineering/decisions/2026-07-02-contribution-model.md`.

## Ownership and money — the deal, in plain terms

- **Your themes, plugins, and tools are yours — entirely.** Build on
  Lattice's public surfaces (the theme token contract, the LFM markdown
  format, the CLI) and what you make is your property, under any license you
  choose, sold anywhere you like, with no cut owed to anyone. Use a
  non-official name (`lattice-theme-foo` style — see
  [TRADEMARKS.md](TRADEMARKS.md)).
- **Engine code that ships in anything commercially licensed gets paid
  for.** If we want your work inside the engine and the engine is ever sold
  under commercial terms, that happens by explicit written arrangement — a
  paid license grant — never by a signature you were required to hand over.
- **The symmetry pledge:** any engine capability that a commercial
  SlideWright product monetizes lands in the AGPL engine within six months.
  The open engine is the product, not the demo.

## What contributions look like in practice

- **Issues, bug reports, and design discussion — always open, most
  valuable.** This is genuinely the best way to contribute.
- **Small mechanical fixes** (typos, broken links, clearly mechanical
  one-liners) are welcome as PRs with a `Signed-off-by:` line per the
  [Developer Certificate of Origin](https://developercertificate.org).
- **Substantive engine work is by arrangement:** open an issue first. If it
  fits, we'll agree terms before code is written — possibly paid work. An
  unarranged substantive PR will be reviewed with thanks but not merged;
  that's not a judgment of the work, it's how the ownership model stays
  honest.

Contributions, when accepted, are licensed inbound = outbound under
AGPL-3.0-only with the additional permissions in
[LICENSE-EXCEPTIONS](LICENSE-EXCEPTIONS).

## Development setup

Everything about the toolchain — Node version, npm scripts, tests, lint,
hooks, and CI — lives in [`engineering/development.md`](engineering/development.md).
The short version:

```sh
npm install
npm test               # unit suite (inner loop)
npm run lint
npm run build          # regenerates dist/ (never hand-edit dist/)
```

Project conventions (commit-message format, changelog discipline, branch/PR
flow) are in [`engineering/workflow.md`](engineering/workflow.md), and the
repo-wide hard rules are indexed in [`CLAUDE.md`](CLAUDE.md). Pre-commit and
pre-push hooks enforce the gates; a hook failure is a root cause to fix, not
a `--no-verify` to skip.
