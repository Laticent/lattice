---
origin: 2998
priority: P1
recorded: 2026-11-01
area: website
severity: medium
swimlane: engineering/decisions/2026-07-20-nacre-preview-loader.md
deferred: large — needs a new pending state for `<img>`, which the `::before`/`::after` Underpainting cannot draw
source: https://github.com/Laticent/lattice/pull/2998
---

# A prose photo's first view in a session still decodes its original

why now   — PR 2998 shows each prose photo (`<img src>`, what the Compose picker, the chat agent
            and a collage write) as a preview-sized copy once one exists, and makes the copies of
            nearby slides' web photos ahead. Until its copy exists, though, an `<img>` keeps its
            original: a replaced element has no honest pending state (the Underpainting is drawn
            with `::before`/`::after`, which an `<img>` cannot render), and blanking it would move
            the slide. So the FIRST view of a Library photo's slide in a session still decodes the
            original once (~26 MB for a 2560px camera-roll import, ~48 MB at 12MP), and WebKit
            keeps that bitmap. Library photos are not made ahead either: the prefetch reads web
            addresses from the markdown, and an `asset:` name resolves only at render.
where     — `docs/src/lib/preview-image-scale.ts` (`imageEdit`), `docs/src/lib/image-size-memo.ts`
            (`prefetch`), `lib/core/image-painting.js` (a pending state for `<img>`).
done when — a prose photo is never decoded at full size in a preview frame: either an `<img>`
            pending state that keeps the slide's layout (its size is known from the Library record
            or the copy's), or the deck's Library photos made ahead from their resolved addresses.
evidence  — `tools/bench-preview-photo-memory.mjs` extended with an `<img>` arm (first view and
            second), before and after.
verify    — the WebKit bench, plus Safari Web Inspector → Timelines → Memory on a real iPhone.
