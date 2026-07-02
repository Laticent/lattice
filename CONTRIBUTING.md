# Contributing to Lattice

Thanks for your interest! Two things to know up front.

## 1. Contribution policy — under review (you own your work, no CLA)

Lattice does not ask contributors to sign a Contributor License Agreement —
the short-lived CLA requirement is withdrawn and no longer applies to anyone.
You keep full ownership of anything you contribute; nothing here asks you to
give up rights.

The long-term contribution model (community core vs. an owned plugin/theme
layer with a marketplace) is being finalized — see
`engineering/decisions/2026-07-02-contribution-model.md`. Until it lands:

- **Issues, bug reports, and design discussion are open and welcome** — this
  is the most useful way to contribute right now.
- **Pull requests may be opened and will be reviewed, but held for merge**,
  with one exception: obvious, minimal fixes (typos, broken links, clearly
  mechanical one-liners) may be merged if the commit carries a
  `Signed-off-by:` line per the
  [Developer Certificate of Origin](https://developercertificate.org).
- For larger engine work, please open an issue first — we'd rather talk
  (possibly about paying for the work) than have your effort go to waste.

Lattice is AGPL-3.0-only with the additional permissions in
[LICENSE-EXCEPTIONS](LICENSE-EXCEPTIONS). Contributions, when accepted, are
licensed inbound = outbound under those same terms.

## 2. Development setup

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
