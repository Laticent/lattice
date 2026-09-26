---
origin: 2385
priority: P2
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2385
---
# The state chart's browser pass writes markup after the sanitizer and is not in the post-sanitize census

why now   — The checker on #2385 showed that a forged `data-fc-model` on a raw-HTML `.flowchart-figure` survives the slide sanitizer (DOMPurify keeps `data-*`) and reached `svg.innerHTML` unvalidated. #2385 fixed the flowchart (sanitizeModel, plus a census row). The state chart's pass has the same shape: it paints from `data-sc-transitions` and the measured `<li>`s' `data-*` into `svg.innerHTML`, from `state-chart.transform.js`, outside `lib/runtime`, where `checkRuntimeMarkupSinks` does not look. Pre-existing and off #2385's path; not verified either way.
where     — lib/components/chart/state-chart/state-chart.transform.js (`installStateChartLayout`, the `svg.innerHTML = paint` write); tools/check-ownership.js (`RUNTIME_MARKUP_EXTRA_FILES`, `SANCTIONED_RUNTIME_MARKUP_SINKS`).
done when — Every structural field the state-chart pass interpolates (tint, status, kind, dir, style, labelBg) is validated against a closed set or escaped. The file joins `RUNTIME_MARKUP_EXTRA_FILES` with a provenance row, and a test paints a forged payload and finds no markup.
evidence  — The flowchart reproduction: `.scratch/fc-xss.mjs` from the #2385 checker run (engine render, the real `sanitize-slide-html.mjs`, then the pass) set `top.__pwned`. The state chart has not been run through it.
verify    — The same harness pointed at a forged `.state-chart-figure[data-sc-transitions]`: `__pwned` stays unset and the SVG holds no element outside the pass's own vocabulary.
