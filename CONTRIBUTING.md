# Contributing to Lattice

Thanks for contributing! Two things to know up front.

## 1. You own your work — there is no CLA

Lattice does not ask contributors to sign a Contributor License Agreement.
You keep full ownership of anything you contribute. By submitting a pull
request you agree your contribution is licensed under the project's license
(AGPL-3.0-only, the inbound = outbound default) — nothing more is granted to
anyone.

One honest note while the long-term contribution model is being finalized
(a plugin/marketplace direction is under design — see
`engineering/decisions/`): please **open an issue before starting a large
core feature**. Small fixes and improvements are always welcome; for big
engine work we'd rather talk first — possibly about paying for it — than
have effort go to waste. This keeps your time respected and the project's
options open.

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

## License

Lattice is licensed under the [GNU AGPL v3.0](LICENSE), with the
[Lattice Output Exception](LICENSE-EXCEPTIONS). Contributions are accepted
under the same license.
