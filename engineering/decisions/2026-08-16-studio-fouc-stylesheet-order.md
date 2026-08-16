---
status: shipped
summary: The Studio flashed its whole chrome unstyled on reload (#1653). Root cause was head ORDER, not head weight — Astro appends a page's bundled stylesheet after the page's own head content, which on /studio/ put the render-blocking link 51KB into a 58KB <head>, behind a 12.5KB inline <style> and a 28KB parser-blocking inline <script>. The browser therefore had nothing telling it to hold the paint and painted the raw DOM: first contentful paint at 339ms, stylesheet applied at 3572ms — 3.2s of unstyled page, measured in real Firefox on the real built artifact. Fixed with a post-build pass (docs/scripts/hoist-stylesheets.mjs) that moves each page's stylesheet link as early in <head> as it can go WITHOUT crossing a <style> element, so the cascade is byte-for-byte preserved: FCP 726ms, stylesheet 705ms — paint now follows the sheet, and the sheet itself arrives 2.86s earlier because its request is no longer queued behind the inline script. Two plausible causes were investigated and rejected as the primary: a MutationObserver forcing style during parse (real, fixed, but not the flash) and the chrome shipping both mobile and desktop control sets (makes the flash louder, is not the cause). Settled-state pixels unchanged at 1440/820/390.
---

# The Studio's flash of unstyled content on reload

**Date:** 2026-08-16
**Status:** shipped — #1653.

## 1. The report, and what was actually wrong

Reload `/studio/` and the page shows fully unstyled DOM for a moment: the
Lattice mark at its intrinsic size, browser-default form controls, no layout.
The reporter was on Firefox 152. A console line captured independently in
#1657 pointed at a mechanism: *"Layout was forced before the page was fully
loaded. If stylesheets are not yet loaded this may cause a flash of unstyled
content."*

The instinct is to read that as "some script forces layout too early", and
one does. That turned out not to be the flash.

The flash is simpler and larger: **the page paints before its stylesheet is
applied, because the stylesheet link is 51KB deep in a 58KB `<head>`.**

Astro appends a page's bundled CSS link after the page's own head content.
On `/studio/` the page's own head content is substantial and deliberate — a
12.5KB inline `<style>` (the SSR shell CSS) and a 28KB parser-blocking inline
`<script>` (the geometry seed). The map of the built head, before the fix:

| offset | element | bytes |
|---|---|---|
| 4,408 | `<style>` (astro-island) | 74 |
| 10,048 | `<style>` (SSR shell CSS) | 12,489 |
| 22,537 | `<script>` (geometry seed) | 28,405 |
| **50,942** | **`<link rel="stylesheet">`** | 59 |
| 51,002 | `<style>` | 4,064 |

Two consequences, and the second is the bug:

1. The stylesheet request is discovered late and queued behind the inline
   script's parse.
2. Nothing tells the browser a render-blocking sheet is pending until the
   parser reaches byte 50,942 — so it paints first, with only the inline
   styles applied.

## 2. Measurement

Both numbers come from one committed instrument, `docs/scripts/fouc-bench.mjs`
(`npm run perf:fouc`), so they are comparable by construction:

```bash
cd docs
node scripts/fouc-bench.mjs --dist /path/to/a/main-build   # before
node scripts/fouc-bench.mjs                                # after
```

It drives real Firefox (Playwright's Firefox 142 — the reporter's engine
family; this sandbox cannot run Firefox 152) against the **real built
artifact**, served through a latency + bandwidth + gzip modeling host, warm
cache, on RELOAD, median of 3. `landing.css` is the page's only external
stylesheet, so "first contentful paint earlier than its `responseEnd`" is
precisely "content painted without the page's CSS". It exits non-zero when a
page paints early, so it reads as a check and not only as a report.

| profile | build | FCP | stylesheet applied | unstyled window |
|---|---|---|---|---|
| 1.2Mbps / 200ms | before | 339ms | 3,572ms | **3,233ms** |
| 1.2Mbps / 200ms | after | 726ms | 705ms | none — paint follows the sheet |
| 10Mbps / 60ms | before | 196ms | 281ms | **85ms** |
| 10Mbps / 60ms | after | 309ms | 288ms | none |

FCP moving *later* is the fix, not a regression: the browser is now holding
the paint until it can paint correctly, which is what a render-blocking
stylesheet is for. The stylesheet itself also lands 2.86s earlier on the slow
profile, because its request no longer queues behind the 28KB script.

A video capture of the before build shows the unstyled frame directly (the
mark drawn at intrinsic size, mid-canvas), which is what the reporter
screenshotted.

## 3. The fix, and why it is shaped the way it is

`docs/scripts/hoist-stylesheets.mjs`, a post-build pass beside
`inject-modulepreload.mjs`: move each page's render-blocking
`<link rel="stylesheet">` as early in `<head>` as it can go **without
crossing a `<style>` element**.

That boundary is the whole design. Three alternatives were considered:

- **Hoist to the top of `<head>`.** Works (measured), and reorders the
  cascade: the page's inline `<style>` blocks currently sit *before* the
  sheet, so the sheet wins ties against them; hoisting past one silently
  flips that. A performance fix that changes which rule wins is a visual
  change wearing a performance fix's clothes. Rejected.
- **`<link rel="preload" as="style">` early, real link where it is.** Starts
  the request early and fixes consequence (1) — but not (2), which is the
  bug. A preload does not make the browser hold the paint; the render-
  blocking link is still unparsed, so the browser has nothing to wait on and
  paints unstyled anyway. Rejected.
- **Move the 28KB inline script out of `<head>`.** Would also move the link
  earlier, but the script seeds `<html>` geometry for the SSR shell and its
  placement is load-bearing; rewriting a boot path to fix a CSS-ordering
  problem is the larger and riskier change. Rejected.

The chosen floor — the end of the last `<style>` preceding the sheet, and
never earlier than the head's first resource element (so `<meta charset>`
stays first) — preserves every stylesheet-to-stylesheet ordering exactly.
Only script and metadata ordering changes, and scripts do not participate in
the cascade. Measured consequence: **0 changed pixels** in the settled state
at 1440 / 820 / 390.

