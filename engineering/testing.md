# Testing — the framework, the practice, and the traps

One testing guide for people and agents. Read it a section at a time:
`grep -n '^## ' engineering/testing.md`, then `sed -n 'A,Bp'` the one you need (A and B are line numbers from the grep).

- **Part 1** says what each tier of the Lattice suite can and cannot prove.
- **Part 2** says how to write a test that cannot flake, and what to do when one does.
- **Part 3** lists real traps, one example each, with the PR that taught it.

This guide is an index for its topic, not a second copy of the rules. The flaky-test shapes F1–F9
live in `engineering/decisions/2026-11-06-flaky-tests.md`, the commands in
`engineering/development.md`, and the binding rules in CLAUDE.md HARD RULES #23 and #32–#34.

---

## Part 1 — Five missions, mapped to Lattice

The framework comes from *Semantic Testing*, a talk on software testing (`examples/semantic-testing.md`, with a longer `examples/semantic-testing-deep-dive.md`). It is a proposed framework, not an
industry taxonomy. Its one idea: **classify a test by its mission, the risk it reduces, not by its
tool, its schedule or where it runs.** "A Playwright nightly" names a tool and a schedule. It does
not say what a pass proves.

| Mission | Question it answers | Lattice tier |
|---|---|---|
| **Unit** | Does the logic work, with everything around it controlled? | `node --test` (`npm test`, `test:<scope>`); vitest with jsdom in `docs/` (`cd docs && npm test`) |
| **Integration** | Do the parts work together with real, local resources? | `npm run test:integration`: the renderers, PDF page counts, marp-cli |
| **System** | Does the assembled product behave as it will for real users? | Playwright e2e on the built site across Chromium, WebKit and Gecko; the platform suites on real macOS, Windows and iOS Simulator; the nightlies |
| **Experience** | Can a person reach the outcome they wanted? | screenshots at 1440, 820 and 390 px; visual review; the owner's export sign-off (CLAUDE.md QUALITY BAR); the raise loop (`workflow.md` §The raise loop) |
| **Safety** | Can the product cause harm, whatever its parts each do? | the sanitizer gates (#22), the `os-sandbox-measure` suite, the OpenRouter guard (#24), CodeQL |

- **Fidelity** is how close a test's conditions are to the real thing. Every tier below production
  substitutes something.
- A **fidelity gap** is a substitution that could change the answer. It does not void the test. It
  limits the claim the test supports, so name it.

HARD RULE #23 is this part's rule in one line: a claim that something is verified names its surface and carries an
artifact from that surface. Green CI is evidence only for what CI exercised.

## Unit tier

**What it is.** `node --test` over `test/unit/**` (`npm test`; one folder with `npm run
test:<scope>`; one file with `node --test <file>`), and vitest with jsdom for the docs site's React
code (`cd docs && npm test`).

**What it proves.** A pure function returns the right value at its boundaries. A lint rule fires on
the right input. A transform emits the right markup. Failures point at one function.

**Fidelity gaps.**

- **jsdom has no layout.** Every box measures 0 by 0, nothing scrolls, and no font loads. A unit
  test cannot show that something fits, overlaps or stays on screen.
- **No real browser timing.** jsdom runs microtasks and timers, not paint or the compositor.
  A test that passes in jsdom says nothing about a frame painting late.
- **Testing Library gives up after 3 s here.** `docs/vitest.setup.ts` sets `asyncUtilTimeout` to
  3 s (the library's own default is 1 s). A lazy module that loads inside
  that window is a race (Part 3, #3233).

## Integration tier

**What it is.** `npm run test:integration` over `test/integration/**`: the CLI renders real decks
through the real engine and headless Chrome, checks PDF page counts, and runs export-to-Marp
through marp-cli.

**What it proves.** The parts agree. The engine, the bundled CSS, the PDF writer and the browser
produce the slides we expect, with the page count we expect.

**Fidelity gaps.**

- **One engine.** Integration renders with Chromium only. WebKit and Gecko layout is not exercised.
- **Linux only.** The per-PR runners are Linux. Font fallback, file-system case rules and sandboxing
  differ on macOS and Windows.
- **No user.** Nobody types, taps or scrolls. Interaction is out of scope here.

## System tier

**What it is.** Three surfaces.

- **Playwright e2e** on the built docs site (`cd docs && npm run test:e2e`), across the projects in
  `docs/playwright.config.ts`: Chromium at desktop, tablet and phone widths with and without touch,
  plus `webkit-phone`, `webkit-tablet` and `gecko`. WebKit and Firefox install themselves when a
  selected project needs them (`docs/scripts/e2e-ensure-browsers.mjs`). Per PR, CI runs only the
  `@smoke` subset on `desktop`; the full suite runs in the Studio E2E nightly.
- **Platform suites** (`.github/workflows/platform-suites.yml`, registry
  `.github/platform-suites.json`): real `macos-26` and `windows-2025` runners, and the iOS Simulator
  on macOS for the `ios-safari-*` suites. A pull request runs the suites whose paths it touches; the
  iOS suites run only by dispatch or on schedule.
- **Nightlies** (`.github/workflows/*-nightly.yml`): the full e2e suite, integration, fit,
  overflow, perf and WebKit baselines, each filing a rolling issue on failure.

**What it proves.** The built product behaves on a real engine, at a real viewport, on a real OS.

**Fidelity gaps.**

- **Playwright WebKit is not Safari.** It is WebKit on Linux, with a different GPU path and no iOS
  touch stack. Only the iOS Simulator suites reach Safari's touch behavior, and the Simulator is not
  a device either.
- **Emulated touch is not a finger.** Playwright's `hasTouch` sends synthetic touch events. Gesture
  timing and long-press detection belong to the platform, so test them in the iOS Simulator suites, not with `hasTouch`.
- **CI runs Playwright with 2 workers**; #34's load evidence runs at 4, as a margin.
- **CI load is not your laptop's.** A loaded runner reorders paints, timers and network replies.
  A race that never fails in a single-worker run can fail at 4 workers (Part 2).
- **Per-PR coverage is the smoke subset.** A spec outside `@smoke` runs only in the nightly.

## Experience tier

**What it is.** A person looks. Screenshots of every changed page at 1440, 820 and 390 px
(`tools/screenshot.js`); visual review of rendered slides (`engineering/visual-review.md`);
the owner's sign-off on any change to export bytes (CLAUDE.md QUALITY BAR); the raise loop before a
merge ask (`engineering/workflow.md` §The raise loop, with `npm run evidence` listing the surfaces
to drive).

**What it proves.** That a reader can use the slide or page: it reads, it fits, it looks right in both
modes, and a control is where a thumb can reach it.

**Fidelity gaps.**

- **A still image hides motion.** Jank, drift and a layout that moves as content grows are
  invisible in one screenshot (`engineering/jank.md`, `npm run check:jank`).
- **The reviewer is not the audience.** An agent's or an engineer's eye is a stand-in for a
  presenter in a real room. Say which one looked.

## Safety tier

**What it is.**

- **Sanitizer gates** (HARD RULE #22): `checkPreviewHtmlSinks`, `checkDocumentStyleSinks`,
  `checkCssTreeRewrapSinks` and `checkRuntimeMarkupSinks` in `tools/check-ownership.js`, run by
  `npm run build:check`. They find every place untrusted markup or CSS reaches a document.
- **`os-sandbox-measure`**, a platform suite on macOS and Windows
  (`test/integration/export/os-sandbox-measure.test.js`): it checks that the browser the export
  launches really runs with its OS sandbox on.
- **The OpenRouter guard** (HARD RULE #24, `checkOpenRouterBudget`): our paid key never reaches the
  site, a test, or a per-PR workflow.
- **CodeQL**, GitHub's default code-scanning setup, outside `ci.yml`.

**What it proves.** That the gates guard the known routes to harm, and catch a new route of a known
shape.

**Fidelity gaps.**

- **The gates find shapes, not intent.** A sink (code that writes untrusted markup or CSS into a
  document) written in a shape no gate looks for passes them.
  The threat model (`engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md`) names the
  shapes; read it before adding one.
- **Every part can pass its own check while the composition causes harm.** For example, a client
  that retries, a gateway that accepts each valid request and a processor that executes each one
  are each correct, and together they pay twice.

---

## Part 2 — Write a test that cannot flake

A test passes or fails on the code alone (HARD RULE #32). Before you write one that waits, times,
randomizes or reaches the network, read `engineering/decisions/2026-11-06-flaky-tests.md`: its
table names the nine shapes F1–F9 and the fix for each. The short form:

- **Wait for a signal, not a duration.** `expect(locator).toHaveText(…)`, `page.waitForResponse(…)`,
  `expect.poll(…)`. Never `waitForTimeout` (F2).
- **Assert on work done, not on milliseconds.** Count calls, nodes or bytes
  (`test/helpers/work-count.js`). Speed belongs to `npm run bench` (F1, #19).
- **Read state after it settles.** Await the state you need, then assert; compare only what the test
  is about (F3).
- **Own your inputs.** Seed every random draw and print the seed (F5). Stub the network (F6). Give
  each test its own data, port and temp folder (F7). Pin the date, timezone, locale and fonts (F8).
- **Write temp files to `os.tmpdir()`**, never into `lib/` or `examples/`, where other tests walk
  (Part 3, #3238).
- **No retries.** Playwright's `retries` is 0 and stays 0 (F9, #34).

## Investigate a flaky test

Whoever first sees a test fail, by running it or by starting work after a red nightly, owns the fix
(HARD RULE #33). Never re-run it
to green, raise its timeout, or file it as a follow-up.

1. **Keep the trace first.** Playwright empties `test-results/` at the start of every run, so copy
   the failing trace out before you run anything again. From CI, download the run's artifact.
2. **Read the trace before forming a theory.** The values in it are the evidence: in #3243 the
   trace showed the tap at x 833 on a 393 px phone, which named the cause on its own.
3. **Reproduce under load.** `--workers=4 --repeat-each=10` (or more) on the one project that
   failed. Note the rate: "3 red in 20" is a measurement; "flaky" is not.
4. **Find the cause.** Ask what the test waits on, and what else could change it under load: a
   paint, a timer, a frame that is not yet laid out, a lazy module, another test's file.
5. **Fix the cause, then prove it** with the evidence below.

If steps 1–4 find no cause after you have reproduced the failure under load, `test.fixme` it with the three-part `// disabled:` note
(what you tried, the evidence, when to re-enable). Deleting a red test is not a fix.

## The evidence a test owes

Every new test, and every test whose assertion or wait changed, carries three things in its PR body
(HARD RULE #34). A *failing arm* is a deliberate break that turns the test red.

| Evidence | How |
|---|---|
| **A failing arm** | Break the product or revert the fix, watch the test go red, restore byte for byte. Name the break. |
| **Repeat runs, alone** | `--repeat-each=10` on one project for e2e; five runs for a unit file. |
| **Runs under load** | `--workers=4 --repeat-each=5` on the same project. |

A rename or a selector-only edit owes only the failing arm.

A failing arm must go red on the old code and green on the new. If the race is too rare to hit by
load, inject the stall directly, as #3250 did with a temporary 2.5 s wait. List any arm that stayed
green on both in the PR body, so nobody repeats it.

## When to stop

CI runs Playwright with 2 workers (`workers: isCI ? 2 : undefined` in `docs/playwright.config.ts`).
HARD RULE #34 asks for evidence at 4 workers, twice that load, as a margin. If a test fails only
above 4 workers, and passes 50 or more runs at 4 workers, record that evidence in the PR or the
decision note and change no code. Hardening a test against a load CI never runs costs time CI will
never repay.

State the numbers: the load that broke it, the load CI runs, and the green run count.

---

## Part 3 — Gotchas

Each trap has one real example and the PR that taught it. For CI-specific symptoms, also read
`engineering/gotchas/ci.md`.

## `offsetTop` leaves out the frame's padding

**Trap.** In the Playground's preview frame, `.lattice` is each slide's `offsetParent` (because of
its `filter`), so `el.offsetTop` leaves out the frame's 36 px of html and body padding.

**Example.** `playground-stress.spec.ts` measured slide visibility with `offsetTop` and placed every
slide 36 px too high, a fifth of a slide. A slide the app rightly kept at just over half visible
measured 36–48%, and the swipe test went red 10 times in 60 at 4 workers.

**Do instead.** Place a slide at `getBoundingClientRect().top` plus the scroll, the way the app's
`frameBands` does. #3252 fixed the measure; #3253 fixed the same offset in the test's scroll-to-slide step.

**Gated.** `checkFlakyTests` counts `offsetTop` and `offsetLeft` in `docs/e2e/**` as the `offset-geometry` shape, held to `tools/flaky-test-baseline.json`. It skips `visualViewport.offsetTop`, a different property.

## Playwright's fake clock: `resume()` lets frames drift

**Trap.** Playwright keeps one fake clock per frame and replays the clock log into any frame born
later. After `clock.resume()`, a new frame replays the resume plus every real millisecond since, so
it can run ahead of the main frame. A later `clock.pauseAt()` then throws `Cannot fast-forward to
the past`.

**Example.** `deck-drop-import.spec.ts:269` resumed the clock between widths so a 1000 ms timer
could fire. A srcdoc preview frame booted between the test's read of the page time and its next `pauseAt`,
and the pause was refused.

**Do instead.** Advance time while staying paused: `clock.runFor(1100)` instead of `resume()`.
Every frame, including one born later, then sits at the same time (#3250).

**Gated.** `checkFlakyTests` counts every `<page>.clock.resume()` as the `clock-resume` shape, held to `tools/flaky-test-baseline.json`. A resume that is right where it is takes `// flaky-ok: <why>`.

## The device tier drops to Lite under load

**Trap.** The Studio's device-tier probe drops from Full to Lite when the main thread stalls at
boot. Under 4 workers that can happen mid-test, and the "switched to Lite mode" notice then covers
controls. The notice's timer pauses on hover, and each Playwright click retry hovers the notice, so
it never closes.

**Example.** `chat-photos:89` went red 1 in 50 at 4 workers on `webkit-phone`: the notice sat over
Send for the whole 15 s click budget. Playwright WebKit names its renderer "Apple GPU" on Linux, so
it starts at Full and has a tier to lose; Chromium (SwiftShader) and headless Firefox start at Lite.

**Do instead.** `docs/playwright.config.ts` seeds the Lite override into every Playwright browser
context. A spec that
tests the tier opts out and drives it on purpose (`device-tier-drop.spec.ts`) (#3245).

## On the iOS Simulator, a tap's hold stretches past the long-press threshold

**Trap.** In the iOS Simulator suites, the time between a touch's down and up events grows between
what the test requests and what Safari sees. The logs do not show whether the Simulator or the
WebDriver driver adds the time; WebDriver's own measured gesture stretched too. A tap with a short hold can therefore reach
Safari as a long press, which selects text instead of placing the caret. The coordinate is not the
problem: every logged tap landed exactly on the point sent. WebDriver's own gesture time does not
predict the result either, because Safari decides on the interval it sees.

**Example.** Platform-suite dispatch 43798678775 (`ios-safari-studio`, branch
`claude/webkit-shadow-and-ipad-tap`) logged the page's touch events on the iPad. A tap with no hold
reached Safari as 29–43 ms and placed the caret. A 150 ms hold reached it as 345 ms and placed the
caret. A 300 ms hold reached it as 632 ms and selected "point". 500 and 800 ms holds selected
"Workspace stop". On the iPhone, a 300 ms hold reached Safari as 1137 ms. This explains the earlier
failures, where a 739 ms gesture selected text and a 939 ms gesture did not.

**Do instead.** Send a tap with no hold between down and up, and assert on the page's own
touch-event log (the touchstart-to-touchend interval) rather than on WebDriver's gesture time. The
fix is tracked in `followups.d/3223-p1-ipad-compose-tap-lands-off-point.md`, written before this
measurement, whose coordinate theory these logs rule out.

## Testing Library's hidden 3 s clock and lazy panels

**Trap.** Testing Library's `waitFor` and `findBy*` give up after `asyncUtilTimeout`, which
`docs/vitest.setup.ts` sets to 3 s (the library's default is 1 s). Nothing in the test says so. A lazy React module that loads inside that window races it.

**Example.** Fabricate is its own `React.lazy` split. Under 4 CPU burners its first open took
1485–1945 ms cold, and `studio.theme-depth` went red once in 64 runs.

**Do instead.** Load the module in `beforeAll` (`loadFabricate()` in `docs/src/test/panels.ts`),
the way the Studio warms it for a returning user. No wait budget changed (#3233).

## A test that writes into the tree races the deck walkers

**Trap.** Many tests walk `lib/components/` and `examples/` for every deck. A file another test
writes there and deletes appears in one walk's listing and is gone when it reads it.

**Example.** `check-ownership.test.js` wrote `pricing.gallery.probe.tmp.md` into `lib/components/`;
`slide-boundaries.test.js` listed it, then hit ENOENT reading it.

**Do instead.** Write temp files to a `mkdtemp` folder under `os.tmpdir()`. Deck walkers also skip
`*.tmp.md`, which the gallery builders write beside decks while rendering (#3238).

**Gated.** `checkFlakyTests` counts a write, append, mkdir, copy, rename, symlink or delete whose destination lands in the repository's own `lib/` or `examples/` as the `tree-write` shape, held to `tools/flaky-test-baseline.json`. It skips a temp folder, `ROOT/.scratch` and a copy *from* the tree. It cannot see a path built in a loop or a helper; its Known limits list those.

## Playwright empties `test-results/` when a run starts

**Trap.** Playwright clears its output folder at the start of every run. Re-running a failed spec
deletes the trace that showed why it failed.

**Do instead.** Copy the trace (and `playwright-report/`) out of the folder before the next run.
From CI, download the run's artifact.

## A branch dispatch of a nightly can write to `main`'s rolling issue

**Trap.** Several nightlies file or append to their rolling issue on failure with no branch check.
Only their "passing again" step checks for `main`. A dispatch on your branch that fails therefore
comments on the issue that tracks `main`, and cannot close it.

**Example.** `fit-nightly.yml`, `overflow-nightly.yml`, `webkit-baselines-nightly.yml`,
`integration-nightly.yml` and `preview-e2e-nightly.yml` guard only the passing step with
`github.ref == 'refs/heads/main'`. `studio-e2e-nightly.yml` guards both, and a `spec:`-filtered
dispatch files nothing.

**Do instead.** Before dispatching one on a branch, read its issue step's `if:`. If it is unguarded,
say in your PR that any comment on the rolling issue came from your branch.

## puppeteer 24+ `executablePath()` returns a Promise

**Trap.** From puppeteer 24 on, `executablePath()` returns a Promise.
`node -p "require('puppeteer').executablePath()"` prints `Promise { '<path>' }`.

**Example.** After the CLI moved to puppeteer 25, fit, overflow and WebKit-baselines nightlies died
in their resolve step, and integration-nightly passed the Promise string to Playwright as a path.

**Do instead.** Wrap the call in `Promise.resolve(…)` and await it, which works with either version
(#3214).

## CodeMirror renders only the visible part of a long line

**Trap.** CodeMirror puts only the in-view part of a very long line into the DOM. Text near the
line's start may not be in the page at all.

**Example.** A photo written as a `data:` URL is one long line. An iOS probe looked for the line's
start while the editor was scrolled to its tail, and the warning it waited for was not in the DOM.

**Do instead.** Find text through the editor's own document (the `cmTile` view handle) and dispatch
the editor's `scrollIntoView` for the line before waiting on it (#3213).

## A test-set selection reaches ProseMirror late

**Trap.** ProseMirror learns of a DOM selection only from the browser's queued `selectionchange`
event. A test that sets a selection directly (`setBaseAndExtent`, `addRange`) leaves the editor
with no selection until that event arrives. #3260 never caught the trigger in a trace; a late event
under load is the explanation that fits the symptom. A person's mouse or
keyboard selection goes through ProseMirror's own handlers and never hits this.

**Example.** `compose-refine.spec.ts:92` set a selection, then waited for the Refine button, which
needs a selection. It failed once in 251 runs on `webkit-tablet`, and about once in 790 under a
stress recipe (four CPU burners, the live device tier).

**Do instead.** Dispatch the event yourself right after setting the selection:
`document.dispatchEvent(new Event('selectionchange'))`. A dispatched event runs ProseMirror's
listener synchronously, so the editor has read the selection before the test moves on. The same
recipe then passed 1,000 of 1,000 (#3260).

## A verdict read once, before the pane paints

**Trap.** A check that reads the page once, on a timer, can read before the thing it measures has
painted, and nothing reads it again.

**Example.** The Coach's photo-contrast watch read a slide 900 ms after the last change. On a phone,
tapping Preview ran that read while the pane was still swapping; the read came back empty, and the
finding never showed. `photo-contrast-coach.spec.ts:91` failed 13 in 100 under load.

**Do instead.** Read again on each paint until a read returns a result. The shell now hands the
watch a subscription to the preview's paints (#3211).

## A render that fetches far more than it draws

**Trap.** A render can do much more work than its output shows, and under load the extra work
overruns a fixed budget.

**Example.** The chat's `render_slide` picture loaded 130 font files for one title slide. Under 4
workers it ran past its 15 s budget and the model got an empty picture, 9 red in 50.

**Do instead.** Load only the faces the slide draws: 130 fetches down to 30. The test now asserts the
fetch count (under 80), a work count rather than a time (#3240).

## A frame still on the desktop layout after a resize

**Trap.** Right after `setViewportSize`, the preview frame laid out for the old width can still be
the live one, its box reading the same twice in a row, with its photos far off the new screen.

**Example.** `collage-lightbox` typed at 1440 px, resized to the phone, and tapped x 833 on a 393 px
viewport. Nothing opened, 1–2 red in 50 at 4 workers on `webkit-phone`.

**Do instead.** Require the frame's box and the tap point to sit inside the current viewport before
tapping (#3243).
