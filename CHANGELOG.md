# Changelog

Lattice publishes thirteen packages to npm, each on its own version line, and each keeps its own
changelog. This file is the index; it gets no entries.

| Package | Changelog |
|---|---|
| `@laticent/lattice` (the engine and CLI) | [`packages/lattice/CHANGELOG.md`](https://github.com/Laticent/lattice/blob/main/packages/lattice/CHANGELOG.md) |
| `@laticent/<library>` | `docs/src/lib/<library>/CHANGELOG.md`, for example [`ltt`](https://github.com/Laticent/lattice/blob/main/docs/src/lib/ltt/CHANGELOG.md) |

Each changelog is written by the release (`changeset version`), never by hand. The engine's npm
tarball carries its changelog; a library's lives here in the repository.

> ## Recording a change
>
> **Add a changeset**: `npx changeset`, or a file in `.changeset/` by hand. Its first line is the
> sentence the release notes print. A `changelog.d/<slug>.<category>.md` fragment is still
> accepted, and the release converts it into a changeset for the engine. Never edit a
> `CHANGELOG.md`: two PRs appending to one shared region is what ejected seven PRs from the merge
> queue in one evening (#1593). See [`.changeset/README.md`](https://github.com/Laticent/lattice/blob/main/.changeset/README.md)
> and HARD RULE #10.

> ## History before the first npm release is in [`changelog/pre-release-archive.md`](https://github.com/Laticent/lattice/blob/main/changelog/pre-release-archive.md)
>
> That file holds the pre-1.0 development log (#1735), the hand-written `## 1.0.0` section of the
> August release (since relabeled `v0.9.0`), and the 1,674 fragments pending when Changesets took
> over. 1.0.0's own notes are [`release-notes/1.0.0.md`](https://github.com/Laticent/lattice/blob/main/release-notes/1.0.0.md).
> The links are absolute because this file ships in the release zip, where a relative path would
> dangle.
