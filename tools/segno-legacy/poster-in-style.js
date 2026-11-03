// FROZEN COPY (Segno R4, the narrator). The pattern lib/transformers/prose-projection.mjs used to read a
// video embed's poster out of its inline style, before `posterInStyle` read it with `cssRefSpans`.
// test/unit/transformers/prose-projection-poster.test.js holds the new reader to this one on every
// rendered deck in the repo. Do not change it: it is the oracle.

/** The poster address in an inline style, as the narrator read it until 2026-11-03, or undefined. */
function legacyPosterInStyle(style) {
  return /background-image\s*:\s*url\((['"]?)(.*?)\1\)/i.exec(style || '')?.[2];
}

module.exports = { legacyPosterInStyle };
