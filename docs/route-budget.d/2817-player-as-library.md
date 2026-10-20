studio: +32
playground: +11
home: +11
The Studio's Share panels gain the off-fence notice and its Turn on action (#2758): one OffFencesNotice component, and
the deck-edit callback threaded from StudioShell through ShareSheet to every diagram-drawing panel (StudioIsland +21).
theme-fetch, a shared chunk all three routes load, grows 11 bytes (CI's measure, hashes fixed). Most likely Rollup
re-splitting the shared loader helpers (chunk-load, engine-base) that the Marp export's new lazy loader imports
(bg-image-lift-source.js, for esm/bg-image-lift.js); not attributed byte by byte. The engine closure does not grow on
the route the `![bg]` lift was measured on.
