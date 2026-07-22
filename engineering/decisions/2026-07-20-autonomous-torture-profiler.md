---
status: proposed
summary: >
  Grow the reusable memory/leak profiler (tools/perf-torture, landed as the engine+scenario+report
  foundation) into a general-purpose torture PROBER that can be pointed at ANY Lattice surface —
  Playground, homepage, docs, Studio — and drive it GREEDILY: follow links, click buttons, seek, and
  torture whatever is in the path, bounded by configurable depth/breadth/budget. HYBRID driving:
  scripted scenarios SEED precise entry states (Studio Build-posture, typing into CodeMirror) and the
  autonomous crawler explores from each seed. A SALIENCE function ranks the frontier by a deterministic,
  LEAK-WEIGHTED heuristic (mount/unmount + iframe/realm + theme-rewrite density, not "user value").
  Headless+fast or HEADFUL+slowMo so a human watches it drive.
  REVISED BY THE ADVERSARIAL TRIO (red team + Munger inversion + independent checker, 2026-07-20): the
  original design computed the leak VERDICT on the LIVE greedy crawl — which all three lenses found
  reproduces the exact cry-wolf failure this whole thread exists to fix (a crawl tours a different path
  each run → the before/after "did my fix work?" is impossible; the checkpoint-return is undecided and
  every reading either resets the leak or pollutes the measurement; there is no lap-level idle control;
  ~3–5 affordable laps starve the plateau discriminator). The FIX (unanimous): SEPARATE DISCOVERY FROM
  MEASUREMENT. The crawler is a scenario GENERATOR — it explores greedily (headful, watchable) and emits
  a DURABLE, REPLAYABLE tour manifest + candidate assertions. The leak verdict runs ONLY against a PINNED
  manifest, replayed deterministically, with an idle-lap control, net-zero (non-navigating) checkpoints,
  and persistent-store (IDB/SW/localStorage) deltas subtracted from the heap signal. Greed stays in
  DISCOVERY (what the user asked for); the VERDICT stays deterministic (what makes it trustworthy). CUT
  from v1 by the trio: the LLM salience lever ("optional" engineers itself into "required", laundering
  non-determinism + spend) and the "official library"/naming/--html/docs-page packaging (premature
  commitment — earn the library identity AFTER the verdict is proven). Also corrected: the measurement
  engine is NOT "unchanged" — slice 2 must export its measurement seam (sample/analyze/serve/…) and add
  two new SAFE primitives (interactable enumeration + a verified descriptor→click), which do not exist
  today. Design-first; nothing here changes exported artifact bytes or ships an LLM on the per-PR path.
---

# Autonomous torture prober — a general-purpose Lattice leak hunter

> **What it is.** Point it at a URL. It drives the *real* app **greedily** — follows links, clicks
> buttons, seeks — torturing whatever it finds, to a depth you configure, while you watch (headful).
> But it does **not** pronounce a verdict on that live crawl. It **records** the tour it discovered as a
> replayable manifest; then the leak verdict runs by **replaying that pinned tour deterministically** —
> N identical laps, an idle-lap control, the heap/nodes/listeners trend, and the retainer walk that
> **names what holds a leak**. Discovery is greedy and human-watched; the verdict is deterministic and
> re-runnable. Scripted scenarios seed the states a crawler can't synthesize (typing, drag, a dialed-in
> posture). It is the memory/leak analog of Lighthouse: it **owns** the report schema nothing else
> models, and **adopts** the standards that already fit (V8 `.heapsnapshot`, JUnit as a projection).

This doc is the design model. The measurement half already shipped (`tools/perf-torture/` engine +
`studio` scenario + report artifacts). This proposes the **autonomous prober** it grows into. The design
was **hardened by the adversarial trio** before any code — §12 is the ledger of what the trio changed and
why; the sections below already reflect those changes.

> **⛔ Slice 3 (the greedy `explore` crawler) is HELD — see
> `2026-07-22-autonomous-crawler-automation-not-autonomy.md`.** The operative reason is NOT §11's "no
> evidence yet" (that framing invites "so run the probe and build it"). It is a category distinction: the
> friction a crawler would relieve — not wanting a fresh clue per run, not wanting recurring leak-hunting
> churn — is an **automation** problem (deterministic scenarios in CI), not an **autonomy** problem, and
> the crawler is a poor fit for it on both counts. Build the §11 scenario library when the friction bites;
> revisit the crawler only as a narrow, later discovery aid. Slices 1–2 (design + exported seam + the two
> safe primitives) stand.

