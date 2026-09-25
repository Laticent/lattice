---
origin: 2358
priority: P2
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2358
---

# The Studio's player export drops every image referenced by URL

why now   — reported from an iPhone while testing #2358: an `![bg](…)` image slide and a video
            poster both came out blank in the exported player. The player's CSP is
            `img-src data:` by design (a deck must not beacon on open,
            lib/core/subresource-csp.mjs), and the Studio passes a no-op `inlineAssets`
            (share-export.ts: "assets are already data-URIs or same-origin URLs, so there is
            nothing to inline"). A same-origin or remote URL is neither, so it is blocked. The
            same slide shows fine in the Studio preview, so the export silently loses it.
where     — `inlineAssets` in docs/src/components/studio/share-export.ts (fetch each img src and
            each inline `url()` the deck references, same-origin first, and embed it as data:),
            with the honesty report for anything that could not be fetched.
done when — a Studio player export of a deck with a URL image and a URL video poster shows both
            in Present, Read · Slides and Read · Article, and a fetch failure is reported, not
            silent. Remote hosts are an owner decision (it is a fetch at export time).
evidence  — the export opened on a phone, before and after.
verify    — owner sign-off: it changes export bytes.
