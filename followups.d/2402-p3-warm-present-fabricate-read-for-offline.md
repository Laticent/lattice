---
origin: 2402
priority: P3
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2402
---

# Present, Fabricate and the reading view fail offline if never opened online

```text
  P3 · extend the idle warm-up to the three other load-on-open surfaces
       why now   — #2402 warms its six panels after startup so they open offline (the service
                   worker caches /_astro/ chunks only once fetched; docs/public/sw.js has no
                   precache list). Present, Fabricate and the reading view are React.lazy with
                   no warm-up, so a user who goes offline before opening them gets the
                   chunk-load card. Offline is a supported state (2026-07-02-docs-pwa.md).
       where     — docs/src/components/studio/StudioShell.tsx (the React.lazy declarations);
                   docs/src/components/studio/lazy-panel.tsx (warmPanels).
       done when — each of the three opens with the network cut after an online session that
                   never opened it, or the doc records why one of them should not be warmed
                   (bytes vs how often it is used offline).
       evidence  — a Playwright run: warm online with the service worker allowed, setOffline,
                   open each surface.
       verify    — tier 1; real Chromium on the built site.
```
