---
status: proposed
summary: >
  Grow the reusable memory/leak profiler (tools/perf-torture, landed as the engine+scenario+report
  foundation) into an OFFICIAL, general-purpose torture LIBRARY that can be pointed at ANY Lattice
  surface — Playground, homepage, docs, Studio — and drive it GREEDILY: follow links, click buttons,
  seek/scroll, and torture whatever is in the path, bounded by configurable depth/breadth/budget. The
  driving model is HYBRID (decided): scripted scenarios SEED precise entry states (Studio Build-posture,
  typing into CodeMirror) and the autonomous CRAWLER explores from each seed — precision where scripts
  are needed, coverage everywhere else. A SALIENCE function ranks the frontier: a cheap deterministic
  heuristic (role/aria/visibility/position) by default, with an OPT-IN, budget-capped LLM pass to break
  ties and prune low-value branches (HARD RULE #24 keeps model spend off the default path). It runs
  HEADLESS+fast for CI or HEADFUL+slowMo so a human watches it drive. The CRUX (and the reason this is a
  decision doc, not a patch): today's leak verdict — run one IDENTICAL, state-neutral cycle K times, test
  for monotonic rise — BREAKS under a crawl, where every action differs and state deliberately
  accumulates. The fix restores the repeated-identical-state property at a CHECKPOINT: lap-and-return
  (crawl a tour, return to a known state, GC, measure at the start line each lap) + per-action-class
  deltas (open→close pairs that net residue). The measurement engine, the retainer walk, and the
  OBSERVER-POLLUTION-safe driving are already built and unchanged; the new work is the DRIVER (crawl mode)
  + the checkpoint verdict + the salience lever + headful/slowMo + the library page (modeled on Vetrina).
  Design-first: this doc locks the model and the four forks (already answered: land the foundation /
  hybrid / heuristic+optional-LLM / doc-first) before code. v1 is sliced; nothing here changes exported
  artifact bytes or ships an LLM on the per-PR path.
---

# Autonomous torture profiler — a general-purpose Lattice prober

> **What it is.** Point it at a URL. It drives the *real* app greedily — follows links, clicks
> buttons, seeks, scrolls — torturing whatever it finds, to a depth you configure, and tells you
> **per action** whether memory / DOM nodes / listeners **leak**, then **walks the heap to name what
> holds the leak**. Scripted scenarios seed the states a crawler can't guess (typing, drag, a dialed-in
> posture); the crawler covers the rest. Headless and fast for CI, or headful and slow so you watch it
> work. It is the memory/leak analog of Lighthouse: it **owns** the report schema nothing else models,
> and **adopts** the standards that already fit (V8 `.heapsnapshot`, JUnit as a projection).

This doc is the design model. The measurement half already shipped (`tools/perf-torture/`
engine + `studio` scenario + report artifacts); this proposes the **autonomous, general-purpose
library** it grows into, and records the four forks already decided.

---

## 1. Why grow it

The landed tool is **scenario-driven**: a human writes the exact cycles, and you only torture what you
wrote. That was right for the Studio audit, but it doesn't scale to "torture *anything* on Lattice."
The ask (verbatim intent): an **official library**, **greedy** (not limited to pre-decided cycles),
that **follows links, clicks buttons, seeks** — with **configurable depth**, an **NLP sense of what's
worth exercising**, and both a **headless** (fast, CI) and a **headful** (slow, watchable) mode. It
should not matter whether the target is the Playground, the homepage, the docs, or the Studio.

The reusable, hard-won half is **already built and stays**: the CDP instrument, the idle-calibrated
Mann-Kendall/Sen verdict, the heap snapshot/diff + **retainer-path walk** (names a leak's GC root), and
the **observer-pollution-safe driving helpers** (every ElementHandle disposed or replaced by an in-page
`evaluate` returning a primitive — the discipline that stopped the harness fabricating its own leaks,
`2026-07-20-studio-audit-instrument-fix.md`). The new work sits *on top* of that core.

## 2. Three layers

| Layer | Status | Owns |
|---|---|---|
| **Engine** (measurement) | ✅ landed | CDP metrics, MK/Sen verdict, heap diff + retainer walk, report artifacts, observer-safe helpers |
| **Driver** | 🆕 the work | `scenario` (scripted, landed) **+** `crawl` (autonomous): enumerate interactables → rank → act → recurse |
| **Report** | ✅ landed, extends | add a **site-map** of what was toured + per-action-class metrics; optional standalone `--html` |

The engine never learns about crawling; the driver never learns about statistics. The report consumes
both. This keeps each layer independently testable — the property that made the extraction clean.

## 3. Driving model — HYBRID (decided)

A **target** is a URL + a crawl config; the crawler discovers the rest. A **scenario** stays available
for precise flows a crawler can't synthesize (typing into CodeMirror, dialing the Studio Build posture,
a drag). The two compose: a scenario's `setup`/seed establishes a state, and the crawler explores
**from** that state.

