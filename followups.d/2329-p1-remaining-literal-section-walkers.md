---
origin: 2329
priority: P1
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2329
---

# Route the remaining literal `<section` scans onto the shared walker

why now   — #2329 moved five walkers onto `splitSections` after a `<section` quoted in a
            comment lost slides or chrome on three surfaces. Its checker found more copies
            that are pre-existing and off that PR's path, so they were logged, not pulled in.
where     — lib/components/chart/word-cloud/word-cloud.transform.js `applyToRenderedHtml`
            (the same indexOf depth walker; only tools/composed-contrast.js reaches it);
            lazy `/<section[\s\S]*?<\/section>/` matchers in lib/transformers/label-set-key.js,
            lib/transformers/logo-marks.js, lib/engine/index.js and
            lib/integrations/markdown-it/plugins.js — a `</section>` quoted in a comment
            truncates a slide, and a nested section breaks them;
            docs/src/playground/preview-virtual.js (flat pairing regex);
            docs/src/lib/single-slide-render.ts `</section>` count near the fidelity compare.
done when — `grep -rnE "indexOf\('<section'|<section\[\\\\s\\\\S\]\*\?" lib docs/src` finds
            only the shared kernel, each migrated caller has a quoted-comment arm, and an
            examples/*.md HTML-export A/B moves no deck.
evidence  — the grep, the A/B count, the new arms failing on the old code.
verify    — tier 1: an independent checker. The kernel sits under every render.
