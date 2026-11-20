---
origin: 3304
priority: P1
recorded: 2026-11-20
area: website
severity: high
swimlane: engineering/decisions/2026-09-13-gallery-preview-memory.md
deferred: large — the owner chose a separate PR (2026-11-20): the fix changes how the shared DeckPreview frame renders a 4K deck, a renderer change with its own review and its own iPhone test
---
# Present on a 4K deck reloads the iPhone tab on Play from the first slide, with Guide and captions on

why now   — The owner's iPhone, on #3304's preview with a 38-slide `size: 4k` test deck (a
            `say:` on every slide, the shape of #3289's `narrationDeckSource`): narration alone plays
            to the end; captions + Guide + Play on slide 1 reloads the tab at once, with or without Voice. Moving
            to slide 2 first, then Play, does not crash. Captions off + Guide on does not crash.
where     — docs/src/components/studio/PresentOverlay.tsx (the "Presented slide" DeckPreview), and the frame it
            renders: a 3840x2160 slide document shown in a ~361x203 frame on a phone.
done when — Present on a 4K deck, opened on slide 1 with Guide and captions on, plays on a real iPhone without
            a reload, and WebKit's process memory with Present open on slide 1 matches its memory on slide 2.
evidence  — Playwright WebKit (WPE, iPhone 15 Pro, the test deck), process RSS, Present open and not playing:
            editor 1,290 MB; Present open on slide 1 1,977 MB (title slide) or 1,744 MB (slide 1 a plain
            heading); after moving to slide 2 about 1,140 MB; back on slide 1 about 1,150 MB. So about 450 to
            700 MB is held from Present's open until the first redraw near the slide (a navigation, dismissing
            the first-run tip). Chromium (Pixel 7) grows only about 30 MB on open. No canvas or image is on the
            page, and the DOM is the same on slide 1 and slide 2: the cost is WebKit's paint of the 3840px
            document. What frees it is not settled: stripping the first-run tip's `backdrop-blur` at runtime
            dropped it to 1,161 MB, but a build without that blur still opened at 1,728 MB, so the strip only
            forced a redraw. A frame-opacity poke raised it (1,969 MB); body and dialog pokes left it flat.
            The narration memory window in #3304 is a different cost and is fixed (the owner's full deck played).
verify    — In Playwright WebKit as an iPhone 15 Pro, import the test deck through the Studio's import input
            (as #3289's present-narration-probe.js does), open Present, and sum the RSS of the WPEWebProcess and
            MiniBrowser processes from /proc/<pid>/smaps_rollup on slide 1, then slide 2, then back on slide 1.
            The fix holds when slide 1 at open is within about 50 MB of slide 2. Then the owner's iPhone with the
            test deck: Guide on, captions on, Play on slide 1.
