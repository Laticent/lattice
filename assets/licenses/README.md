# assets/licenses — third-party license texts, vendored

These are the verbatim license texts for the third-party components
`tools/build-marp-kit.js` redistributes in `dist/marp-kit/`.

They are vendored rather than read from `node_modules/` at build time for one
reason: **the kit is a redistribution artifact, and its license texts have to be
reviewable in the diff.** A file assembled from whatever happens to be installed
is not something a reviewer can check.

| File | Covers | Source |
|---|---|---|
| `MIT-mermaid.txt` | `mermaid-v11.min.js` | `node_modules/mermaid/LICENSE` |
| `MIT-katex.txt` | the `fonts/KaTeX_*.woff2` faces | `node_modules/katex/LICENSE` |
| `OFL-1.1.txt` | Outfit, Playfair Display, JetBrains Mono, Caveat, Shantell Sans | SIL Open Font License 1.1, verbatim |
| `LGPL-3.0-lamejs.txt` | `@breezystack/lamejs` (LAME mp3 encoder) — **the docs site bundle, not the marp kit** | `docs/node_modules/@breezystack/lamejs/LICENSE` |
| `LGPL-2.1-ffmpeg.txt` | FFmpeg's AAC encoder inside `@mediabunny/aac-encoder` — **`lattice video`, not the marp kit** | FFmpeg's `COPYING.LGPLv2.1`, verbatim |

Both MIT licenses require their permission notice to travel with every copy, and
the OFL requires its text to accompany the fonts. Naming a license in a table
does not discharge either obligation — which is what the kit shipped before, and
what `THIRD-PARTY-LICENSES.txt` now fixes.

The per-component copyright lines live in the kit's generated `NOTICE.md`.

**Two entries here are not about the kit.** `LGPL-3.0-lamejs.txt` covers a component
that ships in the *docs site* bundle instead: the Studio encodes narration to mp3
in the browser with LAME (`docs/src/playground/narration-encode.js`). LAME's terms
ask for acknowledgment and a link rather than a bundled text, so the notice the
deployed site actually serves is `docs/public/third-party-licenses.txt`; this file
records the same thing in the diff, for the same reason as everything above it.

**`LGPL-2.1-ffmpeg.txt` covers an npm dependency, not a file we bundle.** `lattice video`
encodes AAC audio with `@mediabunny/aac-encoder`, which is FFmpeg's AAC encoder compiled to
WebAssembly. The package declares MPL-2.0 for its own code but ships no notice for FFmpeg, whose
encoder is LGPL-2.1-or-later. npm installs it unmodified as a separate package, so Lattice
redistributes nothing from it, but the owner chose to carry the notice anyway (2026-09-26, fork 1
of `engineering/decisions/2026-09-25-video-export.md`). This file is the license text, and
`lattice video --help` prints FFmpeg's requested acknowledgment and a link to its source.
