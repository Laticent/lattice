---
origin: 3165
priority: P1
recorded: 2026-11-13
area: website
severity: medium
swimlane: engineering/decisions/2026-11-12-device-capability-tiers.md §4 (slice 3)
deferred: large — a visual change across the Studio shell, the live preview and three backdrop-blur surfaces, owing screenshots at three widths in both tiers
source: https://github.com/Laticent/lattice/pull/3165
---

# LITE visuals: Nacre becomes the hero's pulse skeleton, backdrop blur becomes a solid surface

why now   — PR 3165 ships the tier (`html[data-device-tier]`, applied before paint from the saved value) but
            nothing reads it, so a software-rendered machine still runs Nacre (18 fps at 4K, §1).
where     — docs/src/styles/nacre-loader.css, the SHELL_NACRE_CSS copy in docs/src/pages/studio.astro,
            DeckPreview.tsx's loader, lib/core/image-painting.js (Underpainting), the backdrop-filter sites listed in §1.
done when — under `[data-device-tier="lite"]` the Studio paints the `.live-host` pulse skeleton instead of Nacre (shell
            and post-hydration), the Underpainting is static, and the listed surfaces use an opaque token; FULL unchanged.
evidence  — §4's table; the owner's request (2026-11-12) named the Nacre → hero placeholder swap.
verify    — `?tier=lite` and `?tier=full` screenshots at 1440/820/390; an e2e spec on all six projects that pins each
            tier and asserts which loader paints; studio-shell check still passes; route budget held.
