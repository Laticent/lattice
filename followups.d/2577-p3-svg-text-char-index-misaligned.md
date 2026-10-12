---
origin: 2577
priority: P3
recorded: 2026-10-12
area: engine
severity: low
swimlane: engineering/pipeline.md
---

# The PDF writer's SVG text reader pairs `text[i]` with the browser's character `i`, and the two disagree when whitespace collapses

why now   — found by the independent checker on the per-character fill change (#2577 follow-up). It is
            in the old reader and the new one alike, so it is not a regression, and no shipped
            generator trips it: Mermaid and the chart kernels write `<tspan>`s with nothing between them.
where     — `lib/core/pdf-compose/read-slide.mjs`, the SVG `<text>` branch: it walks
            `el.getNumberOfChars()` / `getStartPositionOfChar(i)` and reads `el.textContent[i]` and
            `owners[i]` (one entry per UTF-16 unit of the text nodes). The browser's index skips
            collapsed whitespace, a `display:none` / `visibility:hidden` span and `<title>` text, and
            counts an astral character once where `textContent` counts two units.
repro     — a pretty-printed `<text><tspan>Alice</tspan>\n    <tspan>Bob</tspan></text>` draws "Alic" at
            Bob's position; a hidden span's text is drawn in place of the visible text after it; an
            emoji splits across its surrogate pair.
done when — each of those draws the characters the browser paints, at the positions it paints them, or
            the element stays in the photo (`refuse('refusedText', …)`), and `test/integration/export/read-slide-svg-text.test.js`
            has a case for each.
evidence  — the same SVG through the old reader, the new one and the browser, as words with positions.
verify    — tier 0, plus the gallery diff in the 2026-10-12 note (every gallery deck, old reader against new).
