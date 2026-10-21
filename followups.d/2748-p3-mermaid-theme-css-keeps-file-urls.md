---
origin: 2748
priority: P3
recorded: 2026-10-19
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-media-plugins.md §4.11
source: https://github.com/Laticent/lattice/pull/2748
---

# A Mermaid diagram's author `themeCSS` can leave `file:` URLs in the exported SVG

why now   — The checker on the worker-confinement change rendered `%%{init: {"themeCSS": "… url(file:///…/outside/secret.jpg) …"}}%%`.
            The worker page now refuses those loads, but the SVG it returns still carries the `file:` URLs in its `<style>`. The CLI's own
            page guard covers this export; an HTML deck opened on another machine would try those paths there.
where     — `lib/plugins/mermaid/shared/render-worker.js` (the returned SVG), `lib/plugins/mermaid/shared/baked-figure.js`.
done when — a baked figure carries no `file:` URL whose real path is outside the deck, or the note records why a reader's machine is not at risk.
verify    — render the init directive above through `node lattice.js deck.md out.html` and grep the output for `file:///`.
---
