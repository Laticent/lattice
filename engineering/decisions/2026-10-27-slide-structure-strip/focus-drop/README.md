# Evidence: a focused thumbnail that unloads drops keyboard focus to the page, and the fix

`focus-drop.cjs` loads a 60-slide deck in the Studio, turns on the slide map, puts keyboard focus on slide 1's tile (it
focuses the current tile and presses Home), then scrolls the strip with the mouse wheel far past Veduta's window. Run it
with `node engineering/decisions/2026-10-27-slide-structure-strip/focus-drop/focus-drop.cjs` while the docs dev server
is up (`cd docs && npm run dev -- --port 4321`). The pinned regression test is the last case of
`docs/e2e/strip-keyboard.spec.ts`.

## Before: reproduced on `47d03e4`, 2026-10-27

Chromium (Playwright), 1440x900. The first run used port 4399 and clicked slide 1's tile directly.

| Read | Value |
|---|---|
| Focus before the scroll | `BUTTON`, `data-unit="0"`, "Slide 1, Slide 1 (text)" |
| Slide 1's tile after the scroll | not in the DOM (0 matches) |
| Focus after the scroll | `BODY` |
| ArrowRight after that | the counter moves "Slide 1 / 60" to "Slide 2 / 60": the shell's page-level arrow navigation still steps the deck |

So the drop was real: keyboard focus left the strip while arrows kept working through the shell, and a strip-scoped
shortcut would have done nothing.

## After: the current tile is always rendered, 2026-10-29

Same script on this branch (slide-structure strip §12 item 9). `MapRail` renders the focused tile even when Veduta's
window has moved past it, outside the window and at its own offset.

| Read | Value |
|---|---|
| Focus before the scroll | `BUTTON`, `data-unit="0"`, "Slide 1, Slide 1 (text)" |
| Slide 1's tile after the scroll | still in the DOM (1 match) |
| Focus after the scroll | `BUTTON`, `data-unit="0"` |
| ArrowRight after that | "Slide 1 / 60" to "Slide 2 / 60", through the strip's own roving focus |
