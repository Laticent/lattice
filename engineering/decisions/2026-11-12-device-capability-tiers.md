---
status: proposed
summary: >
  Lattice has no idea what machine it runs on. About a dozen features each check one API on their own, nothing
  reads memory or GPU, and there is no minimum browser and no "unsupported" message. Proposed: one kernel reads
  the device once, before first paint, and puts it in one of three tiers. FULL is today's app. LITE keeps every
  feature but swaps the GPU-heavy visuals (the Nacre loader becomes the landing hero's pulse skeleton, backdrop
  blur becomes a solid fill), sizes worker pools from cores and memory, and keeps the local AI models off.
  UNSUPPORTED declines, out loud, naming the failed check. A System diagnostic panel in Workspace settings shows
  every signal and the reason for the tier. Declines are driven by facts the browser cannot misreport (missing
  features); hardware numbers are unreliable across browsers, so they choose LITE, not a decline, unless the
  owner sets a hard floor.
---

# Device capability tiers: detect the machine, degrade on purpose, decline out loud

## 1. What exists today (the audit)

There is **no central capability module and no degraded mode.** What exists is local and per feature:

| Area | Today | Gap |
|---|---|---|
| Worker pools | `docs/src/lib/worker-pool.js` falls back to the main thread on the first failure. Sizes are fixed or `hardwareConcurrency − 1` clamped: narration 1–4, picture encoder 1–2, PDF worker 1 with 2 slides in flight | Nothing reads memory. A 2 GB laptop gets the same pools as a 32 GB one |
| Preview iframes | `preview-pool.tsx` keeps 10 to 28 live slide iframes | No device cap; each iframe is a full document |
| GPU visuals | Nacre loader (`nacre-loader.css`, inlined again in `studio.astro`): three oversized `mix-blend-mode: screen` layers rotating forever. `backdrop-filter: blur` in the site header, chart interact, playground and one base modifier | Only `prefers-reduced-motion` is honored. On a software renderer Nacre measured 18 fps at 4K even after the 2026-10-19 fix (`2026-07-20-nacre-preview-loader.md`) |
| Local AI models | Kokoro TTS 80–330 MB, Transformers.js ~350 MB, WebLLM ~1 GB, downloaded on demand. `voice-model.js` probes a real WebGPU adapter; `architect-model.js` only checks `'gpu' in navigator` | Download decision ignores memory and disk; the two GPU checks disagree |
| Storage | IndexedDB in six stores; `storage-metrics.ts` estimates quota | Diagnostics only; nothing acts on low quota |
| Export | Capture drops to `pixelRatio 1` above 2048 px wide (`deck-export.js:1524`) | The only size-based downgrade in the app |
| Browser version | No browserslist, no build target, no "unsupported browser" UI. The app relies on `:has()` in about 45 engine CSS files with no check | An old browser gets a broken page with no explanation |
| Adaptive policy | `prefetch-engine.ts` reads Save-Data and connection type; the bake gates in `studio.astro` and `playground.astro` copy that logic inline | The only adaptive policy, and it is about the network, not the device |
| Diagnostics | Perf, Storage, Viz, Viewport and Preview-fidelity overlays on the shared `DiagnosticPanel` chassis | None reports the device itself |

Off-path defect found on the way: `ConceptGraph.astro` runs its `requestAnimationFrame` loop every frame forever, even when nothing moves. Logged in `followups.d/` with this PR, not fixed here.

## 2. What the browser will and will not tell us

The design has to start here, because the signals are uneven across browsers, and a decline built on a bad signal
turns away a capable user.

