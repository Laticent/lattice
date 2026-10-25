---
origin: 2134
recorded: 2026-10-25
area: website
severity: medium
swimlane: engineering/development.md
source: https://github.com/Laticent/lattice/issues/2134
priority: P2
---

# The first-paint @smoke reload case fails every run against the site we ship

why now   — `docs/e2e/playground-first-paint.spec.ts` "@smoke a reload paints one geometry per
            element" passed 100 of 100 against `npm run build:e2e`, which is what CI's
            `studio-smoke` runs, and failed 20 of 20 against `npm run build` (the shipped site,
            with modulepreload and hoisted stylesheets). Every failure is the same:
            `slide was laid out 2 different ways … [{"rect":[386,293,772,434]},{"rect":[386,1127,772,434]}]`.
            The slide's top moves by 834px, exactly the 1194x834 viewport's height. In the same
            full-build run, "@smoke the editor pane holds its width" failed 1 of 20 with "the cut did
            not remove the preview panel". Measured on 2026-10-25 at 919689d, 4-core sandbox,
            Chromium 1243 (the sandbox's build; CI pins 1194).
where     — the Playground's reload replay (the cached-slide hand-off to the live filmstrip) and
            the spec's `slide` sampler. Unknown which one is wrong: whether a person sees the slide
            jump is UNVERIFIED. The cut-document flake has one untested hypothesis: modulepreload
            hydrates the island fast enough to re-create `#pg-split-preview` in the cut page before
            the count check runs.
done when — the case passes 20 of 20 against `npm run build`, with the cause named, or the
            sampler is shown to count a geometry nobody saw and is fixed.
evidence  — `--repeat-each=20` counts against both builds, before and after, plus a screencast
            frame from the full build at the moment of the second rect.
verify    — tier 2: build with `npm run build`, serve it, then run
            `npx playwright test e2e/playground-first-paint.spec.ts -g @smoke --project=desktop --repeat-each=20`.
