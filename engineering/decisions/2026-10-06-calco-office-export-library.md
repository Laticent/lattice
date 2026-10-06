---
status: in-progress
summary: Calco (`@laticent/calco`) is the office-export library. It turns a rendered HTML slide into an OpenDocument (.odp) or PowerPoint (.pptx) file with real, editable text boxes over a picture of the slide with its text removed, in the deck's own fonts, embedded in both formats. It is a TypeScript workspace in docs/src/lib/calco/ with no dependencies of its own; Lattice is its first user, through `.odp` and `--editable` in the CLI and the Studio. The note records how the output was checked (by eye, slide by slide, in LibreOffice 7, backed by a whole-slide pixel difference that cannot by itself show right text), the six LibreOffice behaviors the writer works around, and what the adversarial review of the first cut found and changed.
---

# Calco: rendered slides to editable office files (2026-10-06)

**Status: in progress.** Built and checked: the CLI (every `.odp`, and `--editable` on
`.odp` and `.pptx`) and the Studio (a LibreOffice row and an Editable-text switch for
PowerPoint and LibreOffice). The `/calco` page and the brand mark land as later commits in
the same PR.

## 1. Why

The owner asked for LibreOffice export "like export of PowerPoint". The first cut wrote an
image-per-slide `.odp`, the twin of the `.pptx` Lattice already had. The owner's sign-off
asked for the thing the image model cannot give: **text you can edit**. Then they asked for
it as a library anyone can use, "like Vetrina and Trama", with Lattice as the first user.

Four decisions were the owner's, taken in one round on 2026-10-06, each on the recommended
option:

| Decision | Chosen | Rejected, and why |
|---|---|---|
| How to get editable text | Our own reader and writers | LibreOffice's PDF import (`soffice --infilter=impress_pdf_import`): needs LibreOffice on the exporting machine, cannot run in the Studio, and swaps the fonts (§3) |
| Editable or picture by default | Picture stays the default; `--editable` opts in | Editable text depends on fonts the reader may not have; the picture is exact |
| PPTX fonts | Named, with the suite's fallback, if embedding is not possible | — (embedding was then built: see below and §6) |
| The shipped picture `.pptx` | Untouched (`lib/export/pptx-export.js`) | Moving it into Calco would change shipped bytes and need a new sign-off |

**PPTX fonts, revisited.** The owner then asked for the most look-parity achievable. The
`.pptx` now embeds its fonts too (§6); naming remains the fallback, for a CFF face or a host
that does not pass JSZip.

The name: *calco* is Italian for a cast or a tracing taken from an original. The output is
a faithful copy you can then rework.

## 2. What Calco is, and what it is not

Calco has three parts, joined by one plain-data model (`types.ts`: a `Deck` of `Slide`s,
each a picture plus `TextFrame`s, each frame lines of styled `TextRun`s, every length in CSS
pixels of the slide box):

- **The reader** (`reader.ts`): `readSlide(section, { hide })` measures every visible word
  on a laid-out slide, groups words into paragraphs (the nearest block ancestor) and lines
  (where the browser wrapped), and records the style each was drawn in: the font the browser
  actually used, weight, slant, size, color, opacity, letter-spacing, transform, decoration
  and whether ligatures were on. With `hide: true` it then hides exactly that text, for a
  background photo, until `restoreSlide`.
- **The writers**: `odp.ts` and `pptx.ts` turn a `Deck` into a file. A slide with no frames
  is a picture-per-slide page, so one writer serves both modes.
- **Fonts and placement** (`fonts.ts`, `layout.ts`): which faces a deck uses, getting them
  ready to embed through a host-supplied pinner, reading their vertical metrics, and the
  maths that puts a box where the office suite will draw its baseline on the browser's.

What it is **not**: a converter of charts, diagrams or equations into native shapes. SVG
and MathML stay in the picture, labels and all. Nor does it reflow: lines break where the
browser broke them, so an editor that types more text grows the box, not the layout.

Calco never sees Markdown or Lattice's CSS. Its input is any laid-out HTML element.

## 3. Measured: three ways to get editable text

