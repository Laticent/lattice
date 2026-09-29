---
status: shipped
summary: >
  The decision index sorted rows newest-first, so every new note inserted at the top of its
  group and two PRs that each added a note to the same group conflicted on GitHub, which ignores the file's
  `merge=union` driver; that was 8 of the 27 required rebases in the #2466 window. Rows now
  sort A–Z by topic slug. Replayed on GitHub's terms over the 192 note-changing commits in the
  last 300 on `main`: the date order conflicts on 13 of 191 adjacent pairs, the slug order on
  0; over 354 pairs up to five commits apart that both rewrite the index, 88 against 5,
  and only 1 of those 5 did not also conflict under the date order. On GitHub itself, four
  real-topic probe pairs went `dirty` under the date order and `clean` under the slug order.
---

# The decision index's rows scatter, so two note PRs stop conflicting

## 1. The problem

`engineering/decisions/README.md` carries a generated index, one row per note. About 37%
of commits on `main` rewrite it (111 of the last 300). Rows sorted by date, newest first,
inside each status group. A new note carries today's date, so it always inserted at the top
of its group. Two PRs that each added a note therefore inserted at the same line, and git
reports two insertions at one point as a conflict.

`merge=union` in `.gitattributes` resolved that locally
(`2026-09-14-the-decision-index-merges-as-a-union.md`). GitHub does not apply merge drivers.
On GitHub the PR showed `mergeable_state: dirty`, got no `pull_request` CI run, and needed a
rebase. #2466 measured it: 8 of the 27 required rebases in 1,000 PR runs, and 9 of the 39
replayed conflicts, conflicted on the index and nothing else
(`2026-09-28-rebase-only-on-conflict.md` §3, §3b, §4b).

## 2. The fix

