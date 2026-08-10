---
status: shipped
summary: Two independent defects kept the Studio's nightly Playwright matrix from doing its job, and the second hid the first. (1) INVALID - #1500 (5e9deb3) fixed the root-deps blackout but its diff replaced the `runs-on: ubuntu-latest` + `timeout-minutes: 30` pair with a comment and `timeout-minutes: 60`, dropping `runs-on` as collateral. A job without `runs-on` fails workflow VALIDATION, so from that merge the file has not been loadable at all: every run is a startup failure with zero jobs, named after the file path rather than the workflow, and the cron cannot fire. Nothing catches this - no workflow lints workflows, this one has no pull_request trigger, and a startup failure looks in the Actions list exactly like an ordinary red. (2) SILENT - it is the only nightly here that files no issue on red (perf, preview-e2e, integration and modulepreload-coverage all do), so its verdict has only ever been a red X on a scheduled run nobody is paged for. FIX: restore `runs-on`; add a rolling `[studio-e2e]` tracking issue. THREE defects the adversarial checker found in the first draft of that issue step, all fixed here: the sibling workflows' `gh issue list --search "in:title [marker]"` idiom is broken because GitHub tokenizes on brackets and hyphens, degrading the query to `studio` + `e2e` and matching human issues #1507/#1514 - it would have commented on someone else's issue nightly and never created its own, so matching is now client-side on the EXACT title; a job-level timeout kills the job so no later step runs even under always(), so the test step now carries its own 45-minute ceiling below the job's 60 and the issue step keys off `steps.e2e.outcome` as well as the output; and a mass-failure body can exceed GitHub's 65,536-char cap and 422 the step, losing the alarm in the loudest case, so both body sections are clamped. ALSO RECORDED: an earlier draft of this work claimed the suite "executed zero tests for 30 consecutive nights since 2026-07-11", which is FALSE - it was derived by reading one run's logs and generalizing across 30 red conclusions. Real logs show 112-177 tests executing on most of those nights, red for genuine spec failures (#1493, #1505, #1507, #1514); the startup blackout was four nights. The claim never merged. The lesson is the one this whole note is about: a red conclusion is not a diagnosis, and neither is a green one.
---

# The nightly was invalid, and that is why nobody could tell (#1498)

**Date:** 2026-08-10 · **Status:** SHIPPED

## Two defects, and the second hid the first

