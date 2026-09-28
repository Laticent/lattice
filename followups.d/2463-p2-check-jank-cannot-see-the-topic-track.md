---
origin: 2463
priority: P2
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2463
---

# `check:jank` cannot measure the topic track, so the tab's fixed height is unguarded

why now   — #2463 pinned the lit tab to one height for a whole section, and proved it by
            hand with Puppeteer (536.8px top, 120.2px tall on every slide). The jank tool's
            synthetic sweep builds topic slides with no track, so it reports the
            `li.on` anchor as "0 of 24 slides" and can never catch a regression.
where     — tools/check-jank.js (the sweep's slide generator); the track is derived by
            lib/transformers/topic-track.js from a section, or authored with the
            `<!-- _track: … -->` directive, which the generator could emit.
done when — `node tools/check-jank.js topic --anchor 'ul.tile-track > li.on'` measures
            every swept slide and reports drift, and breaking the tab's fixed foot in
            topic.styles.css makes it fail.
evidence  — the tool's output before and after, plus the failing run with the foot broken.
verify    — tier 1 checker: it changes what a shared tool finds for every component.