`tools/build-decisions-index.js` sorts each group by topic slug, the filename after its
`YYYY-MM-DD-` prefix, A–Z. A slug tie falls back to newest first. Nothing else changes: the
groups, the row format, the footer and `--check` stay as they were. `--check` never asserted
order (#1547), so an index merged in any order still passes.

Why it works: git merges two insertions cleanly when they land at different points, even
adjacent ones (measured in the 2026-09-14 note §2). A topic slug has nothing to do with when
the note was written, so two new rows land in different gaps among roughly 200 Active or 400
Shipped rows. They still conflict when no existing slug sorts between them, for example
`studio-foo` and `studio-fop`. That is rare, and the unit test pins it as the residual case.

What a reader loses: the index no longer shows recency. `ls engineering/decisions/20*.md |
tail` does, because the filenames start with the date. The README says so above the index.
The access pattern CLAUDE.md prescribes is `grep` for a topic, which does not depend on
order. A–Z by slug also groups related notes (`studio-*`, `pdf-export-*`, `vetrina-*`).

## 3. Evidence — replayed on GitHub's terms

**Method** (the harness is in §6). Take the last 300
first-parent commits on `origin/main` at `d0c6dfa` (2026-09-01 to 2026-09-29). Keep the 192
that change a note under `engineering/decisions/2*.md`. For a pair `(a, b)` with `b` after
`a`, treat them as two PRs open at once:

- base = the notes at `a^`;
- side A = base plus `a`'s note changes (added, edited, deleted);
- side B = base plus `b`'s note changes.

Render all three indexes with the old generator (date order, from `origin/main`) and with
the new one, splice each into the same README, and merge with plain `git merge-file`. That
applies no merge driver, which is what GitHub does.

| Pairs | Pairs | Conflicts, date order | Conflicts, slug order |
|---|---|---|---|
| Adjacent note-changing commits (`b` = next after `a`) | 191 | **13** | **0** |
| `b` up to 5 commits after `a`, and both sides change the index | 354 | **88** | **5** |

The adjacent row counts every pair, including ones where a commit edits a note's body and
leaves its row alone, so read it as a rate over ordinary concurrency. The second row keeps
only pairs where both sides really rewrite the index, which is the case the fix is for.

The 5 that still conflict under the slug order, read one by one:

| Pair | Why it conflicts | Would the date order also conflict? |
|---|---|---|
| `51119d97` · `ea70dd03` | `b` edits the note `a` added: a follow-up, not a concurrent PR | yes |
| `133ac54f` · `1c0c4fed` | the same: `b` edits `flowchart-authoring`, which `a` added | yes |
| `cac079ee` · `283f47ad` | both edit `one-style-delivery-spine`, a real conflict in the note too | yes |
| `d132a188` · `b36ebac2` | `vetrina-reveals-its-target` inserts directly above `video-component`, whose row `b` rewrote | **no** — the slug order caused this one |
| `30ffa6e0` · `fa181c9f` | `overflow-guards-trim` and `overflow-corpus-caption-footer` are new neighbors: no existing slug between them | yes |

Four of the five conflicted under the date order too. The fourth row did not: the date
order put the new row at the top of its group, far from the row `b` rewrote, and the slug
order put it directly above that row. So the new order trades 84 conflicts removed for 1
added, in this window. The last row is the residual case §2 names.

**How often the residual happens.** Of the notes added in the window and still present
(114 or 115, depending on how renames count), 3,210 pairs share a status group, and 36
(1.1%) have no existing row sorting between them by slug. Under the date order a same-day
pair in one group always had nothing between it.

**A real two-branch merge.** Two branches off this PR's head each add one note dated
2026-09-29 (`queue-probe-alpha` and `queue-probe-omega`) and regenerate the index. Merged with
`git --attr-source=<empty tree> merge-tree --write-tree`, as `npm run queue:precheck` does:


| Branches | Date order | Slug order |
|---|---|---|
| `merge-queue-probe` · `studio-export-probe` | exit 1 (conflict) | **exit 0** |
| `queue-probe-alpha` · `queue-probe-omega` (the notes' slugs) | not run | exit 1 — the residual case |

The second pair was the first one tried, and it conflicted: both slugs sort between
`qr-authoring-grammar` and `read-across-carousel`, with nothing between them. It is kept
here because it shows what the residual looks like: two notes whose slugs share a prefix no
existing note has.

**GitHub's own verdict.** Everything above merges locally with merge drivers off,
standing in for GitHub. To check the stand-in against GitHub itself, eight throwaway draft
PRs were opened on 2026-09-29 (#2483–#2490, closed unmerged). For each pair, branches `a`
and `b` each add one note dated 2026-09-29 to the same base and regenerate the index, and
the PR asks GitHub to merge `b` into `a`: two concurrent note PRs, judged by GitHub's merge
machinery. The topics are four real same-day pairs from the window, filed as follow-up
notes (`<slug>-v2`). The base is this change's head for the slug arm, and `main` at
`d0c6dfa` for the date arm.

| Pair (topics) | Group | Date order: GitHub | Slug order: GitHub |
|---|---|---|---|
| `playground-virtual-filmstrip` · `say-not-caption` | shipped | #2487 `dirty` | #2483 **`clean`** |
| `card-tag-register` · `trama-graph-chart-library` | active | #2488 `dirty` | #2484 **`clean`** |
| `backdrop-register` · `studio-panel-lazy-loading` | active | #2489 `dirty` | #2485 **`clean`** |
| `fit-policy` · `one-slide-frame` | shipped | #2490 `dirty` | #2486 **`clean`** |

`git --attr-source=<empty tree> merge-tree` predicted all eight before the PRs were
opened: exit 1 for each date-order pair, exit 0 for each slug-order pair. So the local
stand-in the replay rests on agrees with GitHub 8 of 8.

A first version of this probe held real notes out of a shared base instead of adding new
ones. Every pair merged clean under BOTH orders, because the held-out notes' same-day
siblings stayed in the base and sorted between them. A real PR adds a note dated today to a
base with no note from today, which is the shape above.

**Pinned in the unit suite.** `test/unit/cli/decisions-index.test.js` §"two concurrent note
PRs, merged on GitHub's terms" renders two same-day notes with an existing slug between
them and merges them with `git merge-file`: exit 0, and the merged index passes `verify`.
Under the old date order that test fails. A second arm pins the residual case (no slug
between the two new rows): it must still conflict, which shows the harness can tell the two
cases apart.

## 4. One-time cost

The first regeneration moves every row: 531 lines out, 531 in. Any open PR that adds a
decision note conflicts with this change once, when it lands. Resolve it with
`npm run decisions:index` after taking `main`'s side. After that one rebase, the index stops
conflicting.

## 5. What this does not fix

- **Two PRs editing the same note** still conflict in the note file itself. That is a real
  conflict and should stay one.
- **A new row next to an edited row.** Git conflicts when one side inserts a line directly
  beside a line the other side changed. The date order kept new rows at the top, away from
  most edits; the slug order scatters them, so it can land one beside an edited row. It
  happened once in 354 pairs (§3). Two edits to adjacent rows conflict in either order.
- **The prose above the index** is still under `merge=union` locally, with the limit the
  2026-09-14 note §4 states.
- **The other committed aggregates.** `engineering/capabilities.md` already sorts A–Z by
  script name. `engineering/gotchas.md` follows its topic files' heading order, but a new
  gotcha is also appended to its topic file, which conflicts first, so changing the index
  order would not help. `docs/route-budget.json` (50 of the last 300 commits) is a hand-set
  budget, not a generated file. These stay in
  `followups.d/2466-p2-committed-generated-files-conflict-across-prs.md`.

## 6. The harness

`gen-old.h.js` and `gen-new.h.js` are copies of `tools/build-decisions-index.js` from
`origin/main` at `d0c6dfa` and from this change, with `DIR` read from `$DEC_DIR`. Run as
`replay2.sh 300 5` for the five-apart row. The adjacent row came from an earlier version
that set `D = 1` and dropped both `cmp -s … && continue` filters, so it counted every pair.

```js
// usage: node drive.js <gen> <dir> <template> <out>
const fs=require('fs');const [gen,dir,tpl,out]=process.argv.slice(2);
process.env.DEC_DIR=dir;const m=require(gen);const {notes}=m.collect();
fs.writeFileSync(out,m.splice(fs.readFileSync(tpl,'utf8'),m.render(notes)));
```

```bash
#!/usr/bin/env bash
# replay2.sh <N> <D> — pairs (a,b) of note-changing first-parent commits among the last N
# on origin/main, b within D places after a. Base = a^; side A = a^ + a's note changes;
# side B = a^ + b's note changes. Each side's index regenerated with the old (date) and new
# (slug) generator, then merged with plain `git merge-file` — no merge driver, as GitHub.
set -u
cd /home/user/lattice
N=$1; D=$2; W=/tmp/claude-0/rp2; T=/tmp/claude-0
mkdir -p $W; git show origin/main:engineering/decisions/README.md > $W/tpl.md
mapfile -t C < <(for c in $(git rev-list --first-parent -$N origin/main | tac); do [ -n "$(git diff-tree --no-commit-id -r --name-only $c^ $c -- 'engineering/decisions/2*.md')" ] && echo $c; done)
mk() { rm -rf $1; mkdir -p $1; git archive $2 engineering/decisions | tar -x -C $1 --strip-components=2; }
apply() { git diff-tree --no-commit-id -r --name-status $2^ $2 -- 'engineering/decisions/2*.md' | while read -r st f g; do
    case $st in D) rm -f $1/$(basename $f);; R*) rm -f $1/$(basename $f); git show $2:$g > $1/$(basename $g);;
      *) git show $2:$f > $1/$(basename $f);; esac; done; }
gen() { for g in gen-old gen-new; do node $T/drive.js $T/$g.h.js $W/$1 $W/tpl.md $W/$1.$g.md; done; }
pairs=0; both=0; old=0; new=0
for ((i=0;i<${#C[@]};i++)); do
  a=${C[i]}; mk $W/base $a^; rm -rf $W/A; cp -r $W/base $W/A; apply $W/A $a; gen base; gen A
  cmp -s $W/A.gen-old.md $W/base.gen-old.md && continue   # a leaves the index alone: no race
  for ((j=i+1;j<${#C[@]} && j<=i+D;j++)); do
    b=${C[j]}; rm -rf $W/B; cp -r $W/base $W/B; apply $W/B $b; gen B
    cmp -s $W/B.gen-old.md $W/base.gen-old.md && continue
    both=$((both+1))
    for g in gen-old gen-new; do
      cp $W/A.$g.md $W/m.md; git merge-file -q $W/m.md $W/base.$g.md $W/B.$g.md; rc=$?
      if [ $rc -ne 0 ]; then echo "$g CONFLICT ${a:0:8} ${b:0:8}"; [ $g = gen-old ] && old=$((old+1)) || new=$((new+1)); fi
    done
  done
done
echo "note-changing commits: ${#C[@]}"
echo "window: $(git log -1 --format='%h %cs' ${C[0]}) .. $(git log -1 --format='%h %cs' ${C[-1]})"
echo "pairs where both sides change the index: $both — conflicts: date order $old, slug order $new"
```
