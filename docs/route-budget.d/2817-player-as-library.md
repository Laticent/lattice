studio: +32
playground: +11
home: +11
The Studio's Share panels gain the off-fence notice and its Turn on action (#2758): one OffFencesNotice component, and
the deck-edit callback threaded from StudioShell through ShareSheet to every diagram-drawing panel (StudioIsland +21).
theme-fetch grows 11 bytes on all three routes because it names the engine's asset version, which moves with the
engine change in this PR (the `![bg]` lift now runs on the engine's tokens, and the Marp export's source lift is its
own lazy module, esm/bg-image-lift.js). The engine closure itself does not grow on the route the lift was measured on.
