# hb-subset-color.wasm

HarfBuzz's font subsetter compiled to WebAssembly with the **color tables switched on** (COLR, CPAL, paint, draw,
bitmap). It cuts Noto Color Emoji down to the emoji a deck uses; the stock `harfbuzzjs/hb-subset.wasm` is built
with `HB_TINY`, which drops those tables and leaves every emoji blank. About 1.0 MB, against 635 KB for the stock file.

The CLI reads it from disk and the Studio fetches it, through `lib/fonts/subset-color.js`. Nothing else uses it: text faces
and the PDF writer keep the stock wasm.

## Rebuild

Source: `harfbuzzjs` tag `v0.10.3` (HarfBuzz at the commit that tag pins, `da69b65`), built with Emscripten 3.1.6
(`apt-get install emscripten`).

```sh
git clone --depth 1 --branch v0.10.3 --recurse-submodules --shallow-submodules https://github.com/harfbuzz/harfbuzzjs.git
cd harfbuzzjs
cat >> config-override-subset.h <<'CFG'

#undef HB_NO_COLOR
#undef HB_NO_PAINT
#undef HB_NO_DRAW
#undef HB_NO_BITMAP
#undef HB_NO_BORING_EXPANSION
#undef HB_NO_OT_FONT_GLYPH_NAMES
#undef HB_NO_LAYOUT_COLLECT_GLYPHS
#undef HB_NO_LAYOUT_RARELY_USED
#undef HB_NO_LAYOUT_UNUSED
CFG
make hb-subset        # writes hb-subset.wasm
```

Licenses: HarfBuzz is "Old MIT" (https://github.com/harfbuzz/harfbuzz/blob/main/COPYING), harfbuzzjs is MIT.
Check: subsetting `assets/fonts/noto-color-emoji-5.woff2` to U+1F680 gives about 2.5 KB with COLR and CPAL kept
(`test/unit/core/subset-color.test.js`).
