---
origin: 2909
priority: P3
recorded: 2026-10-28
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-26-web-ref-fuzz.md § Mermaid: what it can fetch and link, measured
source: https://github.com/Laticent/lattice/pull/2909
---

# The web-reference fuzz does not generate Mermaid fences, and its connection oracle cannot fail

why now   — The scanner reads a Mermaid fence's text (`mermaidRemoteRefs`) and the runtime draws it later, so a diagram fetches on render through `img:` shapes, an `<img>` in a label, and `themeCSS` (measured in Chromium and Firefox at `securityLevel: 'strict'`; clicks only navigate). The function is unit-tested and the Reading view was driven once, but the fuzz never writes a fence, so spellings nobody listed are untested. Separately, `<link rel=preconnect>` makes a connection with no request, which the fuzz cannot see: its control load opens no connection the loopback server can attribute in headless Chromium.
where     — `test/fixtures/web-ref-fuzz.js` (generator), `test/helpers/web-ref-fuzz.js` (the `conns` oracle), `lib/core/remote-ref.js` (`mermaidRemoteRefs`).
done when — the generator writes fenced diagrams (a fence of any length, `~~~`, with and without a language) carrying the three fetch classes and click links in odd spellings; the run drives a real diagram on a surface where Mermaid draws, with a control arm that fetches; and the preconnect oracle sees an idle connection in its control or is replaced by one that can.
evidence  — the table in the decision note; `docs/e2e` Reading-view spec used for the 2026-10-27 run.
verify    — tier 2: the seeded run in three engines, with the failing arm shown against an older scanner (`--ref`).
