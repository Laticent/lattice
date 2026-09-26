---
origin: 2391
priority: P3
recorded: 2026-09-26
---

# Let a preset wear a bolder finish, restrained by `backdrop:`

why now   — #2388 added `backdrop:` (strength + mask over any finish). #2391's presets
            predate it and do not set it. Rendered on the two presets that carry a finish
            (Editorial = `ledger`, Brand-forward = `strata`), `backdrop: clear` and `40` only
            make them quieter — closer to Classic and Minimal, which undoes the "tell the four
            apart" goal of #2391's round two. The owner chose to ship the presets as signed off.
            The open idea: a preset could wear a BOLDER finish (e.g. `atrium`) and use
            `backdrop: clear` to keep the words on clean canvas.
where     — the PRESETS table in lib/core/front-matter-key.js; `readBackdrop` in
            lib/core/resolve-backdrop.js reads `topLevelFrontMatterValue`, so `backdrop` would
            have to join `PRESET_KEYS` and resolve through `frontMatterValue`'s preset fallback;
            the Studio's deck Backdrop rows (StudioShell `deckBackdrop`) would read through
            deck-preset.ts `registerValue`.
done when — candidates rendered side by side with today's looks and one picked by the owner
            BEFORE any code; if adopted, `backdrop` is in the preset family with a render test
            per preset and the Reset / "N changes" count covers it.
evidence  — side-by-side renders of each candidate in light and dark, title and cards slides.
verify    — tier 2: preset-register.test.js plus a rendered PDF of examples/deck-presets.md.
