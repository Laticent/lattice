studio: +2
The Studio's PDF camera became `canvasCamera` (lib/core/pdf-compose/compose.mjs), which captures a
slide once and encodes it as PNG or JPEG on request so the writer can keep a 1 px rule exact, and
`makeHtmlToImageCamera` keeps its old `{ toJpeg }` signature beside the new `{ toCanvas }`; the
eager chunk grew by two gzipped bytes.
