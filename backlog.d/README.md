# `backlog.d/` — the open issue queue, one file per issue

**Generated. Do not edit these files: edit the issue.** `tools/sync-backlog.js` writes one
file per open GitHub issue, and the **Sync backlog mirror** workflow
(`.github/workflows/sync-backlog.yml`) regenerates the folder every night and lands it
through the merge queue. Issues are the source of truth; this folder is the committed
snapshot, so leaving GitHub costs zero knowledge. It trails the issues by up to a day.

**Read it with `npm run backlog`, not by opening the folder.** That lists every open issue
here and every item in [`followups.d/`](../followups.d/README.md), one line each, grouped by
area and sorted by severity:

```
npm run backlog                       # the whole queue
npm run backlog -- --area engine      # one area
npm run backlog -- --min high         # critical and high only
npm run backlog -- --issues           # or --followups
```

Then open the one card you picked: `backlog.d/<issue-number>.md`.

## What a file holds

```markdown
---
issue: 2458
status: backlog                 # the board column: backlog | ready | in-progress | review | none
area: infra                     # the issue's area:* labels
type: fix
priority: high                  # critical | high | medium | low
assignees:
flags: needs:triage             # needs:triage / needs:definition, when the triage gate set them
url: https://github.com/Laticent/lattice/issues/2458
generated: tools/sync-backlog.js — do not edit; edit the issue
---

# [studio-security-e2e] Studio sandbox specs failing on main

## Swimlane

_missing — no governing doc on the issue_

## Done when

_missing — no acceptance check on the issue_
```

**Swimlane** and **Done when** are the issue's two Definition of Ready fields
(`engineering/workflow.md` §Definition of Ready). The sync reads them with the same parser the
triage gate uses (`.github/scripts/issue-form.js` `parseForm`). The parser is the same, but the
verdict can differ: the gate flags `needs:definition` only on cards opened after its cutoff, and
never on `feedback` cards (`.github/scripts/triage.js`), while this file says `_missing_` for any
card. A form's **Summary** is copied too. The rest of the
issue body is not: the `url` has it, and copying long discussions would churn the mirror on
every comment-sized edit.

## Why one file per issue

- **Reading cost.** The old single `BACKLOG.md` was 66 KB, about 16.5k tokens, and its
  Backlog column was one 331-line list. Now `npm run backlog` gives the overview and a
  session opens only the cards it works on.
- **Diffs that say what moved.** A sync touches only the cards that changed, so the nightly
  PR's file list is the list of issues that moved.
- **No new conflicts.** Only the sync writes here, and no person's PR touches the folder.
  The old file never conflicted either: 21 bot syncs and 3 human edits from 2026-08-01 to
  2026-10-07. Files are named by issue number alone, so a retitle edits a file in place
  instead of renaming it.

## What the sync does and does not do

- It **adds** a file for each newly opened issue, **rewrites** a file whose issue changed,
  and **deletes** a closed issue's file. It never touches this README.
- `node tools/sync-backlog.js --input issues.json --check` exits 1 on drift either way.
- It is not a CI gate: a PR is never asked to refresh this folder.
- No gate or test reads these files. The repo-wide text walk skips the folder (`US_SKIP_DIRS`
  in `tools/check-ownership.js`), and every unit test that walks all tracked Markdown excludes
  it through `test/helpers/generated-mirrors.js`. Issue text is an external string (HARD RULE
  #21), and a test that read it would turn the nightly sync PR red over an issue body.
