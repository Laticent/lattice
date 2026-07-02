---
status: shipped
summary: REJECTED (decision final — keep `transform: scale()`). Proposal was to replace the preview's `transform: scale()` down-scaling with CSS `zoom` — a real geometry scale (hit-testing/touch land at displayed coordinates), to retire the iOS interaction tax (parent-hosted capture surface + ÷scale coordinate math). A headless fidelity spike looked perfect — `container-type: size` + cqi/cqh diffed zoom-vs-transform were layout-identical in Chromium at desktop (0.56×) and mobile (0.30×). But the on-device test KILLED it: iOS Safari mis-resolves `cqi`/`cqh` under `zoom` — a `46cqi` poster collapsed to a fragment and flex text columns shrank to one word per line on a real iPhone, while the same slide rendered perfectly under `transform`. Classic "works in Chromium, breaks on iOS Safari" (the exact trap headless can't surface). Decision: keep `transform: scale()`; the link guard (already merged, #682) fixed the actual reported blank. Prototype (#698) reverted; this note is the durable record so `zoom` isn't re-proposed without a fix for iOS container-query resolution.
last-updated: 2026-07-02
companion:
  - ./2026-07-01-debug-bounding-boxes.md
  - ./2026-07-02-preview-iframe-vs-shadow-dom.md
---

# Preview down-scaling: `transform: scale()` → CSS `zoom` (REJECTED)

**Date:** 2026-07-02
**Status:** REJECTED — killed by the on-device iOS test (§7). Prototype #698 reverted; `transform: scale()` stays.
**Prompted by:** the owner, after the video-poster iOS blank: "it's a yucky solution. I wonder if we really need transform-scaled to begin with — maybe if we solve that we solve all these problems."

---

## 1. The problem

A slide must lay out at its intrinsic `@size` box (1280×720) — `section { container-type: size }` and every `cqi`/`cqh` unit resolve against that box, and "preview === export" depends on it. The preview pane is narrower, so the slide is down-scaled. Today that is `transform: scale(w/1280)`, which scales the **paint** but leaves the **layout box** at full size. That single choice is the root of a recurring class of iOS bugs:

- **Touch isn't delivered into a transform-scaled iframe** (iOS Safari). The whole parent-hosted capture surface + `elementsFromPoint` mapping in the debug-overlay work (`2026-07-01-debug-bounding-boxes.md`) exists to work around this.
- **Every interactive layer carries `÷scale` coordinate math** — debug-overlay label placement, chart-interact hit-testing — to undo the transform.
- **The negative-margin trick** (`marginBottom = SH*sc − SH + GAP`) and the `overflow: clip` dead-space fix in the FIT agent both exist only because the layout box stays full-size.

The owner's intuition: retire `transform: scale()` and this class dissolves.

**One caveat up front — the link-tap blank is NOT in this class.** Tapping an in-slide `<a href>` navigates the *iframe* to the external site, which frame-blocks → blank. That happens at scale 1.0 too; it's a navigation-policy issue, fixed by the preview link guard (`deck-preview.js linkGuardAgent`), and stays regardless of what we do about scaling.

---

## 2. The candidate: CSS `zoom`

`zoom` is a **real geometry** scale — it changes the used box size, not just the paint. So:

- Hit-testing and touch land at the **displayed** coordinates → no capture surface, no `÷scale` math.
- No negative-margin compensation (the box shrinks for real) and no `overflow: clip` dead-space fix.
- `getBoundingClientRect` returns the displayed rect directly.

It is now universally supported (Safari always, Chrome always, Firefox 126+).

**The blocking unknown was fidelity:** does `container-type: size` + `cqi`/`cqh` stay faithful when the container is `zoom`-scaled rather than paint-scaled?

---

## 3. The fidelity spike (verified)

Rendered a `cqi`/`cqh`- and text-heavy `stats` slide through the real preview engine (`lib/playground`, `inlineSVG:false` — the same DOM `deck-preview` scales), displayed the same section at the same target width two ways, and diffed:

| Scale | Displaying | Differing px | Where |
|---|---|---|---|
| **0.5625** (desktop pane) | 720×405 | ~6.5k / 292k (2.2%) | glyph edges only |
| **0.305** (mobile pane) | 390×220 | ~1.9k / 86k (2.2%) | glyph edges only |

The diff map lights up **only on text edges** — zero structural shift, no repositioning, no line-break drift. `cqi`/`cqh` resolve identically under `zoom`; the only difference is sub-pixel text rasterization (if anything `zoom` is *crisper*, laid out at target size, and closer to the native-resolution export). Artifacts: `.scratch/spike/` (compare-desktop.png, compare-mobile.png).

**Verdict: `zoom` is viable.** The blocking question is answered.

---

## 4. What is still unproven

The **payoff** — that `zoom` actually fixes the iOS touch class — cannot be verified from the headless sandbox (headless Chromium delivers iframe touch fine; only real iOS Safari doesn't — the same trap as the debug saga). It requires **on-device confirmation** (HARD RULE #23). Hence the staged rollout.

---

## 5. Rollout that was planned (staged)

1. **Filmstrip prototype (#698).** Switch the shared filmstrip builder's FIT agent (`deck-preview.js`, Playground + Drawing Board) from `transform: scale()` → `zoom`. Ship it, deploy the Cloudflare preview, confirm on a real iPhone.
2. **On-device gate.** If iOS confirms → proceed. If iOS rejects → revert one file, keep the link guard.
3. **Full migration** (never reached): the other four preview builders + retire the `÷scale` math in `debug-overlay.js` / `drawing-board-chart-interact.js` + the parent-hosted capture surface.

The gate at step 2 is where it died.

---

## 6. The on-device result — REJECTED

The prototype shipped (#698, Cloudflare preview) and was tested on a real iPhone. **`zoom` broke the layout that `transform` renders correctly:**

- `video companion`: the poster (`max-width: 46cqi`) collapsed to a tiny fragment and the flex `.video-lead` text column shrank to **one or two words per line** — while the *same* slide on the `transform` build (a screenshot minutes earlier) rendered full-width and correct.
- The slide also under-filled the pane.

**Diagnosis: iOS Safari does not re-resolve `container-type: size` + `cqi`/`cqh` against a `zoom`-scaled container.** Under `zoom`, the container-query length units on iOS collapse (the poster's `46cqi` and the flex columns resolve against a wrong/near-zero effective container), so every cqi-sized dimension shrinks. Chromium *does* re-resolve them proportionally — which is exactly why the §3 headless spike was clean and misleading. This is the same **"passes in headless Chromium, fails only on real iOS Safari"** class as the debug-overlay touch saga and the mobile-WebKit `:root` cqi bug (`engineering/gotchas.md`): every regression gate here runs headless Chromium, which cannot surface it.

The `transform: scale()` approach does not have this problem — it scales the *paint* of an already-resolved layout, so cqi resolves once against the intrinsic 1280×720 box and the raster is scaled uniformly.

---

## 7. Decision

**Rejected. Keep `transform: scale()`.** The interaction "tax" (parent-hosted capture surface + `÷scale` math) stays, but it *works on iOS* — which `zoom` does not. The actual reported bug (the video-poster tap blanking the preview) was already fixed by the orthogonal **link guard** (#682), so nothing is lost by keeping `transform`. Prototype #698 is reverted to `transform`; this note is the durable record.

**Reopen only if** a future iOS Safari resolves container-query units under `zoom` (test `46cqi` on a real device first), **or** someone finds a scaling mechanism that is both real-geometry (for touch) AND resolves container queries on iOS — neither is true today. Do not re-propose `zoom` on headless-spike evidence alone.
