---
origin: 3132
priority: P2
recorded: 2026-11-11
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-media-plugins.md §9
deferred: off-path — Export-to-Marp's full-bleed backgrounds, identical bytes on main and on #3132; #3132 changes only which picture is placed, not how Marp draws a background
source: https://github.com/Laticent/lattice/pull/3132
---

# A Marp bundle draws no full-bleed `![bg]` background

why now   — The export comparison on #3132 rendered bundles with the pinned marp-cli (test/fixtures/marp-cli, `--images
            png --allow-local-files`). A `![bg](assets/photo-pano.jpg)` on a plain content slide, and on a `content bleed`
            slide (what the image plugin's export writes for a record or the shortcut there), draws NO background in light
            or dark, on main and on the branch alike. The panel pictures of `image` slides in the same bundle load and draw,
            so the asset path works. lib/export/marp-fidelity.js says the `bleed` case reaches Marp as its full-bleed
            background; the render says it does not.
where     — the bundle's theme CSS (lattice.css in the bundle) against Marp's advanced-background markup, or the bundle's
            runtime; lib/export/marp-bundle.js, lib/export/marp-fidelity.js.
done when — a `![bg]` on a non-`image` slide draws as the slide's background in a marp-cli render of the bundle, light and
            dark, with an Export-to-Marp integration test that renders it and finds the picture's pixels.
evidence  — /tmp scratch renders of `bg-plain.md` on #3132 (two slides, both blank where the photo belongs).
verify    — the Export-to-Marp integration tests (test/integration, marp-cli pin); a PNG compare of the slide.
