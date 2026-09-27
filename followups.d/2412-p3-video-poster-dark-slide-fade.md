---
origin: 2412
priority: P3
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2412
---

# On a dark slide, a light video poster still steps from dark to light as it loads

why now   — #2412 moved the tile under a loading poster from the dark video ink to the slide's
            own surface (`--bg-alt`), which ended the near-black flash on light slides (17 frames
            to 0, poster held 2 s). On a dark slide the surface is itself dark, so a light poster
            still steps from luminance ~26–69 to ~232 when it lands. No tile color avoids that.
where     — lib/components/imagery/video/video.styles.css and the runtime (lib/runtime): decode
            the poster (`new Image().decode()`) and fade the poster layer in once it has, with
            the play badge and label unaffected — the image is the anchor's own inline
            background today, so it would need its own layer.
done when — a light poster on a dark slide fades in rather than stepping, with the poster held
            2 s, and a cached poster shows no fade at all.
evidence  — the #2412 frame record (`luminance of the tile's top-left third`), dark slide,
            before and after.
verify    — tier 0 + the visual review path.
