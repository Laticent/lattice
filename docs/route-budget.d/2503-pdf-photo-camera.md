studio: +1
The Studio's PDF camera became `canvasCamera` (lib/core/pdf-compose/compose.mjs), which captures a
slide once and encodes it as PNG or JPEG on request so the writer can keep a 1 px rule exact; the
eager chunk grew by one gzipped byte.
