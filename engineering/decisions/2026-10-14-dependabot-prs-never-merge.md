---
status: in-progress
summary: >
  Dependabot's "needless" rebases are it refreshing its lockfile after main changes the
  same lockfile; leave rebase-strategy alone. The real defect is that no Dependabot PR has
  merged since 2026-09-02: 0 of 60 CI runs went green in 1,835 PR runs, and the security
  group (#1497, DOMPurify 3.4.11 → 3.4.16) has been red since 2026-08-09 because a
  dependency bump changes committed generated bundles that Dependabot cannot rebuild.
---

# Dependabot PRs never merge, and that is the cost, not the rebases

## 1. The question

`2026-09-28-rebase-only-on-conflict.md` §6 found 16 Dependabot rebases, in two weeks, of
PRs that would have merged cleanly on GitHub's terms (~140 CI minutes). HARD RULE #16
cannot reach a bot, so `followups.d/2466-p3-dependabot-rebases-clean-prs.md` asked what
triggers them. The answer is ordinary, and it points at a bigger problem.

## 2. What triggers the rebases

GitHub's
[Dependabot options reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference)
(`rebase-strategy`) says Dependabot rebases an open PR when its schedule runs, when the PR is
reopened, when `target-branch` changes, or when the PR "is in conflict after a recent push
to the target branch". The repo sets no `rebase-strategy`, so that default applies.

Each of the 29 same-message Dependabot pushes from 2026-09-20 to 10-14 was replayed:

- 20, outside the schedule, came after a commit on `main` that changed the same lockfile (`package-lock.json` for
  the root groups, `docs/package-lock.json` for the docs groups). A text merge of two
  lockfiles can be clean and still wrong, so Dependabot regenerates. In 27 of the 29, the
  regenerated diff was identical to the old one, so the refresh was not needed, but
  Dependabot cannot know that without doing it.
- 5 came from the weekly scheduled run (Saturdays about 10:03Z).
- 4 have no visible trigger.
- They did not stop when the owner turned off the ruleset's strict flag (the ruleset was
  last updated 2026-10-06T11:40Z): 5 off-schedule rebases came after it.

**Decision: leave `rebase-strategy` at its default.** Turning it off saves about 1% of CI
minutes and leaves a Dependabot PR with a stale lockfile, or a real conflict, stuck until a
person comments `@dependabot rebase`.

## 3. What the replay found instead

Every Dependabot CI run in both windows was red: 0 green of 24 runs before and 36 after
(1,835 PR runs in all). No Dependabot PR has merged since 2026-09-02 (the last three were
ungrouped bumps), and no grouped PR merged in either window: #2505 was rebased 9 times and
then closed unmerged. 17 are open, the oldest from 2026-07-05. Each one is rebased
and re-run whenever `main` changes its lockfile, so the 16 "needless" rebases are a symptom:
they are CI spent on PRs that cannot land.

The three grouped PRs open on 2026-10-14 fail for three different reasons:

| PR | Opened | Updates | Fails at |
|---|---|---|---|
| #1497 security (root) | 2026-08-09 | `dompurify` 3.4.11 → 3.4.16, `esbuild` 0.28.0 → 0.28.1 | `lint` → `build:check`: three committed bundles are stale (`lib/export/{anima-player,guide-player,speech-projection}-bundle.generated.mjs`). `speech-projection` bundles DOMPurify, and an `esbuild` bump changes the bytes of all three |
| #2569 security (docs) | 2026-10-07 | `dompurify`, `sharp`, `esbuild`, `svgo` | `docs-build` → its tests |
| #2582 routine (root) | 2026-10-07 | 17 updates, including Biome | `lint`: the new Biome adds rules the code fails (`useOptionalChain`), and the build's lint-coverage check aborts |

#1497 is the one that matters. DOMPurify is the sanitizer behind `sanitizeSlideHtml`
(HARD RULE #22), and its patch releases have been blocked for two months by a build gate
working as designed: Dependabot changes `package-lock.json`, but nothing rebuilds the
committed bundles, so `build:check` reports them stale. This is a cost of keeping
generated JS committed under `lib/`, which the owner deferred until the desktop app lands
(`2026-10-06-conflict-reduction.md` §3). That deferral did not count this cost.

## 4. Options

These are the owner's call. Rebuilding the export bundles changes the bytes of an exported
artifact (the CLAUDE.md QUALITY BAR's export exception), and options B and C change shared
CI or bot behavior.

- **A. Land the two security bumps by hand now.** A session updates `dompurify` and
  `esbuild`, runs `npm run build`, and commits the three rebuilt bundles in its own PR,
  with dark and light renders of a demo deck for export sign-off. This unblocks the
  sanitizer fix only. Every later bump to a bundled package hits the same wall.
- **B. Rebuild the bundles on Dependabot PRs.** A workflow step on Dependabot branches
  runs `npm run build` and pushes the rebuilt bundles. That is a new CI step, it needs
  `AUTOMATION_PAT`, and Dependabot stops managing a branch someone else has pushed to.
- **C. Stop committing the generated JS now.** This reverses the deferral in
  `2026-10-06-conflict-reduction.md` §3. It removes this failure and the conflict class
  together, at up to ~27s more per `npm install` (measured in that note), with the desktop
  app's build still unknown.
- **D. Do nothing.** Dependency updates, including security fixes, keep not landing.

**Recommendation: A now, then C.** A is reversible and closes the security gap this week. C
fixes the cause, and the cost the deferral weighed now includes blocked security updates.
The routine group's Biome failure (#2582) is ordinary upgrade work in any case.

## 5. Owner decision and option A (2026-10-14)

**The owner picked A now, then C.**

**A landed in the PR that added this note.** It makes the same bumps as #1497 (root
`dompurify` ^3.4.16 and `esbuild` ^0.28.1), plus `dompurify` ^3.4.16 in `docs/` from #2569,
and rebuilds the three bundles with `npm run build`:

- `anima-player` and `guide-player` change only esbuild's CommonJS wrapper helper, which now
  resets a module that throws while loading (+33 bytes each).
- `speech-projection` carries DOMPurify 3.4.16 (+2.1 KB).

**Export evidence.** Three player decks (`html-player`, `anima-scene`, `guide-storyboards`)
were exported with `--player --captions`, in dark and light, once with the old bundles and
once with the new:

- All 52 caption files (`.vtt`) are byte-identical.
- `anima-scene` grows by exactly the 33 bytes. The other two decks do not embed a changed
  player.
- 17 of 18 screenshots matched on the first pass. The animated frames that differed between
  runs differ by the same amount when the new export is compared against itself
  (50–974 px), so the difference is animation timing.

**What is still red.** #2569 (docs: `sharp`, `esbuild`, `svgo`) fails `docs-build`, and
#2582 (routine) fails the new Biome's lint rules. Both are ordinary upgrade work. Pushing to
`main` on 2026-10-14, GitHub reported 122 open vulnerability alerts on the default branch
(1 critical, 51 high). Most should clear as these groups land.

**C is next.** `followups.d/2554-p1-uncommit-generated-js.md` now carries
the owner's go-ahead.
