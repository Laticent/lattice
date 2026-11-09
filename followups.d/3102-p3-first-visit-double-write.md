---
origin: 3102
priority: P3
recorded: 2026-11-09
area: website
severity: low
swimlane: engineering/decisions/2026-11-08-studio-newcomer-bake.md
deferred: large — on the first-visit render path PR #3102 rewrote, but not caused or worsened by it (main 18 of 24 loaded runs, the PR 13 of 24); finding what issues the second render is its own investigation
source: https://github.com/Laticent/lattice/pull/3102
---

# A first Studio visit writes the live preview twice under load

why now   — each full write parses the ~1.2 MB sheet again and mints a new iframe realm, on the cold start where
            the main thread is busiest. Under load (6 parallel workers, desktop project), a first visit with no
            newcomer bake wrote the editing preview's frame twice in 18 of 24 runs on main 756c1ff and 13 of 24
            on PR #3102's build with the bake kept out. Unloaded runs write it once.
where     — docs/src/playground/single-slide-render.ts (which render misses the patch and restyle paths, and
            why: a change of slide box, web policy, or a write still pending when the next render starts);
            docs/src/components/DeckPreview.tsx and StudioShell.tsx (what issues the second render at boot).
done when — the second render takes the patch path, or there is no second render; a loaded first visit
            writes the frame once.
evidence  — the write count per load, main against the fix, the same load; the render's writePath per render.
verify    — a scratch spec that wraps HTMLIFrameElement srcdoc, as e2e/studio-newcomer-bake.spec.ts recordWrites
            does, --repeat-each=24 --workers=6, both builds.
