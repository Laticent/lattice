---
origin: 2779
priority: P1
recorded: 2026-10-19
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-media-plugins.md §4.7
source: https://github.com/Laticent/lattice/pull/2779
---

# A photo in a `columns` pane is cropped, not fitted to the pane

why now   — the `image` plugin (#2727) is being built, and its note has no rule for how a pane sizes a
            figure it receives (§4.7 covers `image`, `split-panel`, `collage`, `video` and a lone
            figure on a plain slide). Left unsaid, the plugin ships with today's clipping.
found     — a pane matrix on 2026-10-19: four photo shapes (`lib/samples/photo-{wide,tall,pano,square}.jpg`)
            as `![…](sample:…)` in a plain pane (`_pane: content`) beside a text pane, in
            `columns ratio-25-75`, `ratio-50-50` and `ratio-75-25`, CLI render, indaco, light.
            Today's behavior: the photo takes the pane's width at its own shape, from the top. When
            that makes it taller than the pane it is cropped and the engine stamps "Content clipped":
            wide at 75%, tall at 50% and 75% (the sun is cut off), square at 75%. At 25% it is a small
            thumbnail with empty space below.
where     — the pane frame (`lib/forms/cell/pane/pane.css`) and whatever the plugin emits for a figure
            in a pane; the plugin is owed to stamp `aspect-ratio` from known dimensions (media-plugins
            §4.11, "The box is known before the bytes arrive", slices 2 and 3), so the layout can size
            from it once it lands. Note `pane.css:266-281` already gives an `image` pane `object-fit:
            cover`, a deliberate crop; the matrix tested `_pane: content`, a different rule. The fix
            must say whether it changes the `image` pane's cover
done when — a photo of any shape in a pane of any share is scaled to fit inside its box, never cropped,
            and no "Content clipped" stamp appears; a pane with no shaped figure renders byte-identical
evidence  — the same 12-slide matrix before and after, light and dark, via SendUserFile
verify    — tier 1 checker (a pane rule changes how every figure in a pane is sized)
note      — the shape comes from the plugin's stamped aspect, not a component manifest field. Fixed-shape
            charts (`piechart`, `radar`, `funnel`, `map`, `diagram`) leave empty space in a pane for the
            same reason; one pane rule that fits any figure by its declared aspect could cover both. See
            `engineering/decisions/2026-10-16-mosaico-layout-library.md` §8.8.
