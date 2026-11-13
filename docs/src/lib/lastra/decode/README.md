## Decode

PNG and JPEG bytes to RGBA pixels, in pure JavaScript: no dependencies, no DOM, no platform API, the same
answer in Node, every browser and a worker. PNG's zlib inflate is lastra's own (`inflate.ts`).

```ts
import { decodeJpeg, decodePng, isLastraError } from '@laticent/lastra';

const controller = new AbortController();
try {
  const { width, height, data, icc, colorSpace } = await decodeJpeg(bytes, { maxPixels: 40_000_000, signal: controller.signal });
  // data: Uint8ClampedArray, width * height * 4 bytes, RGBA, alpha not premultiplied, values as stored.
  // icc: the embedded ICC profile (not applied), or null. A host that wants color management hands a
  // file with a profile, or a CMYK one (colorSpace 'cmyk' or 'ycck'), to a color-managed decoder.
} catch (e) {
  if (isLastraError(e)) console.warn(e.code); // 'truncated' | 'bad-marker' | 'too-large' | 'unsupported' | 'crc' | 'corrupt'
  else throw e; // the signal's reason, a TypeError for a wrong argument, or a lastra bug
}
```

`decodeJpeg` and `decodePng` are async: they give the event loop a turn every few milliseconds (8 to
12 ms at the longest on a 12 MP file, measured on a shared machine) and reject with `signal.reason` once
the signal aborts. `decodeJpegSync` and `decodePngSync` run the same steps to the end without yielding.
`LastraError` is the library's one error type.

### What decodes

| Format | Decodes | Refuses (`code`) |
|---|---|---|
| PNG | color types 0, 2, 3, 4, 6 at every legal bit depth (1, 2, 4, 8, 16); `PLTE` + `tRNS`; gray and RGB `tRNS` keys; Adam7; IDAT split into any number of chunks (empty ones skipped); APNG's default image | no signature, a malformed chunk header, chunks out of order (`bad-marker`); the file or the zlib stream ends before the image is complete (`truncated`); a bad CRC on IHDR, PLTE, IDAT or IEND (`crc`); an impossible header, a bad filter byte, a zlib stream zlib itself would refuse (`corrupt`); an unknown critical chunk, interlace method 2 (`unsupported`); more than 2^20 chunks (`too-large`) |
| JPEG | baseline, extended and progressive Huffman frames (SOF0, SOF1, SOF2); spectral selection and successive approximation; restart intervals; 1, 3 or 4 components; any whole-number chroma sampling (4:4:4, 4:2:2, 4:2:0, 4:4:0, 4:1:1, ...) at any size; Adobe APP14 RGB, YCbCr, CMYK and YCCK; a sequential frame with no `DHT` (Motion-JPEG) through the Annex K tables; the primary picture of an MPF or Ultra HDR file | arithmetic coding, lossless, hierarchical, 12-bit, a height set by DNL, 2 or more than 4 components, a fractional sampling ratio (`unsupported`); a file cut short (see below) (`truncated`); a malformed or misplaced segment (`bad-marker`); a Huffman table a scan names that is over-full or never defined, a component in two sequential scans, a frame with no scan, a progressive DC sum past 32 bits (`corrupt`); more than 500 scans, or more than 1,024 coefficients decoded per block over all scans (`too-large`) |

### Which pixels

- **JPEG follows libjpeg-turbo's C code** (3.1): the accurate integer IDCT, fancy upsampling, the YCbCr
  tables, block smoothing for progressive files that stop before their last refinements, and libjpeg's
  handling of damaged scans (a bad Huffman code consumes 17 bits and decodes as 0; data that runs out
  leaves the rest of the segment alone; restart markers resynchronize by `jpeg_resync_to_restart`'s
  rules). Measured: identical to Pillow's libjpeg-turbo on every valid file of the corpus (including
  stock `jpegtran -scans` files of 64 to 97 scans), and identical to libjpeg-turbo's C build on every one
  of the review's 951 damaged and partial files. The SIMD builds browsers and Pillow ship differ from the
  C code where a block's IDCT leaves 16 bits or the range-limit window, which happens only in damaged or
  crafted files; there lastra matches the C build, not the browsers. Safari on Apple platforms decodes
  through ImageIO and is not measured.
- **A JPEG cut short** decodes only when it ends in scan data or between segments after at least one scan
  was read whole, so every pixel has data from a whole scan; it is `truncated` when it ends inside a
  marker segment or before any scan is whole. A cut baseline file (one scan) is therefore always refused,
  and a cut progressive file shows its last whole pass. libjpeg shows whatever it has, Firefox shows both
  kinds partly, Chromium refuses both, WebKit shows nothing and Pillow refuses every cut file.
- **CMYK and YCCK decode** as Adobe-inverted CMYK to RGB with no color management,
  `R = K - K x C / 255` with Pillow's rounding; `colorSpace` says so.
