---
origin: 2358
priority: P3
recorded: 2026-09-29
area: website
severity: low
swimlane: engineering/decisions/2026-07-08-studio-html-player-export.md
source: https://github.com/Laticent/lattice/pull/2358
---

# The player export does not embed a picture named in the deck's own CSS

why now   — the Studio player export now embeds every same-origin picture the SLIDE MARKUP names
            (lib/export/inline-url-media.mjs), but a `url()` in a front-matter `style:` block or
            a local component's CSS travels in `out.css`, which that pass never reads. The
            player's `img-src data:` policy refuses it, so a logo or texture set in deck CSS is
            still blank in the player, and the toast does not say so. Found by the maker-checker
            pass on the fix for 2358-p2.
where     — `shareHtmlPlayer` in docs/src/components/studio/share-export.ts: run `deckCss` and
            `extraCss` through the same kernel (its `<style>` arm already skips `@font-face` and
            custom properties). The CLI's `inlineFileUrls` already reads `<style>` for `file://`.
done when — a Studio player export of a deck whose `style:` sets `background:url(/x.png)` on a
            slide shows it in Present and Read · Slides, and a failure is named in the toast.
evidence  — the export opened in a browser, before and after.
verify    — owner sign-off: it changes export bytes.
