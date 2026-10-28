---
origin: 2909
priority: P5
recorded: 2026-10-28
area: diagram
severity: low
swimlane: engineering/decisions/2026-10-26-web-ref-fuzz.md § Mermaid: what it can fetch and link, measured
source: https://github.com/Laticent/lattice/pull/2909
---

# A Mermaid `click … href` link has not been clicked in the real Reading view

why now   — On 2026-10-27 the real Mermaid 11.14 at the runtime's config was measured in two browsers: a `click A href` draws an `<a>` and a click navigates the page, callbacks and `javascript:` do nothing. In the real Studio Reading view the diagram with a click link is held back until the reader allows its address, and after "Load images" an anchor is drawn. The click itself was not made in the Reading view, so the navigation there (same tab or new, whether the host intercepts it) is measured only in the bare page.
where     — `docs/e2e/read-article-beacons.spec.ts` (the Reading-view spec), `lib/plugins/mermaid/mermaid.hydrate.js`.
done when — a spec clicks the drawn anchor in the Reading view after "Load images" and states where the browser goes, and that nothing is requested before the click.
evidence  — the table in the decision note and the 2026-10-27 run.
verify    — tier 1: the Reading-view spec in Chromium, Firefox and WebKit.
