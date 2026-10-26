---
origin: 2868
priority: P1
recorded: 2026-10-22
area: website
severity: high
swimlane: engineering/decisions/2026-10-22-studio-startup-regression.md
---

# Get the Studio's startup back to the 2026-09-22 baseline, then make the site Lighthouse-green.

why now   — the owner: "performance is critical, especially on initial load". The Studio's first slide on a throttled
            phone profile went from 3.25 s (2026-09-22) to 6.46 s (2026-10-22), requests from 146 to 324, main-thread
            work before the slide from 2.4 s to 4.7 s. Lighthouse mobile: production Studio 46-48, Playground 43-44,
            home 66-81; none is green. Typing did not regress.
where     — docs/src/components/studio/StudioShell.tsx and studio-warm.ts (what boots before the slide);
            docs/src/lib/single-slide-render.ts, theme-fetch.ts, load-engine.ts (the preview path); lib/engine (panes and
            other subsystems installed on every render); lib/runtime (1.25 MB, 825 KB unused at first slide); the Nacre
            loader (Lighthouse's largest-contentful-paint element on /studio/).
progress  — 2026-10-23, PR #2877 (engineering/decisions/2026-10-23-studio-boot-order.md and -startup-bake-off.md): target (1) is MET on
            the harness: phone first slide over HTTP/2 3.29 s against 3.86 s for the 09-22 build and 3.97 s for the PR's base, 15 loads each, same
            machine, interleaved (editor built after the slide on a phone; engine, theme and runtime started from the island's first
            module). The icon chunk was dropped (HTTP/1.1 artifact). Lighthouse (2) is NOT met: the loader no longer counts as the largest paint (LCP 13.7 s to
            4.5-5.3 s, score 51-55 to 59-67) but FCP (3.3-3.6 s simulated) and TBT (~400 ms) remain; the cheap levers were measured and
            do not get there (E7). What is left is the script work itself: React ~800 ms, the runtime's chart builders (0.2 s ceiling,
            changes export bytes), ~1.9 s unattributed. Target (3), a CI time budget, is the owner's call; the harness spread (stdev
            ~30-60 ms) supports a same-job comparison.
            2026-10-26, session F (engineering/decisions/2026-10-26-lighthouse-home-runtime-prefetch.md): dropping the home
            page's runtime prefetch moved home 56-61 -> 66-76 on a LOCAL server but was NEUTRAL on the real CDN (73-80 vs
            75-78, note §7): local Lighthouse runs overstate download cost, so measure candidates on a CDN preview. Studio (48-60) and Playground (42-47) unchanged: their paint waits on 750-900 KB of module-preloaded
            JS and TBT is React, the island and the runtime (per-script table in the note §2). None is at 90; the boot-order
            redesign (next 3) is still the route, and TBT is now home's largest remaining weight.
            Deployed (the PR's Cloudflare preview): home 71-76, Studio 66-71, Playground 37-44. The Playground's LCP element is
            the Explore walk caption (`p.pg-walk-caption`), which paints after hydration, so its simulated LCP is 10.1-10.3 s
            (94% render delay): the cheapest Playground lever found, not yet tried (note §6).
            2026-10-26, PR #2913: the Playground walk caption is now in the server HTML. On the CDN preview, 5 runs interleaved
            against #2907's preview: LCP median 8.3 s -> 4.2 s, score median 42 -> 55 (note §8). The under-4 s bar is NOT met (2 of 5).
            Next item 3 now has a design (note §9): lever A (no lint while the editor is hidden) measured -190 ms simulated TBT;
            the owner's call is whether to take A and spike D (time-sliced hydration).
decided   — the owner sets both targets. PR #2870 (warm-ups after the first slide, no false KaTeX load, the web-image
            import started early) is a first slice: 6.50 s -> 6.15 s median, and 30% less main-thread work after the
            slide. How to reach the targets is not decided: it is a "rethink startup" design, so it needs a design note
            and one question round first (CLAUDE.md, design before code).
            Preloading the engine from the HTML was tried and made the first slide later (5.97 s -> 6.38-6.52 s); the
            note's §6 has the table. Re-measure it only after a preview-first boot. Hosting (Cloudflare in front of, or
            instead of, GitHub Pages: Brotli, Early Hints, immutable caching) is the owner's call; §6 item 8.
done when — (1) first slide at or below a build of 2026-09-22 measured the same day (MET, see progress); (2) Lighthouse mobile performance >= 90 on /studio/, /playground/ and / against the
            deployed site, three runs; (3) the owner has decided whether a time budget (first slide, Lighthouse) joins CI.
evidence  — the note's tables re-run on the new build: first slide, requests, main-thread work before the slide by
            script, typing latency, and Lighthouse score, FCP, LCP, TBT per page.
verify    — tier 2 trio for the boot-order change; it touches every Studio load.

next (owner order, 2026-10-23) — (1) a startup time budget in CI: same-job comparison of head against base with `serve-h2.mjs` and
            `perf:startup` (adds a CI step: bring the owner the options first); (2) the preview runtime's chart-builder split (needs the
            export sign-off, dark and light renders); (3) a Lighthouse 90 boot-order redesign: start with a design note.