| Signal | API | Chromium | Safari | Firefox | Trust (browser columns are from vendor docs, not measured here; only Chromium was measured, below) |
|---|---|---|---|---|---|
| Memory | `navigator.deviceMemory` | Rounded to 0.25, 0.5, 1, 2, 4, 8 (capped at 8). Secure contexts only | **Absent** | **Absent** | Low: missing on two of three engines |
| CPU cores | `navigator.hardwareConcurrency` | Real count | May be clamped (privacy) | Real count, may be clamped under resist-fingerprinting | Medium |
| GPU present | WebGL `UNMASKED_RENDERER_WEBGL` | Full string | `"Apple GPU"` (masked, but always a real GPU) | Full or generalized string | **High for one fact:** a software renderer names itself (`SwiftShader`, `llvmpipe`, `Microsoft Basic Render Driver`) |
| GPU class | WebGPU `requestAdapter()` | Adapter + `isFallbackAdapter` | Recent Safari only | Behind flags on some platforms | Medium; absence means little |
| Storage | `navigator.storage.estimate()` | Quota from disk | Approximate | Approximate | Medium; enough for a "you have < N MB" warning |
| Browser features | `CSS.supports`, `typeof X` | — | — | — | **High:** a feature test cannot lie |
| Browser version | User-Agent string | Frozen / reduced | — | — | Low; never gate on it, gate on features |
| Actual speed | Long-task observer, frame timing during boot | Yes | Partial (no long-task API) | Partial | **High for what it measures**, and it is the one signal that sees thermal throttling and a busy machine |