- **Pure autonomous** was rejected: it can't reach input-gated states (typing, drag), so it would leave
  the richest surfaces (the editor) untortured.
- **Two disconnected drivers** was rejected: the crawler would start cold on every surface, re-deriving
  the entry state a one-line seed already encodes.

So: **seeds where precision is needed, greed everywhere else.** The `studio` scenario's surfaces become
seeds; new surfaces (homepage, Playground, docs) can be *seedless* targets the crawler drives from `/`.

## 4. The levers (the crawl's control surface)

Sane defaults, every one configurable:

| Lever | What it bounds | Default posture |
|---|---|---|
| **depth** | actions deep from a seed before reset | shallow (e.g. 4) — the primary knob |
| **breadth** | interactables tried per state | capped (e.g. 6 highest-salience) |
| **budget** | total actions / wall-clock | the real governor — every action is a *measure cycle* |
| **scope** | same-origin + URL include/exclude globs | same-origin, stay on the target |
| **revisit** | state fingerprint (URL + visible-control set) to skip seen states | dedup on; frontier is a set, not a list |
| **safety** | denylist of destructive/irreversible controls; external-nav block; dry-run | never click "Delete", never submit, never leave-origin |
| **headful / slowMo** | `--headful` non-headless + `--slowmo <ms>` pacing; a live action+metrics banner | headless+fast; headful is opt-in for watching |
| **salience** | the priority function over the frontier (§5) | heuristic; LLM pass opt-in |

**Budget is the governor, not depth.** Because each action triggers a GC + a full metrics sample, a
naïve deep×wide crawl is O(actions) expensive. The crawl is a **best-first search** ordered by salience
under a hard action/time budget — it spends the budget on what matters and stops cleanly.

## 5. Salience — heuristic first, optional LLM (decided)

The greedy frontier needs a **priority function**: which control is worth the budget. Three tiers,
stacked:

1. **Heuristic (default, deterministic, no spend):** score each candidate by role / aria-label /
   visible text / size / viewport position / semantic tag. A visible header `button[aria-label="Present"]`
   outranks a footer "Privacy" link. Fully reproducible; works with no API key.