On the real build the pass rewrites 84 of 92 pages; the Studio's sheet moves
27.7KB earlier.

## 4. Two things investigated and NOT the cause

Recorded because both are plausible, both were pursued, and one of them is a
real defect that was fixed anyway — so a future reader does not re-derive them.

**The forced style flush (real, fixed, secondary).** `ColorSchemeSeed.astro`
armed a `MutationObserver` on `<html>` with `style` in its attribute filter,
from inside a `<head>` script, whose callback calls `getComputedStyle`. The
Studio's geometry seed writes seventeen custom properties onto `<html>` while
the head is still parsing, so the observer woke and forced a style resolution
with no author stylesheet applied. Instrumented on the real artifact by
patching `getComputedStyle` and recording `document.readyState` +
`document.styleSheets` at call time: **1 forced read at `readyState:
"loading"` with only inline `<style>`s applied, in both Chromium and
Firefox → 0 after.** That is exactly the condition Gecko's warning names, and
it is worth not doing. It is not the flash: the flash survived this fix, on
video. The observer is now armed at `DOMContentLoaded` and `sync()` refuses
to run while parsing.

**Both control sets in the chrome.** The unstyled DOM reveals that the shell
ships the mobile *and* desktop control sets, with CSS choosing between them.
That makes the flash louder — more unstyled things to see — but it is not why
a flash happens, and it is a deliberate property of a responsive SSR shell.
Not changed.

## 5. What is not covered

- `npm run build:e2e` skips the post-build passes (it already skipped
  `inject-modulepreload`), so the e2e artifact does not carry the hoist. That
  predates this change and is left consistent rather than quietly diverged.
- Firefox 152 specifically is unreachable from this sandbox; the measurement
  is Firefox 142. The mechanism is not version-specific — it is "paint before
  the stylesheet applies" — and the same before/after direction reproduces in
  Chromium's instrumentation.
- The measurement uses a modeling server (latency + bandwidth cap + gzip),
  not the deployed Cloudflare host, which this sandbox cannot reach. The
  artifact under test is the one Cloudflare deploys.
