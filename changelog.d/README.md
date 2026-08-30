# `changelog.d/` — one changelog entry per PR, in its own file

**Write your changelog entry here, not in `CHANGELOG.md`.** This is HARD RULE
#10's landing spot.

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

Nothing, until a release. `tools/changelog.js` reads `## Unreleased` **plus**
every pending fragment as one body, so `--bump`, `--notes` and `--check` all
already see your entry. The release (`tools/release.js`, serialized behind the
`release` concurrency group) folds the fragments into `## Unreleased` under
their category headings, rolls that into the dated version section, and deletes
the fragment files in the same commit.

**Nothing regenerates `CHANGELOG.md` per PR.** That is deliberate: a
build-time assembly would make `CHANGELOG.md` a generated-from-*everything*
committed artifact byte-gated by `build:check`, which is the *other* merge-queue
hazard (#1594 / #1547) — trading a visible conflict for a silent ejection.

## This is an interim

Its successor is `.changeset/`. `engineering/decisions/2026-08-09-changesets-multi-package-release.md`
plans to adopt Changesets across the five workspace packages and retire
`tools/changelog.js`'s versioning role; that is gated behind a manual first npm
publish which has not happened. When it does, slice 1 of that record converts
whatever is pending here. Until then this directory is where entries go.
Reasoning: `engineering/decisions/2026-08-11-changelog-fragments.md` §7.

## Gates

`checkChangelogFragments` (in `tools/check-ownership.js`, via `build:check`)
rejects an unparseable name, a heading, a body with no bullet, a conflict
marker, CR line endings or a BOM — and also rejects a **missing**
`changelog.d/`, so the gate can never pass by scanning nothing.

Fragments are ordinary repo prose, so US English applies (HARD RULE #21): write
`gray`, `license`, `behavior`. **Nothing checks this** — the repo-wide US-English
gate was retired once the tree was swept to zero, so the rule is discipline and
review, not a build failure.
