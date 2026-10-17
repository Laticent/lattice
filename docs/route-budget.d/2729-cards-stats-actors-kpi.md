playground: +64
studio: +16
CI read the playground's eager JS +2 B and the Studio's -10 B against main at this head (and the Studio +1 B at the previous head): three more components now carry a `cards` entry in the generated cards catalog the engine bundle includes (stats, actors, kpi), which gzips to about a byte or two. Nothing else grew, since the render-tier tooling and the conformance contract are not bundled. The declared figures leave room for gzip spread between heads, as #2548 and #2361 saw; no real growth beyond the catalog rows is being declared.
