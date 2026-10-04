playground: +32
home: +32
No route code grew. This PR changes no module the Playground or the home page loads at startup: the Mermaid pass, stylesheet and grammar moved inside lib/plugins and lib/runtime, which ship as separate assets. CI measured +1 B (playground) and +2 B (home) gzipped against main, and the Studio fell 10 B. That is gzip noise from rebuilt chunk names. Declared with a 32 B margin per route, because the noise moves from build to build.