**1 · The workflow does not load.** `#1500` (`5e9deb3`) fixed the real root-deps blackout —
the preview server could not boot without root `node_modules` (#1271). But its diff did this:

```diff
-    runs-on: ubuntu-latest
-    timeout-minutes: 30
+    # 60, not 30. This ceiling is OURS, not GitHub's …
+    timeout-minutes: 60
```

`runs-on` went with the comment rewrite. A job without it fails workflow **validation**, so
since that merge the file has not been loadable: runs are startup failures with **zero jobs**,
and GitHub names such a run after the file path rather than the workflow. The cron cannot fire.
Neither job has executed.

**2 · The workflow cannot raise an alarm.** It is the only nightly in this repo that files no
issue on red. `perf-nightly`, `preview-e2e-nightly`, `integration-nightly` and
`modulepreload-coverage-nightly` all open or append a rolling tracking issue; this one has only
ever produced a red X on a scheduled run nobody is paged for.

The second is why the first went unnoticed. In the Actions list a startup failure — the most
severe outcome available, where *nothing ran* — is visually identical to a suite that ran 240
specs and had two fail.

## Decision

- **Restore `runs-on: ubuntu-latest`**, with a comment naming how it was lost, so a future
  comment rewrite in that block does not repeat it.
- **Add a rolling `[studio-e2e]` tracking issue** to the deterministic `e2e` job.
- **`e2e-ai` files nothing, deliberately.** It shares the webServer startup path, so any
  infrastructure break lands in the other job's issue; alone it can only fail on the live-model
  scenario, and an issue per paid-API hiccup is the alert fatigue that makes an alarm worth
  ignoring.

## Three defects in the first draft of the issue step

An independent checker was run on this change specifically because **nothing else can verify
it**: the workflow has no `pull_request` trigger, so no CI check exercises it before the cron
fires. It found three real bugs, all fixed here.

**The sibling workflows' marker idiom is broken.** They all do:

```sh
gh issue list --state open --search "in:title [preview-e2e]"
```

GitHub tokenizes on the brackets and the hyphen, so `in:title [studio-e2e]` degrades to the
terms `studio` + `e2e`. Two open human-authored issues match that today — **#1507** and
**#1514** — and `.[0]` takes whichever ranks first. The first failing nightly would have
commented on a person's issue and kept appending there every night, while the rolling issue was
never created. Matching is now **client-side on the exact title**, which no tokenizer can
reinterpret. The siblings carry the same latent bug; their markers simply do not collide yet.

**A job timeout files nothing, `always()` or not.** A job-level timeout kills the job — later
steps do not run, including ones guarded by `always()`. So the "suite killed mid-flight" case
that `#1498` is partly about would have produced silence. The test step now carries its own
**45-minute ceiling below the job's 60**, so a hang fails the *step* and leaves the job alive to
file; the issue step keys off `steps.e2e.outcome` as well as the captured output, because a
timed-out step never writes one.

**A loud failure can lose its own alarm.** Matched failure lines run ~350 bytes each; a broken
shared selector across the 240-spec matrix crosses GitHub's 65,536-char body cap, `gh issue
create` 422s, `set -e` fails the step. Both body sections are now clamped.

## A false claim, recorded because the correction is the point

An earlier draft of this work asserted, in five places, that the suite had "executed zero tests
for 30 consecutive nights since 2026-07-11."

**It is false.** It was produced by listing 30 scheduled runs, seeing `conclusion: failure` on
all of them, reading **one** run's logs, and generalizing. The real logs show 112–177 tests
executing on most of those nights, red for genuine spec failures — which is exactly why #1493,
#1505, #1507 and #1514 exist. The startup blackout was **four nights** (2026-08-06 → 08-09),
which is what #1500's own commit message says.

It never merged. It is recorded here because the error and this note's subject are the same
mistake in two directions: **a red conclusion is not a diagnosis, and neither is a green one.**
Thirty reds looked like one story and were three. A green Actions list, after this lands, will
mean "the AI tier passed" and not "the suite is green" — because the deterministic job exits 0
on spec failure by design, the house shape it inherits from `integration-nightly`.

## Consequence for #800

`ci.yml` and `engineering/development.md` both tell a future reader to promote `studio-smoke`
into `ci`'s `needs` after an "observed nightly green streak" (`2026-06-28-experience-gating-playwright.md`
§3, *"never promoted on hope"*). Two things now qualify that:

- No streak can accrue until the workflow **loads**, which is this change.
- After this change the streak must be read off **issue history, not the Actions list**, since
  the deterministic job is green by design when specs fail.

## Verification

The workflow is schema-valid (every job has `runs-on`; parsed with `yaml.safe_load`). The issue
script was run locally against the real shape of the problem: exact-title matching returns *no
match* against the three colliding open issues (#1493, #1507, #1514) and so would create the
rolling issue rather than hijack one, and returns the right number once that issue exists; a
synthetic 400-failure report clamps to ~20KB against the 64KB cap.

**The fix itself is UNVERIFIED in the only sense that counts** (HARD RULE #23), and
unavoidably so: the proof is a scheduled run on `main` that loads, executes tests, and files an
issue. That cannot be produced from a branch, because the workflow runs on cron against `main`
and has no `pull_request` trigger. The first post-merge nightly is the verification event.
Expect it to open a `[studio-e2e]` issue immediately — the suite has real failures on `main`
(#1493, #1507, #1514), and surfacing them is the system working.

`actionlint` is **not** available in this sandbox and was not run; an earlier draft of this note
claimed it was clean, which was untrue.
