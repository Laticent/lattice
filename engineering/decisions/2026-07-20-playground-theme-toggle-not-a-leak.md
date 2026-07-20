---
status: shipped
summary: >
  CORRECTED FINDING (supersedes the initial claim). The §9 autonomy-ROI probe flagged the Playground
  light/dark toggle as a leak — ~361 KB/lap sustained RETAINED heap, MK z=4.46 — and an earlier draft of
  this doc promoted it to a confirmed, user-facing, #1120-class leak worth a fix, and cited it as proof
  the autonomous crawler "earned its keep." The adversarial trio (red team + Munger inversion + checker)
  plus a cheap discriminating measurement RETRACTED that. The MECHANISM is real and code-confirmed (a
  light/dark toggle flips `<html data-mode>` → the Playground's MutationObserver → a full `srcdoc` rewrite
  in the shared `deck-preview.js` → a fresh iframe realm per write; #1120's restyle fast-path lives only
  in `single-slide-render.ts` and never covered this path). But the RETENTION was a HEAPPROFILER
  ARTIFACT: the 361 KB/lap was measured as post-`HeapProfiler.collectGarbage` retained heap, whose
  retainer walk bottoms out at native Global handles (V8PerContextData / gin::ContextHolder) — the exact
  fingerprint two prior docs already quarantined as "NOT a confirmed app leak, needs on-device
  confirmation" (the studio-audit E-realm deferral + the instrument-fix doc). Re-measured WITHOUT a heap
  client, via `performance.measureUserAgentSpecificMemory()` (its own GC): 40 toggles grew only ~0.6 MB
  (~16 KB/toggle), and after 30 s idle memory fell BELOW baseline (20.1 → 20.8 → 19.0 MB). So the detached
  realms are reclaimed by a real GC — there is NO material, user-facing leak, and NO fix is warranted. The
  §9 crawler-ROI bar is UNMET: the probe rediscovered a KNOWN mechanism on a surface §11 already earmarks
  for a hand-written scenario, and the "leak" was an instrument artifact — this is NOT evidence autonomy
  finds what a human wouldn't script, and it does not greenlight Slice 3. What IS validated: the Slice-2
  primitives work (they drove the discovery), and a no-CDP measure is the required confirmation gate for
  any realm-class finding.
---

# The Playground theme-toggle "leak" is a HeapProfiler artifact, not a real leak

> **What it is — corrected.** An earlier draft claimed the Playground light/dark toggle leaks ~361 KB per
> toggle-pair and needed a #1120-scale fix. It does not. That number came from
> `HeapProfiler.collectGarbage`-retained heap, which over-counts detached-but-reclaimable iframe realms —
> the artifact class this codebase already knew about. A real-GC measurement shows ~16 KB/toggle,
> reclaimed on idle. **No fix is warranted, and this is not the crawler-ROI win it was billed as.**

This doc is kept as the corrected record — it documents a real instrument failure mode, the discriminating
test that settles it, and an honest correction of an over-claim the adversarial trio caught.

## What was claimed, and what the trio + measurement found

The §9 autonomy-ROI probe (`2026-07-20-autonomous-torture-profiler.md`) drove the just-merged Slice-2
primitives greedily over the Playground and flagged the light/dark toggle. A crude sniff + a hand-driven
"lap-and-return" showed the post-2×GC **retained heap** climbing ~361 KB/lap, sustained over 12–15 laps
(MK z=4.46). The initial draft concluded: a confirmed, user-facing, #1120-class realm leak; build the fix;
"autonomy earned its keep."

The trio dismantled the load-bearing parts of that:

- **Red team:** the retained-heap fingerprint (growth rooting at native `V8PerContextData` /
  `gin::ContextHolder` / `extensions::ScriptContext` Global handles) does **not** distinguish "pinned
  forever" from "detached, awaiting normal reclamation" — *every* V8 context is held by that native
  machinery. `HeapProfiler.collectGarbage` (a V8 GC) does not force Blink's context-disposal lifecycle,
  and an attached CDP/inspector client is already documented in this repo to pin detached contexts / block
  bfcache. Two prior docs already deferred this exact fingerprint pending on-device confirmation. No idle
  control ran; z=4.46 is the *ceiling* for n=12 (it means "monotone," nothing about magnitude).
