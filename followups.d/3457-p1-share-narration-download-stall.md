---
origin: 3457
priority: P1
recorded: 2026-11-23
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §HARD RULES #33 and #34
deferred: blocked — every await in the stretch is bounded and logged (the shipped fix); the nightly trace rules out a network stall, and which in-page await stalled needs the next failing trace, which now names it
source: https://github.com/Laticent/lattice/pull/3457
---

# A narrated Webpage export stalls before it starts, and share-narration-rate-limit.spec.ts:48 times out

why now   — the "Retry-After exposed" arm of :48 timed out on `page.waitForEvent('download', 240 s)` twice: once on
            webkit-phone in a full local run (2026-11-22, no trace kept), and once on gecko in the Studio e2e nightly,
            run 45159654897, shard 2/8 (2026-11-23). It is 44 of 44 green in this sandbox, alone, loaded, paired and in a
            full run. Severity is medium, not low: the stall is in the PRODUCT. A narrated export that never starts
            would leave a real author waiting with no error.
where     — docs/src/components/studio/share-export.ts `shareHtmlPlayer`, from its start (line 450) to the
            `deck-export` import (line 518): `ensureReady` → `ensureTheme` (theme fetch, KaTeX faces) → `assetOpts` →
            `renderMarkdown`. One of these never resolved. Nothing in that stretch is bounded.
measured  — from the gecko trace (`test-results/share-narration-rate-limit-48c8a-…-gecko/trace.zip` in artifact
            `studio-e2e-45159654897-shard-2`; read with HTTP range requests, since the artifact is 6 GB). After the
            "Download webpage" click registered (logged as done, 1704110):
            - ZERO /audio/speech requests in 240 s; the mock's only call was one models-list abort at +27.8 s.
            - The `deck-export` chunk was never requested, and no capture document booted (no `[lattice-runtime]
              bootstrap`, no key/credits fetch).
            - The PASSING arm in the same shard requested `deck-export` 378 ms after its click, booted its capture
              frame at +0.95 s, and sent its first speech request at +1.6 s.
            Both runs loaded `font-embed` and `player-core.generated` right after the click.
ruled out — `document.fonts.ready` in `ensureFontsLoaded` (font-embed.js). A replay that held `fonts.ready` forever
            in every frame still reached narration (4 speech requests) on both the old code and a bounded version, so
            that wait is not where this stalls. Load alone does not explain it either: the export takes 32–107 s here
            under every load tried, and a sentence needs 9 refusals to fail, where the mock sends 6.
done when — the stalled await is named. Have the test record each `onStatus` message with a timestamp: the panel's
            progress line, or a `console.info` from `shareHtmlPlayer`, which the trace keeps. Then fix it at its cause,
            or bound that await with a visible error as deck-export.js bounds its own, and add the HARD RULE #34
            evidence.
evidence  — a failing run (nightly or loaded gecko) whose trace carries the export's progress messages.
verify    — tier 1, since the change would touch the export pipeline: a checker, plus the export sign-off if the
            exported bytes can change.

## 2026-11-27 — bounded and logged (the fix that shipped)

shipped   — `shareHtmlPlayer` runs every wait from its start through the player tools' imports through `exportStep`
            (share-export.ts): load the engine, load the math fonts, load the theme, read the Library photos, render the
            deck, load the exporter, load the player tools. Each is bounded at `EXPORT_STEP_MS` (60 s) and ends in a
            toast naming the step ("Webpage failed: the step “load the theme” did not finish within 60 s…"). Each logs
            `lattice export +<ms> ms: <step>: started / done / failed`, and every progress line, to `console.info`,
            which a trace keeps. `e2e/share-export-step-bound.spec.ts` pins the error; `share-export.test.ts` pins the
            bound.
measured  — each wait held back in turn on gecko, the narrated 30-slide deck, 40 s after the click:
            - the theme-step request `themes/lattice.css`, held from page load: NO download, NO `deck-export` request,
              NO capture document, no speech request. That is the nightly trace's shape. The Studio's preview never
              needs that file (it draws from the style loader's subset). The export asks for the whole sheet, and in a
              quiet sandbox the page's idle backstop has usually fetched it before the click. Holding it only from the
              click changed nothing, because it was already cached.
            - `themes/indaco.css` from the click: no effect (cached before the click).
            - `deck-export`, `font-embed`, `player-core` chunks from the click: NO download, but `deck-export` WAS
              requested, which is not the nightly's shape.
            - `font-embed` and `player-core` load at +30–80 ms after the click from the Studio's warm queue
              (`warmNarrationProjection`), not from `shareHtmlPlayer`. So their loading in the nightly trace says
              nothing about how far the export got.
            Under load (`--workers=4`, 4 CPU-burning loops alongside), with the bound: gecko 20 of 20 green; webkit-phone
            19 of 20, then 40 of 40. The one webkit-phone failure had the nightly's exact shape: `font-embed` and
            `player-core` 0.5 s after the click, then no `deck-export`, no capture document, no speech request. Its
            trace kept info, log and warning lines but NOT ONE at `console.debug`, so it could not name the step; the
            log moved to `console.info` for that reason.
two renders — switching narration audio on starts the panel's quote, a full deck render (`projectDeckSpeech`), and
            the test clicks Download a moment later, so the export's render overlaps it. The `font-embed` and
            `player-core` loads after the click are the quote's render finishing, not the export's. The export's own
            render is the one that stalls. No lock or shared single-flight between the two was found in
            render-engine.ts, theme-fetch.ts, ensure-charts.ts or the code-package door.
nightly   — re-read 2026-11-27 (artifact studio-e2e-45159654897-shard-2, the gecko trace of the failing "Retry-After
            exposed" arm, by HTTP range reads): `themes/lattice.css` answered 200 in 62 ms, 3.3 s BEFORE the click, and
            NO request of any kind was left open. After the click the only requests are the quote's `font-embed` and
            `player-core`, then the Studio's idle warm queue at +3.2 s. So the held-back `lattice.css` reproduces the
            shape, not the cause. Nothing on the export's path made a request: the stall is an await with no network
            behind it (a memoized promise that never settles, or a loader that waits on an event that never fires), or
            the click never reached `shareHtmlPlayer` at all.
not named — which of those. The next failing trace now answers it: no `lattice export … status “Rendering the deck…”`
            line means the click never started the export (look at ShareSheet `run` and the panel's `launch`); a
            `<step>: started` with no `done` names the await. A retry in the same tab waits on the same never-settling
            promise, which is why the error says to reload. Still unbounded, outside this stretch: `buildFontEmbedCss`
            under "Embedding fonts…".
