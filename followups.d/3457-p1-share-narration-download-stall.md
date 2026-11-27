---
origin: 3457
priority: P1
recorded: 2026-11-23
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §HARD RULES #33 and #34
deferred: blocked — every await in the stretch is now bounded and logged (the shipped fix); which one stalled the nightly needs the next failing run's trace, which now names it
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
            progress line, or a `console.debug` from `shareHtmlPlayer`, which the trace keeps. Then fix it at its cause,
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
            `lattice export +<ms> ms: <step>: started / done / failed`, and every progress line, to `console.debug`,
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
            Under load, unfixed and fixed: gecko 20 of 20 green (`--workers=4 --repeat-each=10`, 4 CPU-burning loops
            alongside); webkit-phone: see the PR.
not named — the nightly trace's network list was not re-read for a `themes/lattice.css` request left open. If the next
            failing run's trace shows `load the theme: started` with no `done`, the cause is that fetch, and the next
            fix is the full sheet's fetch itself (a fetch with no answer, on a 1.2 MB file the page fetches once). Today
            a retry in the same tab waits on that same memoized, never-settling fetch, which is why the error says to
            reload. Still unbounded, outside this stretch: `buildFontEmbedCss` under "Embedding fonts…".

