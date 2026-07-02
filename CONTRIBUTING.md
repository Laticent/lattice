# Contributing to Lattice

Thanks for contributing! Two things to know up front.

## 1. Contributor License Agreement (required)

All contributions require signing the [SlideWright CLA](CLA.md). It lets
SlideWright keep Lattice available under the AGPL while retaining the ability
to offer commercial licenses; you keep full ownership of your work.

Signing is a one-time comment: when you open your first pull request, the CLA
bot posts instructions — reply with the sign-off phrase and you're done for
all future contributions.

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

Lattice is licensed under the [GNU AGPL v3.0](LICENSE). By contributing, you
agree your contributions are provided under the terms of the CLA above.
