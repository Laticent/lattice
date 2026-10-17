---
origin: 2748
priority: P3
recorded: 2026-10-17
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-media-plugins.md §4.11
source: https://github.com/Laticent/lattice/pull/2748
---

# The player inliner misses a hand-written entity spelling of a quote, and bakes a style inside a `<template>`

why now   — A fresh checker on PR #2748's player inliner found two behaviors it judged off the path, both only in decks whose
            author hand-writes HTML. (1) `style='background:url(&#34;file://…&#34;)'`: a browser decodes `&#34;` and loads the
            picture, but the inliner reads only `&quot;`, `&#39;` and `&#x27;`, so the absolute local path ships in the shared file.
            (2) A `style` attribute inside `<template>` is baked like any other, although template content is inert. Neither
            appears in engine output.
where     — `lib/export/html-player.js` `inlineFileUrls` (the `url(` pattern's quote group) and `mapPlayerContexts`
            (RAW_TEXT and the tag walk).
done when — (1) the quote group reads every numeric spelling of `"` and `'` (decimal and hex), with a test, or the attribute value is
            entity-decoded before the match; (2) a decision records whether `<template>` content is a CSS context, and a test pins it.
            The trust boundary stays as documented above `inlineFileUrls`: a hosted bake of an untrusted deck must gate `file://`
            to an allowlisted root first.
verify    — render a deck with `style='background:url(&#34;file://…&#34;)'` and read the player for the local path.
