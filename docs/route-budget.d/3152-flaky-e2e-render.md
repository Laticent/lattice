studio: +62
playground: +144
home: +62
Real growth from two product fixes. The draw host's stub (`preview-draw-host.ts`, in the shared chunk Vite names
`video-overlay`) now marks a kind down and rejects with `drawUnavailable` when its own chunk cannot load, so an
offline diagram falls back to the page's Mermaid (+62 on every route that ships the stub). The Playground's
`startWalk` drops a walk a later pick superseded and keeps an edited draft when Explore starts it (+82,
`PlaygroundIsland`). Measured by CI on 25a00949.