**Measured here (2026-11-12, cloud sandbox, Playwright Chromium 153 headless):** `hardwareConcurrency` 4,
`deviceMemory` undefined (the probe page was not a secure context), WebGL renderer
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) ...))`, no WebGPU adapter, `:has()`, relative
colors and CSS nesting all supported. Two consequences:

1. **The software-renderer test works,** and it is exactly the "no GPU" case the owner named.
2. **Our own CI and e2e browsers are software-rendered.** An automatic tier would put every e2e run in LITE and change
   the screenshots. The tier must be pinnable (`?tier=full`, and a Playwright init script that pins it), and the tests
   must cover each tier on purpose, not by accident of the runner.

## 3. The model: three tiers, decided once, before first paint

| Tier | Who | What they get |
|---|---|---|
| **FULL** | A real GPU, enough cores and memory (or no evidence against them) | Today's app, unchanged |
| **LITE** | Software GPU, or ≤ 4 GB / ≤ 4 cores where reported, or the boot probe measured sustained long tasks | Every feature works; the costly *presentation* is swapped (§4) |
| **UNSUPPORTED** | Missing a feature the app cannot run without, or below a hardware floor the owner sets (§6, question 1) | A full-page decline that names the failed check and what to use instead |

**Rules that keep it honest:**

- **Absent signal is not a weak signal.** Safari reports no memory; that is "unknown", and unknown never pushes a user down a tier.
- **Feature tests decline; hardware numbers degrade** (by default). A missing `:has()` is a fact; "8 GB" is a rounded guess from one engine.
- **Measured beats guessed.** A boot probe (long tasks over the first few seconds of the Studio) can drop FULL to LITE mid-session, never the other way, and says so in a toast.
- **The user can override** (Workspace settings → Auto / Full / Lite). Auto is the default. The override never lifts UNSUPPORTED past a missing feature.
- **One place decides.** `docs/src/lib/device-profile.ts`: a pure `classify(signals) → { tier, reasons[] }` plus a `readSignals()` that touches the browser. `classify` is unit-tested over a signal table; nothing else in the app reads `deviceMemory` or the renderer string. `prefetch-engine.ts`'s network signals fold in as inputs, and the inline copies in `studio.astro` / `playground.astro` go.
- **Before first paint.** A small inline script in the page head runs the same feature list and the renderer test, and sets `data-device-tier` on `<html>`. CSS reads the attribute, so the Studio shell's inline Nacre never paints on a LITE machine at all.

## 4. What LITE changes

Ordered by how much each saves on a weak machine.

| Surface | FULL | LITE | Why |
|---|---|---|---|
| Studio preview loader (`DeckPreview`, the `studio.astro` shell) | Nacre | The landing hero's skeleton: `.live-host:not(.is-live)::after`, one gradient pulse (`landing.css`) | Nacre is three blended full-box layers composited every frame; the pulse is one layer. This is the owner's example |
| Underpainting (image-loading brushwork, `lib/core/image-painting.js`) | Animated band | Static | Same reason |
| `backdrop-filter: blur` (header, chart interact, playground) | Blur | Opaque surface token | Backdrop blur re-samples what is behind it every frame it scrolls |
| Preview iframe pool (`preview-pool.tsx`) | 10–28 slots | 6–12 | Each slot is a full document in memory |
| Worker pools (encoder, narration, PDF in-flight) | cores − 1, current caps | 1 worker, 1 PDF slide in flight | Memory more than CPU: one 4K bitmap is about 33 MB |
| Export capture | `pixelRatio` 2 below 2048 px | 1 | Halves capture memory; the PDF stays vector |
| Local AI models (Kokoro, Transformers.js, WebLLM) | Offered | Hidden; hosted voice only | 80 MB to 1 GB downloads on a machine that cannot hold them |
| Idle prefetch (`studio-warm.ts`) | Compose, Present, reading view, Fabricate | Off; panels load on first open | Prefetch is CPU and memory spent on a guess |
| Anima / motion | Author's tier | `legible` tier, the same floor `prefers-reduced-motion` uses | The kernel already has the tier |

LITE is a **look** change on screen, never an **export** change: no exported byte differs between tiers (the
capture `pixelRatio` row is the one exception, and it only applies to raster image export, which goes through the
QUALITY BAR's export sign-off before it ships).

## 5. The System diagnostic panel

A sixth overlay on the existing `DiagnosticPanel` chassis, toggled under Workspace settings → Diagnostics as
"System", with `?system` as its URL parameter like the others. It shows:

- **Tier** and the reasons, in plain words ("Lite, because the browser draws with a software renderer (SwiftShader)").
- **Browser:** engine and version, from feature tests and `userAgentData` where present.
- **CPU:** cores as reported, and "clamped by the browser" on Safari.
- **Memory:** as reported, or "not reported by this browser".
- **GPU:** renderer string, software or hardware, WebGPU adapter yes/no.
- **Storage:** used and quota, persistent or not (reuses `storage-metrics.ts`).
- **Network:** connection type, Save-Data.
- **Preferences:** reduced motion, reduced data, the user's tier override.
- **Feature checklist:** each required feature, pass or fail.
- **Copy report** button: the whole panel as text, for a bug report.

## 6. The decline screen

Full page, in the site's own chrome, no app behind it. It says what failed and what to do, without apology
padding:

> **Lattice can't run well in this browser.**
> It needs CSS `:has()`, which this browser doesn't support. Use a current Chrome, Edge, Safari or Firefox.
> [Copy system report]

The required-feature list (the decline set) is short and comes from what actually breaks, verified by disabling each
one in a real browser before it joins the list: module workers, IndexedDB, CSS `:has()`, container queries,
`structuredClone`, and the ES level the build emits. Anything with a working fallback today (OffscreenCanvas,
CompressionStream, relative colors, `requestIdleCallback`) is **not** on it.

## 7. Open decisions (owner's call)

1. **Does weak hardware ever decline, or only degrade?** Recommended: degrade only, decline on missing features. Memory is unreported on Safari and Firefox, so a hardware floor declines only Chromium users and lets the same weak machine through on Safari.
2. **Does the decline screen keep a "continue anyway" link?** Recommended: yes, small, below the report button, and the session then runs as LITE with a persistent banner. Without it, one wrong feature test locks a capable user out with no recourse.
3. **Which surfaces does the gate cover?** Recommended: the Studio, Playground and Present. The landing and docs pages are static and serve everyone.
4. **The LITE thresholds.** Proposed: software renderer, or ≤ 4 GB reported, or ≤ 4 cores reported on a non-Safari engine, or the boot probe. These are the owner's numbers to set (CLAUDE.md, second filter, row 3).

## 8. Delivery

One branch, one PR, one commit per slice (HARD RULE #17):

1. `device-profile.ts` kernel + unit table + the pre-paint inline script + tier pinning for tests.
2. System diagnostic panel.
3. LITE visuals: Nacre → skeleton, Underpainting static, backdrop blur → solid. Owes a demo deck only if a slide surface changes (it does not; these are app chrome), and owes `tools/screenshot.js` at three widths in both tiers.
4. LITE resources: pool sizes, preview slots, prefetch, model visibility.
5. Decline screen + override setting.

**Verification:** Playwright Chromium is a natural LITE machine (SwiftShader); a GPU-backed FULL run and real Safari
need the macOS suite by dispatch. A real low-memory Android phone is **UNVERIFIED** from here (HARD RULE #23), and the
PR will say so.
