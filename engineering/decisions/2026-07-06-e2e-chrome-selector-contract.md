---
status: shipped
summary: Prevent the "shared-chrome change breaks the nightly-only e2e tier" drift (#780) by centralizing fragile Studio selectors behind a CHROME contract map + helpers in the e2e fixture, adding an author checklist to the PR template and dev guide, making the suite runnable in the sandbox, and standing up a fast @smoke subset as a promotion candidate for the PR gate
---

# E2E selector contract for shared Studio chrome

**Status:** shipped (2026-07-06). Prevention work for the incident filed the
same day (the #771/#773 settings-panel redesign broke 19 Studio e2e specs on
`main`; found in #780, repaired in #782).

## The failure, in one line

A change to shared Studio UI chrome (a scope rail, a retired toolbar toggle, a
new `role="status"` echo) updated the **unit** tier but not the **e2e** tier —
and e2e is **nightly, off the per-PR gate** — so every pre-merge check was green
while the e2e suite quietly broke, hiding a real 21px overflow regression the
layout-invariant spec would have caught.

Root cause: **asymmetric gating** (the only tier exercising the real chrome is
the only tier not run pre-merge) compounded by **duplicated fragile selectors**
(accessible names copy-pasted across N spec files, so one rename breaks N files
with no single place that screams) and a **point-fix reflex** (a reviewer flagged
one stale spec; it was fixed at that line, not swept as a class).

## Why not just "run e2e on every PR"

That is the tempting fix and it is the wrong one. `2026-06-28-experience-gating-
playwright.md` §3 is explicit: a browser-dependent suite that needs a built site
+ Chromium is runner-coupled and slow, so it stays nightly; a **flaky blocking
E2E check is the worst outcome for a round-the-clock fleet** (it blocks every
parallel PR). Promotion of a subset to PR-blocking is allowed **only after an
observed green streak** demonstrates it doesn't flap. So the prevention has to
work *within* the asymmetry, not erase it — plus give a clean, low-risk path to
the eventual promotion.

## Decision — four complementary guards

1. **Centralize fragile selectors behind a contract** (`docs/e2e/studio-fixture.ts`).
   A `CHROME` map is the single source of truth for e2e-critical accessible names
   (`deckScope`, `slideSettings`, `architect`, …), consumed by helpers
   (`openInspector`, `appToast`) and specs. A chrome rename becomes a **one-file
   fix** here, and the map is the documented list a chrome change is *required* to
   reconcile. The 6 duplicated `'Deck scope'` opens across 4 specs collapsed onto
   `openInspector`.

2. **Author checklist at the point of change** — added to
   `.github/pull_request_template.md` (Tests section) and
   `engineering/development.md` (§ "Studio e2e suite"): when you change a
   control's accessible name/role/presence/location, update the `CHROME` map,
   **grep every hit** (sweep the class, not the flagged line), watch for role
   collisions, update both tiers, and **state whether e2e was actually run**.

3. **Make the suite runnable in the sandbox.** The old assumption — "Playwright
   isn't installed here" — was half-true: the *npm package* wasn't installed, but
   the **pinned Chromium is pre-installed** at `/opt/pw-browsers` (build 1194 ↔
   `@playwright/test` 1.56.1). `cd docs && npm ci && npm run build:e2e && npm run
   test:e2e` runs the real specs. Documented in the dev guide, so "run the real
   surface" (HARD RULE #23) is a real option, not a shrug. Only `@visual` bless
   (runner-specific AA) and the PDF-export journeys (blocked font CDN) stay
   nightly/UNVERIFIED locally.

4. **A `@smoke` subset, landed on the PR path as an ADVISORY job.**
   Three fast desktop specs tagged `@smoke` — shell mounts + paints, open
   Inspector + write front-matter (the scope-rail chrome), both-panels-open
   no-overflow (the layout invariant the #780 regression tripped) — run via
   `npm run test:e2e:smoke` (~1 min incl. build). The `ci.yml` `studio-smoke`
   job runs them on every docs-touching PR with `--retries=0`, so selector drift
   fails fast on the PR instead of next-morning-on-main.

   **The two rungs, and why.** §3 forbids a browser check becoming PR-*blocking*
   "on hope" — only after an observed nightly green streak. So the job ships
   **advisory** first: absent from the required `ci` gate's `needs` (like
   `golden-diff`), it reports red/green but does not block merge or jam the merge
   queue. Promotion to **blocking** is a one-line follow-up — move `studio-smoke`
   into `ci`'s `needs` — taken once the streak is on record. Tracked in #800.
   (Evidence so far: the `@smoke` specs are green in the nightly and in local
   runs; the nightly's *overall* red is unrelated pre-existing failures — demo +
   PDF-export journeys + a `@mobile` split spec — not the `@smoke` subset.)

## What this deliberately does NOT do

- It does **not** make the e2e job merge-**blocking** — `studio-smoke` is advisory
  (outside the required `ci` gate) until §3's green-streak condition is met (#800).
- It does **not** introduce `data-testid`s. The suite's convention is
  accessible-name selectors (which also assert a11y); the contract map preserves
  that while removing the duplication. `data-testid` remains available if a
  specific control's name is genuinely too volatile to contract.

## Verification

Ran on the real built site in this sandbox (Chromium 1194): `test:e2e:smoke`
green (3/3, 22s) and the full refactored specs green
(`inspector`+`editor-lint`+`split`, 16/16) — proving the `openInspector` sweep
and the `CHROME` contract work on the actual surface, not a harness.
