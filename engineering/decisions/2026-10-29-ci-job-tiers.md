---
status: shipped
summary: >
  Per-job call on what runs on every pull request, from 999 PR runs (2026-10-18..28). unit (node 24) moves to the
  merge queue only (0 unique catches); studio-smoke stops running unread in the queue but stays on PRs (the Studio
  nightly is red 10 of 10); the iOS Simulator suites run nightly and on dispatch. Flakes: the CLI's Chrome launch
  limit fixed, marp-cli no longer re-downloaded on every integration leg, and a test that read SVG order fixed.
---

# Which CI jobs run on every pull request, job by job (2026-10-29)

**Answer.** Two jobs move off the pull request and one flake source is cut at its root:

- `unit (node 24)` runs in the merge queue only.
- `studio-smoke` runs on pull requests only, no longer in the merge queue.
- The iOS Simulator platform suites run nightly and on dispatch, never on a pull request.
- Two flake sources are fixed or shrunk rather than moved: Chrome's launch limit in the CLI, and marp-cli being
  downloaded again on every integration leg (the registry metadata call remains). A third, `mermaid-worker-confine`, had a test bug and is fixed too.

Every other job stays where it is, for the reasons in the table. The owner asked for the call to be made per job, on
impact, not all-or-nothing.

## The evidence

All 999 `pull_request` runs of `ci.yml` from 2026-10-18 21:55Z to 2026-10-29 02:34Z (167 PR branches, every attempt),
the 179 `merge_group` runs of the same window, and the logs of all 406 failed jobs. A **unique catch** is a run where
the job was the only one to fail, and a later run on the same branch passed it. A dependency break that failed every
job at once (the `lib0` module, a bad lockfile) is not counted as anyone's catch.

| Job | Min per PR | Unique catches per 100 PRs | Flaky or infra share of its failures | Decision |
|---|---|---|---|---|
| lint | 13 | 2.4 | 0% | stays on every PR |
| unit (node 22) | 61 | 3.6 | 24%, all Chrome launch timeouts | stays; the launch timeout is fixed (below) |
| unit (node 24) | 35 | 0 | 19% | **merge queue only** |
| integration, 4 legs | 169 | 3.6 | 51% of leg failures passed on a re-run | stays; the marp-cli fetch, its largest flake, is fixed (below) |
| docs-build | 60 | about 11 for code; 38 for the byte declaration | 2% | stays, declaration included (below) |
| studio-smoke (advisory) | 64 | about 7, some flaky | 43% | **pull requests only** |
| golden-diff (advisory) | 41 | none; it posts a comment | 0% | stays |
| player no-JS (WebKit) | ~5, when the player changes | 0 | 100% (the Ubuntu 26.04 Playwright issue) | stays |

The window includes the Ubuntu 26.04 image rollout and the `lib0` incident, so the infra shares of `studio-smoke` and
`player-webkit` read high.

## Each decision

**`unit (node 24)` → merge queue only.** It runs a subset of node 22's tests on the newer Node, and in 999 PR runs it
failed alone, for a reason the author then fixed, zero times. It failed alone three times: once while node 22 was
cancelled, and twice on the Chrome launch flake this change fixes (runs 40790016781 and 40732970015). All four `npm ci` wedges recorded at the top of `ci.yml` were this leg. In the queue it
still runs on every merge, so nothing reaches `main` untested on 24. What it costs: a Node-24-only break now ejects one
queue group instead of redding a PR, which in this window would have happened at most twice (the queue's two
node 24 failures).

**`studio-smoke` → pull requests only.** It is advisory everywhere: absent from `ci`'s `needs`. On a pull request an
author reads it. In the queue nobody does, and it still ran there, because the queue forces the `docs` tier on and its
`if` did not check the event: 2,408 runner-minutes over 179 queue runs, the most of any advisory job, buying nothing.
`workflow.md` already said it never ran in the queue; that is now true. **It does not move to the nightly**, which
the first cut proposed: `studio-e2e-nightly` failed all 10 of its scheduled runs to 2026-10-28, so a selector drift
caught only there would land in a rolling red issue nobody can tell apart from the rest. Until that nightly is
green (followup `2971-p1`), the PR run is the Studio's only working e2e signal.

