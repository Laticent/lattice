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

Both MIT licenses require their permission notice to travel with every copy, and
the OFL requires its text to accompany the fonts. Naming a license in a table
does not discharge either obligation — which is what the kit shipped before, and
what `THIRD-PARTY-LICENSES.txt` now fixes.

The per-component copyright lines live in the kit's generated `NOTICE.md`.
