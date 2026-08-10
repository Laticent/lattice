---
status: proposed
summary: A layered strategy for gating the docs-site/playground EXPERIENCE — visual, interaction, cause-and-effect, and performance — with Playwright owning structured E2E (consolidating the ad-hoc Puppeteer flows onto it), perf gated by metric class, and slide/PDF visual staying on the existing golden-diff path
---

# Gating the experience — where Playwright fits (and where it doesn't)

**Status:** proposed (2026-06-28). Design first, per CLAUDE.md "design-before-code
on rethink X". Implementation is phased below and tracked as follow-up; this doc
is the reviewable deliverable.

Builds directly on two existing frameworks — do not re-derive them here:
- `2026-06-13-gate-strategy-change-detection.md` — the repo-wide tiering rule
  (deterministic + cheap → blocking per-PR; runner-coupled + expensive → nightly
  on `main`, file an issue on red).
- `2026-06-15-docs-perf-gating-policy.md` — perf is a non-deterministic *species*
  of gate; relative-delta, measured back-to-back on one runner, nightly.

Siblings already living the framework: `perf-nightly.yml`,
`preview-e2e-nightly.yml`, `2026-06-27-integration-nightly-split.md`.

## Question

We want the **experience** of the docs site + playground gated, so that if it
*diminishes* we detect it. "Experience" is explicitly four things, not one:

1. **Visual** — does it look right (at the three mandated widths: 390 / 820 / 1440)?
2. **Interaction** — do clicks, navigation, controls work?
3. **Cause and effect** — does an action produce the *correct* functional result
   (re-theme produces the *right tokens*, not merely a changed DOM)?
4. **Performance** — is it fast, and does it stay fast?

The trigger question was "is Playwright the best tool for this?" The honest
answer is **no single tool gates all four**, and we already own most of the
layers. Playwright is the best tool for *one* dimension (interaction) and a
worthwhile upgrade for a second (docs-site visual). It is the **wrong** tool for
performance, and **redundant** for the slide/PDF visual + rendering correctness
we already gate.

## What we already have (the starting point)