**The iOS Simulator suites → nightly and dispatch.** In the 100 platform-suites PR runs from 2026-10-28T10:50Z to
2026-10-29T02:25Z they ran 49 jobs for about 820 macOS minutes, 27 of the jobs not green (failed or cancelled), and
they gate nothing. `"on_pull_request": false` in `.github/platform-suites.json` keeps
them out of every PR run, plumbing edits included. Their `paths` still say when a change reaches them, so
`npm run evidence` plans a dispatch for exactly those suites.

**`unit (node 22)` stays, and its flake is fixed.** Nothing else runs the unit suite before the queue (pre-push dropped
`npm test`), so moving it would turn every unit failure into a queue ejection. 7 of its 29 failures were "Timed out
after 30000 ms while waiting for the WS endpoint URL" in a test that spawns `lattice.js` (`export-media-addresses`);
node 24 had 2 more (`slide-bar`). The cause: Puppeteer's own 30 s launch limit fired before the CLI's 90 s watchdog
(`RENDER_WATCHDOG_MS`), so a runner busy enough to start Chrome slowly failed a launch the CLI meant to allow. Every
CLI launch now passes the watchdog's value as Puppeteer's `timeout`. Reproduced with a Chrome wrapper that sleeps
35 s before starting: before the change the export fails at 30.9 s with that exact message; after it, it succeeds
at 39 s. The price, found by the checker: the launch `guard` now fires first, and its timeout counts as a wedge, so
the render is retried once with the hardening flags. A Chrome that never starts therefore fails after about twice the
watchdog (180 s by default) instead of at 30 s. The retry stays, because the hardening flags are what start Chrome in
a small container. `lattice video` launches without the new limit.

**`integration` stays, and its biggest flake is fixed.** It is the only per-PR render gate, and the nightly runs
different suites, so a move would leave render regressions unguarded until the queue. Its leg failures split:
- **The marp-cli fetch.** Five files run the real marp-cli through `npx -y`, and every leg downloaded it and its
  dependency tree from npm again. When the registry was slow, the 90 s fetch probe timed out ("could not fetch
  marp-cli (exit null)") and the suite's before-hook cancelled every test under it. That was 4 of 4
  `marp-bundle-author-script` failures and 5 of 11 `marp-admission` failures. The integration job now caches
  `~/.npm/_npx`, keyed on the file that holds `MARP_CLI_RANGE` and the ISO week. This shrinks the fetch rather than
  removing it: npx still asks the registry for the package's metadata on every call, so a registry that is down
  still fails the probe; what goes is the tarball downloads and the unpack race. The cache is scoped to the PR that
  saved it, so a PR's first run misses. The week in the key keeps a new marp-cli 4.x from going unseen.
- **`mermaid-worker-confine` had a test bug.** It read the two flowchart images' widths in SVG order and took the
  first for the outside node; Mermaid does not promise that order. It failed 6 times with "the outside picture is the
  stand-in (width 20)", 20 being the inside picture's real width. It now matches each image to its node, and its
  message carries both widths and the worker's stderr. Arm: with confinement switched off, it fails with
  `widths {"A":20,"B":20}` and nothing refused.
- **The rest are real catches or still open.** `slide-camera`'s 0.118% failures all came from one PR that changed the
  camera. `marp-admission`'s hard-coded plugin list fails when a PR adds a plugin, which is its job. Three
  "mermaid `<pre>` is marked" failures are not diagnosed here.

**`docs-build` stays, byte declaration included.** 85% of its failures are the route budget asking a PR that grew a
route past its free bytes to say why, in one line (`docs/route-budget.d/README.md`). That is the step working: the
sentence is the point, and its failure prints the exact line to add. Making it a warning would remove the friction
that is its whole purpose. The cost is real (a missed declaration costs one 11-minute docs build), so the cheap
improvement is catching it before CI: followup `2971-p2`.

**`lint`, `golden-diff`, `player-webkit` stay.** `lint` is cheap, never flaked and catches stale artifacts that would
otherwise eject PRs from the queue. `golden-diff` exists for its before/after comment, which only means something on
the PR, and it is fast when no golden moved (p50 91 s). `player-webkit` was made blocking on the owner's call (PR
#2494), already runs only when the player changes, and its five failures were all the Ubuntu image.

## Not measured

- Whether a later green run was the author's fix, a rebase onto a fixed `main` or a flake. Same-SHA re-runs are
  excluded; the rest is mixed.
- How long a break would sit on `main` under the nightly. That shows only after a job moves.
- The merge-queue half of the `unit` matrix: its expression runs only on `merge_group`, so the first queue run of
  this change is its proof.