- **Munger:** ~180 KB/toggle on a 15.7 MB baseline, on a *code editor* users rarely toggle — no
  user-facing symptom was established (the draft inherited #1120's iOS-tab-discard symptom without
  re-deriving that it transfers). And the §9 bar is "a leak a human *wouldn't* have scripted," but this is
  a KNOWN class (#1120/restyle) on the Playground — a surface §11 explicitly earmarks for a scenario. The
  "autonomy earned its keep" framing was motivated reasoning.
- **Checker:** verified the mechanism, the MK math, and the #1120-class attribution are all correct — but
  those establish *that a realm is minted per toggle*, not *that it is retained*. It also noted the fix
  would live in shared `deck-preview.js` (playground + drawing-board + both studios), not `PlaygroundApp.tsx`
  — a wider blast radius than the draft stated — and that, because the holder is *native*, the "just null
  the contentWindow ref" cheap fix would free nothing.

## The discriminating measurement (the test the trio demanded)

Measured via `performance.measureUserAgentSpecificMemory()` — which runs its **own** GC and reports actual
per-context bytes — with **no `HeapProfiler` client attached** (cross-origin-isolated via COOP/COEP on a
throwaway server), driving the real trigger (`data-mode` flips → the Playground's MutationObserver → the
render path):

```
baseline = 20.1 MB
after 40 light/dark toggles = 20.8 MB   (Δ 0.6 MB ≈ 16 KB/toggle)
after 30 s idle = 19.0 MB               (BELOW baseline)
⇒ NEGLIGIBLE growth, and it RECOVERS on idle — the detached realms are reclaimed by a real GC.
```

The ~361 KB/lap from the `HeapProfiler.collectGarbage`-retained path was the artifact: it counted
detached contexts that V8 keeps "near-death" across synchronous CDP GCs but a real idle GC reclaims. The
real per-toggle cost (~16 KB) is an order of magnitude smaller and fully reclaimable. **Not a material
leak; no fix warranted.**

## Corrections this forces

- **No Playground fix.** The `restyle`-in-place change is withdrawn — there is no material leak to fix.
- **§9 ROI bar: UNMET.** Autonomy did not surface a leak a human wouldn't have scripted; it rediscovered a
  known mechanism on an obvious surface, and the "leak" was an instrument artifact. This does **not**
  justify building the Slice-3 driver. What IS validated: the Slice-2 primitives drove real discovery
  correctly (enumerate + resolve-and-click worked on a live un-scripted surface). The honest next step for
  coverage remains §11's — a committed, deterministic `pgtoggle`-style scenario — not the crawler.
- **Engine gate (follow-up, logged).** `perf-torture`'s default verdict uses `HeapProfiler.collectGarbage`
  retained heap, which over-counts detached realms. Any **realm-class** finding (growth rooting at
  NativeContext / Global handles, DOM counts flat) MUST be confirmed with a no-CDP measure
  (`measureUserAgentSpecificMemory` / a real device) before it is called a leak. This should be baked into
  the engine's realm-retainer report as an explicit "UNCONFIRMED — needs no-CDP measurement" banner, and
  the README's Limits section updated. (Off the path of the profiler slices; logged, not fixed here.)

## The one genuine win

The process worked: an over-claim built on a known-suspect instrument fingerprint was caught — before any
code shipped — by the adversarial trio plus a ~10-minute discriminating measurement. That is the
maker-checker / trio ladder (HARD RULE #25) doing exactly its job, and the reason "verified" must name its
surface and carry an artifact from it (HARD RULE #23): the real surface here was a real-GC memory measure,
and it said "not a leak."
