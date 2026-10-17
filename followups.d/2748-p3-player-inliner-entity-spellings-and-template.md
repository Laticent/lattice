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
also      — A fifth fresh checker pass found no stranger-text leak and recorded these, all needing raw hand-written HTML, none reaching
            the output (jsdom and DOMPurify drop them after the inliner has read the file): the inliner READS the named file for an
            SVG `<style>` child's attribute, for `<plaintext></plaintext><img src=…>`, for `<img <src=…>` and `<img =src=…>`
            (attributes a browser names `<src` and `=src`), for an `<img>` inside a `<script><!--<script>` nest, and for a `url(file://…)`
            inside a CSS comment or string; and called directly with hand-written HTML it also inlines from a duplicate `src` or
            `style` attribute and from `<img\0 src=…>`. Two stall cases stay: a 1 MB `style` or `<style>` body of repeated
            `url(file://` takes about 3.7 s (linear, bounded at 4096 characters per start; main's pattern was unbounded), and a
            deck of repeated unclosed quotes (`<a "`) is quadratic in the tag pattern. The engine takes minutes on those same decks.
            A full fix is a hand-written linear tokenizer in place of `TAG_OR_COMMENT`; done when it reads only real positions,
            leaves a document with no `file://` byte-identical, and a 1 MB hostile deck costs under 3 s.
verify    — render a deck with `style='background:url(&#34;file://…&#34;)'` and read the player for the local path.
