---
origin: 2613
priority: P2
recorded: 2026-10-08
area: authoring
severity: medium
swimlane: spec/diagnostics.md
source: https://github.com/Laticent/lattice/pull/2613
---

# focus-spec, focus-style, focus-steps and track-directive only run on slides with a class

why now   — found by the registry checker on #2613. The four rules sit inside lintTextWith's
            per-slide loop after `if (!dir?.payload) return;` (lib/authoring/lint-core.js ~4084),
            so a slide with no `_class` or running `class` is never checked. A bare deck-wide
            `<!-- track: A | [B] -->` on a class-less slide, the case track-directive's own comment
            calls dangerous, produces no finding. spec/diagnostics.md 1.1 describes the gate as it is.
where     — lib/authoring/lint-core.js lintTextWith (the class gate and the four rules).
done when — the four rules run on every slide (or the gate is justified in the spec), and the
            spec rows drop "on a slide with a class directive" if the gate goes.
evidence  — a unit test: `<!-- track: A | [B] -->` and `<!-- _focus: rows 4 -->` on a class-less
            slide each produce their finding.
verify    — tier 0 gates plus a lint run over examples/ to see what newly fires.
