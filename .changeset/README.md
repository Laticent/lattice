# `.changeset/`: one record per PR, in its own file

**Record a user-visible change here.** This is HARD RULE #10's landing spot. A
`changelog.d/` fragment still works too (see the last section), but a changeset is
the native form and the only one that can name a library.

## Add one

```sh
npx changeset
```

It asks which packages changed and how much, then writes a file like this. You
can also write it by hand; the name only has to be unique.

```markdown
---
"@laticent/lattice": minor
"@laticent/ltt": patch
---

Charts now keep their colors when a deck switches to dark mode.

The chart kernel read the palette once, before the mode switch had applied, so
every series rendered in its light color. It now reads the palette after.
```

- **The front matter** names each package that changed and its bump: `patch`
  (a fix), `minor` (something new, or a change that breaks nothing), `major` (it
  breaks a deck or a caller). Only the thirteen packages that publish can be named
  (`tools/release-packages.js` `PUBLISH_SET`); the gate rejects any other.
- **A library is `0.x`, so a break in one is `minor`.** Changesets would take a
  `major` on `0.1.0` to `1.0.0`, ending the library's `0.x` line, so the gate rejects
  it. A `major` on the engine is allowed, and a release that carries one waits for a
  human merge instead of auto-merging.
- **The first line is the release note.** One plain sentence about what a user can
  now do, or what stopped breaking. No file paths, no mechanism, not a heading or a
  bullet. Weekly release notes are this line and nothing else.
- **The rest is free.** The engineering detail goes in the package's `CHANGELOG.md`
  under the first line, and nowhere else.

A change nobody using the packages can see (tests, CI, docs tooling) needs no
changeset, and neither does a change to the docs site, the Studio or the
Playground alone, since none of them ships in a package. `npx changeset --empty` records that on purpose, if you want a record.

## What happens to it

Nothing, until a release. **Release (prepare)** runs `changeset version`, which
bumps each named package (and patches any package that depends on it), writes the
entry into each package's `CHANGELOG.md`, and deletes the changeset, all in the
release PR. **Release (publish)** then publishes every package whose new version is
not on npm yet, in dependency order. See `RELEASE.md`.

The first release, 1.0.0, is the exception: it ships each package at the version
it already carries (the engine at 1.0.0, each library at 0.1.0), and archives
whatever is pending into `changelog/pre-release-archive.md`, because its notes
are the curated `release-notes/1.0.0.md`.

## Fragments still work

`changelog.d/<slug>.<category>.md` fragments are accepted exactly as before (the
contract is `changelog.d/README.md`). At release time `tools/changesets.js`
converts each pending fragment into a changeset for `@laticent/lattice`, with the
bump its category always picked: `removed` or a `**Breaking:**` bullet is major;
`added`, `changed` and `deprecated` are minor; `fixed` and `security` are patch.
The first bullet becomes the first line. A fragment cannot name a library, so a
library change needs a changeset.

## Gates

`checkChangesets` (in `tools/check-ownership.js`, via `build:check`) rejects a
changeset that names a package outside the publish set, a bump that is not
`patch`, `minor` or `major`, a missing or non-sentence first line, a file that is
not `.md`, conflict markers, CR line endings or a BOM. It also holds the publish
set itself: every workspace package publishes, is listed in `config.json`
`ignore`, or is private.

Why one file per PR: two PRs that edit one shared region conflict in the merge
queue, and an ejection silently clears auto-merge (#1593). Decision:
`engineering/decisions/2026-10-07-first-npm-release.md` §11.
