---
status: shipped
summary: Triaged all 138 open issues at 7b8a219 on two axes — did the defect survive, and what kind of work is it — then rescanned and had an independent checker re-run every falsifiable claim, which is where this note earns its keep. NINE cards were closed with pickup notes (#684, #1188, #1197, #1194, #1155, #1361, #876, #870, and #1250 as a duplicate of #1208). The AUDIT then refuted two of the note's own headline claims: #577's US-English ratchet was never raised — it was LOWERED 1336 to 1307 and the measured count fell 1307 to 1304, so "the ratchets run backwards" was sign-reversed by comparing a count against a budget; and #1310's "70 of 357 empty index rows" was 59 of 346, miscounted by an awk that also matched the README's prose bullets, and the card is now FIXED by #1370. Six more rows decayed within a day because main moved 10 commits (#1299, #1300, #1320, #1327, #1347, #1349, #1363 half, #1278); four numbers were stated with no reproducible method; the #1324 "87 failures" came from a run sharing the box with 49 Chromium processes and an idle re-run shows 0. Every substantive error has ONE shape: a number derived from a rendered artifact instead of the source, and not re-run before publishing. The rescan is the other half: 22 closed and 23 filed in ~18 hours, net +1, so the arrival rate dominates the closing rate that §8 blames. THREE of the new cards are a previously-fixed defect resurfacing one file over (#1388 is #1349 in export-marp, #1369 is #1327 in test/, #1377 is #1347 on the theme-pinned path) because each fix was scoped to the instances its card enumerated rather than the defect class — and #1405 is an acceptance case that a Closes keyword swept past. #669 must NOT be closed: its mechanism shipped but the ratified front-matter backdrop map became finish-override:, and #287, #511, #596, #757 share that shape.
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

Of the 138 open at `7b8a219`:

| | count |
|---|---|
| **Fixed — CLOSED in this pass** | **8** |
| **Closed as a duplicate** (#1250 → #1208) | 1 |
| **Premise moved — rescoped, not closed** | 4 |
| Verified still real *(as of `7b8a219`; 5 have since decayed — see §6)* | 15 |
| Read and classified, defect not re-tested | 110 |
| | **= 138** |

*(An earlier revision of this table read 8 / 4 / 2 / 25 / 101, which sums to 140
and contradicted the closing section's "104". The "worse than filed | 2" row is
**retracted** — see §3. Both numbers now derive from the enumerated rows.)*

**Nothing in the queue was found to be simply *wrong*** — no card asserted a
defect that never existed. The failure mode here is not bad reports; it is that
**nothing closes cards when the fix lands elsewhere.** Every one of the
verified-fixed cards was fixed by a PR that was solving something else.

> ### ⚠ This note was audited, and a lot of it was wrong
>
> An independent checker re-ran every falsifiable claim here. It found **two
> published headline claims refuted outright** (§3), **six rows decayed** because
> `main` moved 10 commits the same day, **four numbers stated without a
> reproducible method**, and **one internal contradiction**. All corrections are
> inline and marked; nothing was silently deleted.
>
> The single most useful output of this note is therefore not the classification.
> It is §9: **a triage of a moving queue has a shelf life measured in hours**, and
> the errors clustered in one shape — measuring a rendered artifact instead of the
> source, then not re-running the measurement before publishing.

---

## 1 · Fixed — CLOSED, each with a pickup note on the card

These eight were closed as part of this sweep, each with a comment carrying the
evidence below so a session that lands on the card from a search knows why it is
shut and what to reopen it for.

| # | Title | Evidence |
|---|---|---|
| **#684** | connect bucket gallery drifted from qr/wifi manifests | `test:integration` → `ok 39 - connect: source .md matches manifests` |
| **#1188** | imagery bucket gallery drifted (anima block missing) | `ok 19 - imagery: source .md matches manifests` |
| **#1197** | imagery gallery stale against `scene.manifest.json` | the "rotor turns and a bead" line is now in **both** manifest and gallery; the ` ```anima ` block is present |
| **#1194** | `coverWindow` chunks greedily → runt last page | `lib/core/carousel.js` now calls `evenGroups(items.length, per)`; the code comment names the exact defect: *"`per` is a CEILING; chunking `i += per` treated it as a chunk size and left a runt last"* |
| **#1155** | ~a dozen CHANGELOG entries orphaned above `## Unreleased` | `## Unreleased` is at line 26; **zero** entry-shaped lines above it |
| **#1361** | `overflow:check` red on clean `main` | clean run is green (exit 0). Fixed by **#1359** (`75b3e1b`). **Correction:** I wrote that the deck was *"gone from `overflow-baseline.json`"* — it was **never in it** (`git log -G` over that file returns nothing); what `75b3e1b` removed was `image-set-export.md`. The verdict holds, the stated reason did not |
| **#876** | preview-font `@font-face` 404s at `//fonts/*.woff2` | **FIXED.** `docs/src/styles/fonts.css` now reads `url('../playground/fonts/…')` for every face, under a header comment stating *"Vite rewrites each relative `url()` to the hashed, base-aware bundled asset"* — exactly the fix asked for. `font-embed.js` moved to `docs/src/playground/`, beside `fonts/`, so its own `./fonts/…` import resolves. The remaining channel (bare `url('fonts/…')` inside *fetched* theme CSS) is now absolutized by `docs/src/lib/theme-fetch.ts` and covered by tests |
| **#870** | Drawing Board theme fetch serialized behind an engine-bundle poll | **Closed as moot** — the file and surface are gone (§2). **Caveat the checker raised, and it is fair:** I rescoped #476/#477 onto the successor surface but closed this one, on identical facts, and never asked the #669 question — *did the defect survive the substitution?* Whether the Studio's theme fetch is also poll-gated is live-runtime ordering, **UNVERIFIED** from here. Noted on the card |

### The one I got wrong, and the correction

I first listed **#669 (backdrop controls)** here as near-certain fixed. **It is not.**
Checking the author surface rather than the mechanism shows a **substitution**, and
the distinction matters to whoever picks it up:

- **Shipped** — the architectural half. `applyBackdropToHtml`
  (`lib/integrations/markdown-it/plugins.js:495`) injects
  `<div class="backdrop"><i class="backdrop-mask"></i></div>` as the first child of
  every finish section, mirrored on all three render paths, and the compositor in
  `base.finish.css` reads `--fin-backdrop-strength` + `--backdrop-clear-mask`. The
  code comment credits **"Backdrop-controls work (#669)"** directly.
- **Did NOT ship as specified** — the author surface. The card asks for *"a NEW
  nested front-matter map `backdrop: { strength, clearance, spotlight }`"*.
  `KNOWN_DIRECTIVES` has **no** `backdrop` key, no deck in the corpus authors one,
  and the function explicitly declines to: *"the wrapper carries no deck-level
  inline style; the deck author tunes it through the Studio's `finish-override:`
  map (regenerated CSS)."*

So the controls became a **baked layer of the generated finish CSS** reached through
`finish-override:` (`examples/finish-override.md`) instead of a front-matter map.
That may well be the better design — but it is a *different* deliverable than the
card ratified, and only someone who knows the intent should decide whether that
closes it. **Left open deliberately, with this comment on the card.**

The lesson generalizes: **the mechanism landing is not the feature landing.**
#287, #511, #596 and #757 in §7 have exactly this shape — substrate in, surface
out — and none of them should be closed on a grep for the substrate either.

**#1250** was also closed, as a **duplicate of #1208** — the same
`demo.spec.ts` test, the same locator, the same deterministic failure, filed
twice two days apart. #1208 is the older card and stays open.

---

## 2 · Premise moved — rescope before anyone works these

The **Drawing Board and Workbench were removed** (`2026-07-03-studio-succession.md`).
No `*drawing-board*` or `*workbench*` file survives anywhere under `docs/`. Four
cards are written against those files:

| # | Cites | What it needs |
|---|---|---|
| **#870** | `docs/src/playground/drawing-board-render.js:182-191` — serialized theme fetch | **CLOSED in this sweep** (§1). The surface is gone; the card's own text says it was left unfixed *because* the Drawing Board was frozen. Nothing left to fix |
| **#476** | `drawing-board-chart-interact.js` (kanban per-card reveal) | Rescope onto `docs/src/playground/chart-interact.js`. The feature itself is genuinely unbuilt |
| **#477** | same file (`tb` reveal-lift magnitude) | same rescope |
| **#414** | consolidate 3 theme/palette dropdowns | One of the three surfaces (the Drawing Board's Radix select) no longer exists. Re-count before estimating |

Plus one doc that moved:

| # | Cites | What it needs |
|---|---|---|
| **#310** | `engineering/audit.md` "Part 11" | That file no longer exists. Re-audit which "Part N" headings actually remain |

---

## 3 · RETRACTED — "the ratchets are running backwards" was wrong on both entries

**This section originally claimed #577's and #1310's burn-down budgets had
grown, and drew a conclusion about ratchet discipline from it. An independent
checker refuted both. The retraction is kept in place rather than deleted,
because the *way* both were wrong is the most useful thing in this note.**

### #577 — refuted, and the sign was backwards

I claimed the budget *"rose 1288 → 1307, +19."* `US_ENGLISH_BUDGET` has held
exactly two values in the repo's history:

```
$ git log -p -L'/const US_ENGLISH_BUDGET =/,+1:tools/check-ownership.js'
  23f8283  +const US_ENGLISH_BUDGET = 1336;
  75b3e1b  -1336  +1307
```

**Lowered by 29.** Never 1288, never raised. And the measured British-spelling
count fell too — 1307 at `7b8a219`, **1304** now.

**The error:** I compared the *count* in the card's title (1288) against the
*budget constant* (1307) and called the delta a raise. Different quantities. A
budget above the count is slack; a budget equal to it is a pin. Someone
**tightened** the pin, which is the opposite of the accusation.

### #1310 — now FIXED, and my first retraction of it was also wrong

Real figures: **59 of 346** at `7b8a219` (corroborated by `62a61a4`'s own code
comment: *"59 notes rendered an index row reading `— >`"*), not 70 of 357. The
card's own "58 of 339" was near-exact.

`62a61a4` taught the generator to consume YAML block scalars, so **0** rows now
render empty and `summary: >` is a supported form. The card is **fixed**, and
belongs in §1, not here.

The two definitions now diverge, which is worth stating precisely:

| | `7b8a219` | now |
|---|---|---|
| notes whose `summary:` is a bare `>` / `\|` | 59 | **60** |
| index rows that *render* as `>` or empty | 59 | **0** |

**The error, twice over.** I measured the *rendered* README with
`awk -F'—' '/^- /'`, which also matches the README's hand-written prose bullets —
and those contain no em-dash, so `$2` is empty and each was counted as broken.
`357 = 346 index rows + 11 prose bullets`; `70 = 59 broken + the same 11`. The
missing filter was `\]\(.*\.md\)`.

Then, retracting it, I diagnosed the cause as *"summaries containing an em-dash"* —
**also wrong**: 253 rows contain an interior em-dash and none is miscounted. I
corrected the number by inspection without re-running the measurement, and got
the mechanism wrong while getting the number right.

### What this section should have said

Neither ratchet is misbehaving. Both are being maintained correctly. The real
finding is about **me**: two headline claims, both built by measuring a rendered
artifact instead of the source, both stated without showing the method. Every
number in this note that lacks a reproducible command should be read with that
in mind — the checker found four more (§4a #1324, §7 #1223's "29 → 28", §6
#1327's "15 tools", §8's BACKLOG date).

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
| **#1324** | `docs-build` flaky on main | **"CONFIRMED" WITHDRAWN.** My run reported 9 files / 87 tests failed — but it was **sharing the box with `overflow:check` (~49 Chromium processes)**, which I disclosed on the #1328 row and *not* on this one. An idle re-run: **212 files, 2475 tests, 0 test failures.** Counts were stale too (204/2369 → 212/2475). **This is the same standard I applied to myself on #1361 and failed to apply here.** The card is NOT refuted — one green run cannot disprove nondeterminism — but my evidence for it is withdrawn |
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
| ~~**#1299**~~ | ~~`flex-end` overflow shears content off the top~~ — **FIXED + CLOSED** by #1365. Discovered boxes are now measured by rect spill, and the `tell = over && (…)` gate is gone |
| ~~**#1300**~~ | ~~`probeContentClipped` misses `.chart-body`, `.panel-left`, clamped cards, generated content~~ — **CLOSED** by #1365, but **one acceptance case was left unmet and unlogged**: `::after` axis labels. Filed a day later as **#1405**. A `Closes #N` reached further than the diff |
| ~~**#1347**~~ | ~~the Mermaid config half has no parity gate~~ — **FIXED + CLOSED** by #1373; `test/unit/mermaid/init-config-parity.test.js` now gates it in both directions. Residue split out as **#1377** |
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
| #298 | `.latticepack` interchange | unbuilt. **Correction:** my parenthetical (*"no reference outside `lib/layout/README.md`"*) was false at both bases — it also appears in `lib/layout/scaffold.js` (real code) and a unit test |
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

> **⚠ Scoped to `7b8a219`, and 5 of 15 rows have since decayed.** The original
> sentence here was *"everything here reproduces on the current tree."* That was
> true when written and is false now — `main` moved 10 commits the same day.
> Corrections are inline below, marked **`→ NOW:`**. Read this table as a
> snapshot with an expiry date, which is what any triage of a moving queue is.

Ordered by what I'd fix first.

| # | Defect | Evidence |
|---|---|---|
| **#1246** | Mermaid renders *after* `sanitizeSlideHtml`, so a diagram can put `javascript:` into a same-origin preview frame | filed with an end-to-end real-Chromium exfiltration of a planted key. **Security; HARD RULE #22.** Blocks any feature where a deck arrives from someone else |
| **#1354** | Export-to-Marp bundle ships MIT + OFL third-party files with **no license text** | **REPRODUCED.** Ran `node tools/export-marp.js` — output carries `fonts/`, `mermaid-v11.min.js`, `lattice-runtime.min.js` and **zero** LICENSE / NOTICE / THIRD-PARTY files. (`dist/marp-kit/` *does* carry all four — the export path does not) |
| **#1349** | a CRLF-authored deck silently renders with the default palette | ~~`resolve-palette.js:23` is still `/^---\n…/`~~ **→ NOW: FIXED** by `bdf9cea` (#1357). **My evidence was the wrong instrument even then:** that regex *is* still literally on the line — the fix normalizes the input (`replace(/\r\n?/g,'\n')`) instead of loosening the pattern, deliberately, because `\r?\n` structurally cannot match a lone CR. Grepping for an unchanged pattern proves nothing. **Recurred anyway: #1388** is this defect in `tools/export-marp.js`, which was not in `SANCTIONED_EOL_BOUNDARIES` |
| **#1350** | structured comment pragmas leak into every exported presenter-notes field | `MAGIC_COMMENT_MATCHERS` (`lib/authoring/notes-core.js`) still allowlists only prettier / markdownlint / remark-lint |
| **#1363** | `below-note`'s exclusion is a substring test | **→ NOW: HALF FIXED, and my quote was inaccurate when written** — the line already read `hasOptOut(cls) \|\| EXCLUDED.some(…)`; I dropped the first clause. `62a61a4` filters `no-*` tokens, so `no-progress → false`. But `compare-code` and `pull-quote` are **still** substring-excluded and the code says so: *"does NOT make the layout list token-exact … needs a design ruling (#1363)"*. **Keep open on that half** |
| **#1320** | `speak: never` is invalid in Chromium **and** wouldn't help | ~~still present~~ **→ NOW: FIXED** by `62a61a4`. `speak:` survives only inside explanatory comments, in the past tense |
| **#1069** | `proseWordCount` counts fenced-code content as prose | still strips only the class directive and headings |
| **#1241** | ~~the *only* Radix portal wrapper without `lx-ui`~~ | **→ CARD UNDERSTATED; my "verified" retracted.** There are **6** Portal wrappers and **2** lack `lx-ui` — `dropdown-menu.tsx` **and `select.tsx`**. So five siblings, four carry it. Wrong at both bases; I repeated the card's "only" instead of testing it |
| **#1348** | two diagram ink pairs sit below AA in every palette | `gitBranchLabel0-7` + `errorTextColor` are sanctioned in `KNOWN_BELOW_AA`, not fixed |
| **#797** | 28 of 30 gated showcase WebPs have no consumer | verified: 30 files, only `funnel.{light,dark}` referenced (`comparison.astro`) |
| **#970** | three superseded branches need deleting | all three still exist on `origin` |
| **#1327** | nine tools each carry their own Chromium resolver | **→ NOW: evidence REFUTED, card still partly real.** `tools/lib/resolve-chrome.js` exists (`62a61a4`) and 9 tools import it — so *"no shared resolver"* is false. But **11 tools still don't use it**, so consolidation is partial. My *"15 tools"* also does not reproduce (the grep returns 19) — a number stated without a method. **#1369** is the successor for the 15 `test/` copies |
| **#1336** | the `content` stress-test slide no longer demonstrates its claimed ceiling | **→ EVIDENCE CANNOT SUPPORT THE CLAIM, and the card is now closed.** That the heading exists is not evidence the slide fails to demonstrate the ceiling — that is a *rendered* claim and I substituted a source read for a render, which §"What I did not verify" says not to do |
| **#1278** | `wifi` clips real content on 4 of its own gallery slides | **→ NOW: FIXED and CLOSED** by #1365 (the QR tile was 301px of a 524px stage; worst slide 51px over → 22px under). Both baseline entries I cited are gone, so my *"exact match in the ratchet"* evidence no longer exists |
| **#1355** | `--measure-body: 36em` is a compatibility value, not a typographic one | still 36em. **Note:** the card says *"do not fix the comment"* — the comment has since been softened from "769.5px, ~78–83 characters" to "~80 characters at the body tier" |

---

## 7 · Partially landed — shrink the card, don't close it

| # | What landed | What remains |
|---|---|---|
| **#578** | `--footer-centre-*` → `--footer-center-*` **done** | `lib/forms/cell/progress-centre/` still carries the UK spelling |
| **#1223** | 29 lint exclusions → 28 | `.claude/workflows` is still excluded and is neither vendor nor generated |
| ~~**#1332**~~ | steps 1–2 landed via #1353 | **CLOSED** — the config half landed in #1373 (#1347). Residue is **#1377** |
| **#511** | the Mermaid var-map unification landed via #1353 | the CLI rename off "emulator" has not |
| **#287** | 15 manifests carry a `render` key | the dispatcher schema and the chart-kernel migration have not |
| **#757** | part A — the `.html` player — shipped in #798–#824 | part B — the `.lattice` envelope with theme + components + assets |
| **#596** | the perf gate landed via #1330 | the E2E re-tier |
| **#1270 / #1308** | `#1312` made the slice/deck sweep able to fail | the GATE half |

---

## 8 · One process finding

**`BACKLOG.md` is stale by 93 issues.** It states "**45 open**" and was last
written **2026-07-28** (`git log -- BACKLOG.md` shows one commit, `23f8283`; my "2026-07-30" had no source); there are **138**. `sync:backlog` (`tools/sync-backlog.js`)
has not run since. The file's own header calls itself "the one-way mirror of the
open GitHub issue queue" — a mirror that is off by 3× is worse than no mirror,
because it is the surface an agent reads first when picking up work.

This is also the root of the triage problem generally: **there is no closing
mechanism.** Five cards in §1 were fixed by PRs solving adjacent problems, and
nothing noticed. A cheap fix is to have `sync:backlog` run on merge and flag any
card whose cited gate now passes.

---

## What I did not verify

Honesty per HARD RULE #23. **110** of 138 cards were read and classified without
the defect being re-tested (the headline table now derives this; an earlier
revision said 104 in one place and 101 in another). Specifically not driven:

- **Any real-device claim** — #667, #783, #1216 all need a physical iPhone. They
  remain correctly marked UNVERIFIED in their own text; I did not change that.
- **The nightly gates** — #683, #688, #732, #793, #1315 were read from their
  comment threads, not re-run. `npm run regress` (the #688 check) was not run.
  Note that #683's tier (`test:integration`) passes locally on this tree, which
  neither confirms nor refutes a nightly failure on a different runner.
- **#1360 — RETRACTED.** I wrote that `examples/state-chart.md` was *"not in the
  baseline now and the gate is green,"* so its acceptance criterion *"can already
  pass without the defect being fixed."* **False.** `examples/state-chart.md: [6]`
  **is** in the baseline at `e053eaf`, and the sweep does not list it among the
  improved decks — so the criterion is unsatisfied and can fail. I read the
  baseline at `7b8a219` and asserted current state after `main` had moved; #1365
  rewrote that file in between. The one part that survives: the geometric probe
  and the reported defect are different measurements, so verify p6 by eye too.
- **#1246 was not re-exploited.** The card carries an end-to-end real-Chromium
  demonstration; I confirmed only that the architectural gap is still there —
  `checkPreviewHtmlSinks` gates that a builder *calls* `sanitizeSlideHtml`, and
  Mermaid renders inside the frame afterward, so the sanitizer never sees its
  output. Re-running the exploit needs a docs build and a real browser.
- **Visual/rendering claims** — #581, #680, #1213, #1278, #1299, #1346, #1360 all
  need a real render inspected by eye. Not done here.

---

## 9 · The rescan, and what the audit actually proved

Both halves of this section were produced *after* the note above, by rescanning
the queue and by running an independent checker over every claim in it. This is
the part worth reading.

### 9a · The queue moved faster than the triage

| | |
|---|---|
| open at `7b8a219` (the snapshot) | 138 |
| closed since — by this sweep | 9 |
| closed since — **by other work** | **13** |
| **new cards filed since** | **23** |
| open at `e053eaf`, ~18 hours later | **139** |

**Twenty-two closed, twenty-three filed, net +1.** The queue is running to stand
still. That reframes the whole note: the §8 process finding ("nothing closes
cards") is real but secondary — the dominant term is the *arrival rate*, and
`sync:backlog` running on merge would not touch it.

Closed by others, all of which this note lists as open or still-real: #1278,
#1279, #1299, #1300, #1310, #1320, #1327, #1329, #1332, #1336, #1347, #1349,
#1358.

**Three of the 23 new cards are a previously-fixed defect resurfacing one file
over** — the most actionable pattern in the whole exercise:

| new | is | why it escaped |
|---|---|---|
| **#1388** | **#1349 again**, in `tools/export-marp.js` | #1357 normalized eight *ingests*; this file was not in `SANCTIONED_EOL_BOUNDARIES`, so the gate cannot see it |
| **#1369** | **#1327 again**, in `test/` | #1327's scope was the nine *tools*; the 15 test copies were out of scope |
| **#1377** | **#1347 again**, on the theme-pinned path | split out at merge time as the one sub-item that did not ship |

Each original fix was real. Each was scoped to *the instances its card
enumerated* rather than to the *class of defect*, and the residue became a new
card. **That is the mechanism generating this backlog**, and it is worth more
attention than any individual card in it.

One more, from the same family: **#1405** is acceptance case 4 of **#1300**.
#1365 closed #1300 having fixed the other three cases; its "off-path, logged not
pulled" list (#1360, #1367, #1361, #1379, #1404) contains no card for this one.
A `Closes #N` reached further than the diff. **Suggested rule: a closing keyword
on a multi-acceptance card should require every box, or the card should be
split.**

### 9b · What the checker found, and the one shape it found it in

Two published headline claims **refuted** (§3), six rows **decayed**, four
numbers stated **without a reproducible method**, one **internal contradiction**
in the counts, and one **inconsistently applied standard** (#870 vs #476/#477).

Every one of the substantive errors has the same shape:

> **A number was derived from a rendered artifact instead of the source, and not
> re-run before being published.**

- **#1310** — counted the *rendered* `README.md` with an `awk` that also matched
  hand-written prose bullets. Then, retracting it, diagnosed the cause by
  inspection rather than re-running, and got the mechanism wrong while getting
  the corrected number right. Two passes, two failures of the same discipline.
- **#577** — compared a *count* against a *budget constant* and called the delta
  a raise. The ratchet had been tightened 1336 → 1307. Sign reversed.
- **#1324** — reported 87 test failures from a run sharing the box with ~49
  Chromium processes, and disclosed that load on a *different* row. An idle
  re-run: 0 failures. I had invalidated my own `overflow:check` run three rows
  earlier for exactly this reason and did not apply it here.
- **#1360, #1361, #1278** — asserted what `overflow-baseline.json` contains from
  a read taken before `main` moved.
- **#1349** — cited an *unchanged regex* as proof a bug survived. The fix
  normalizes the input rather than loosening the pattern, so the regex is still
  there and the bug is gone. Grep-for-pattern was the wrong instrument.
- **#1241, #1336, #298, #1223, #1327** — "verified" attached to a claim that
  repeated the card instead of testing it, or that a source read cannot settle.

The corrective is not "be more careful". It is procedural, and cheap:

1. **State the command with the number.** Four of these would have died on
   contact with `show your method` — the missing filter in the `awk`, the
   `git log -L` on the budget, the concurrent load on the vitest run.
2. **Measure the source, not the render**, unless the rendered result *is* the
   claim — and if it is, produce the artifact (HARD RULE #23), don't substitute
   a grep.
3. **Re-read state immediately before publishing it.** Six errors here are a
   correct reading of a tree that had since moved. A triage of a live queue is
   perishable; date-stamp it and re-check anything load-bearing at publish time.

That is the durable output of this exercise — more than the classification,
which was obsolete within a day.
