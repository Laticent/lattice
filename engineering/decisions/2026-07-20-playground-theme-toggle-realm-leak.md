---
status: proposed
summary: >
  The §9 autonomy-ROI probe (design doc 2026-07-20-autonomous-torture-profiler.md, gating the whole
  crawler bet) was run on the just-merged Slice-2 primitives — and it ANSWERED YES: greedy autonomous
  discovery reached a real, previously-unknown leak that no hand-written scenario covers. On the
  PLAYGROUND (zero scenario coverage), toggling light/dark leaks ~361 KB/lap of retained JS heap,
  SUSTAINED (12–15 laps, Mann-Kendall z=4.46, no decay, reproducible). It is NOT the DOM/node class —
  Documents, Frames, nodes, and listeners all read FLAT — so the live-frame metrics miss it; the heap
  snapshot names it: +30 NativeContext / +1472 Context / +1260 FunctionTemplateInfo per run, held by
  native Global handles (V8PerContextData / gin::ContextHolder / extensions::ScriptContext). That is
  DETACHED PREVIEW-IFRAME REALMS accumulating — the SAME root-cause class as #1120 (a full srcdoc
  rewrite mints a fresh iframe realm on every theme/mode change), but on the Playground's OWN
  marp-engine render path, which #1120's `restyle` fast-path (single-slide-render.ts) never reached.
  The fix is to give the Playground preview the same in-place restyle: on a theme/mode-only change swap
  the theme in the resident iframe realm instead of rewriting `srcdoc`. That is a #1120-scale render-loop
  change (PlaygroundApp.tsx is ~1.2k lines) needing 3-width visual verification + a trio, so it is
  teed up as its own PR, not rushed. This doc banks the reproducible diagnosis and doubles as the ROI
  record that justifies building the Slice-3 `explore` driver.
---

# Playground light/dark toggle leaks detached iframe realms (~361 KB/lap)

> **What it is.** Every time you toggle light/dark on the **Playground**, the live preview is
> re-rendered by a full `srcdoc` rewrite, which mints a fresh iframe **realm** — and the old realm is
> not released. They pile up at ~361 KB per toggle, unbounded. It's the #1120 leak class (srcdoc-rewrite
> realm churn), on the one render path the `restyle` fix didn't cover.

## How it was found — the §9 ROI probe (autonomy's first real catch)

This leak is the payoff of the autonomous-profiler bet. The design doc
(`2026-07-20-autonomous-torture-profiler.md` §9/§11) said the whole crawler is only justified if
autonomy can find a leak a human wouldn't have scripted — and gated the build on running that
experiment first. Run on the Slice-2 primitives (`enumerateInteractables` + `resolveAndClick`, #1126):

- **Coverage reach:** greedy discovery enumerated **51 of 58** Studio controls the `studio` scenario
  never touches, plus the **entire** landing (83) and Playground (45) surfaces — zero scenario coverage.
- **The catch:** a crude single-pass sniff flagged the Playground light/dark toggle; the honest
  **lap-and-return** discriminator (invertible toggle = net-zero checkpoint on the same page, the design
  doc §6 method) confirmed it **sustained**, not warmup.

So autonomy earned its keep on the first real run. It also **live-validated two of the trio's Slice-3
watches**: the volatile-label false-abort (the "Switch to dark mode → Switch to light mode" toggles
*flip* their label, so `resolveAndClick` aborted, §4.1) and the ungated-navigation crash (an `a[href]`
on the landing page navigated and destroyed the measurement context — red team F4).

## The measurement (reproducible)

Fresh Playground page, warm one toggle, then K laps of one full light/dark **pair** (net-zero), retained
heap sampled at the closed start line each lap (post 2×GC):

```
heap/lap (MB): 15.7 16.0 16.5 16.9 17.3 17.6 18.0 18.3 18.7 19.0 19.4 19.7
  sen ≈ 361 KB/lap · MK z = 4.46 · early Δ(0→3)=1141 KB ≈ late Δ(8→11)=1062 KB  ⇒ SUSTAINED, no decay
Documents 4→4 · Frames 3→3 · nodes 1435→1435 · listeners 1266→1266   (all FLAT)
```

Reproduced identically on a second run. The flat DOM/node/listener counts are the tell that a
*naive* leak hunt (watching `Nodes`/`Documents`) would miss this — it is off-DOM realm memory.

## Root cause (named from the heap snapshot)

A per-constructor baseline→final diff over 15 laps (`diffSnapshots`) shows the growth is V8 realm
scaffolding, not app objects:

| Δcount | constructor | meaning |
|---|---|---|
| +30 | `NativeContext` | **new JS realms** (≈2 per lap) |
| +1472 | `object:system / Context` | their context objects |
| +1260 | `FunctionTemplateInfo` | per-realm DOM-API binding scaffold |
| +7800 / +13530 | `AccessorInfo` / `AccessorPair` | per-realm accessor bindings |
| +2102 | `PrototypeInfo` | per-realm prototypes |

The realm retainer walk (`retainerReport({realm:true})`) names the holder: every leaked realm's
`global_proxy_object` is retained by a **native Global handle** —
`V8PerContextData::context_` / `gin::ContextHolder::context_` / `extensions::ScriptContext::v8_context_`.
That is Blink holding **detached iframe contexts** it hasn't released — the classic detached-realm leak.
`Documents`/`Frames` stay flat because a new `srcdoc` write replaces the doc in the *same* frame slot
(frame count unchanged) while the *previous* realm detaches and lingers.

**Why here and not fixed by #1120:** `PlaygroundApp.tsx` renders the preview by writing the iframe
`srcdoc` (its own comments: "re-bound after each render (a srcdoc rewrite replaces the iframe doc)",
"Re-apply after every full srcdoc rewrite (deck swap / **theme / mode** / size)"), and its render
signature includes mode — so a light/dark toggle is a **full rewrite**. #1120 fixed exactly this churn
for the **single-slide-render** path (`docs/src/lib/single-slide-render.ts` — swap the resident
`<style id="lattice-theme">` in place, no new realm) but never touched the Playground's marp-engine
render loop.

## The fix (teed up as its own PR — NOT rushed here)

Give the Playground preview the **in-place restyle fast-path**: when only theme/mode/palette changed
(deck source + geometry unchanged), swap the theme stylesheet inside the **resident** iframe realm
instead of rewriting `srcdoc` — mirroring #1120's `restyleSig` / RESTYLE branch. Expected: per-toggle
realm mint → 0, the ~361 KB/lap climb → a plateau (as landing's toggle already shows post-#1120).

Why it is its own change, not folded in tonight:
- **Blast radius.** `PlaygroundApp.tsx` is a ~1.2k-line render loop with a full-rewrite vs. section-patch
  regime, a FIT agent, and skeleton/reveal timing. Adding a third (restyle) regime is a #1120-scale
  reshape, not a one-liner.
- **QUALITY BAR.** A Playground render change must be visually verified at all three widths
  (`tools/screenshot.js`) — the toggle must still recolor correctly, no paint/scale regression — and the
  #1120-class risk warrants the adversarial trio on what ships.
- **Isolation (#8/#17).** It is a distinct feature on a distinct surface; it earns its own branch/PR.

## Verification protocol for the fix (when it lands)

Re-run the lap-and-return on the Playground light/dark toggle (the measurement above): the SUSTAINED
climb must become a **plateau** (slope decays with K), with `NativeContext`/`Context` growth → ~0 across
the run, and the theme still visibly recolors at 1440 / 820 / 390 px. That artifact is the proof.