The example deck `examples/accessible-descriptions.md` (4 slides, indaco), rendered by
LibreOffice 7 at 192 dpi and compared with Chrome's own render. "Differ" is the share of
pixels whose largest channel difference exceeds 40.

| Route | Slide 1 | 2 | 3 | 4 | Fonts |
|---|---:|---:|---:|---:|---|
| LibreOffice PDF import | 2.25% | 2.28% | 4.16% | 1.54% | substituted (serif headings turn sans) |
| Calco, first spike | 3.11% | 3.24% | 7.10% | 2.33% | embedded, but the page size was ignored |
| **Calco, as built** | **0.55%** | **0.55%** | **1.52%** | **0.37%** | **embedded** |

On two denser dark-mode decks (indaco-dark), the editable `.odp` measures 0.63–1.86%
(`chart-lead-blocks`, 7 slides, 63 boxes, 9 faces) and 0.97–2.87% (`muted-tier-and-syntax`,
8 slides, 67 boxes, 9 faces), with tables, lists, cards, tags and highlighted code.

**What this number does and does not show.** A whole-slide pixel difference catches a box in
the wrong place or the wrong font. It cannot tell a right word from a wrong one, it scores a
paragraph left in the picture as perfect, and LibreOffice's PDF import (every serif heading
turned sans) scores inside the same range. So it is a regression alarm, not the proof. The
proof is looking: every slide of the decks above, `examples/gallery-jargon.md` (58 slides,
622 boxes, 13 faces) and the Studio's welcome deck were compared side by side with the
original, by eye, after the review fixes in §5a. The full 123-section gallery
(`test/integration/baseline-decks/gallery.md`) exports in both modes (120 slides, 1,184
boxes, 17 faces).

## 4. The package

Shaped like Trama (`2026-09-27-trama-graph-chart-library.md` §3):

- `docs/src/lib/calco/` is an npm workspace, `@laticent/calco`, `AGPL-3.0-only`;
  `tools/build-calco-lib.js` emits ESM, CJS and `.d.ts` to its `dist/` (uncommitted,
  freshness-gated by `calco-lib:check`).
- **No dependencies, not even `node:`**, enforced by `checkCalcoBoundary` in
  `tools/check-ownership.js`. JSZip, PptxGenJS and the font pinner are arguments. This is
  what lets the reader ship as `fn.toString()` source into a headless page and lets the
  Studio bundle the writers with its own JSZip.
- The CLI bundle inlines it (`INLINE_PACKAGES` in `tools/build-emulator.js`): a workspace
  package does not resolve from a published install.
- **Lattice's host** is `lib/export/office-export.js`: it supplies the fonts from the one
  manifest (`lib/fonts/text-faces.js`), and a pinner built on the HarfBuzz subsetter the
  composed PDF already uses (`lib/core/pdf-compose/font-subset.mjs`), which gained a "keep
  every character" mode (`text` null) for this. A reader of an editable file types words the
  slide never used, so the face cannot be subset.

## 5. What the reader and writer work around

Each was found by rendering the output in LibreOffice and looking, and each has a test.

1. **LibreOffice ignores the page size without `<office:styles>`.** A `styles.xml` with only
   automatic and master styles opens at LibreOffice's default 28 × 15.75 cm page, and every
   box lands too large. An empty `<office:styles/>` is enough. (`odp.test.js`)
2. **A variable font draws at its default weight.** The shipped woff2 are variable; embedded
   as-is, bold Playfair drew at 400. Each face is pinned to one weight first.
3. **LibreOffice puts all leading above the text.** CSS splits a line's spare height evenly
   above and below the glyphs; LibreOffice's fixed line spacing puts it all above, so a box
   placed at the browser's glyph top draws low by half the leading (6px for 28px Outfit on
   a 47.6px pitch). Boxes are placed from the browser's baseline, using the face's own
   metrics. (`fonts-layout.test.js`)
4. **Translucent, letter-spaced text is clipped.** A run with `loext:opacity` and
   `fo:letter-spacing` is clipped at its un-spaced width ("EVERY SLIDE … TEXT A"). The reader
   blends translucent text over the solid background behind it, and the writer uses that
   color. (`calco-reader.test.js`, `odp.test.js`)
