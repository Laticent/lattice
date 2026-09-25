---
origin: 2375
priority: P1
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2375
---

# Hold a slide's text until its fonts land in the engine, once, instead of in every host

why now   — The owner keeps seeing text shift right after a slide renders. The cause is systemic: every engine `@font-face` is `font-display: swap`, so each surface that shows a slide must hide the text until its faces land, and five places do it separately (the player, `single-slide-render`, the Playground's `deck-preview`, the stage window, print). A surface that forgets it, as the player did before #2375, brings the shift back.
where     — `tools/build-css.js` emits the `font-display` descriptor; `lib/core/preview-font-gate.mjs` is the gate the Studio hosts use; `lib/export/player-core.mjs` rewrites the player's faces to `fallback`; `docs/src/lib/single-slide-render.ts` (`facesReady`, `armLateFonts`), `docs/src/playground/deck-preview.js`, `docs/src/components/studio/present/stage-window.js`, `docs/src/components/studio/PrintOptionsPanel.tsx` each carry their own copy. Record: `engineering/decisions/2026-09-25-one-slide-frame.md`, and `engineering/gotchas/fonts.md` for the earlier 197ms/517ms two-layout measurement.
done when — The document the engine emits holds its own text until its faces land, with a bounded backstop, so a new host inherits that without writing any gate code. The five host copies are deleted, and a jank check fails when a slide's title moves while visible.
evidence  — A frame-by-frame capture (Chrome trace screenshots plus a per-frame title-rect log) of the player, Studio, Playground and Present, at normal speed and at 4x CPU throttle, showing zero visible movement. #2375's session used this method: every shift happened while the frame was still at opacity 0. Plus the owner's iPhone, because desktop WebKit did not reproduce iOS behavior in #2375.
verify    — tier 2 trio, because it changes an engine kernel every surface and export shares, and a wrong backstop shows a blank slide.
