---
status: shipped
summary: Durable policy for the docs-site perf gate, treating perf as a non-deterministic species of gate that flaps on runner variance
---

# Docs-site perf gating — the durable policy

**Status:** decided (2026-06-15). Resolves issue #327 (the umbrella perf-gate
tracking issue). Implements the policy in config + CI; the §"open human step"
below (real-hardware code-fix inspection) is explicitly deferred, now that the
gate no longer flaps on it.

Sibling: `2026-06-13-gate-strategy-change-detection.md` (the repo-wide
scheduling-tier framework this applies to the perf gate specifically).

## Symptom

The per-PR Lighthouse job (`lighthouse.yml` → `npm run perf`) flapped red on CI
while local was clean: desktop landing CLS tripped at 0.0551 vs a 0.05 bar
(local 0.000); the mobile 4×-throttle profile pushed LCP to 3.0–3.4s and CLS to
~0.17 (local ~0). Stop-gapped to `warn` in PR #324. The bars were absolute
numbers that (a) sat at/below the edge of the web-vitals "good" band, (b) flapped
on runner variance, and (c) rot as the site grows.

## Root cause — perf is a different *species* of gate

Every other gate we run measures a property of the **code**: lint, unit,
integration parity, `build:check`, and the pixel regression gate are all
**deterministic** — same input → same verdict on any machine, and a red always
means "change the code." The perf gate is the only one whose verdict depends on
the **runner**: CPU speed, network (the sandbox's TLS proxy blocks the CDN web
fonts, so locally they fall back to serif instantly → no font-swap reflow → CLS
0.000; CI loads the real fonts → swap-in reflow → CLS), and concurrent load.
Same code → different numbers run-to-run.

So a single absolute threshold has to absorb **noise AND growth** with one
number — which is why it's impossible to tune and inevitably rots. (Note the
pixel regression gate already dodged this by comparing against a *committed
baseline*, not a constant — the right instinct, wrong to copy verbatim here; see
"why not B-committed".)

## Decision

Three coupled choices, made with the maintainer:

### 1. Relative, not absolute (kills the rot axis)

The gate compares HEAD against a **base** measurement and flags a metric only
when HEAD is worse **by more than a tolerance**. Removing the growth axis means
the tolerance only has to cover runner *noise*, not "how big is the site now."
This directly answers item #4 ("absolute thresholds rot").

### 2. B-injob, not a committed baseline (self-maintaining)

The base is **measured fresh each run** by building the ~24h-ago `main` commit
and the current `main` **back-to-back on the same runner**, then diffing the
medians. Measuring both on one runner cancels *systematic* hardware differences.

- **Why not B-committed (a `perf-baseline.json`):** it removes rot too and is
  cheaper at runtime, but it adds an **update ritual** (someone must `--update`
  when a legitimate perf change lands, or it false-reds) and a **provenance**
  constraint (the committed numbers are only valid if measured on the same env
  that runs the gate). B-injob has neither: nothing to commit, nothing to keep
  in sync, no stale baseline. We pay CI minutes (double build) instead — which is
  free under choice #3.
- **Residual we accept:** run-to-run noise still exists (base and head are two
  noisy measurements). Mitigated by median-of-3 + per-metric tolerance with an
  absolute noise floor. The only thing that would truly tame noise is many
  historical samples (an lhci *server* → percentile bands) — rejected as
  over-altitude for a solo+AI-fleet shop until the nightly proves it's needed.

### 3. Nightly on `main`, not per-PR (off the critical path)

Per the gate-strategy framework (`2026-06-13` §C/§D): render-free, sub-10s,
deterministic checks stay blocking per-PR; expensive **runner-coupled** checks
move to a nightly on `main` that opens an issue on red. A perf regression is
cheap to catch a day late (reversible, not a correctness break), so it qualifies.
This also dissolves B-injob's one cost — the double build is irrelevant at 3am —
and removes the PR-latency + flapping that triggered #327.

The deterministic, attributable docs check (`check:overflow` — layout width is a
property of the code) **stays per-PR** in `docs-overflow.yml` (renamed from
`lighthouse.yml`). Perf moves out entirely.

### 4. Fonts: keep `display=swap`; do not chase the font CLS

The CI CLS is font-swap reflow (`&display=swap`: fallback paints, web font swaps
in, text reflows). `font-display: optional` would zero it but drops the brand
display font (Playfair) to Georgia on a slow first load — the wrong trade on a
boardroom-brand site. Under the relative gate it's moot anyway: the swap CLS
shows on **both** base and head, so the *delta* is ~0 and never trips. So we keep
`swap`, leave app code untouched, and let the metric be measured, not chased.

## Tolerances (in `scripts/perf-regression.mjs`, not the configs)