---

## 1. Why grow it

The landed tool is **scenario-driven**: a human writes the exact cycles, and you only torture what you
wrote. The ask (verbatim intent): a **greedy** prober (not limited to pre-decided cycles) that **follows
links, clicks buttons, seeks** — configurable **depth**, a sense of **what's worth exercising**, and both
a **headless** (fast, CI) and a **headful** (slow, watchable) mode — pointable at *any* Lattice surface.

The reusable, hard-won half is **already built and stays behaviorally unchanged**: the CDP instrument,
the idle-calibrated Mann-Kendall/Sen verdict, the heap snapshot/diff + **retainer-path walk**, and the
**observer-pollution-safe driving helpers** (the discipline that stopped the harness fabricating its own
leaks, `2026-07-20-studio-audit-instrument-fix.md`). But "unchanged" ≠ "untouched": slice 2 must
**export the measurement seam** (`sample`, `peakDuring`, `analyze`, `controlSlopesFrom`, `serve`), which
is private to `runTorture`/`withinSession` today — the crawl driver reuses it rather than duplicating it
(HARD RULE #1). See §12/C4.

## 2. Three layers

| Layer | Status | Owns |
|---|---|---|
| **Engine** (measurement) | ✅ built; **seam to be exported** (§12/C4) | CDP metrics, MK/Sen verdict, heap diff + retainer walk, report artifacts, observer-safe helpers |
| **Driver** | 🆕 the work | `scenario` (scripted, landed) **+** `explore` (greedy discovery → tour manifest) **+** `replay` (pinned manifest → verdict) |
| **Report** | ✅ built; **renderers extend** (§12/C5) | a lap-map onto the existing K-loop shape + a discovery site-map; renderers today iterate `report.cycles` only |

Crucially — and this is the trio's central correction — **the driver has two distinct phases with a
durable artifact between them**: `explore` (non-deterministic, greedy, human-watched, produces a tour
manifest) and `replay` (deterministic, produces the verdict). The engine never learns about crawling;
the verdict never runs on a live crawl.

## 3. Driving model — HYBRID discovery, DETERMINISTIC verdict

A **target** is a URL + a crawl config. A **scenario** stays available for precise flows a crawler can't
synthesize (typing into CodeMirror, a drag, the Studio Build posture). The crawler explores **from** a
seed state.

- **`explore`** drives greedily from a seed, following links/buttons under the levers (§4), and emits a
  **tour manifest**: an ordered, replayable action list (stable, verified selectors — §6) tagged by
  action-class, plus **candidate assertions** (observed post-conditions a human curates). This is the
  greedy, "torture anything" phase — run it **headful** to watch.
- **`replay`** takes a *pinned* manifest and runs the verdict: N identical laps + an idle-lap control
  (§6). Same tour, every run → a valid before/after.

Pure-autonomous and two-disconnected-drivers were rejected as before. What changed post-trio: the greedy
crawl **no longer produces the verdict directly** — it produces the *scenario* the verdict replays.

## 4. The levers (the discovery crawl's control surface)

| Lever | What it bounds | Default posture |
|---|---|---|
| **depth** | actions deep from a seed before reset | the primary **shaping** knob (e.g. 4) |
| **breadth** | interactables tried per state | capped (e.g. 6 highest-salience) |
| **budget** | total actions / wall-clock | the hard **stop** (every action is a measure cycle) |
| **coverage floor** | *minimum* budget reserved **per seed/surface** | on — defeats "spend it all in one corner, report clean by omission" (§12/R2) |
| **scope** | same-origin + URL include/exclude globs | same-origin, stay on the target |
| **revisit** | state fingerprint to skip seen states | **best-effort, open sub-problem** (§4.1) — not assumed to converge |
| **safety** | **allowlist** of action classes + spend/network **quarantine** + dry-run | allowlist, not denylist (§12/R6) |
| **headful / slowMo** | `--headful` non-headless + `--slowmo <ms>` + a live action/metrics banner | headless+fast; headful for watching |
| **salience** | frontier priority — **leak-weighted, deterministic** (§5) | heuristic only in v1 |

**Budget is the hard stop; depth shapes; the coverage floor guarantees a minimum.** Because each action
triggers a GC + a full metrics sample, discovery is a **best-first search** under budget — but with a
per-surface floor so it can't leave a whole surface untortured and read clean.

**Spend is quarantined, not denylisted.** The Playground runs on the **user's own OpenRouter key** (BYOK).
A "Generate"/"Fabricate" control is *maximally salient* to a naïve heuristic and would be clicked **every
lap**, spending the user's money and writing to the uncapped IDB asset shelf (polluting the checkpoint).
So spend/network-side-effect controls are an **allowlist** decision — quarantined by default, dry-run
first, never auto-clicked (§12/R6).

### 4.1 State fingerprinting is an open sub-problem (not a settled default)
"URL + visible-control set" is **unsound both ways** and is called out as unresolved: in an SPA the URL
is near-constant (`/studio?perf` for the whole session), so the key collapses to the control set — which
(a) **over-collides**: a 5-slide deck and a 50-slide deck present identical toolbars, so the crawler skips
the high-node-count state where the worst leaks live (silent false-clean); and (b) **under-collides**:
volatile labels ("Slide 3 of 12", "saved 3s ago", hydration IDs) make one logical state fingerprint
differently each visit → the frontier never converges → budget blown re-touring one corner. v1 uses a
**structural, volatility-stripped** fingerprint and treats dedup as best-effort; the budget model does
**not** assume convergence, and memory-relevant *scale* (deck size) is out of the fingerprint's reach.

## 5. Salience — deterministic and LEAK-weighted (LLM lever CUT from v1)

The discovery frontier needs a priority function. v1 ships **one tier**: a deterministic heuristic that
ranks by **leak surface**, not "user value" — mount/unmount density, iframe/realm creation, theme/CSS
rewrites, dialog open/close — because **leak-proneness is orthogonal to how central a control is to the
product** (the worst leaks the audit found live in boring corners: the add-slide gallery's 14 thumbnail
realms, theme toggles). It also folds in role/aria/visibility/size to stay legible. Fully reproducible;
works with no API key.

**The LLM salience lever is CUT from v1** (not deferred). The trio's Munger lens showed the predictable
dynamic: a crude heuristic under-covers → "you need `--smart` to find real leaks" → the LLM becomes the
de-facto default → every serious run now spends budget **and is non-deterministic** (LLM tie-breaks vary
run-to-run), laundering both into the path people actually use. "Optional" engineers itself into
"required," which is worse than absent. If a deterministic leak-weighted heuristic can't prioritize
usefully, that is evidence the crawl premise is weak — not evidence we need a model. (This is the exact
class of "looks-configurable-but-corrupts-an-invariant" lever Vetrina's trios cut four times.) An LLM
pass may be revisited *after* v1 proves its worth, behind the full HARD RULE #24 machinery (§12/R5).

## 6. The verdict — DISCOVER greedily, MEASURE deterministically

This is the crux, and the part the trio rebuilt. The original design computed the verdict on the live
greedy crawl; **all three lenses independently found that unsound** (§12). The verdict now runs on a
**pinned, replayed tour** — restoring every property that makes today's K-cycle verdict trustworthy:

1. **Discovery → a durable manifest.** `explore` records the tour (ordered, class-tagged actions with
   **verified** selectors) as a replayable artifact. Non-determinism is quarantined to *authoring*.
2. **The verdict replays the pinned manifest — N identical laps.** The **lap is the new cycle**: replay
   the same tour N times and trend start-line heap/nodes/listeners lap-over-lap. Same tour every run →
   a valid **before/after** (the #1 question a leak tool answers), which a live greedy crawl cannot give.
3. **An idle-lap control (required).** As `idle` calibrates the K-cycle floor, an **idle lap** — a
   no-op/dwell tour of the same shape — calibrates the lap floor and defeats the autocorrelation
   false-positive. Without it the verdict is UNCALIBRATED; crawl targets must supply `universalFloors`.
4. **Checkpoints are NON-navigating and NET-ZERO.** "Return to the start line" means **invert the tour's
   actions on the same document** (open⇄close, toggle⇄toggle) — *never* a reload. A reload resets the
   leak (false CLEAN, blind to the persistent-page leak class — which is exactly the `restyle` positive
   control); an in-app nav pollutes the start line with its own detached-realm residue. So a measured
   tour **must be a closed, net-zero loop**, and `explore` only emits tours it could invert.
5. **Persistent-store deltas are subtracted.** A tour legitimately grows IndexedDB / Cache Storage /
   localStorage, and `listAssets()` pulls the whole IDB store into memory → that benign persistence
   *moves* `retainedHeap`. The verdict subtracts measured store deltas from the heap signal (the audit's
   own "wrong metric" lesson) so a JS-heap leak isn't conflated with honest persistence.
6. **Plateau vs leak, at N laps.** A tour touches far more first-touch warmup (JIT, lazy modules, cache
   fill) than a single repeated cycle, so laps are *more* plateau-confounded, and budget affords few laps
   (and `analyze()` needs n≥4). The verdict therefore **discards a burn-in lap** and reports **plateau vs
   leak explicitly** (re-run at higher N; slope decay ⇒ plateau). If N is too low to discriminate, it says
   so — it does **not** guess.
7. **Per-action-class deltas (secondary), seed-paired only.** open→close pairs that net residue signal a
   leak — but the *inverse* pairing requires per-component knowledge only a human has (which "close" undoes
   which "open"). So this signal uses **seed/human-provided pairs**, not crawler-inferred ones.

**Observer-safe autonomous driving needs two NEW primitives.** The doc's earlier claim that the crawler
"drives via the existing helpers" was wrong: no enumeration helper exists, and `clickIn`/`clickNth` are
first-match / stale-index unsafe for arbitrary discovered controls. Slice 2 adds (a) `enumerateInteractables()`
— in-page `evaluate` returning **descriptors** (role, label, rect, a verified-unique selector), never
`ElementHandle`s; and (b) `resolveAndClick(descriptor)` — **re-enumerates after every action**, re-finds
the node, **verifies role+label match before clicking**, and aborts on mismatch (defeating the
descriptor-staleness that would mis-tag actions and corrupt the per-class deltas). Both are handle-free,
preserving the anti-pollution invariant.

## 7. Packaging — internal tool now; earn "library" later

v1 stays an **internal `tools/perf-torture/` tool** — no library page, no name ceremony, no `--html`,
no docs-site page. The trio's inversion showed the "official library" framing is **premature commitment**:
Vetrina's *four* adversarial trios spent their effort **subtracting** exactly this kind of surface, and a
diagnostic that isn't even a gate hasn't earned a stable public API. The library identity (a Vetrina-style
README, a name — parked candidates: Segugio / Tormenta / Setaccio — and a shareable `--html` report) is
**earned after** the replay verdict is proven reproducible on the positive controls (§9), not before.

## 8. Slices (v1) — a serialized chain, each landing before the next

1. **This doc** *(in hand)* — the model + the trio ledger.
2. **Export the measurement seam + the two safe primitives** — refactor `engine.mjs` to export
   `sample`/`peakDuring`/`analyze`/`controlSlopesFrom`/`serve`; add `enumerateInteractables` +
   `resolveAndClick`. Pure engine work, independently testable, no driver yet.
3. **`explore` driver + levers + tour manifest** — greedy best-first discovery under budget + coverage
   floor, leak-weighted heuristic salience, spend quarantine, the durable manifest + candidate assertions.
4. **`replay` verdict** — pinned-manifest laps, idle-lap control, non-navigating net-zero checkpoints,
   persistent-store subtraction, burn-in/plateau handling, the crawl report (lap-map + site-map).
5. **Headful + slowMo + live banner** — the watchable discovery mode.

### Slice-3 watches (logged from the Slice-2 trio — HARD RULE #18)

The Slice-2 primitives shipped CI-green + trio-reviewed (red team + Munger + checker: observer-safety
upheld, nothing fatal); the trio logged these to retire in Slice 3, not silently defer:

- **Run the §9 autonomy ROI control FIRST** — before building the Slice-3 driver machinery (levers,
  manifest, salience), run the "does greedy clicking find an un-scripted leak?" probe cheaply in
  `.scratch/` on the two primitives. Munger's whole-ballgame point: that single result decides whether
  slices 3–5 should exist. Sequence the killing experiment ahead of the plumbing.
- **role+label re-check is a heuristic, not identity** — it can mis-click a duplicate/recycled label OR
  false-abort a volatile one ("Slide 3 of 12", §4.1). Corroborate with a structural signal (stored
  `nth-of-type` position / subtree fingerprint) and reconcile the verify with §4.1's volatile-label reality.
- **Visibility misses ancestor `opacity:0` / off-canvas transforms** (`isVisible` reads own-opacity only;
  Radix menus fade the container while items stay mounted) → use `el.checkVisibility({opacityProperty,
  visibilityProperty})` + an in-viewport check, and re-check visibility in `resolveAndClick`.
- **Per-frame enumeration** — the primitives query the top document only; decide how `explore` reaches
  same-origin srcdoc realms (where the gallery/preview leaks live).
- **Single-source the a11y probe** — when the probe must diverge (a looser label match, app-specific role
  derivation), replace the byte-identity duplication + drift test with one injected probe-source string.

Slices are a **serialized chain** (each needs its predecessor), landing one PR at a time — permitted under
HARD RULE #17 (sequential PRs, not a stacked chain). The prior "each builds against `main` alone" wording
was imprecise and is corrected here.

## 9. Verification & risk (how each slice earns "done")

- **Correct positive-control assignment.** The `restyle` theme-swap leak
  (`2026-07-20-preview-theme-restyle-in-place.md`) is an *accumulate-on-the-persistent-page* leak → it is
  caught by the **per-action-class toggle delta** (and by lap-and-return **only because** checkpoints are
  now non-navigating, §6/4). The replay verdict must **flag a pre-`restyle` build and clear post-`restyle`**,
  driving the theme change through a **real, discoverable DOM control** (`[data-demo="mode"]`, not the
  scripted `setAttribute`) so the crawl path actually reaches it.
- **A lap-and-return positive control** that is a *growing-tour* leak (an unbounded listener/Map surviving
  action-inversion), so the primary signal has a control that isn't really the secondary signal's.
- **The autonomy control (the ROI test).** A positive control where the crawler finds a leak on a surface
  **no seed encoded** — otherwise autonomy adds nothing a scenario didn't. If this can't be shown, scope
  the crawler down to discovery-aid only and write more scenarios instead (§11).
- **No fabricated leaks.** Re-run the held-handle A/B under `explore` to prove autonomous driving pins no
  nodes (the observer-safe invariant).
- **`peakHeap` honesty.** Peak is a max over 60 ms polls, so a longer action shows a higher peak at the
  same true memory; per-action-class peak is duration-confounded. The verdict restricts to
  `retainedHeap`/`nodes` (as the README already advises) and does not claim peak coverage per action.
- **Adversarial trio on each shipping crux (HARD RULE #25).** The `replay` verdict (slice 4) and — if ever
  revived — LLM salience are the high-blast-radius parts; the trio attaches **per shipping PR**, not once.

## 10. Non-goals / boundaries (v1)

- **Not a CI gate.** Diagnostic; it prints signals + a verdict and ships **no gating workflow**. (The
  JUnit projection is gate-*capable* if a consumer wires it — that's their choice, not the tool's.)
- **No exported-artifact change.** Zero effect on PDF/PPTX/HTML export bytes.
- **No LLM anywhere in v1.** The salience lever is deterministic; the LLM tier is cut (§5).
- **Across-refresh (`--mode refresh`)** stays stubbed; note the checkpoint design (§6/4) is deliberately
  the *opposite* of a refresh (non-navigating), so refresh-mode is a separate concern.

## 11. The honest ROI position (from the trio)

> **Superseded as the operative hold-reason** by `2026-07-22-autonomous-crawler-automation-not-autonomy.md`:
> the section below is still true, but the *reason not to build Slice 3* is the automation-vs-autonomy
> category distinction, not pending evidence. The "write ~5 more scenarios" fallback here is elevated there
> to the primary answer.

There is **no evidence yet** that autonomy finds a leak a human wouldn't script — every known leak
(restyle, compose, the gallery realms) was found by a *targeted* scenario. So the crawler's genuine edge
is narrow: **discovering leak surfaces nobody thought to script**. v1 is therefore justified **as a
discovery aid feeding the deterministic verdict**, and its worth is gated on the §9 autonomy control. If
that control can't be produced, the higher-ROI path is explicit: **write ~5 more scenarios** (landing
islands, docs pages, Playground variants, export preview, mermaid) — each ~15 lines, deterministic,
asserted, CI-blessable — rather than maintain a general crawler. The doc commits to *measuring* that
trade, not assuming the crawler wins.

## 12. Trio ledger — what the adversarial review changed (2026-07-20)

Red team + Munger inversion + independent checker, run on the *original* draft of this doc. Their
collective verdict was **needs-revision**: the architecture and the "a lap = a K-cycle" insight are
sound, but the crux (computing the verdict on a live greedy crawl) was broken. Net effect — like Vetrina's
trios — was to **cut** surface and make the verdict's trustworthiness **structural**, not aspirational.

| # | Finding (converged across lenses) | Change folded in |
|---|---|---|
| **C1** | The **live greedy verdict** is non-deterministic → the before/after "did my fix work?" is impossible (Red B4, Munger F1/F4). | **Separate discovery from measurement** (§3, §6): `explore` emits a durable tour manifest; `replay` runs the verdict on a *pinned* tour. |
| **C2** | The **checkpoint-return** is undecided; reload resets the leak (false clean, blind to the `restyle` control), nav pollutes the start line (Red B3, Munger F2, Checker F1). | Checkpoints are **non-navigating action-inversion**; tours must be **net-zero closed loops**; persistent-store deltas subtracted (§6/4–5). |
| **C3** | **No lap-level control + lap starvation** — uncalibrated, and ~3–5 laps can't run the plateau discriminator or reach n≥4 (Red B1/B2, Checker F3). | **Idle-lap control required**; `universalFloors` required; **burn-in discard + explicit plateau-vs-leak**; refuse to guess at low N (§6/3,6). |
| **C4** | "Engine already built and **unchanged**" is **false** — the measurement seam isn't exported (Checker F5). | §1/§2 corrected; **exporting the seam is named slice-2 work**. |
| **C5** | "Drives via **existing helpers**" is **false** — no enumeration helper; `clickIn`/`clickNth` unsafe for discovered targets (Checker F4, Red M4). | **Two new safe primitives** — `enumerateInteractables` + verified `resolveAndClick` (re-enumerate + role/label check) (§6). Report renderers extend, not purely additive (Checker F9 → §2). |
| **R2** | **No coverage floor**; salience ranks *user value*, but leak-proneness is orthogonal → leaks hide where the crawler won't look (Red M2). | **Per-surface coverage floor** + **leak-weighted** salience (§4, §5). |
| **R6** | **Denylist** safety is unsound; salience steers the crawler to the BYOK **Generate** button → spends the user's money every lap (Red M6). | **Allowlist + spend/network quarantine + dry-run** (§4). |
| **M1** | "URL + visible-control set" fingerprint **over- and under-dedups** (Red M1, Checker F8). | Reframed as an **open sub-problem**; structural/volatility-stripped key; budget doesn't assume convergence (§4.1). |
| **R5/M5** | The **LLM salience lever** "optional" engineers itself into "required," laundering non-determinism + spend (Munger F5). | **Cut from v1** (not deferred) (§5). |
| **M6** | "Official library"/naming/`--html`/docs-page is **premature commitment** (Munger F6). | **Deferred** — internal tool until the verdict is proven (§7). |
| **ROI** | **No control proves autonomy finds an un-scripted leak**; scenarios may be higher-ROI (Munger F6 steelman, Red M3). | Added the **autonomy positive control** as the gate on the whole bet + the honest fallback (§9, §11). |

## 13. The forks (decided 2026-07-20)

1. **#1123 = the foundation** → landed; this prober builds on top as new (serialized) branches/PRs.
2. **Driving model = hybrid** → scenarios seed, the crawler explores from each seed — **but discovery and
   the verdict are two phases with a durable manifest between them** (trio C1).
3. **Salience = deterministic, leak-weighted; LLM cut from v1** (trio R5/M5).
4. **First deliverable = this design doc**, now hardened by the trio.
