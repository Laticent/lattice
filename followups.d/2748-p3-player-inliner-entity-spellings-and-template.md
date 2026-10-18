---
origin: 2748
priority: P3
recorded: 2026-10-17
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-media-plugins.md §4.11
source: https://github.com/Laticent/lattice/pull/2748
---

# The player inliner: a CSS comment or string is still read as a `url(file://…)`, and one design call is the owner's

why now   — The linear start-tag reader and `rewriteFileUrls` (2026-10-18, lib/export/html-player.js) closed what five checker passes
            found: numeric quote spellings, `<template>` (decided: a CSS context, so baked), reads in positions a browser ignores
            (`<img <src=`, `<img =src=`, `<plaintext>`, a `<script><!--<script>` nest, a duplicate attribute, `<img\0`), and both stall
            cases (a 1 MB `<a "` deck, a 1 MB `url(file://` body: each now tens of milliseconds, was minutes and 3.7 s).
            One case remains: a `url(file://…)` inside a CSS comment (`/* url(file:///x.png) */`) or inside a CSS string
            (`content:"url(file:///x.png)"`) is read, so the named file is baked into text a browser never loads. It needs a
            CSS comment-and-string mask in front of `rewriteFileUrls`; none of it reaches a rendered position.
where     — `lib/export/html-player.js` `rewriteFileUrls`.
done when — a `url(file://…)` inside a CSS comment or string is left as written and not read, with a test; the hostile-deck timings in
            `test/unit/export/player-inliner-linear.test.js` stay under 3 s.
open call — (owner's) Should the inliner instead work on the DOM the pipeline already parses with jsdom, after the sanitizer? The
            sanitizer would then have removed every position a browser ignores, and this file would shrink to "read `style`, `<style>`
            and `<img src>` off the tree". Measured on 2026-10-18: jsdom parses the 3.1 MB baseline-gallery HTML in about 1.0–1.3 s
            (the linear tokenizer reads the same document in about 60 ms), and the parse happens anyway later in the pipeline, so the
            DOM route costs a second parse unless the inliner moves after `parseHtml` and shares it. The linear reader now meets the
            stall and position goals without that move, so this is a simplification question, not a safety one.
verify    — render a deck with `style="background:url(/* c */)"`-style comment and string cases and read the player for the local path.
---
