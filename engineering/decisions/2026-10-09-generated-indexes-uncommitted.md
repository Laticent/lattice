---
status: shipped
summary: >
  Generated indexes are never committed. The capability, decision and gotcha indexes are built
  from one-file-per-item sources into dist/engineering/ by npm install, and their --check
  validates the sources instead of diffing an output. 23 of the 50 commits to 2026-10-09
  rewrote at least one of the three committed copies.
---

# Generated indexes are built, never committed

**The owner asked:** use `<folder>.d/`-style sources for anything that is really an index, and
generate the index. When is each index needed, and when does it get generated? The owner picked
the long-term shape: hand-written files stay committed, and generated output lives in `dist/`.

## 1. The measurement

Over the 50 commits on `main` ending at `953301c4`:

| File | Commits that rewrote it |
|---|---|
| `engineering/capabilities.md` | 12 |
| `engineering/decisions/README.md` | 12 |
| `engineering/gotchas.md` | 5 |
| **any of the three** | **23** |

Each of the three is generated from sources that were already one file per item: the
`tools/` headers and `package.json` scripts, one note per decision, one topic file per
gotcha group. Only the OUTPUT was shared, so two unrelated PRs that each added a tool, a note
or a gotcha rewrote the same file.

On 2026-10-09, 13 of the 18 open PRs conflicted with `main` on GitHub's terms
(`git --attr-source=<empty tree> merge-tree`, the `queue:precheck` method). 7 of the 13
conflicted on `engineering/decisions/README.md` and 2 on `engineering/capabilities.md`. All 13
were stale heads from August and September. The 5 PRs opened in the two weeks before were
clean.

The repo had already paid for three workarounds to keep the committed decision index
mergeable:

- a `merge=union` driver in `.gitattributes`, which GitHub ignores, so it helped local merges
  only (`2026-09-14-the-decision-index-merges-as-a-union.md`);
- a `--check` deliberately weaker than a byte-diff, so two note PRs could share the merge
  queue (#1547; `parseIndex` and `verify`, about 150 lines in each of two generators);
- rows sorted by topic slug instead of date, so two new rows rarely shared an insertion point
  (`2026-09-29-decision-index-rows-scatter.md`).

The `.gitattributes` note named the real fix itself: "move the generated block into its own
file so the driver covers only generated content."

## 2. The decision

**An index is never committed.** The contract, for these three and for any future one:

1. **The source is one file per item**, committed: a note, a topic file, a tool header.
2. **The output lives under `dist/`**, which `.gitignore` already covers. These three go to
   `dist/engineering/`, named after the folder they index, and the npm package excludes that
   folder (`!dist/engineering/` in `files`) because their links point into `engineering/`.
3. **The step is `uncommitted: true, validates: true`** in `tools/build.js` `STEPS`.
   `uncommitted` puts it in `build:uncommitted`, so `npm install` (`prepare`), the
   SessionStart hook and `npm run build` write it. `validates` keeps it in `build:check`.
4. **`--check` reads the sources, never the output.** There is no committed copy to compare,
   so the check asks only what a PR is responsible for: is every tool and script described,
   is every note's front-matter valid, is any row over its cap.
5. **Write never fails on a bad source.** It warns, skips the bad item and writes the rest,
   because it runs inside `npm install`, and one malformed note must not break every install
   on a branch. The gate is `--check`.

`test/unit/tools/uncommitted-steps.test.js` holds the tags to this: the three steps must be
`uncommitted` and `validates`, `validates` may only ride on an `uncommitted` step, and
`scopeSteps` (the function `build.js` uses) must keep every `validates` step in both
`build:check` and `build:uncommitted`.

## 3. When each index is needed, and where it is built

| Reader | When it must exist | Where it is built |
|---|---|---|
| An agent or person in a checkout | After install | `prepare` → `build.js --only-uncommitted`; the SessionStart hook; `npm run build` |
| A CI job | Before the job reads it | Every job that loads repo code runs root `npm ci`, which runs `prepare` |
| A reader on github.com | Any time | `publish-kits.yml` copies `dist/engineering/` to the `dist-kits` branch, with links rewritten to `main`. No push trigger covers the sources, so a decision note does not cost a full build; the nightly run keeps the copy at most a day behind |
| An npm package consumer | Never | Excluded from `files` |

Nothing builds an index by committing it to `main` from a bot. That would put a second writer
on a shared file, which is the problem this removes.

## 4. What it removed

- `parseIndex`, `verify` and `splice` in both index generators, and their tests.
- The `merge=union` driver and its 50-line rationale in `.gitattributes`.
- The rule that a gotcha written into `engineering/gotchas.md` is silently destroyed. The
  file is hand-written now, so nothing overwrites it.
- 568 lines of committed `capabilities.md`, and the generated halves of
  `decisions/README.md` (650 lines) and `gotchas.md` (280 lines).

The hand-written halves stay where they were, so every pointer to
`engineering/decisions/README.md` (the note convention) and `engineering/gotchas.md` (how to
use and add gotchas) still resolves. Pointers that meant the INDEX now name
`dist/engineering/<name>.md`: CLAUDE.md's routing rows, `AGENTS.md`, `README.md`,
`engineering/README.md`, `engineering/development.md`.

The slug sort order stays. It no longer prevents conflicts, but it is a stable, readable order,
and changing it would buy nothing.

## 5. What it costs

- **A fresh clone has no index until `npm install`.** Every other `dist/` artifact already
  works this way, and CLAUDE.md already routes agents to `dist/docs/components.pick.md`.
- **github.com shows the index on `dist-kits`, not next to its source**, and up to a day late.
- **Install time:** the three generators take 0.7s together, measured on 2026-10-09.

## 6. What it does not fix, and what is next

The same shape exists elsewhere, and each is a follow-up rather than part of this change:

- **`SCRIPT_META` in `tools/build-capabilities.js`** is a hand-edited map of every npm script's
  description, and every PR that adds a script edits it. It was in 9 of the same 50 commits.
  The description could live next to the script, for example as one file per script.
- **The 42 committed `lib/**/*.generated.*` registries** (plugin registry, chart registry,
  package index and others). The owner deferred these until the desktop app lands
  (`followups.d/2554-p3-uncommit-generated-js-after-desktop-app.md`). Under this contract the
  question that deferral turns on is concrete: the desktop app's build must run the engine's
  `npm run build` first.
- **`derive-cat-ink.js` and `derive-chart-cat-ink.js` write generated values into the
  hand-written `themes/*.css`.** A file with two writers invites conflicts; the fix is to give
  the generated values their own file.