> **SUPERSEDED IN PART, 2026-09-05 — the `script-size` row below is gone.** This section is
> still what `perf-regression.mjs`, `lighthouserc.cjs` and `lighthouserc.mobile.cjs` name as
> their canonical policy, so the correction belongs here rather than only in the newer note.
> The "deterministic" class was **empty of anything real**: `script-size` summed Lighthouse
> *network* records, so it measured what happened to load during a visit rather than what the
> build produced, and 35% of 140 repeat readings of an identical commit moved past its own 3%
> tolerance. The metric is deleted, and **the payload ratchet moved to
> `docs/scripts/check-route-budget.mjs`** — a per-PR, blocking, five-route byte ledger read off
> the built artifact. Everything else in this section still holds: the remaining four metrics
> are all environment-coupled, and the relative-vs-absolute argument that motivated this
> document is untouched. See `2026-09-02-alarm-channel-saturation.md` § Decision.

Two metric classes:

- **Deterministic** — `script-size` (bundle bytes; no runner/network noise) →
  tight: +3% / 10KB. This is the real ratchet for item #2 ("payload only grows").
- **Environment-coupled** — LCP (+15% & ≥150ms), TBT (+20% & ≥100ms), CLS
  (+0.05 abs & ≥0.01), perf score (drop >0.05 & >0.02). Each needs BOTH a
  relative/absolute tolerance AND an absolute noise floor, so a sub-noise wobble
  never trips. Score also has an absolute **catastrophe floor** (head < 0.5 trips
  regardless of delta) — the backstop that still catches a total break.

These floors are a **first guess**. Issue #327 §3 shows single-run CI spreads
already near them (mobile LCP 3000→3338 ≈ 340ms; CLS 0→0.17). Median-of-3 damps
that, but expect to **retune the floors against the first ~1–2 weeks of observed
nightly spread before trusting reds** — early false-reds are cheap here (a
nightly files an issue, it doesn't block a PR). If the spread proves too wide to
tune out, that's the trigger to escalate to historical percentile bands (the
rejected lhci-server option).

### Attribution is per-window, not per-commit

B-injob diffs HEAD vs the ~24h-ago commit, so a red attributes to **all merges in
that window** — for a round-the-clock AI fleet that can be 10–20 PRs. The
operator bisects within the window. This is inherent to choosing nightly over
per-PR (the per-merge attribution is exactly the cost we're avoiding); naming it
so it isn't a surprise.

## How a regression surfaces

The nightly compares, writes a markdown delta table to the job summary + an
artifact, and on a regression opens/appends a single rolling tracking issue
(found by the `[perf-nightly]` title marker — no label dependency).

## Open human step (deferred, not dropped — #327 §4A/§4B)

Confirm real-world numbers on real hardware/network and decide whether the
landing CLS / mobile LCP warrant code fixes (reserved preview `min-height`;
`font-display`/preload) or are accepted good-tier live-render cost. This was the
original "human inspects real behaviour" intent of #327. It is now **safe to
defer**: the relative nightly gate no longer flaps on these, so there is no CI
pressure forcing a blind fix. The sandbox cannot do it (it blocks the fonts).

**On-device path (added 2026-06-16):** the human inspection no longer needs a
laptop or USB tether. Any page carries a live, draggable Core-Web-Vitals overlay
(`docs/src/components/site/PerfOverlay.astro`) — open `…/lattice/?perf` on a real
phone (or flip the "Performance overlay" switch in Drawing Board settings →
Workspace, a cross-surface toggle like Guided tours) and the device's own browser
reports LCP / CLS / INP / FCP / TTFB on screen, fonts and all — plus a runtime
group (FPS, JS-heap memory, and a CPU≈ main-thread-busy proxy where the browser
exposes them). That is the simplest way to settle the landing-CLS / mobile-LCP
question on real hardware.
Available in every environment until GA, then GA-gated via `PERF_OVERLAY_AVAILABLE`
in `docs/src/playground/perf-overlay-prefs.js`.

## Files

- `scripts/perf-regression.mjs` — pure parse+compare verdict (unit-tested).
- `scripts/perf-collect.mjs` — build + `lhci collect` both form factors.
- `.github/workflows/perf-nightly.yml` — the nightly B-injob watch.
- `.github/workflows/docs-overflow.yml` — per-PR overflow guard (was
  `lighthouse.yml`; perf step removed).
- `lighthouserc.cjs` / `lighthouserc.mobile.cjs` — now collection-only.

## Update (2026-07-01) — root-base URL fix + Studio coverage

The 2026-06-28 retirement of the `/lattice` project-page base (site now serves at
`/`; see `astro.config.mjs`) left both collection configs pointing at stale
`/lattice/…` URLs. `lhci collect` 404s on the first URL and throws, so the nightly's
non-`continue-on-error` **HEAD** collection failed every night from 2026-06-28 until
this fix — the watch was measuring nothing. (The **base** collection is
`continue-on-error`, so a base commit whose own configs 404 never fails the job; the
compare just runs head-only. For the ~24h after this fix merges the base still 404s,
then self-heals as the base window rolls past it — no workflow change needed.)

Fixed the URLs to the root base and, while there, added the three interactive app
surfaces — `/studio/`, `/drawing-board/`, `/workbench/` — to the measured list. These
`client:only` CodeMirror + live-engine shells are the heaviest thing a user loads and
were never covered; the mobile profile (4× CPU, Slow-4G) puts them at ~40–55 perf,
dominated by the engine JS payload, so this is exactly where a regression would bite.
