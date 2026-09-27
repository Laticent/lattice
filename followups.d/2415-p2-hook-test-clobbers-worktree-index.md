---
origin: 2415
priority: P2
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2415
---

# A pre-commit test clobbers a git worktree's index, and flipped the main repo's core.bare

why now   — seen in #2415's session: a commit made from an agent's git worktree
            (`.claude/worktrees/…`) failed in the pre-commit `affected-tests` step. During
            `test/unit/cli/check-lint-coverage.test.js` (it runs `git init` and `git add -A` in a
            temp folder) the worktree's real index was overwritten with the test's 19 fixture
            files, and every test that lists the repo's files then failed. In the same window the
            main checkout's `.git/config` gained `core.bare = true`, so every git command there
            failed with "must be run in a work tree" until it was reset by hand. Likely cause, not
            confirmed: git hands a hook absolute `GIT_DIR` / `GIT_INDEX_FILE`, and the test's child
            git calls inherit them. `test/unit/tools/staged-pdf-glob.test.js` looks exposed the same way.
where     — test/unit/cli/check-lint-coverage.test.js, test/unit/tools/staged-pdf-glob.test.js, and
            any test that spawns git (strip `GIT_*` from the child env), or tools/affected-tests.js.
done when — committing from a git worktree runs the pre-commit hook green, and neither the worktree's
            index nor the main repo's config changes during the run.
evidence  — a worktree commit log, and `git config core.bare` before and after.
verify    — maker-checker; it touches the hook path.
