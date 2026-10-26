---
status: shipped
summary: A `fonts:` line (and `--fonts` flag, and a Studio control) says how much of each typeface an export carries - exact, used, full or system - with a `-emoji` suffix for the emoji font. Noto Color Emoji is now self-hosted as 11 unicode-range slices and cut to the deck's own emoji by a color build of HarfBuzz's subsetter. A five-emoji player went from 3.11 MB to 1.06 MB.
---

# One `fonts:` setting for every export (2026-10-26)

## The answer first

An export carries as much of each typeface as the author asks for, and one kernel (`lib/core/font-policy.js`) decides it for every host.

| Word | Meaning |
|---|---|
| `exact` | only the characters or emoji the deck shows. Smallest. |
| `used` | the whole face as we ship it (the full Latin range), so edited text never hits a missing glyph. |
| `full` | the whole face; for emoji, all 11 slices. |
| `system` | embed nothing; the viewer's fonts draw it. |

A bare word sets the text faces (default `used`); a word ending in `-emoji` sets the emoji font (default `exact`): `fonts: used exact-emoji`.
The name is `fonts`, not `embed`: `embed` would also seem to cover pictures, which `images:` owns. `fonts:` is not CSS; it never changes which font a slide asks for.

## Why emoji get their own default

Nobody types a new emoji in our face, and PowerPoint cannot use it (the font is COLR v1). So an emoji is never an editing resource, and `exact` loses nothing. A text face is: someone who edits the file types new letters.

## What each host does

| Output | text | emoji |
|---|---|---|
| player (CLI and Studio) | `exact` cuts to the characters shown; `used`/`full` keep the face; `system` drops it | `exact` cuts each slice to the deck's emoji; `used` keeps the slices that hold them; `full` all 11; `system` none |
| editable PPTX/ODP | every tier but `system` embeds the whole face (no tier cuts an Office face, or edited text would lose glyphs); `system` embeds nothing | emoji stay in the slide picture |
| plain `.html`, `--read`, `--fluid` | as the player: the finished file is cut by the same function, counting what its entities spell (`&#x1F389;`, `&laquo;`) | as the player |
| PDF | `system` embeds no font file: the writer skips the engine's faces, so those words stay in the page picture (drawn in our faces) and the PDF has no selectable or searchable text in them. CLI and Studio do the same | the emoji are in the picture either way |
| image sets | no font file to embed; the pictures are drawn as always | same |

CLI and Studio read the same words, merged class by class (`--fonts full` keeps the deck's emoji tier).

## The emoji font

Google serves Noto Color Emoji (v47) as 11 woff2 slices with a `unicode-range` each, about 2 MB together; the single file is 25 MB. They live in `assets/fonts/`, ship in `dist/fonts/` and are declared in `dist/lattice.css`, so a browser fetches only the slices a page needs.
An export inlines `slicesFor(text)` (`lib/fonts/emoji-faces.js`). Google puts some code points in two slices (a rocket is in slice 5 and 8), so `used-emoji` can carry both; `exact-emoji` cuts each to a few KB anyway.

## Where the emoji font does not load, and what happens

- **A renderer without COLR v1 (Safari and every iOS browser, as far as we know).** The slices are COLR v1 fonts; such a renderer would draw an
  empty box and never fall back, because the face claims the code point. Every emoji rule therefore ends `format('woff2') tech(color-COLRv1)`,
  so the browser skips the source and the stack falls through to the platform's own emoji font. **UNVERIFIED on real Safari or iOS:** neither is
  reachable from the Linux sandbox, and Playwright's Linux WebKit is a different renderer. The Chromium, Firefox and WebKit e2e check the size of the
  emitted rules, not pixels.
- **An Export-to-Marp bundle** has the emoji rules removed (`withoutEmojiFont`, lib/core/marp-bundle.js): marp-core draws emoji as twemoji images.
- **The player's Read view** names `'Noto Color Emoji'` in its font stacks, so an emoji in the article draws from the embedded font like the slides.
- **The published bundle.** `dist/lattice.js` is one file, where `__dirname` is `dist/`; the color wasm is found through the package's `lib/` (`lib/fonts/subset-color.js`) and `test/integration/export/emoji-font-cut.test.js` renders from the bundle as well as from source, because a missing wasm only makes the cut silently skip.
- **`fonts: system`** drops only the engine's text faces and the emoji faces, inside the `lattice-embedded-fonts` block. KaTeX's faces and slide
  text that looks like a rule are not touched.

## Why a rebuilt wasm

The subsetter the engine ships (`subset-font` over `harfbuzzjs/hb-subset.wasm`) is built with `HB_TINY`, which drops COLR and CPAL; run over an emoji slice it returns a valid font that draws nothing.
`lib/fonts/hb/hb-subset-color.wasm` is the same HarfBuzz with the color tables switched on (1.0 MB against 635 KB), and `lib/fonts/subset-color.js` drives it with the same calls `subset-font` makes. Only the emoji font uses it; text faces and the PDF writer keep the stock wasm. The rebuild recipe is `lib/fonts/hb/README.md`.

Measured, one emoji out of its slice: 🚀 121 KB to 2.5 KB, ✅ 65 KB to 0.8 KB, 🇫🇷 709 KB to 1.9 KB, and the result draws in Chromium. Player, same five-emoji deck: 3.11 MB with whole slices, 1.06 MB with `exact-emoji`.

## What is deliberately not done

- No tier cuts text faces in an Office file. `exact` there would defeat editing, and the file is the one place the whole face pays for itself.
- No script ranges beyond Latin: we ship no other script, so `used` has nothing to add. A first non-Latin face adds its own range to the kernel with it.
- Studio emoji in a PDF or an editable Office file stay pixels in the slide picture; COLR v1 cannot go in either format.

## Enforcement

`unknown-fonts` lints a bad word. `test/unit/core/font-policy.test.js`, `emoji-faces.test.js`, `subset-color.test.js` and `player-fonts-policy.test.js` pin the kernel, the slice picker, the color cut and the per-tier player behavior. `docs/e2e/export-fonts-policy.spec.ts` drives the real Studio's web-page export. `tools/check-fonts.js` checks every slice is on disk. The color wasm's license notices sit beside it (`lib/fonts/hb/LICENSE-*.txt`); `assets/fonts/OFL.txt` goes to `dist/fonts/`.
