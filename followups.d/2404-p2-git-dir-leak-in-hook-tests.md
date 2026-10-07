---
origin: 2404
priority: P2
recorded: 2026-09-27
area: infra
severity: high
swimlane: engineering/development.md
source: https://github.com/Laticent/lattice/pull/2404
---

# Tests that run git leak into the real repo when a hook runs from a worktree

A `git push` from a `git worktree` corrupted the MAIN checkout's config. Afterwards
`core.bare = true`, `user.name = t` and `user.email = t@t`, and four `check-ownership` tests
failed, including "checkCommittedPdfs found NO committed PDFs".

```text
  P2 · [no ticket] strip inherited GIT_* variables from every test that spawns git.
       why now   — git exports GIT_DIR to a hook that runs in a worktree. A test such as
                   test/unit/tools/staged-pdf-glob.test.js:109-111 runs `git init` and
                   `git config` in a temp dir, inherits GIT_DIR, and so rewrites the real repo.
                   Worktrees are the natural way to test one PR while another is checked out.
       where     — test/unit/tools/staged-pdf-glob.test.js (spawnSync with cwd: tmp); grep
                   test/ and tools/ for other spawnSync/execFileSync('git', …) calls with a
                   foreign cwd.
       done when — the pre-push hook passes when run from a worktree, and the main
                   checkout's .git/config is byte-identical before and after.
       evidence  — the push log from a worktree, plus a `git config --list --local` diff.
       verify    — tier 0 gates, because it is test-harness hygiene with no product surface.
```
