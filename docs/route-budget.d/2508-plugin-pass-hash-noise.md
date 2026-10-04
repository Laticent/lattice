studio: +64
playground: +64
home: +64
No route code grew. This PR changes no module the Studio, the Playground or the home page loads at startup: the Mermaid pass, stylesheet and grammar moved inside lib/plugins and lib/runtime, which ship as separate assets. CI measured between −10 and +3 B gzipped per route against main, and the sign flipped from one build to the next (Studio −10 B, then +3 B). That is gzip noise from rebuilt chunk names. Declared with a 64 B margin per route, because the noise moves from build to build.