5. **Code ligatures come back.** JetBrains Mono's `calt` turns `<!--` into an arrow unless
   the embedded face drops it. A face drops its ligature features when any run in it had
   ligatures off, as code does. (`fonts-layout.test.js`)
6. **Chrome re-adds `style=""` after a restore.** Chrome writes CSSOM changes back to the
   `style` attribute lazily, so a `removeAttribute('style')` straight after one comes back as
   an empty attribute. The restore reads the attribute first. (`calco-reader.test.js`)

**How text is hidden, and the two designs that failed first.** Hiding with
`color: transparent` alone erases what is not text: a code pill whose background mixes
`currentColor`, an SVG icon filled with it, a slide number drawn by `::after`. The first
spike used the CSS Custom Highlight API, which is clean in a headless browser and invisible
to the Studio's html-to-image capture. The second design FROZE every `currentColor`-derived
color and then made the text-bearing elements transparent; it passed every CLI check and
failed on the real Studio, because html-to-image clones neither `::marker` nor document
stylesheets, so bullets and pseudo-element labels inherited the transparent color. The
shipped design WRAPS each text node it read in an inline `<calco-hide>` that is itself
transparent, so no element's own color changes; it then measures every word again, and if a
wrapper moved anything (a `> *` or `:first-child` selector) it unwraps and falls back to the
freeze. Both paths restore the DOM byte for byte.

## 5a. What the adversarial review changed

The red team, a Munger inversion and an independent checker reviewed the first cut
(commit 2fef869); a second independent checker reviewed the font embedding and the hide
rewrite that came after, and wider decks rendered in LibreOffice 26.8 found two more. Every
finding below was reproduced, fixed and given a test:

| Finding | Fix |
|---|---|
| `--editable` crashed in the PUBLISHED CLI bundle (`decompress is not a function`) | `font-subset.mjs` unwraps esbuild's CJS default import; a test runs the bundle |
| Every `.odp` past ~60 slides died at the 90 s render watchdog (one guard round the whole loop) | the watchdog guards each slide, as the raster loop does |
| A line pushed right by a `::before` marker (agendas, counters) was drawn on the marker | a left-aligned box starts at its earliest line; later lines get a SPACER |
| Text after a padded inline pill overlapped the pill | a gap wider than a space becomes a spacer: a 2px no-break space whose letter-spacing is the gap |
| `<b>a</b> <i>b</i>` lost its space | whitespace-only nodes carry the separator to the next word |
| A plain `# Title` slide never made its heading editable (its glyph box overhangs the clipping stage) | the vertical clip test allows a quarter of the glyph box |
| Blank lines in code were dropped, and the pitch was averaged over them | the pitch is the smallest line step; blank lines go back in as empty lines |
| Soft-wrapped `pre-wrap` code sat on its first line; RTL never split into lines | preformatted words keep their spaces; the wrap test reads the direction |
| Text hidden by `filter`, `mask`, `clip`, `clip-path`, or stroked, became visible editable text | those subtrees stay in the picture |
| A quote or control character in a font name or text broke the `.pptx` XML | escaped / stripped before PptxGenJS |
| A restricted-license font would be embedded by a non-Lattice host | `fsType` bit 1 refuses it (`embeddingAllowed`); Lattice's faces are all OFL |
| A letter-spaced translucent eyebrow over a gradient lost its last letters in LibreOffice ("THE PREMI") | LibreOffice clips letter-spaced text drawn with opacity; such text is flattened over the gradient's base color (never over a `url()` image) |
| The gap after a small padded code chip collapsed | at a style boundary a 1px difference already makes a spacer |
| A `.pptx` run whose exact face was not embedded (CFF, a failed fetch) named a renamed family nobody had, and lost its bold | `planEmbedding` maps only exact, embeddable faces; every other run names its family with bold at 600+ |
| Two weights that round to one name ("Outfit Bold" for 700 and 720) were listed twice | names are unique; the second keeps its number ("Outfit 720") |
| A renamed face dropped its copyright and the names STAT points at | the rename replaces only the IDs it owns (1–6, 16, 17, 21, 22, 25) |
| A face `toEot` could not wrap failed the whole export | `canEmbedAsEot` checks first; that face is named instead. Bitmap-only fsType is refused too |
| A taller inline in prose became a blank line inside the paragraph | blank lines are inserted for preformatted text only |
| A wrapper flipped `:first-child` and changed paint without moving a word | the hide also compares the paint of the parents and siblings, and falls back to the color freeze |
| PowerPoint would re-wrap a line set in a wider substitute font | `.pptx` boxes do not wrap, and the fonts are now embedded (§6) |

