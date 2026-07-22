---
status: shipped
summary: >
  HOLD the autonomous torture crawler (Slice 3 of the 2026-07-20-autonomous-torture-profiler design) —
  and record the REAL reason, superseding the earlier "no evidence yet that autonomy finds a leak a human
  wouldn't script (ROI unmet)" as the operative one. "No evidence" is the weak reason: it invites "so run
  the probe and get evidence," treating the question as empirical-pending. It is actually settled by a
  category distinction. The friction that a crawler purports to relieve — not wanting to supply a fresh
  hypothesis per run ("having to have a clue"), and not wanting a recurring manual leak-hunting tax as the
  app grows ("future leak-detection churn") — is an AUTOMATION problem, not an AUTONOMY problem. Automation
  (deterministic scenarios wired into CI) removes the per-run clue (you write it once), makes coverage
  ACCUMULATE (write-once, guard-forever), and catches REGRESSIONS. Autonomy (the greedy crawler) does
  NEITHER well: it still needs scripted seeds + human-curated net-zero tours and reaches the leaky corners
  unreliably (§4.1 fingerprinting over/under-collides), and it INCREASES churn (unsolved fingerprinting /
  selector-staleness; a non-deterministic path can't be a stable CI regression guard). So the crawler is
  the wrong tool for the actual felt friction. Build the fallback — a small, growing library of cheap
  deterministic scenarios in CI — when the friction bites. The crawler's only legitimate niche is a later,
  unproven, occasional DISCOVERY AID that feeds that library; a real find becomes a durable scenario, so
  the crawler is never the standing mechanism. The §9 autonomy probe is demoted from "the gate on whether
  Slices 3–5 exist" to "an optional one-off if we ever specifically want to hunt un-imagined leak surfaces."
---

# The autonomous crawler is held — the friction is automation, not autonomy

> **Decision.** Do not build Slice 3 (the greedy `explore` crawler) of
> `2026-07-20-autonomous-torture-profiler.md`. Not "until we gather ROI evidence" — that framing is
> wrong. The friction a crawler would relieve is met by **automation** (deterministic scenarios in CI),
> and the crawler is a poor fit for it on both counts. When leak-hunting friction bites, write scenarios
> and wire them to CI (the design's own §11 fallback). Revisit the crawler only as a narrow, occasional
> discovery aid, and only if a cheap probe ever shows it reaches leaks a hunch can't.

## Why re-record the reason

The design doc's §11 already declines to build on spec, but gives the **weak** reason: "there is no
evidence yet that autonomy finds a leak a human wouldn't script." That reads as *empirical-pending* — it
invites "so run the §9 probe, get the evidence, then build." Follow that and you have quietly committed to
the crawler the moment a single probe comes back positive. The **real** reason is not pending evidence; it
is a category error in the motivation. This note makes that the operative reason.

## The friction, named

The pull toward a crawler is two real frustrations (stated plainly by the maintainer):

1. **"Having to have a clue."** The scripted tool requires a *hypothesis about a specific path* — you must
   already know *which button to press* to test a surface. You don't want to supply that every time.
2. **"Future leak-detection churn."** As the app grows, you don't want leak-hunting to be a recurring
   manual tax.

Both are legitimate. The mistake is assuming *autonomy* is what relieves them.

## Automation ≠ autonomy — the distinction that settles it

- **Automation** = "it runs itself." Deterministic scenarios (≈15 lines each) wired into **CI**.
- **Autonomy** = "it explores without a script." The greedy crawler.

They are orthogonal, and the named friction is an **automation** problem:

- **Automation removes the per-run clue.** You write a scenario's clue *once*; from then on it runs on
  every PR with no fresh hypothesis required. The clue cost is paid a single time and amortized to zero.
- **Automation makes coverage accumulate, not churn.** A scenario written once guards its surface forever.
  A new feature adds one small scenario to a growing guard set — the opposite of churn; it is a compounding
  asset. And it catches **regressions** (a surface that was fine breaking later), which is the actual tax
  you want gone.

## Why the crawler is the wrong tool for this friction

It fails at *both* frustrations it is supposed to fix:

1. **It does not remove the clue.** The design still requires scripted **seeds** for anything a crawl can't
   synthesize (typing into CodeMirror, drag, the Studio Build posture), **human-curated net-zero tours**,
   and **seed-provided open/close pairs** — and its state fingerprinting is an open sub-problem (§4.1) that
   over-collides (skips the high-node-count state where the worst leaks live) and under-collides (blows
   budget re-touring one corner). You still supply clues, just in a fuzzier, less reliable place.
2. **It increases churn, it doesn't reduce it.** A general crawler carries unsolved fingerprinting,
   selector staleness, and spend-quarantine machinery that all need ongoing care. A **scripted** selector
   drifted in this very thread (the `slidesettings` "Compact spacing" switch); a crawler drifts on *every*
   discovered selector. And because its path is **non-deterministic**, it cannot be a stable before/after
   — so it can never be the CI regression guard that would actually remove the recurring tax.

Conflating "runs itself" with "explores without a script" is the category error. The crawler answers a
question — *explore paths nobody imagined* — that the felt friction is not actually asking.

## What to build when the friction bites

The design doc's **§11 fallback**, elevated here to the primary answer: a **small, growing library of
deterministic scenarios wired into CI** (landing islands, docs pages, Playground variants, export preview,
mermaid — each ~15 lines, asserted, blessable). This is the low-clue, low-churn, regression-catching
mechanism. It is cheap, it starts paying immediately, and it uses the measurement engine that already
shipped (`tools/perf-torture/`).

## Where the crawler could still fit (narrow, later, unproven)

Not as the standing leak-detection mechanism — only as an **occasional discovery aid that feeds the
scenario library**. Explore greedily once in a while; when it surfaces a *real* leaking path, **bless it
into a durable deterministic scenario** (the design's own `explore → manifest → replay` shape). Note the
consequence: even a *positive* discovery is converted into a durable scenario, so the crawler is never the
thing that runs day to day — the scenarios are. Build the prospector only if a cheap `.scratch` probe on
the two shipped Slice-2 primitives ever shows it reaches gold a hunch can't — and treat that as a
curiosity-driven one-off, not a gate on the roadmap.

## What this supersedes / leaves standing

- **Supersedes:** §11's "no evidence yet / ROI unmet" as the *primary* reason to hold Slice 3. That
  observation is still true; it is just no longer load-bearing.
- **Demotes:** the §9 autonomy probe — from "the killing experiment that decides whether Slices 3–5 exist"
  to "an optional one-off if we ever want to hunt un-imagined leak surfaces on purpose."
- **Leaves standing:** the design doc's architecture (discover greedily / measure deterministically), its
  trio ledger, and the shipped Slices 1–2 (design + the exported seam + the two safe primitives). Nothing
  here unships or contradicts them; it sharpens *why we stop before Slice 3*.
