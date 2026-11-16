---
origin: 3239
priority: P3
recorded: 2026-11-16
area: website
severity: medium
swimlane: engineering/decisions/2026-10-16-media-plugins.md §9
deferred: off-path — #3239 changed which photo the Studio finds, not how the Coach measures it; the measure never ran on Gecko before this PR either, and no spec runs it there
source: https://github.com/Laticent/lattice/pull/3239
---

# The Coach's photo-contrast warning never appears in Firefox

why now   — Driving #3239 on real engines: the plain one-heading deck from docs/e2e/photo-contrast-coach.spec.ts (a thin
            `card-clear` card, dark words on the dark `sample:photo-wide.svg`) shows "The text on this photo reads at …" in
            Chromium at 1440/820/390 and in WebKit, and never in Gecko, though the preview paints the slide. The spec carries
            no `@gecko` tag, so nothing has run it there.
where     — photo-verdict.ts `readLive` (each early `return null`: the section's `data-img-composition`, `sameSlide`, the
            `.lattice-bg` url, `meanUnderBox` reading the photo canvas) and card-ink-sampler.ts.
done when — the existing photo-contrast-coach cases run and pass on the `gecko` project.
evidence  — the spec tagged `@gecko`, red today, green after, with the return that fired named.
verify    — self-review with the gates; photo-contrast-coach.spec.ts on gecko, desktop and webkit-phone.
