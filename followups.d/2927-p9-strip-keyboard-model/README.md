# Evidence: a focused thumbnail that unloads drops keyboard focus to the page

Ran against `47d03e4` (this PR's base on main; the PR changes no code) on 2026-10-27, Chromium (Playwright), 1440x900, the
docs dev server (`cd docs && npm run dev -- --port 4399`).

`focus-drop.cjs` loads a 60-slide deck in the Studio, turns on the slide map, keyboard-focuses slide 1's tile, then
scrolls the strip with the mouse wheel until that tile unloads. Run it with `node followups.d/2927-p9-strip-keyboard-model/focus-drop.cjs`
while the dev server is up.

Result:

| Read | Value |
|---|---|
| Focus before the scroll | `BUTTON`, `data-unit="0"`, "Slide 1, Slide 1 (text)" |
| Slide 1's tile after the scroll | not in the DOM (0 matches) |
| Focus after the scroll | `BODY` |
| ArrowRight after that | the counter moves "Slide 1 / 60" to "Slide 2 / 60": the shell's page-level arrow navigation still steps the deck |

So the drop is real, and today's cost is that keyboard focus leaves the strip while arrows keep working through the shell. A strip-scoped shortcut (§5) would do nothing after it.