- **PNG is lossless**: the corpus matches its ground truth exactly. It follows libpng (Firefox, WebKit):
  16-bit samples keep their high byte (Firefox rounds instead, at most 1 apart); a palette index past
  `PLTE` is opaque black (Chromium paints a palette color); a misplaced, repeated or wrongly sized `tRNS`
  is ignored and a gray or RGB key is masked to the bit depth (Chromium applies the wrongly sized ones).
- **PNG's inflate is lenient**: it stops as soon as the image is complete. Extra inflated data and bytes
  after the stream are never read, and neither is the Adler-32, as in Chromium. Up to that point it is
  zlib byte for byte, and it refuses what zlib refuses (held to Python's zlib on 83 streams). The engines
  disagree on the checksum: Chromium shows a file with a bad Adler-32 and refuses one with none, Firefox
  refuses the missing one and drops the last rows of the bad one, WebKit drops rows of both. lastra once
  used the platform's `DecompressionStream` and inherited that split; lastra running inside Chromium,
  Firefox and WebKit now matches lastra in Node on every fixture (`browser-compare.mjs` checks it).
- **No color management.** Samples come back as stored. `icc` returns the embedded profile (JPEG APP2,
  reassembled across segments; PNG `iCCP`, inflated, dropped past 16 MB or when it fails to inflate). A
  PNG's `color` gives the `sRGB` intent, `gAMA`, `cHRM` and `cICP` values. Measured on Display P3 and Adobe
  RGB files: the browser that color-manages (Chromium) differs from lastra by a mean delta E of 5 to 7
  (largest 14 to 20), which is the gap a host closes by checking these fields.
- **EXIF orientation is not applied.** The reader reports it; `applyOrientation(image, orientation)`
  returns a new upright image (1 to 8, Pillow's `exif_transpose` mapping). Browsers now turn by EXIF
  orientation even under `imageOrientation: 'none'`.

### Hostile input

- `maxPixels` (default 100,000,000) and `maxBytes` (default 256 MiB) are checked before anything is
  allocated. JPEG allocates its coefficients at the first scan and PNG its pixels at the first row, so a
  header with nothing behind it costs no memory.
- JPEG work is bounded per frame: at most 500 scans (libjpeg-turbo's fuzzer uses the same limit) and at
  most 1,024 coefficients decoded per block over all scans (a legal progression needs at most 896; images
  under 2^16 blocks get 2^26 in all). End-of-band runs over blocks with nothing to refine are skipped in a
  tight loop, and a scan whose data ran out at a marker no restart can accept stops at once. The worst
  file measured at 100 MP costs 4.6 s before it is refused, and an abort ends it within milliseconds.
- PNG reads its IDAT chunks in place, with nothing kept per chunk, and refuses more than 2^20 chunks. The
  inflate stops at the size the header implies, so a decompression bomb costs one window of output.
- `opts.meter` (`{ steps, limit? }`) counts work: a step per segment, table, decoded block plus one per 8
  coefficients of its band, restart, IDCT block, 64 output pixels, PNG chunk, scanline and 4 KB inflated.
  Past `limit` it refuses (`too-large`). The fuzz tests hold every case under a limit proven from the
  loops and under twice the measured highest steps per unit of declared work.

### Speed

A 12-megapixel decode (4000 x 3000) on a shared 4-core sandbox, Node 22: baseline 4:2:0 JPEG about
0.39 s, progressive about 0.55 s, an RGB PNG about 1.2 s. Against a browser's own `createImageBitmap`
plus `getImageData`: about 2 to 3 times as long for JPEG in Chromium, Firefox and WebKit, and 2.6
(WebKit) to 5.8 (Firefox) times for PNG. Pillow's SIMD libjpeg-turbo is about 5 times faster than
lastra (`tools/lastra-corpus/bench.mjs`; the table is in the design note §4).

### The corpus and the oracle

`tools/lastra-corpus/generate.py` draws every fixture from a seed (and builds its own ICC profiles) and
records the oracle in `fixtures/expected.json`: Pillow's decode for JPEG (with EOI appended for the cut
files, and libjpeg-turbo's C build for the two overflow files), the encoder's ground truth for PNG, and
Python's zlib for the inflate streams. `tools/lastra-corpus/browser-compare.mjs` measures the distance to
Chromium, Firefox and WebKit, runs lastra inside each, and pins the known differences. The tests read only
the committed files.

### Notices

The JPEG decoder is a TypeScript re-expression of parts of libjpeg-turbo. This software is based in part
on the work of the Independent JPEG Group. The IJG README and libjpeg-turbo's license file sit beside this
file, unaltered (`README.ijg.txt`, `LICENSE.libjpeg-turbo.md`), and ship with the package.
