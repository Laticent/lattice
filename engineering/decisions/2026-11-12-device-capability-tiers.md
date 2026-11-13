---
status: in-progress
summary: >
  Lattice has no idea what machine it runs on. About a dozen features each check one API on their own, nothing
  reads memory or GPU, and there is no minimum browser and no "unsupported" message. The design: one kernel reads
  the device once, before first paint, and puts it in one of three tiers. FULL is today's app. LITE keeps every
  feature but swaps the GPU-heavy visuals (the Nacre loader becomes the landing hero's pulse skeleton, backdrop
  blur becomes a solid fill), sizes worker pools from cores and memory, and keeps the local AI models off.
  UNSUPPORTED declines, out loud, naming the failed check. A System diagnostic panel in Workspace settings shows
  every signal and the reason for the tier. Declines are driven by facts the browser cannot misreport (missing
  features) or by two hardware signals that agree, using a short CPU micro-benchmark and the detect-gpu library to
  cover what Safari and Firefox do not report.
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

**Measured on the other engines (2026-11-13, the System panel on the built Studio):**

| Engine | Graphics reads | Memory | Cores | Tier the panel showed |
|---|---|---|---|---|
| Playwright WebKit 26.0 (Linux, iPhone 15 Pro profile and a 1180 × 820 box) | `Apple GPU` | not reported | discarded as clamped (Safari UA) | Full |
| Playwright Firefox 142 (headless, 1440 × 900) | no WebGL context at all | not reported | 4 | Lite (no WebGL counts as one floor signal; 4 cores is weak) |
| Playwright Chromium (from §2's first probe) | `SwiftShader` | reported on a secure page | 4 | Lite |

Three consequences for the slices still to build:

1. **WebKit always names its renderer `Apple GPU`**, even this Linux build with no GPU at all, so on WebKit the
   software-renderer test sees nothing. Harmless on a real Apple device, which always has a GPU; on WebKit the
   tier rests on the CPU probe and the boot probe.
2. **"No WebGL" is not proof of no GPU.** Headless Firefox has none, and a real Firefox user can turn WebGL off for
   privacy. As first built it was a floor signal, so such a user on a machine reporting ≤ 2 cores would have been
   DECLINED. **Fixed the same day:** no WebGL is now weak (LITE) only, and detect-gpu's tier 0 counts as a floor
   only when a WebGL context exists, because detect-gpu also returns 0 when it cannot make one.
3. The memory and core columns of §2 are now measured on all three engines, not only taken from vendor docs.

## 3. The model: three tiers, decided once, before first paint

| Tier | Who | What they get |
|---|---|---|
| **FULL** | A real GPU, enough cores and memory (or no evidence against them) | Today's app, unchanged |
| **LITE** | Software GPU, or ≤ 4 GB / ≤ 4 cores where reported, or the boot probe measured sustained long tasks | Every feature works; the costly *presentation* is swapped (§4) |
| **UNSUPPORTED** | Missing a feature the app cannot run without, or below the hardware floor in §3.1 | A full-page decline that names the failed check and what to use instead, with a small "continue anyway" link that runs the session as LITE |

**Rules that keep it honest:**

- **Absent signal is not a weak signal.** Safari reports no memory; that is "unknown", and unknown never pushes a user down a tier.
- **Hardware declines only on agreeing evidence.** A missing `:has()` is a fact and declines alone. A hardware number is a guess, so the hardware floor (§3.1) needs two independent signals to agree before it declines; one weak signal only makes LITE.
- **Measured beats guessed.** A boot probe (long tasks over the first few seconds of the Studio) can drop FULL to LITE mid-session, never the other way, and says so in a toast.
- **The user can override** (Workspace settings → Auto / Full / Lite). Auto is the default. The override never lifts UNSUPPORTED past a missing feature.
- **One place decides.** `docs/src/lib/device-profile.ts`: a pure `classify(signals) → { tier, reasons[] }` plus a `readSignals()` that touches the browser. `classify` is unit-tested over a signal table; nothing else in the app reads `deviceMemory` or the renderer string. `prefetch-engine.ts`'s network signals fold in as inputs, and the inline copies in `studio.astro` / `playground.astro` go.
- **Before first paint.** A small inline script in the page head runs the same feature list and the renderer test (the renderer string is cached after the first visit, §3.2), and sets `data-device-tier` on `<html>`. CSS reads the attribute, so the Studio shell's inline Nacre never paints on a LITE machine at all.

### 3.1 Quick, cross-browser hardware detection (the owner asked for one)

The owner wants hardware to count toward a decline, "best effort but somewhat accurate". The browser's own numbers
cannot do that alone (memory is missing on Safari and Firefox), so the profile adds two signals that work on every
engine:

1. **A CPU micro-benchmark** (about 140 ms of work, run in a Web Worker after the first slide paints and cached for a day; see §3.2): a fixed unit of typed-array
   math, a JSON round trip and string building, counted in seven 20 ms windows, median taken. It measures the thing
   we care about (how fast this browser runs our kind of JavaScript right now) and it sees what the spec numbers
   cannot: thermal throttling, battery saver, a busy machine.
   **Measured here** (Playwright Chromium 153, sandbox, CDP CPU throttling): unthrottled median 178 units, 4x
   throttle 24, 6x throttle 28. It separates a fast machine from a slow one by about 7x, and it does **not**
   separate 4x from 6x. It is a coarse gate, good for "clearly slow", useless for fine grading. The first window
   reads low (76) because the JIT is still warming, which is why it takes the median. The cut-off is calibrated in
   slice 1 against the macOS and Windows runners, and the PR records the numbers.
2. **`detect-gpu`** (pmndrs, MIT, v5.0.70): looks the WebGL renderer string up in a table of measured GPU frame
   rates and returns tier 0–3. Tier 0 means no WebGL, a blocklisted GPU, or under 15 fps. It ranks real GPUs (an
   old integrated chip versus a discrete card), which our own software-renderer test cannot. Two costs: its
   benchmark tables must be **self-hosted** (it defaults to unpkg, and the app has no CDN dependency), and they were
   last published 2025-02, so a GPU newer than that is unknown and the library falls back to a guess. It loads
   lazily after first paint; the pre-paint script uses only our renderer-string test.

No library is needed for browser version: feature tests are exact, and a UA parser (`bowser`, `ua-parser-js`) would
only add a less reliable second answer. The System panel shows the UA-derived name for humans; nothing decides on it.

**The floor.** Decline when the browser lacks a required feature (§6), **or** when two hardware signals agree:

| Signal | Weak (counts toward LITE) | Floor (counts toward decline) |
|---|---|---|
| GPU | no WebGL, a software renderer, or `detect-gpu` tier 1 | `detect-gpu` tier 0 for a real (not software) chip that has a WebGL context |
| Memory (Chromium only) | ≤ 4 GB | ≤ 1 GB |
| Cores (not Safari) | ≤ 4 | ≤ 2 |
| Micro-benchmark | below the LITE cut-off | below the floor cut-off (calibrated in slice 1) |

One weak signal makes LITE (the owner's threshold, 2026-11-12). Two floor signals make UNSUPPORTED, with the
"continue anyway" link. The floor column is a proposal; the owner sets the final numbers on the PR.

### 3.2 What detection costs at load (measured 2026-11-12)

Playwright Chromium 153 in the cloud sandbox, fresh page per run, median of 5:

| Step | CPU x1 | CPU x4 (CDP throttle) | Where it runs |
|---|---|---|---|
| Feature tests (`CSS.supports`, `typeof`) | 0.2 ms | 0.7 ms | Pre-paint, main thread |
| WebGL renderer read (make a context, read, release) | 7.4 ms (first run 19.9) | 21.4 ms (first run 27.9) | Pre-paint on the FIRST visit only; later visits read the cached string |
| CPU probe (7 × 20 ms windows) | 140.5 ms | 142.8 ms | A Web Worker, after the first slide paints, at most once a day |
| `detect-gpu` | 3.3 KB gzipped code + one vendor table, 2–14 KB gzipped | — | After first paint, async fetch from our own origin |

The probe takes a fixed ~140 ms on every machine by design (it counts work in fixed windows), so it can never go on
the main thread at boot. In a worker it measures the same JavaScript engine without blocking a frame. Until its first
result lands, the CPU signal is `null` (unknown), which by the rules in §3 never lowers the tier. A slow result found
later drops FULL to LITE with a toast, the same path the boot probe uses.

**Load cost after this change:** under 1 ms on a returning visit (feature tests plus a cached renderer string), and
about 7–28 ms once, on the first visit, for the WebGL read. A real GPU's first context can cost more than SwiftShader's
(driver start-up); that is **UNVERIFIED** until the macOS and Windows runners measure it.

## 4. What LITE changes

Ordered by how much each saves on a weak machine.

| Surface | FULL | LITE | Why |
|---|---|---|---|
| Studio preview loader (`DeckPreview`, the `studio.astro` shell) | Nacre | The landing hero's skeleton: `.live-host:not(.is-live)::after`, one gradient pulse (`landing.css`) | Nacre is three blended full-box layers composited every frame; the pulse is one layer. This is the owner's example |
| Underpainting (image-loading brushwork, `lib/core/image-painting.js`) | Animated band | Static | Same reason |
| `backdrop-filter: blur` (header, chart interact, playground) | Blur | Opaque surface token | Backdrop blur re-samples what is behind it every frame it scrolls |
| Preview iframe pool (`preview-pool.tsx`) | 10–28 slots | 6–12 | Each slot is a full document in memory |
| Worker pools (encoder, narration, PDF in-flight) | cores − 1, current caps | 1 worker, 1 PDF slide in flight | Memory more than CPU: one 4K bitmap is about 33 MB |
| Local AI models (Kokoro, Transformers.js, WebLLM) | Offered | Hidden; hosted voice only | 80 MB to 1 GB downloads on a machine that cannot hold them |
| Idle prefetch (`studio-warm.ts`) | Compose, Present, reading view, Fabricate | Off; panels load on first open | Prefetch is CPU and memory spent on a guess |
| Anima / motion | Author's tier | `legible` tier, the same floor `prefers-reduced-motion` uses | The kernel already has the tier |

LITE is a change to what the app shows and how fast it works, **never to what it exports.** A deck exported on a
LITE machine is byte-for-byte the one a FULL machine exports. Export work may run slower on LITE (one worker, one
slide in flight), but capture resolution, fonts and encoders do not change, so no tier ever needs the QUALITY BAR's
export sign-off.

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

### 5.1 As built (2026-11-13, slice 2)

`docs/src/components/site/SystemOverlayPanel.tsx` draws the rows that `docs/src/lib/system-report.ts` builds; the wording
and the status rules (green / amber / red, gray for a value the browser does not report) live in that pure module
under unit tests. The panel shows a short graphics name (`SwiftShader (software)`) and the copied report keeps the
full renderer string. The speed test runs only on a click, because it pauses the page for about 140 ms (§3.2). The
"GPU rank" row appears once `detect-gpu` is wired (slice 1b). Until slice 5, the panel shows the tier the device
WOULD get; nothing in the app acts on it yet.

**Bytes.** The first cut mounted the panel as its own eager island and CI's route budget failed it (home eager JS
315.8 KB over a 313.2 KB ceiling, Studio HTML 243.5 KB over 243.4 KB). It now follows `PerfOverlay.tsx`: the eager
gate (`SystemOverlay.tsx`) only reads the pref, and the panel with the profile and report code is a lazy chunk that
loads on the first switch-on. The gate shares the Storage overlay's island (`SiteDiagnostics.tsx`), so no page
carries an extra island tag. Local production build after the fix: home eager JS 311.2 KB, Studio HTML 243.2 KB,
every route under its ceiling; with the panel off the Studio requests no `SystemOverlayPanel` chunk, and `?system`
requests exactly one.

**Opaque panel (2026-11-13).** On Playwright WebKit with the iPhone 15 Pro profile (Linux, not a real iPhone) the slide's text read through every diagnostic
panel: the shared chassis (`diagnostic-overlay.tsx`) was `bg-popover/95` with `backdrop-blur-sm`, and WebKit does
not apply a backdrop filter to an iframe beneath it, so the 5% of slide that showed through stayed sharp. The
Storage overlay had the same bleed on `main`. The chassis is now opaque with no backdrop filter, on all six overlays;
`system-panel.spec.ts` asserts the computed background is an alpha-free `rgb()`.

Driven on the real Studio (`npm run dev`, Playwright Chromium 153, 390 and 1440 px): the sandbox reads as Lite
(software renderer, 4 cores), "Run speed test" turned "Not run yet" into "248 units", "Copy report" put the full report
on the clipboard, and both buttons stay on screen at 390 × 844.

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

## 7. Decisions (owner, 2026-11-12)

1. **Decline on features and hardware**, best effort: the floor in §3.1, two agreeing signals, with the
   micro-benchmark and `detect-gpu` filling the gaps the browser's own numbers leave.
2. **The decline screen keeps a "continue anyway" link.** The session then runs as LITE with a banner that stays up.
3. **The gate covers the Studio, the Playground and Present.** Landing and docs pages serve everyone.
4. **LITE triggers as proposed:** a software GPU, or ≤ 4 GB reported, or ≤ 4 cores reported outside Safari, or the
   boot probe. Any one is enough.

## 8. Delivery

One branch, one PR, one commit per slice (HARD RULE #17):

1. `device-profile.ts` kernel + unit table + the pre-paint inline script + tier pinning for tests.
2. System diagnostic panel.
3. LITE visuals: Nacre → skeleton, Underpainting static, backdrop blur → solid. Owes a demo deck only if a slide surface changes (it does not; these are app chrome), and owes `tools/screenshot.js` at three widths in both tiers.
4. LITE resources: pool sizes, preview slots, prefetch, model visibility.
5. Decline screen, "continue anyway", and the override setting.

**Verification:** Playwright Chromium is a natural LITE machine (SwiftShader); a GPU-backed FULL run and real Safari
need the macOS suite by dispatch. A real low-memory Android phone is **UNVERIFIED** from here (HARD RULE #23), and the
PR will say so.

## 9. Test plan (HARD RULES #32–#34)

This feature's job is to read the machine and the clock. Those are exactly the inputs a test must never depend on
(F8 and F1 in `2026-11-06-flaky-tests.md`). So every test feeds the profile its inputs and never lets it read the
runner.

| What | How it is tested | Never |
|---|---|---|
| `classify(signals)` | A table of signal objects in, `{ tier, reasons }` out. Pure, no browser | Reading `navigator` or the runner's cores, memory or GPU (F8) |
| `readSignals()` | Takes `navigator`, `document` and `CSS` as arguments; tests pass fakes. Each field has a case where the API is absent | A real WebGL context in a unit test |
| CPU micro-benchmark | Takes a `now()` function. Tests pass a fake clock that advances by a fixed step per call, then assert the **count of units** the probe ran and the median it picked | Asserting how long it took, or comparing two runs (F1) |
| `detect-gpu` | Its benchmark fetch is stubbed with a recorded table (`page.route` in e2e, an injected loader in unit tests) | Fetching unpkg or our own CDN from a test (F6) |
| Boot probe (FULL → LITE) | The long-task source is injected; the test feeds it entries and asserts the transition | Making the page slow and hoping it trips (F4) |
| e2e, every surface | Each spec pins its tier with an init script (`?tier=full` / `lite` / `unsupported`), because the CI browser is software-rendered and would otherwise land in LITE by accident. It waits on `html[data-device-tier]` and on the element under test, never a duration | `waitForTimeout`, hand-made sleeps, relying on the runner's GPU (F2, F8) |
| Visual evidence | `tools/screenshot.js` at 390, 820 and 1440 px, each tier pinned | A pixel golden from another machine (F8) |

Every new test carries in the PR body:
- its **failing arm**: break the product, watch the test go red, then restore it byte for byte;
- **repeat green alone**: five runs for a unit file, `--repeat-each=10` for e2e;
- **green under load**: `--workers=4 --repeat-each=5`.

Playwright `retries` stays at 0. The flaky-test baseline (`tools/flaky-test-baseline.json`) does not grow.