2. **Optional LLM salience pass (opt-in, budget-capped):** score candidate labels+context against a
   "what is core to *this* app's value?" prompt to break ties and **prune low-value branches** — the
   NLP "is this worth following?" judgment. Off by default; gated exactly like the existing spender
   (`OPENROUTER_ALLOW_SPEND`), never on the per-PR path (**HARD RULE #24**).
3. **LLM-driven step selection** — a model picks each step live. Richest, but costly and
   non-reproducible; documented as a mode, not a default.

**A pure-heuristic run must always work with no key.** The LLM is a lever that sharpens prioritization,
never a dependency.

## 6. The crux — the verdict breaks under a crawl, and how it's fixed

This is the load-bearing decision. Today's verdict is trustworthy **because** it runs one *identical,
state-neutral* cycle K times and tests for a monotonic rise against an idle-calibrated floor. A crawl
**violates both premises**: every action is different, and the app legitimately accumulates state as you
navigate deeper. Run the current verdict over a crawl and it flags "leak" on *every* surface — a rising
heap is simply the app loading more UI. Useless.

The fix restores the repeated-identical-state property at a **checkpoint**, two complementary signals:

- **Lap-and-return (primary).** The crawler discovers a *tour* (a bounded path of actions), then
  **returns to a known checkpoint** (the seed/home state), GCs, and **measures at the start line**. Run
  N laps of the tour; if start-line heap/nodes/listeners grow lap-over-lap, that's a real leak — and the
  retainer walk names the holder. "Torture a tour, measure at the start line each lap." This is the
  crawl-mode generalization of the K-cycle test: the *lap* is the new cycle, the *checkpoint* is the
  state-neutral anchor.
- **Per-action-class deltas (secondary).** Tag each action by class (open-dialog / close-dialog /
  navigate / toggle-theme / …). A class whose inverse should net zero but leaves residue (open→close
  nets +nodes) is a leak — a generalization of what the `studio` `insert` cycle already asserts (dialog
  closed + rail count unchanged).

Corollary: **observer-pollution safety must extend to autonomous driving.** Every click/enumeration the
crawler performs routes through the engine's in-page `evaluate`/disposed-handle helpers, or it
re-introduces the exact artifact the audit killed. The crawler enumerates interactables via an in-page
`evaluate` that returns *descriptors* (selector, role, label, rect), never `ElementHandle`s.

## 7. Packaging — an official library, familiar with a twist

Modeled on **Vetrina** (`docs/src/lib/vetrina/`, `2026-07-05-vetrina-walkthrough-library.md`): a real
README with a tagline + a 60-second start, a decision doc (this file) for the contract, a
`capabilities.md` entry, and an `npm run torture` entry point. The **twist**: Vetrina is a runtime
*browser* library; this is a Node/CDP *profiling* library, so its "page" is the **report artifact** it
emits (the Markdown+Mermaid tour report, and the standalone `--html` for offline/shareable) plus a docs
page describing the model. Same house shape (contract-first, invariants named, adversarially reviewed),
different medium.

**Naming (open).** `perf-torture` is the working id. If it wants an identity like Vetrina, an Italian
register fits the house (Vetrina, indaco, cuoio): candidates — **Segugio** (bloodhound: it follows the
scent and names the holder), **Tormenta** (tempest/torment), **Setaccio** (sieve: it sifts every
surface). Not blocking; parked for the human pick.

## 8. Slices (v1)

1. **This doc** — the model + the four locked forks. *(the deliverable in hand)*
2. **`crawl` driver + levers + lap-and-return verdict** — the autonomous core: in-page interactable
   enumeration (descriptors, not handles), best-first frontier under budget, checkpoint return, the
   crawl-mode report (site-map + per-tour laps). Heuristic salience only.
3. **Headful + slowMo + live banner** — `--headful`/`--slowmo`, the on-screen action+metrics overlay.
4. **Optional LLM salience** — opt-in, budget-capped, key-gated (HARD RULE #24); pure-heuristic stays
   the default.
5. **Standalone `--html` + the library page** — the shareable tour report (Lighthouse-style
   self-contained file) and the Vetrina-modeled README/docs page.

Each slice builds/tests against `main` alone → its own branch/PR (**HARD RULE #17**); the engine+report
foundation (#1123) is the base they all stand on.

## 9. Verification & risk (how each slice earns "done")

- **Real surface, real artifact (HARD RULE #23).** The crawl-mode verdict is proven on a *known* leak
  and a *known* clean surface: the landing theme-swap leak we already fixed (`restyle`,
  `2026-07-20-preview-theme-restyle-in-place.md`) is the positive control — lap-and-return must flag a
  pre-`restyle` build and clear the post-`restyle` build. A surface with no leak must read clean.
- **No fabricated leaks.** An A/B that the crawler's own driving doesn't pin nodes (the observer-safe
  invariant), re-run of the held-handle test under crawl.
- **Adversarial trio on the crux (HARD RULE #25).** The lap-and-return verdict and the salience pruning
  are the high-blast-radius, genuinely-novel parts — they get the full trio (red team + Munger inversion
  + independent checker) on what ships, not the mechanical slices.
- **Cost honesty.** The LLM salience pass prints its spend and caps it; a run with no key is fully
  functional and says so.

## 10. Non-goals / boundaries (v1)

- **Not a CI gate.** Diagnostic, like the engine today — it prints signals + a verdict; it never fails a
  build. (JUnit projection is for dashboards that *want* it, opt-in.)
- **No exported-artifact change.** Zero effect on the PDF/PPTX/HTML export bytes; this drives previews
  and pages, it does not touch the render pipeline.
- **No LLM on the per-PR path.** The salience LLM is opt-in and key-gated; the default run is
  deterministic and free.
- **Across-refresh (`--mode refresh`)** stays stubbed until a slice needs it.

## 11. The four forks (decided 2026-07-20)

1. **#1123 = the foundation** → landed as the engine+report base; this library builds on top as new
   branches/PRs.
2. **Driving model = hybrid** → scenarios seed, the crawler explores from each seed.
3. **Salience = heuristic + optional LLM** → deterministic default, opt-in budget-capped LLM pass.
4. **First deliverable = this design doc** → lock the model, then slice.
