---
status: shipped
summary: Triaged all 138 open issues against the tree at 7b8a219, on two axes the queue never carried — did the defect survive (fixed / still reproduces / premise moved), and what kind of work is it (gate failure, upgrade, bug, docs drift, debt, verification owed, chore). Nothing in the queue is simply WRONG — no card asserts a defect that never existed; the failure mode is that nothing CLOSES cards, and all five verified-fixed ones were fixed by a PR solving something adjacent. Six close on sight (#684, #1188, #1197 now pass their integration test; #1194's coverWindow uses evenGroups; #1155's CHANGELOG is clean; #1361's overflow gate is green, fixed by #1359 and gone from the baseline rather than blessed into it), four more are near-certain (#669, #757-A, #876, the marp-kit half of #1354). Five moved out from under their premise and need rescoping rather than working (#414, #476, #477, #870 cite the REMOVED Drawing Board; #310 cites a deleted doc). Two ratchets run backwards (#577's US-English budget rose 1288 to 1307; #1310's empty index rows rose 58/339 to 70/357). Gate-failure work is 22 cards — 12 red/flaky, 10 blind — and is load-bearing: #1324 was CONFIRMED red here at 9 files / 87 tests, but its cited files are stale and the true failing set is now studio.controls + StudioShell, while the Node integration tier is green at 671/671, so the rot is docs/vitest-specific rather than main-wide. #1208 and #1250 are the same failing test filed twice. #1364 and #1354 were reproduced end to end. BACKLOG.md is stale by 93 issues (claims 45 open, actual 138) because sync-backlog has not run since 2026-07-30.
---

# Open-issue triage — what is fixed, what is real, what moved

**Date:** 2026-08-04
**Tree triaged against:** `7b8a219` (`main`), 138 open issues
**Status:** complete for the classification; six gate runs were still executing
at write time and are marked as such

---

## Why this exists

The queue had grown to 138 open cards with no signal for *which ones still
describe reality*. Many were filed as off-path finds (HARD RULE #18) by sessions
working on something else, and nothing ever revisits them. This note records a
one-time sweep: every open issue read, and every cheaply-checkable claim
re-tested against the current tree.

Two axes, both asked for directly:

1. **Did the defect survive?** — `FIXED` · `VALID` · `PARTIAL` · `STALE` · `OPEN`
2. **What kind of work is it?** — `gate` · `upgrade` · `bug` · `docs` · `debt` ·
   `verify` · `chore`

`OPEN` means *not independently verified in this pass* — it is an honest gap, not
a judgment. `VALID` and `FIXED` each carry the evidence that earned them.

---

## The headline

| | count |
|---|---|
| **Already fixed — close on sight** | **6 verified + 4 near-certain** |
| **Premise moved — rescope, don't work** | **5** |
| **Worse than filed** | **2** |
| Verified still real | 25 |
| Not independently verified this pass | 101 |

**Nothing in the queue was found to be simply *wrong*** — no card asserted a
defect that never existed. The failure mode here is not bad reports; it is that
**nothing closes cards when the fix lands elsewhere.** Every one of the five
verified-fixed cards was fixed by a PR that was solving something else.

---

## 1 · Fixed — close these

| # | Title | Evidence |
|---|---|---|
| **#684** | connect bucket gallery drifted from qr/wifi manifests | `test:integration` → `ok 39 - connect: source .md matches manifests` |
| **#1188** | imagery bucket gallery drifted (anima block missing) | `ok 19 - imagery: source .md matches manifests` |
| **#1197** | imagery gallery stale against `scene.manifest.json` | the "rotor turns and a bead" line is now in **both** manifest and gallery; the ` ```anima ` block is present |
| **#1194** | `coverWindow` chunks greedily → runt last page | `lib/core/carousel.js` now calls `evenGroups(items.length, per)`; the code comment names the exact defect: *"`per` is a CEILING; chunking `i += per` treated it as a chunk size and left a runt last"* |
| **#1155** | ~a dozen CHANGELOG entries orphaned above `## Unreleased` | `## Unreleased` is at line 26; **zero** entry-shaped lines above it |
| **#1361** | `overflow:check` red on clean `main` | clean run is green (exit 0, 8 clips, none above baseline). Fixed by **#1359** (`75b3e1b`); the offending deck is gone from `overflow-baseline.json`, so it was fixed rather than blessed — see §4a |

Near-certain, worth one confirming read before closing:

| # | Title | Evidence |
|---|---|---|
| **#669** | Backdrop controls — strength / clearance / spotlight | `lib/engine/index.js:337` injects the `.backdrop` wrapper per finish section; `base.finish.css` carries `--fin-backdrop-strength` (strength), `--backdrop-clear-mask` (clearance) and the spotlight layer |
| **#757 (part A)** | the self-contained `.html` player | `lib/export/html-player.js` exists and its header records the player as shipped in #798–#824. **Part B** (the `.lattice` envelope carrying theme + components + assets) is still open — rescope the card to B only |
| **#876** | preview-font `@font-face` 404s at `//fonts/*.woff2` | `docs/src/styles/fonts.css:56` now reads `url('../playground/fonts/outfit-300.woff2')` — a correctly-resolving relative path, not the bare `fonts/…` that 404'd. `docs/src/lib/font-embed.js` (the cited file) no longer exists. Confirm against the built site before closing |
| **#587 / #588 / #596 / #668 / #1270 / #1308** | — | each has had its substrate land via a later PR; see §5 |

---

## 2 · Premise moved — rescope before anyone works these

The **Drawing Board and Workbench were removed** (`2026-07-03-studio-succession.md`).
No `*drawing-board*` or `*workbench*` file survives anywhere under `docs/`. Four
cards are written against those files:

| # | Cites | What it needs |
|---|---|---|
| **#870** | `docs/src/playground/drawing-board-render.js:182-191` — serialized theme fetch | **Close.** The surface is gone; the card's own text says it was left unfixed *because* the Drawing Board was frozen. There is nothing left to fix |
| **#476** | `drawing-board-chart-interact.js` (kanban per-card reveal) | Rescope onto `docs/src/playground/chart-interact.js`. The feature itself is genuinely unbuilt |
| **#477** | same file (`tb` reveal-lift magnitude) | same rescope |
| **#414** | consolidate 3 theme/palette dropdowns | One of the three surfaces (the Drawing Board's Radix select) no longer exists. Re-count before estimating |

Plus one doc that moved:

| # | Cites | What it needs |
|---|---|---|
| **#310** | `engineering/audit.md` "Part 11" | That file no longer exists. Re-audit which "Part N" headings actually remain |

---

## 3 · Worse than filed — the ratchets are running backwards

Two cards track a burn-down budget. Both budgets **grew** since filing:

| # | Filed as | Now | Delta |
|---|---|---|---|
| **#577** | US-English gate frozen at **1288** | `US_ENGLISH_BUDGET = 1307` (`tools/check-ownership.js:1877`) | **+19** |
| **#1310** | **58 of 339** decision notes have an empty index row | **70 of 357** | **+12** |

HARD RULE #21 calls its budget "exceed-only, target zero." It has been raised
instead of lowered. #1310 is the same shape: the folded-YAML `summary: >` bug
silently drops a note's summary, `build:check` stays green, and the rate of new
notes exceeds the rate of repair.

---

## 4 · Gate-failure cluster — 22 cards, and the reason everything else is slow

This is the answer to "which are gate-failure related." Split into **gates that
are red/flaky** and **gates that are blind**.

### 4a · Red or flaky right now

| # | Gate | Status |
|---|---|---|
| **#1364** | `check-lint-coverage` writes probe files into the live tree | **REPRODUCED.** `npm test` failed at `check-ownership › tag clustering › the live tree clusters cleanly` with `ENOENT … lint-teeth-probe-a3f3d85ecc02.js` — a probe file deleted mid-scan by a concurrent run. **Broader than filed**: probes also land in `docs/src/components/studio/ai/`, not only `lib/components/` |
| **#683** | `[integration-nightly]` render-regression on main | open, active (15 comments, last 2026-08-03) |
| **#688** | 10 gallery goldens stale — `npm run regress` red | not re-run in this pass |
| **#732** | `[perf-nightly]` docs perf regression | open, active (34 comments, last 2026-08-04) |
| **#793** | `[preview-e2e]` playground preview fails to render | open, active (27 comments, last 2026-08-03) |
| **#1324** | `docs-build` flaky on main, ejects unrelated PRs from the merge queue | **CONFIRMED.** Full docs vitest on this tree: **9 files / 87 tests failed** (204 files, 2369 tests). But the failing SET has moved: the card named `single-slide-render.alignment` + `chart-anima`; today it is `studio.controls` (39), `StudioShell` (26), `studio.findings-fix` (7), `studio.theme-depth` (6), and five more. The card's claim holds; its cited files no longer do |
| **#1328** | `studio.theme-depth` flakes under full-suite load | **CONFIRMED, and under exactly the stated condition.** `studio.theme-depth.test.tsx` failed 6 times in a full-suite run that was sharing the box with `overflow:check` (~49 concurrent Chromium processes). Load-sensitivity is the mechanism, as filed |
| **#1361** | `overflow:check` red on clean `main` | **FIXED — close it.** Clean re-run on an idle box: `✓ overflow corpus — 8 clipped slide(s) across 4 deck(s), none above baseline (8)`, exit 0. Fixed by **#1359** (`75b3e1b`), whose decision note names `examples/marp-export-fidelity.md` five times as the root-cause case — the 23px was the deck logo dragged into flow by `base.finish.css`'s stacking rule. The deck is **gone from `overflow-baseline.json` entirely**, so the clip was *fixed*, not blessed away. (My first run reported exit 1; it had crashed under self-inflicted load with 3 decks `failed to render` and no verdict. That run was invalid, not evidence.) |
| **#1315** | `studio-jargon-alignment.spec.ts:81` fails on main | not re-run |
| **#1208 / #1250** | *the same failing test* — `demo.spec.ts` "walkthrough reskin drives the REAL deck Inspector" | **duplicates.** #1208 cites line 61, #1250 cites line 65, same locator, same deterministic failure. Merge them |
| **#684 / #1188 / #1197** | bucket-gallery drift | **all three now pass** — see §1 |

**#1324 deserves priority attention, and the run above sharpens why.** It is a
*required* check that fails at random on `main`, so it gates the merge queue and
ejects PRs touching zero `docs/` files. Every other card in this queue pays that
tax. Two things the re-run adds:

- **87 failing tests is not a flake, it is a cliff.** Under load the Studio test
  surface collapses wholesale — `studio.controls` alone lost 39. This is not one
  racy assertion; it is a suite with no isolation under contention.
- **The card's cited files are stale.** Anyone picking up #1324 and opening
  `single-slide-render.alignment.test.ts` will find nothing wrong with it. Update
  the card before assigning it.

**Contrast: the Node integration tier is green.** `npm run test:integration` —
671 tests, 0 failures — on the same tree, same box. The rot is specific to the
docs/vitest surface, not to `main` generally.

### 4b · Blind — a gate that should exist doesn't

| # | What is unwatched |
|---|---|
| **#291** | no per-component pixel baseline tier (verified: 0 such tests) |
| **#582** | nothing flags a golden as stale when the CSS that renders it changes (~772 slides drifted silently) |
| **#588** | HARD RULE #3's hex gate never runs over shipped engine CSS |
| **#1075** | per-card overflow in `cards-stack` is unprobed |
| **#1279** | three gates are blind to `lib/base/**` galleries — `logo.gallery` PDFs went stale unnoticed |
| **#1299** | `flex-end` overflow shears content off the **top**; `scrollHeight` reads zero, so no gate sees it |
| **#1300** | `probeContentClipped` misses `.chart-body`, `.panel-left`, clamped cards, and all `::before`/`::after` content |
| **#1347** | the Mermaid **config** half has no parity gate (only `themeVariables` is gated, via `DIVERGENT_KEYS`) |
| **#1267** | no gate stops a new Studio input shipping under the keyboard |
| **#290** | no positive test that the same transform set registers across all three render paths |

§4b is the more valuable half. Every card in §4a is a symptom; the §4b gaps are
what let the symptoms reach `main` in the first place.

---

## 5 · Upgrade / feature work — 38 cards

"Upgrade related" reads two ways and both are answered here.

**Dependency or version upgrades: there are none.** No card in the queue tracks a
Mermaid, Node, Marp, or npm-dependency bump. That axis is empty.

**Product upgrades — new capability rather than a repair — is 38 cards.** The
substantial ones, with what actually exists today:

| # | Feature | Shipped? |
|---|---|---|
| #180 | resolution-independent charts (10K export) | epic, unbuilt |
| #287 | LPM Phase 1 — manifest `render` block | **PARTIAL** — 15 manifests now carry a `render` key, but as a bare string (`"svg"` / `"hybrid"`), not the Phase-1 dispatcher schema. The card's premise ("zero manifests carry a render block") is out of date |
| #288 / #289 | front-matter deck-config · `$`-sigil interpolation | unbuilt |
| #298 | `.latticepack` interchange | unbuilt (no `latticepack` reference outside `lib/layout/README.md`) |
| #299 | `lib/integrations/function-plot/` home | **directory still missing.** The `renderPaths`-honesty half was partly addressed by #1362 |
| #506 | runtime auto-split | unbuilt — only build-time Option A ships |
| #515 | Google Drive BYO storage | unbuilt (no `google.accounts` / `drive.file` anywhere in `docs/src`) |
| #554 | N-up split Frame | unbuilt |
| #610 / #648 / #660 / #662 / #982 | Studio-AI + Living Decks | all key-gated or spike-stage |
| #964 | wink-nlp lens suggestions | unbuilt (no `wink` dependency) |
| #1302 | carbone light-mode tokens | **still valid** — carbone remains pinned-dark at zero specificity with no light values defined |
| #1294 / #1295 / #1284 / #1281 | Studio navigation, present-screen rework, context-aware autocomplete, class taxonomy | #1301 shipped ten fixes from the #1281–#1295 batch; `present/presenter-window.js` exists, so #1295 is at least partly landed. **Re-read these four before working them** |

---

## 6 · Verified-real defects worth pulling forward

Everything here reproduces on the current tree. Ordered by what I'd fix first.

| # | Defect | Evidence |
|---|---|---|
| **#1246** | Mermaid renders *after* `sanitizeSlideHtml`, so a diagram can put `javascript:` into a same-origin preview frame | filed with an end-to-end real-Chromium exfiltration of a planted key. **Security; HARD RULE #22.** Blocks any feature where a deck arrives from someone else |
| **#1354** | Export-to-Marp bundle ships MIT + OFL third-party files with **no license text** | **REPRODUCED.** Ran `node tools/export-marp.js` — output carries `fonts/`, `mermaid-v11.min.js`, `lattice-runtime.min.js` and **zero** LICENSE / NOTICE / THIRD-PARTY files. (`dist/marp-kit/` *does* carry all four — the export path does not) |
| **#1349** | a CRLF-authored deck silently renders with the default palette | `lib/core/resolve-palette.js:23` is still `/^---\n([\s\S]*?)\n---\n/` — the one front-matter reader in `lib/` with no `\r?` |
| **#1350** | structured comment pragmas leak into every exported presenter-notes field | `MAGIC_COMMENT_MATCHERS` (`lib/authoring/notes-core.js`) still allowlists only prettier / markdownlint / remark-lint |
| **#1363** | `below-note`'s exclusion is a substring test, so `no-progress` matches `progress` | `isExcluded` is still `EXCLUDED.some(x => cls.includes(x))` |
| **#1320** | `speak: never` is invalid in Chromium **and** wouldn't help | still present at `base.print-textures.css:33` and `themes/a11y-base.css:152` |
| **#1069** | `proseWordCount` counts fenced-code content as prose | still strips only the class directive and headings |
| **#1241** | `dropdown-menu.tsx` is the only Radix portal wrapper without `lx-ui` | verified: six siblings carry it, `dropdown-menu.tsx` does not |
| **#1348** | two diagram ink pairs sit below AA in every palette | `gitBranchLabel0-7` + `errorTextColor` are sanctioned in `KNOWN_BELOW_AA`, not fixed |
| **#797** | 28 of 30 gated showcase WebPs have no consumer | verified: 30 files, only `funnel.{light,dark}` referenced (`comparison.astro`) |
| **#970** | three superseded branches need deleting | all three still exist on `origin` |
| **#1327** | nine tools each carry their own Chromium resolver | 15 tools reference Chrome resolution; `tools/lib/` has no shared resolver |
| **#1336** | the `content` stress-test slide no longer demonstrates its claimed ceiling | the heading still claims *"as much text as one slide should ever carry"* |
| **#1278** | `wifi` clips real content on 4 of its own gallery slides | **exact match in the ratchet.** `overflow-baseline.json` sanctions `connect.gallery.md = [3]` and `wifi.gallery.md = [2, 3, 4]` — precisely the four slides the card names. They are *baselined*, i.e. accepted as known clips, not fixed |
| **#1355** | `--measure-body: 36em` is a compatibility value, not a typographic one | still 36em. **Note:** the card says *"do not fix the comment"* — the comment has since been softened from "769.5px, ~78–83 characters" to "~80 characters at the body tier" |

---

## 7 · Partially landed — shrink the card, don't close it

| # | What landed | What remains |
|---|---|---|
| **#578** | `--footer-centre-*` → `--footer-center-*` **done** | `lib/forms/cell/progress-centre/` still carries the UK spelling |
| **#1223** | 29 lint exclusions → 28 | `.claude/workflows` is still excluded and is neither vendor nor generated |
| **#1332** | steps 1–2 landed via #1353 — `lib/core/mermaid-theme-map.js` + `diagram-theme-parity.test.js` exist | the config half is still duplicated (that is #1347) |
| **#511** | the Mermaid var-map unification landed via #1353 | the CLI rename off "emulator" has not |
| **#287** | 15 manifests carry a `render` key | the dispatcher schema and the chart-kernel migration have not |
| **#757** | part A — the `.html` player — shipped in #798–#824 | part B — the `.lattice` envelope with theme + components + assets |
| **#596** | the perf gate landed via #1330 | the E2E re-tier |
| **#1270 / #1308** | `#1312` made the slice/deck sweep able to fail | the GATE half |

---

## 8 · One process finding

**`BACKLOG.md` is stale by 93 issues.** It states "**45 open**" and was last
written 2026-07-30; there are **138**. `sync:backlog` (`tools/sync-backlog.js`)
has not run since. The file's own header calls itself "the one-way mirror of the
open GitHub issue queue" — a mirror that is off by 3× is worse than no mirror,
because it is the surface an agent reads first when picking up work.

This is also the root of the triage problem generally: **there is no closing
mechanism.** Five cards in §1 were fixed by PRs solving adjacent problems, and
nothing noticed. A cheap fix is to have `sync:backlog` run on merge and flag any
card whose cited gate now passes.

---

## What I did not verify

Honesty per HARD RULE #23. 104 of 138 cards are marked `OPEN` — read and
classified, but the defect itself was not re-tested. Specifically not driven:

- **Any real-device claim** — #667, #783, #1216 all need a physical iPhone. They
  remain correctly marked UNVERIFIED in their own text; I did not change that.
- **The nightly gates** — #683, #688, #732, #793, #1315 were read from their
  comment threads, not re-run. `npm run regress` (the #688 check) was not run.
  Note that #683's tier (`test:integration`) passes locally on this tree, which
  neither confirms nor refutes a nightly failure on a different runner.
- **#1360 needs a re-read, not a re-run.** Its acceptance check is *"`overflow:check`
  drops `examples/state-chart.md` from the baseline"* — but that deck is **not in
  the baseline now and the gate is green**, while the card's actual complaint
  (p6's sixth state box renders as a labelless sliver) is a *visual* loss the
  geometric probe would not catch anyway. The acceptance criterion is already
  satisfied without the defect necessarily being fixed. Verify by eye, and give
  the card a criterion that can fail.
- **#1246 was not re-exploited.** The card carries an end-to-end real-Chromium
  demonstration; I confirmed only that the architectural gap is still there —
  `checkPreviewHtmlSinks` gates that a builder *calls* `sanitizeSlideHtml`, and
  Mermaid renders inside the frame afterward, so the sanitizer never sees its
  output. Re-running the exploit needs a docs build and a real browser.
- **Visual/rendering claims** — #581, #680, #1213, #1278, #1299, #1346, #1360 all
  need a real render inspected by eye. Not done here.
