---
status: in-progress
summary: >
  Why the Studio hung while the Architect chat streamed and while the preview sat idle, with the measurements
  before and after, what was fixed (chat repaint cost, an idle frame loop in the preview, collage hover) and
  what was measured and left (the agent's whole-deck fit check, typing cost).
---

# Studio main-thread jank: the chat stream, the idle preview, collage hover (2026-10-19)

## Symptom

The owner saw the page hang slightly while the Architect worked, and while changing slides in the Studio on an
Ubuntu desktop. Collage photos did not react to the mouse in the Studio, though they do in the Playground.

## How it was measured

The built Studio (`npm run build:e2e`), Chromium with the CPU throttled 4x, a mocked model (HARD RULE #24: no
paid key), long tasks from a `PerformanceObserver` plus frame gaps from a `requestAnimationFrame` sampler, and
Chrome trace and CPU profiles for the cause. Throttling exaggerates absolute times; the shapes below are what
matter. Five turns in one thread, each streaming a 1.8 KB Markdown reply:

| turn | long tasks before | long task time before | long tasks after | long task time after |
|---|---|---|---|---|
| 1 | 5 | 0.3 s | 23 | 1.4 s |
| 2 | 83 | 5.0 s | 20 | 1.3 s |
| 3 | 333 | 21.9 s | 19 | 1.3 s |
| 4 | 473 | 36.8 s | 26 | 1.7 s |
| 5 | 524 | 47.9 s | 23 | 1.5 s |

Frame-gap p99 on turn 5 went from 304 ms to 92 ms, and on turn 1 it was 101 ms before and 99 ms after. The turn-1
long-task count is higher after because layout now runs inside the commit instead of in a later rendering
task; the gap, which is what a reader feels, did not move. After the fix the cost no longer depends on the length of the thread.

## Causes and fixes

1. **The chat re-rendered and re-sanitized the whole thread on every streamed frame.** The streamed text was
   panel state, and the render body called DOMPurify over every message. A frame cost work proportional to the
   thread, and so did every keystroke in the composer. Fix: the in-flight reply lives in a small store that only
   `LiveReply` reads; `AssistantBody` and `ProseHtml` are memoized; sanitizing runs once per distinct html
   string. Paints back off by three times the measured cost of the last frame (capped at 300 ms). The transcript
   follows the reply only while the reader is at the bottom. The test counts sanitizer passes (140 before, at most 22 now).
2. **The preview frame ran a 60 Hz loop after every boot.** The Mermaid pass waits for its library in a
   `requestAnimationFrame` loop capped at 600 frames; it ran in documents with no diagram. An idle Studio ran about 180
   frame callbacks in 3 s and 373 tasks in 3 s; now 0 and 40. `boot()` returns early when there is no fence and no
   host Mermaid tag. The integration test counts the runtime's own callbacks (111 before, 0 after).
3. **Hover never reached the preview.** The preview box takes no pointer events. Collage tiles now get
   `data-host-hover` from the host, as code-block copy buttons already did.

Fixing (2) exposed a jsdom quirk: a test window closed with a frame callback queued leaked an interval and threw in a later
test. Six test files now close through `test/helpers/jsdom-close.js`. Real browsers do not run callbacks for a closed window.

## Measured and not fixed

- **The agent's fit check hangs the page for the length of a whole-deck render.** Each `edit_slides` result
  renders the entire draft in an offscreen frame and measures every slide (`draft-fit.ts`, `measureDeckFit`). On a
  40-slide gallery deck at 4x it produced a 3.7 s gap (about 0.9 s unthrottled), mostly layout and style
  recalculation inside the frame. Chunking cannot split that work. Measuring only the slides the agent touched
  would cut it by the deck size, but it changes what the agent may say ("all N slides fit"), so it is an owner decision (see the PR's decision card).
- **Typing** costs about 110 ms per keystroke at 4x on that 40-slide deck, with or without the chat open. That is the
  budgeted full-deck re-render (`test/benchmark/preview-budget.json`), unchanged.
- **Slide changes** by rail click or arrow key are cheap here (a few long tasks in 20 changes at 4x, none unthrottled, in Chromium and Firefox). The slide-change hang on the owner's machine is not reproduced; the idle loop and the chat re-render are the candidates this PR removes.
- **"cell-f"** in the report could not be matched to any feature; see the decision card.
