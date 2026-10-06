studio: +1900
Leading state markers, matrix-grid cells and `_track` are now read by a parser Segno generates from
a grammar (lib/core/list-text.generated.js, Segno phase 3). The Studio's live lint is lint-core,
which reads `_track` through parseTrackSpec, so the parser ships there by design (HARD RULE #7). It
replaces the hand-written regex readers, whose bytes are gone. CI measured +1764 against main at
df47f6a; the rest is headroom for gzip noise in shared chunks as main moves.
