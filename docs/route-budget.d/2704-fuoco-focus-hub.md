studio: +6100
playground: +60
home: +90
The Studio's focus hub (docs/src/lib/fuoco) and the incremental slide outliner
(docs/src/lib/deck-outline) load with the shell, because the rail, the counter and the preview
read them at first paint; they replace the shell's own guards and the per-render slide parse.
Given back first: the Studio imported Fuoco through its barrel, which shares a chunk with the
/fuoco demo page and dragged in the plain-text outliner the Studio never calls; importing
`hub` and `outline` directly cut the Studio's growth from +7,441 to +6,039 bytes. Home and
Playground grow only by the ninth entry in the libraries nav.