Recorded, not fixed: PowerPoint itself (§6), the AGPL license for a library meant for
anyone (the owner's call), the `types` entry pointing at TypeScript source (as every sibling
does), and the Studio's CSS counters rendering as `0` in BOTH the picture and the editable
export, a pre-existing html-to-image limit (logged in `followups.d/`).

What the reader deliberately leaves in the picture: SVG and MathML, `::before`/`::after`
text, rotated or vertical text, transparent (gradient) text, and any paragraph with a word
cut by a clip, an ellipsized footer among them. A box cannot reproduce a cut word.

## 6. PowerPoint: what is and is not verified

The editable `.pptx` places the same boxes through PptxGenJS, then Calco adds the fonts to
the package itself (`embedPptxFonts`, `pptx.ts`; `sfnt.ts`):

- **Embedded OpenType, one family per weight.** PowerPoint's font model has four slots per
  family (regular, bold, italic, bold italic), so Outfit 300, 500 and 600 have nowhere to go.
  `renameFace` gives each pinned face its own family ("Outfit SemiBold"), as that family's
  regular face, and its runs ask for it by that name with no synthetic bold or italic.
  `toEot` wraps it as EOT 2.1, uncompressed and not XOR-ed, in `ppt/fonts/*.fntdata`, listed
  in `p:embeddedFontLst` with `embedTrueTypeFonts="1"`, related by the `font` relationship
  and typed `application/x-fontdata`. This is the shape PowerPoint itself writes.
- **What is still named, not embedded:** a face with CFF outlines (Lattice ships none), and
  any `writePptx` call without JSZip. Those runs fall back to the family plus bold at 600+.
- `text-transform` is baked into the text.

Checked: libeot (what LibreOffice links) decodes all nine `.fntdata` of
`examples/muted-tier-and-syntax.md` with the right family names. LibreOffice 24.2 does not
import PPTX embedded fonts at all; **LibreOffice 26.8.1 does**, and renders that deck in the
embedded faces (`pdffonts` lists PlayfairDisplayBold, OutfitLight, OutfitMedium,
JetBrainsMono and the rest). Per slide, 1.37–2.89% of pixels differ from the picture export,
and the slides match side by side. A baseline check deck (hairlines drawn by Chrome under
each baseline, text boxes over them) puts LibreOffice's body text within about 1px of
Chrome's and code within about 2.5px.

**UNVERIFIED in PowerPoint itself** (HARD RULE #23): no PowerPoint runs here. PowerPoint's
rule for "exactly" line spacing is not published, so its baselines may sit a few pixels
from LibreOffice's. The baseline check deck is the one-look test: open it in PowerPoint and
see whether the letters stand on the red lines (`followups.d/2556-p2-verify-editable-pptx-in-powerpoint.md`).

## 7. How it is verified

- `test/unit/calco/` — the writers' package rules and styles, font metrics, placement maths,
  and serialization of the built reader (31 tests).
- `test/integration/export/calco-reader.test.js` — the reader in Chromium against a fixture
  holding every case in §5.
- `test/integration/export/export-formats.test.js` — the CLI end to end for `.odp`,
  `--editable` `.odp` and `.pptx`, and the warning on other formats.
- The measurements in §3, rendered by LibreOffice and compared with Chrome.

## 8. What this does not do

- No native charts, diagrams or equations; no reflow; no editable speaker-note formatting.
- The `/calco` page and the brand mark are later commits in this PR.
- No `.lattice` source inside an `.odp` (the re-openable switch is PowerPoint and PDF only).
