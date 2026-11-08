---
origin: 3087
priority: P2
recorded: 2026-11-08
area: website
severity: medium
swimlane: engineering/decisions/2026-11-08-studio-newcomer-bake.md §5
deferred: blocked — starts once #3087 merges; the owner chose option A (D1 A)
source: https://github.com/Laticent/lattice/pull/3087
---

# Bake the Studio newcomer's first slide (PR A)

why now   — a first-time Studio visitor waits 5.49 s for the first slide on the phone profile, and 1.75 s of
            it is the engine rendering a deck the build could have rendered. The Playground's bake made its
            first slide 47% sooner; option A's measured ceiling for the Studio is about 1.5 s.
where     — docs/scripts/bake-newcomer-frame.mjs (or a sibling sharing its jsdom/Vite harness);
            docs/src/playground/single-slide-render.ts (a seeding entry point for the first write);
            docs/src/pages/studio.astro (the head gate and fetch); docs/src/components/studio/decks.ts.
done when — the nonce question in the note's §2 is answered in the PR description; a current bake is
            adopted with no rewrite of the frame; a stale one is dropped and rendered normally.
evidence  — perf:startup visible time against main, phone profile; a 0-pixel handoff diff at 390/820/1440
            in both modes; an e2e adoption spec.
verify    — startup-bench against main, 7 loads per build, alternated, two rounds; the adoption spec on
            Chromium, WebKit and Gecko.
