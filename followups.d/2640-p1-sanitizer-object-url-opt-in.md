---
origin: 2640
priority: P1
recorded: 2026-10-12
area: website
severity: low
swimlane: engineering/decisions/2026-10-12-library-media-assets.md
source: https://github.com/Laticent/lattice/pull/2640
---

# Make the sanitizer's blob: allowance opt-in, so the home page and Playground do not carry it

why now   — PR #2640 added a same-origin `blob:` UUID allowance for `<img>` and media `src` to the
            shared `lib/core/sanitize-slide-html.mjs`, so Library photos survive the preview
            sanitizer. Every docs surface imports that module, so the home page and the Playground
            carry about 250 bytes gz of it with no Library to use it; the declaration is
            `docs/route-budget.d/2640-library-media.md`. Both routes are already over their soft
            target.
where     — `lib/core/sanitize-slide-html.mjs` (`createSlideSanitizer`, `isOwnObjectUrlSrc`) and the
            docs binding `docs/src/lib/sanitize-slide-html.js`.
done when — `createSlideSanitizer` takes an option that turns the allowance on, only the Studio's
            binding passes it, and home and Playground eagerJsGz are back to within a few bytes of
            main (measure with `docs/scripts/measure-route-base.sh`).
evidence  — local measurement against main, 2026-10-12: playground +276, home +268 bytes gz, of which
            the render hook accounts for about 90 and the sanitizer allowance for the rest.
verify    — the pinned tests in `test/unit/core/sanitize-slide-html.test.js` still pass, plus one
            proving the allowance is OFF by default; the Studio e2e `library-images-render.spec.ts`
            still passes.
