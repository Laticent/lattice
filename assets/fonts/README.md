# Self-hosted web fonts — the library's own type (zero network)

These woff2 files are the engine's text faces, self-hosted so **every render
path loads type from the library's own bytes — no CDN, no network**. They are
the *source-of-truth*; `tools/build-css.js` copies them into `dist/fonts/` (which
ships in the npm tarball) and emits a `@font-face` block in `dist/lattice.css`
pointing at `url('fonts/<file>.woff2')`. The emulator base64-inlines the same
files into the PDFs it prints. There is no Google-Fonts `@import` anymore.

`assets/` itself is **not** in the npm tarball — consumers get the woff2 from the
shipped `dist/fonts/` instead. These source copies are what the build vends and
what an in-repo (pre-build) emulator run falls back to.

| Family | Role | Files | License |
|---|---|---|---|
| Playfair Display | display / headings | `playfair-{400,700}.woff2`, `playfair-italic-{400,700}.woff2` | SIL OFL 1.1 |
| Outfit | body | `outfit-{300,400,500,600,700}.woff2` | SIL OFL 1.1 |
| JetBrains Mono | code / mono | `jetbrains-{400,500,600}.woff2` | SIL OFL 1.1 |
| Caveat | `sketch` headings | `caveat-{400,700}.woff2` | SIL OFL 1.1 |
| Shantell Sans | `sketch` body / labels | `shantell-{400,500,700}.woff2` | SIL OFL 1.1 |

Latin-subset woff2, pulled from the Google Fonts CSS API. The canonical face list
lives in **`lib/fonts/text-faces.js`** (`TEXT_FACES`) — the single source of truth
shared by the build emitter, the emulator (`SELF_HOSTED_FACES`), and the parity
gate. To bundle another weight/family: drop the woff2 here, add a row there, and
run `npm run build`.

KaTeX's math glyphs are self-hosted too — the build copies the `katex` package's
woff2 into `dist/fonts/` and rewrites its CSS to reference them locally. Math
renders offline like the text.

## The `fonts:check` gate

`tools/check-fonts.js` (run by `build:check` and pre-commit) holds the manifest,
these source woff2, and the web-export supply (`docs/src/playground/font-embed.js`)
to the same face set, and **regression-guards the zero-network property**: any
`fonts.googleapis.com` / `fonts.gstatic.com` URL creeping back into the engine
CSS or the shipped bundle fails the build. `dist/fonts/` freshness is enforced
separately by `css:build --check`.

## Color emoji — system font by default, opt-in full-offline tier

Noto Color Emoji is **not** bundled by default: at ~25 MB it is impractical to
ship to everyone, so color emoji falls back to the installed **system** emoji
font (every font stack lists Apple/Segoe/Noto). Air-gapped environments that
can't rely on a system emoji font run **`npm run fonts:emoji`** once while online
to vendor the font into `dist/fonts/noto-color-emoji.ttf` (excluded from the
tarball); linking the committed `dist/lattice-emoji.css` after `lattice.css` then
resolves it locally.

See `engineering/decisions/2026-06-26-local-font-library.md` for the full design,
and `2026-06-12-export-font-embedding.md` for the export-embedding precursor.

> Subset note: `outfit-{300,500,600}` and `shantell-500` were copied from the
> web-export set (`docs/src/playground/fonts/`) and carry its slightly wider
> latin subset, so they are larger than their tighter-subset siblings here.
> Harmless for embedding (a glyph superset).
