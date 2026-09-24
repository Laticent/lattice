---
origin: 2329
priority: P4
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2329
---

# The DOM masthead mirror puts a rebuilt card's header and footer inside the stage

why now   — found by the #2329 checker on `video`, and `wifi` does the same, so it is
            pre-existing and off that PR's path. On a RAW, not-yet-rendered section the
            DOM mirror (lib/runtime masthead-lift) wraps `<header>` and `<footer>` into
            `.cell-stage`, because its footer check (`!next`) trips on the trailing
            whitespace the card rebuilders keep after `</footer>`. The HTML path is right,
            and the DOM pass is idempotent on rendered output, so the trigger is the
            late-register window only.
where     — lib/runtime masthead-lift DOM mirror; the header/footer regexes in
            lib/components/connect/wifi/wifi.transform.js and
            lib/components/imagery/video/video.transform.js.
done when — applyAllToDom on a raw wifi and a raw video section leaves header and footer
            outside `.cell-stage`, matching applyAllToHtml, pinned by a jsdom test.
evidence  — the jsdom test, failing on the old code.
verify    — tier 0.
