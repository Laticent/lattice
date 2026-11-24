# `changelog.d/` — one changelog entry per PR, in its own file (legacy form)

**Prefer a changeset** (`npx changeset`; contract in `.changeset/README.md`). It
is HARD RULE #10's native form since the Changesets cutover, and the only form that
can name a library. A fragment here is **still accepted, unchanged**: the release
converts it into a changeset for `@laticent/lattice`. Open PRs that already carry
one need no change.

## Why the entry is not in `CHANGELOG.md`

Every PR used to append to the same `## Unreleased` section, at the top, in the
same place. Two PRs in flight therefore edited the same region, so the second to
reach the merge queue conflicted and was ejected — and **an ejection silently
clears auto-merge**, so going green again merges nothing. Measured over one
evening of five PRs: **seven ejections, every one a `MERGE_CONFLICT` on
`CHANGELOG.md`**, every resolution the same mechanical "keep both entries".
#1566 alone needed six cycles across about four hours for a change whose content
stopped moving after the second.

One file per PR removes the shared region, so the conflict cannot happen. See
`engineering/decisions/2026-08-11-changelog-fragments.md`.

## The contract

Add **one file** named:

```
changelog.d/<slug>.<category>.md
```

- **`<slug>`** — lower-case `[a-z0-9._-]`, starting with a letter or digit.
  Convention is the issue number and a couple of words:
  `1593-changelog-fragments`. It only has to be unique; nothing parses it.
- **`<category>`** — exactly one of `added` · `changed` · `deprecated` ·
  `removed` · `fixed` · `security`. **This is what picks the release bump**, so
  it lives in the filename rather than in front matter: deriving the bump is
  then a directory listing, which no amount of prose can confuse, and a typo is
  a filename that matches nothing — a loud gate failure rather than an entry
  silently dropped from the release.

The file body is **Keep-a-Changelog bullets and nothing else** — no headings.
The `### Added` heading is written by the assembler at release time.

```markdown
- **Fixed: the roadmap lane no longer clips its last milestone.** The lane
  measured its width before the fit spine had run, so a twelfth milestone
  landed outside the viewport. It now measures after.
```

Lead a breaking change with `**Breaking:**` exactly as before — the release
still reads that marker and bumps major, whichever category the file carries.

## What happens to it

Nothing, until a release. **Release (prepare)** (`tools/release.js --prepare`)
converts every pending fragment into `.changeset/fragment-<slug>-<category>.md`,
naming `@laticent/lattice` with the bump the category above picks
(`tools/changesets.js` `fragmentToChangeset`). The first bullet, unwrapped onto one
line, becomes the changeset's first line, which is the line the release notes
print; the rest keeps its wording. `changeset version` then writes it into
`packages/lattice/CHANGELOG.md` and deletes both files in the release PR.

The first release, 1.0.0, is the exception: it bumps nothing and archives every
pending fragment into `changelog/pre-release-archive.md`, because its notes are the
curated `release-notes/1.0.0.md`. The 1,674 fragments pending at the cutover were
archived the same way.

**Nothing regenerates a `CHANGELOG.md` per PR.** That is deliberate: a build-time
assembly would make it a generated-from-*everything* committed artifact
byte-gated by `build:check`, which is the *other* merge-queue hazard (#1594 /
#1547), trading a visible conflict for a silent ejection.

## Gates

`checkChangelogFragments` (in `tools/check-ownership.js`, via `build:check`)
rejects an unparseable name, a heading, a body with no bullet, a conflict
marker, CR line endings or a BOM — and also rejects a **missing**
`changelog.d/`, so the gate can never pass by scanning nothing.

Fragments are ordinary repo prose, so US English applies (HARD RULE #21): write
`gray`, `license`, `behavior`. **Nothing checks this** — the repo-wide US-English
gate was retired once the tree was swept to zero, so the rule is discipline and
review, not a build failure.
