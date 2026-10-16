---
origin: 2727
priority: P1
recorded: 2026-10-16
area: engine
severity: high
swimlane: engineering/decisions/2026-10-16-media-plugins.md §3 (D1)
source: https://github.com/Laticent/lattice/pull/2727
---

# A relative image in slide text breaks in a CLI export written to another folder

why now   — `![a](pic.jpg)` beside `deck/d.md` renders when the output is in `deck/` and shows a broken-image
            icon when it is `-o out/d.png`. The PDF writer reports "1 not-loaded kept in the photo". `![bg]` is
            unaffected because the CLI lifts it to `file://` first.
where     — `lattice.js:2178,2191` calls `engine.render` with `samplesUrl` but no `baseUrl`, and Chromium loads
            the page from the output path (`:3082,3397`), so the relative `src` resolves against the output folder.
done when — the same deck renders its picture with `-o` in any folder, for PDF, PNG and HTML; a test pins it.
evidence  — rendered 2026-10-16: `deck/d.md` → `out/d.001.png` shows the broken-image icon, while `deck/same.001.png` shows the picture.
verify    — render a deck with a relative prose image to an output in a different folder and look at the PNG.
