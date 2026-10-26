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
| editable PPTX/ODP | the host applies the tier through `faceCut` (lib/core/font-policy.js) and hands Calco finished fonts: `exact` cuts each face to the characters the deck draws in it, `used` and `full` keep the whole face we ship, `system` embeds nothing | `system` leaves the emoji font out of every picture (a whole-slide picture, the shared background); an emoji in an editable text box is drawn by the viewer's own font under every tier (an embedded COLR v1 emoji face draws blank in LibreOffice 24.2) |
| plain `.html`, `--read`, `--fluid` | as the player: the finished file is cut by the same function, counting what its entities spell (`&#x1F389;`, `&laquo;`) | as the player |
| PDF | `system` embeds no font file: the writer skips the engine's faces, so those words stay in the page picture (drawn in our faces) and the PDF has no selectable or searchable text in them. CLI and Studio do the same | no emoji font file rides in a PDF under any tier, so `exact`, `used` and `full` draw the same picture; `system` leaves our font out of the camera, so the picture's emoji come from the drawing machine's own emoji font |
| image sets | no font file to embed; the pictures are drawn as always | as the PDF: `system` draws the machine's own emoji |

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

## Addendum: the emoji tier reaches every picture (2026-10-26)

A first cut made `system-emoji` a no-op outside `.html`: PDFs and picture formats kept drawing Noto, and the Studio's PDF and PowerPoint panels
lost the choice for a while. The owner rejected both (emoji are fonts; one shared spine). Now the tier applies in every export. The shared
camera (`lib/core/slide-camera.mjs`) drops the emoji `@font-face` rules when the capture document carries `data-lattice-omit-fonts`, and the
command line leaves the face out of the page. Measured on a rocket, a check mark, a flag and a heart: a PDF under `system-emoji` is 5 KB
larger and draws the rocket in the machine's own glyph; `exact` and `full` write byte-identical PDFs.

Price: a PDF drawn under `system-emoji` depends on the drawing machine. A machine with no emoji font draws boxes. Text stays different on
purpose: its layout was measured in the engine's faces, so `system` text never changes what the picture draws.

## Addendum: policy lives in the kernels; Calco is handed finished inputs (2026-10-26)

**The model, from the owner:** Calco is handed the fonts and the pictures it needs and does nothing but use them. Policy (what `exact` means, whether
`original` is lossless, the JPEG thresholds) belongs in one shared place Lattice owns; Calco lists what a deck uses, crops, and writes the file.

- **Fonts.** `lib/core/font-policy.js` `faceCut(tier, chars)` is the one decision: `undefined` embeds nothing, a string is the characters to keep,
  `null` keeps the whole face. Calco's `prepareFonts(deck, host, onSkip)` lists the faces and the characters drawn in each (capitals from
  `text-transform` and small caps included) and asks `host.font(face)` for the finished font. The CLI (`lib/export/office-export.js`) and the Studio
  (`calco-font-host.js`) each load and pin their own way and both ask `faceCut`. Calco has no tier words; the duplicate list it carried is gone.
- **Pictures.** `lib/core/image-policy.js` owns `choosePicture` (the PNG-or-JPEG rule for a slide), `PICTURE` (the thresholds, measured on a 35-slide
  deck) and `cropRules` (what Calco is told for the pictures it crops). The CLI and the Studio call `choosePicture`; each used to carry a copy.
  Calco's `captureOfficeSlides` takes plain crop instructions (`pictures`); absent, every crop is a lossless PNG. The crop quality now follows the
  policy (default 90; it was a fixed 92, which contradicted "one quality for every picture").
- **Emoji in Office files: Calco can, our hosts do not.** `splitEmojiRuns` splits a run at its emoji (the run is marked `style.emoji`; a skin tone
  binds to its base, a tag flag keeps its tags; a line's height comes from its text) and names a face for each, so a host can embed an emoji font like
  any other face. We built that wiring for both hosts, tested it in LibreOffice 24.2 and **removed it**: Noto Color Emoji is COLR v1, and LibreOffice
  draws NOTHING for an emoji set in an embedded COLR v1 face. It does so with the system emoji font hidden AND with it installed (the embedded family
  wins over the system fallback), so embedding makes emoji disappear, which is worse than leaving them to the reader's own font. (An earlier note here
  claimed the opposite. It rested on an `.odp` written without `--editable`, which is one picture per slide, so the color emoji came from the
  picture.) `.pptx`: LibreOffice 24.2 does not read embedded fonts from a `.pptx` at all, text included, and whether PowerPoint paints an embedded
  COLR v1 face is **UNVERIFIED**, so the same rule holds. So the emoji tier changes nothing in an editable Office file: the emoji stay text and the
  reader's own font draws them. It still applies to web pages, the player, plain `.html`, and to the pictures in PDFs and picture formats
  (`system-emoji` there draws this machine's own emoji font). **To bring it back** a host needs a face an office suite can paint (a COLR v0, SBIX or
  CBDT build of the emoji font; we ship only the Google COLR v1 slices) and to call `splitEmojiRuns` before `prepareFonts`.