| Surface | Existing coverage |
|---|---|
| Engine (slides → PDF) | node `--test` unit (135 files) + integration (16); `golden-diff` / `pixel-check` / screenshot tests; `bench` + `baseline.json` perf gate (on-demand, rule #19) |
| Docs site | Vitest + Testing Library + jsdom (logic), fast-check (property), `@lhci/cli` (Lighthouse), web-vitals, `perf-collect`/`perf-regression` (relative-delta, nightly) |
| Playground | jsdom unit/fuzz (pane STATE), **`check-preview-render.mjs`** real-browser paint check (`puppeteer-core`, nightly via `preview-e2e-nightly.yml`) |

The gap is **not** "zero E2E" — `check-preview-render.mjs` already drives a real
browser through a load-gallery flow and asserts the deck paints. The gap is that
this coverage is **bug-driven, single-flow, `puppeteer-core`-ad-hoc, and
nightly-only**. There is no *structured, broad* interaction suite.

### Browser-automation stacks today — and why "two not three" is real

Define a **stack** precisely: an npm dependency that provides a
browser-automation *API*. By that measure we run **two** — `puppeteer ^23` at
root (engine renders / screenshot tests) and `puppeteer-core ^25` in docs
(playground paint check). Note that marp-cli/golden-diff also drive a headless
Chromium, but via the **shared `CHROME_PATH` binary**, not a separate automation
API — so it is *not* a third stack, just another consumer of the same browser.
Adding `@playwright/test` would make three automation APIs; consolidating the
docs `puppeteer-core` work onto Playwright keeps us at **two** (HARD RULE #15).

## Decision — one tool per dimension, not one tool for all

| Dimension | Tool | Rationale |
|---|---|---|
| **Visual — docs site** | **Playwright** `toHaveScreenshot` at 390/820/1440 | Built-in multi-viewport visual snapshots; cleaner than ad-hoc puppeteer screenshotting. (Maintenance cost is real — see §"Baseline maintenance") |
| **Visual — slides/PDF** | **Existing `golden-diff` / screenshot** (unchanged) | This is the *product*; already gated. Playwright is the wrong layer — it doesn't touch this |
| **Interaction** | **Playwright** | Its sweet spot: auto-wait, web-first assertions, multi-viewport, trace viewer. This is the real gap |
| **Cause & effect — UI flows** | **Playwright** | "click → *correct* effect" is an E2E assertion (with an explicit oracle — see §"Cause-and-effect oracles") |
| **Cause & effect — rendering** | **Existing engine integration** (+ `emulator-engine-parity` as a narrow structural proxy) | Markdown → correct slide is an engine concern, already gated by the integration tier. (`emulator-engine-parity.mjs` is a migration harness asserting engine↔emulator HTML *structure* parity — a partial proxy, not a full correctness oracle) |
| **Performance** | **Lighthouse CI + `bench`** (NOT Playwright) | See §"Why not Playwright for perf" |

### 1. Playwright for docs-site/playground E2E — and consolidate

Adopt Playwright as the structured E2E layer for interaction + cause-and-effect
+ docs-site visual snapshots, and **migrate the docs `puppeteer-core` flows
(screenshotting + `check-preview-render.mjs`) onto it** → two automation stacks,
not three.

Why Playwright over extending Puppeteer: auto-waiting + web-first assertions kill
the retry/sleep plumbing we'd otherwise write by hand; the trace viewer makes a
nightly failure reproducible without re-running; native multi-viewport matches
the 3-width Quality Bar; `toHaveScreenshot` gives a visual-regression mechanism
(not "for free" — see below).

**Consolidation parity criterion (no silent coverage loss).** Before retiring
`check-preview-render.mjs`, the Playwright port must reproduce *each* assertion
it makes, not just "a paint check":
- the reported regression flow — load a gallery from **Edit** view, the tab flips
  to **Preview**, and the deck **actually paints** (`.lattice` becomes
  visibility:visible with slides), at **mobile + desktop**;
- the pane-sync assertion (active tab AND `body[data-pane]` both read "preview");
- the on-failure machinery — screenshots + reproducible report, filed into the
  single rolling tracking issue. This plumbing is **carried over**, or explicitly
  retired in the PR with justification. The old check is deleted only once the
  port is green on the same flow.

### 2. Performance — gate by metric *class*, never through Playwright

Perf is already 90% solved by the perf-gating policy doc. The remaining lever is
**splitting by determinism**, which the existing `perf-regression.mjs` already
classifies internally:

| Metric class | Examples | Gate placement |
|---|---|---|
| **Deterministic** (no runner/network noise) | bundle / script bytes | **PR-blocking** — tight threshold, *cannot* flap. The one safe per-PR perf gate |
| **Environment-coupled** (runner CPU + font-load variance) | LCP, CLS, TBT, Lighthouse score | **Nightly** relative-delta vs base, **as today** — unchanged |
| **Engine throughput** | `bench` / `baseline.json` | Observational nightly (see §3); **not** a new gate — rule #19's in-PR evidence contract is unchanged |

#### Why not Playwright for perf

Not an assertion-by-adjective: the perf gate's whole validity rests on a specific
method `2026-06-15` built — **measure HEAD vs base back-to-back on the same
runner and diff the medians**, so systematic hardware/network differences cancel
and only a real regression trips. Lighthouse CI + `bench` have this machinery
(or a committed baseline); **Playwright has none of it**. Routing perf through
Playwright would mean *re-implementing* B-injob inside the E2E suite for zero
gain — and per-flow interaction timing on a shared runner is noisier than a cold
Lighthouse load, so it would be redundant *and* riskier. Playwright *may* capture
web-vitals into traces for **diagnosis**, but **must not gate** on them.

### 3. Tiering (applies the gate-strategy framework)

The framework's bias is "runner-coupled → nightly," and a flaky *blocking* E2E
check is the worst outcome for a round-the-clock fleet (it blocks every parallel
PR). So:

| Check | Tier |
|---|---|
| Playwright E2E (interaction, cause-effect, visual) | **Nightly by default** on `main` (like `preview-e2e-nightly.yml`), issue-on-red |
| → promotion of a sub-second, observed-stable flow to **PR-blocking** | Only after a green-streak demonstrates it doesn't flap; gated by an explicit flake budget (retries=0 in the blocking subset, documented timeout) — never promoted on hope |
| Bundle-size delta | **PR-blocking** (deterministic) |
| Lighthouse env-coupled metrics | **Nightly** (unchanged) |
| Engine `bench` | **Observational** nightly run that files an issue on regression; does **not** block, and does **not** replace rule #19's in-PR evidence ritual |

### Baseline maintenance — the dominant ongoing cost (not "free")

`toHaveScreenshot` baselines are the highest-maintenance test class in any
frontend repo, and this site has exactly the non-determinism `2026-06-15` is a
monument to (web-font swap reflow, AA, runner variance). The visual layer ships
*with* a maintenance contract, not as an afterthought:
- **Neutralize non-determinism**: a `stylePath` that disables animations/
  transitions and pins or hides web fonts (mirroring the font-swap issue from
  `2026-06-15`); `maxDiffPixelRatio` tolerance for sub-pixel AA noise; mask
  volatile regions.
- **Determinism via version pin**: the `@playwright/test` version **is** the
  browser-version pin; a browser bump shifts every pixel, so baselines are tied
  to it and re-blessed deliberately when it moves.
- **A blessing ritual**: `--update-snapshots` is run intentionally (who/when),
  baselines are committed under the docs test tree, and a legitimate CSS change
  re-blesses in the *same* PR (like the slide golden-diff baselines).

### Cause-and-effect oracles — the distinctive tier, specified

"Interaction works" (a control responds) is weaker than "the *correct* effect
happened." Each cause-effect test names an **oracle** — what proves the effect is
*right*, not merely present:
- **Palette re-theme**: after selecting a palette, assert the resolved
  `--token` values on a sampled element match that palette's expected tokens
  (read computed style), not just that a class changed.
- **Playground edit → preview**: after editing source, assert the rendered slide
  reflects the edit (a known string/element appears in the painted `.lattice`),
  not just that the preview pane is visible.
- **Responsive control swap**: at 390px, assert the icon-only control variant is
  the one present (per the Quality Bar's tight-space rule), not merely that *a*
  control rendered.

### Timeouts — a setup wait is not an assertion (added 2026-08-10, #1572)

`expect.timeout` (15s) is the budget for *an assertion about behavior*. Getting
the app into the state a spec starts from is **setup**, and it deserves a
setup-shaped budget of its own. `gotoStudio` inherited the assertion default for
the Studio's cold first paint — an island hydrate, a lazy engine chunk and a full
render inside a srcdoc iframe — and because nearly every spec calls it in a
`beforeEach`, that one line became the suite-wide flake surface: the timeout was
reported against whichever spec drew the slow worker, so it looked like a
different bug each time it appeared.

Measured on a 4-core box, deliberately oversubscribed 4× (`--workers=16`,
`--retries=0`), 54 first paints:

| median | p90 | p95 | max | over the 15s default |
|---|---|---|---|---|
| 7.5s | 19.5s | 20.6s | 22.0s | **13 / 54 (24%)** |

So under starvation the old budget sat *inside* the observed distribution — the
wait was not detecting a defect, it was sampling the load. The paint now gets
`FIRST_PAINT_TIMEOUT` (45s, the budget `studio-instant-shell.spec.ts` already
spends on the same iframe), which leaves 2× headroom over the worst observed
paint and still sits under the 60s test timeout, so a genuine hang fails *here*,
named, rather than as an unexplained runner timeout.

Two rules generalize from it:

- **A shared fixture wait states its own budget.** Inheriting an assertion
  default couples every spec's reliability to a number tuned for something else.
- **A shared fixture failure says what stalled and that it is the fixture.** The
  wait throws "the Studio never painted its first slide within 45s", names which
  of the two stages stalled, and says the cause is usually a starved worker — a
  bare locator timeout sends the triager to read the reporting spec, which is the
  one place the cause is not. Only a *timeout* is re-labeled; anything else
  escapes as itself.

CI (`workers: 2`, `retries: 1`) never ran the configuration that provoked this,
and the E2E tier is nightly, off the PR gate — so this was latent triage cost, not
a broken gate. **Still open at that stress:** at 4× oversubscription the 60s
*test* timeout becomes the binding constraint for reload specs (one
`persistence.spec.ts` run exceeded it, with both of its cold paints inside
budget). That is a property of the runner budget, not of this wait, and nobody
runs 16 workers on 4 cores.

### Watching a run — headed, UI mode, trace, video (RPA-style observability)

A frequent ask: "can I watch it click through the UI, like an RPA bot?" Yes —
and the suite is configured so that watchability is the default, not an
afterthought. Four modes, in rough order of how interactive they are:

- **Headed + `slowMo`** (`headless: false`, `launchOptions.slowMo`) — a real
  browser window with a deliberate pause per action, so the clicks/typing/tab-
  switches are eye-followable in real time. The literal "watch the bot work" view.
- **UI mode** (`npx playwright test --ui`) — interactive runner: pick a test,
  play it, and **time-travel** through every step with a live DOM snapshot at each.
- **Codegen** (`npx playwright codegen <url>`) — the RPA *recorder*: click the
  real site by hand and it writes the script. Useful for drafting a new flow.
- **Trace + video artifacts** (`trace: 'on'`, `video: 'on'`) — every run saves a
  scrubable trace (filmstrip + before/after screenshots + DOM/network/console)
  and an `.mp4`. This is the same trace the §3 nightly relies on to make a 3am
  failure reproducible — so we get the watchable record *for free* on every run.

**Remote-sandbox caveat (this matters here).** Headed mode opens a window on the
machine *running* the test — in the cloud sandbox that's the container, with no
display a human can see. So the two practical paths are: **(a)** run the suite
locally for live headed/UI poking, or **(b)** in the sandbox/CI, run headless
with `trace`+`video` **on by default** and review the artifacts after the fact
(`SendUserFile` the `.mp4`/trace). The scaffold (PR A) therefore enables
`trace`+`video` by default precisely so the watchable record exists everywhere,
not just on a developer's local machine. (Boundary: Playwright drives browsers —
and the Tauri wrapper's webview content — but not native desktop chrome, unlike a
general desktop RPA tool. For our web surfaces that boundary doesn't bite.)

## Out of scope (explicit)

- **Slide/PDF visual regression** stays on `golden-diff`/screenshot. Playwright
  does not touch the engine render path (HARD RULE #1).
- **The Tauri desktop wrapper** (separate SlideWright repo) — not covered here.
- **Engine `bench` internals / rule #19 evidence contract** — unchanged. §3's
  nightly bench is *observational issue-filing only*, deliberately not a gate, so
  it does not creep into rule #19's intentionally un-blocked territory.

## Sandbox + CI browser provisioning (so phase 1 doesn't trip on it)

- **Cloud sandbox (local runs)**: Playwright reads `PLAYWRIGHT_BROWSERS_PATH=
  /opt/pw-browsers` (Chromium pre-installed) and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
  =1` — set in the environment already. **Do NOT run `playwright install`.** Note
  `CHROME_PATH` is the *Puppeteer* cache and is irrelevant to Playwright.
- **CI**: provision the Playwright-pinned browser explicitly (the
  `@playwright/test` version is the browser version, which is what makes
  `toHaveScreenshot` reproducible). This replaces the existing nightly's
  `browser-actions/setup-chrome` + `PUPPETEER_SKIP_DOWNLOAD` story for the docs
  E2E job; the engine's root-`puppeteer` CI path is untouched.

## Implementation phases (sequential PRs, each merged before the next — NOT a stack)

Per HARD RULE #17, these are **incremental PRs on `main`, merged in order** — not
concurrent stacked branches. Phases are paired so each PR is a coherent,
independently-shippable feature that builds/tests against `main` alone:

- **PR A (phases 1+2) — scaffold + consolidate.** Add `@playwright/test` (docs),
  3-viewport config wired to the sandbox/CI browser contract above; port the
  `check-preview-render.mjs` flow to Playwright and prove it green against the
  parity criterion; broaden to the core interaction + cause-effect flows
  (palette re-theme, nav, edit→preview) with their oracles and visual snapshots
  + baseline contract; enable `trace`+`video` by default (§"Watching a run") so
  the watchable record exists in the sandbox/CI, not just locally; retire docs
  `puppeteer-core` → two stacks.
- **PR B (phases 3+4) — perf class split + re-tier.** Wire the deterministic
  bundle-size delta as a PR-blocking gate; add the Playwright E2E nightly
  workflow (issue-on-red) and the observational engine-`bench` nightly; confirm
  the env-coupled Lighthouse gate is untouched.

Each PR ships its own demo/evidence (3-width `tools/screenshot.js` proof for the
visual work) and updates `CHANGELOG.md` `## Unreleased`.

## The human gate

Dependency adoption (`@playwright/test`, pinned + standard) is reversible and
proceeds with PR A — not a real gate. The decision genuinely worth a human sign-
off is in PR A: **confirming the Playwright port fully covers what
`check-preview-render.mjs` guarded before that nightly check is deleted** (a
permanent removal of a bug-specific guard). That parity sign-off — not the
dep-add — is where review is asked to look.
