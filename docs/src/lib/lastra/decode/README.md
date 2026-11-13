## Decode

PNG and JPEG bytes to RGBA pixels, in pure JavaScript: no dependencies, no DOM, the same answer in Node,
every browser and a worker. The only platform API is `DecompressionStream('deflate')`, which PNG's
inflate runs through (Node 18+, every current browser).

```ts
// Until the package entry re-exports it, import from this folder: './decode/index.js'.
import { decodeJpeg, decodePng, isLastraError } from './decode/index.js';

const controller = new AbortController();
try {
  const { width, height, data, icc } = await decodeJpeg(bytes, { maxPixels: 40_000_000, signal: controller.signal });
  // data: Uint8ClampedArray, width * height * 4 bytes, RGBA, alpha not premultiplied, values as stored.
  // icc: the embedded ICC profile (not applied), or null. A host that wants color management hands a
  // file with a profile to a color-managed decoder instead.
} catch (e) {
  if (isLastraError(e)) console.warn(e.code); // 'truncated' | 'bad-marker' | 'too-large' | 'unsupported' | 'crc' | 'corrupt'
  else throw e; // the signal's reason, a TypeError for a wrong argument, or a lastra bug
}
```

`decodeJpeg` and `decodePng` are async: they hand the thread back to the event loop between slices of
work and reject with `signal.reason` once the signal aborts. `decodeJpegSync` runs the same JPEG decode
to the end without yielding.

### What decodes

| Format | Decodes | Refuses (`code`) |
|---|---|---|
| PNG | color types 0, 2, 3, 4, 6 at every legal bit depth (1, 2, 4, 8, 16); `PLTE` + `tRNS`; gray and RGB `tRNS` keys; Adam7; split `IDAT`; APNG's default image | no signature, a malformed chunk header, chunks out of order (`bad-marker`); the file ends mid-chunk or before the image data is complete (`truncated`); a bad CRC on IHDR, PLTE, IDAT or IEND (`crc`); an impossible header, a bad filter byte, image data that fails to inflate before the image is complete (`corrupt`); an unknown critical chunk, interlace method 2 (`unsupported`) |
| JPEG | baseline, extended and progressive Huffman frames (SOF0, SOF1, SOF2); spectral selection and successive approximation; restart intervals; 1, 3 or 4 components; any whole-number chroma sampling (4:4:4, 4:2:2, 4:2:0, 4:4:0, 4:1:1, ...) at any size; Adobe APP14 RGB, YCbCr, CMYK and YCCK; files with no `DHT` (Motion-JPEG) through the Annex K tables; the primary picture of an MPF or Ultra HDR file | arithmetic coding, lossless, hierarchical, 12-bit, a height set by DNL, 2 or more than 4 components, a fractional sampling ratio (`unsupported`); the file ends before any scan is whole (`truncated`); a malformed or misplaced segment (`bad-marker`); an over-full Huffman table a scan uses, a component in two sequential scans, a table a scan needs that was never defined, a frame with no scan (`corrupt`); more than 500 scans, or more than 32 visits per coefficient block (`too-large`) |

### Which pixels

- **JPEG follows libjpeg-turbo's C code** (3.1): the accurate integer IDCT, fancy upsampling, the YCbCr
  tables, block smoothing for progressive files that stop before their last refinements, and libjpeg's
  handling of damaged scans (a bad Huffman code consumes 17 bits and decodes as 0; data that runs out
  leaves the rest of the segment alone; restart markers resynchronize by `jpeg_resync_to_restart`'s
  rules). Measured: identical to Pillow's libjpeg-turbo on every valid file of the corpus, and identical
  to libjpeg-turbo's C build on every one of 951 damaged and partial files the review built. The SIMD
  builds browsers and Pillow ship differ from the C code where a block's IDCT leaves 16 bits or the
  range-limit window, which happens only in damaged or crafted files (93 of the 951; none a real encoder
  wrote); there lastra matches the C build, not the browsers. Safari on Apple platforms decodes through
  ImageIO and is not measured.
- **A JPEG that ends with no EOI** decodes when at least one scan was read whole, as libjpeg reads the end
  of the file as EOI; otherwise it is `truncated`. Pillow refuses every such file; Chromium refuses it,
  WebKit shows nothing, Firefox shows the scan-boundary case as lastra does. lastra decodes it so a host
  does not ship a full-size original because a cut photo was refused.
- **CMYK and YCCK decode** as Adobe-inverted CMYK to RGB with no color management,
  `R = K - K x C / 255` with Pillow's rounding.
- **PNG is lossless**: the corpus matches its ground truth exactly. It follows libpng (Firefox, WebKit):
  16-bit samples keep their high byte (Firefox rounds instead, at most 1 apart); a palette index past
  `PLTE` is opaque black (Chromium paints a palette color); a misplaced, repeated or wrongly sized `tRNS`
  is ignored and a gray or RGB key is masked to the bit depth (Chromium applies the wrongly sized ones);
  image data past what the header needs (an extra row, bytes after the zlib stream, the Adler-32) is not
  read. Rows are unfiltered as they inflate, so the inflated image is never held whole.
- **No color management.** Samples come back as stored. `icc` returns the embedded profile (JPEG APP2,
  reassembled across segments; PNG `iCCP`, inflated, dropped past 16 MB or when it fails to inflate), and
  a PNG's `tags` say which of `iCCP`, `sRGB`, `gAMA`, `cHRM` and `cICP` it carries. Measured on Display P3
  and Adobe RGB files: the browser that color-manages (Chromium) differs from lastra by a mean delta E of
  5 to 7 (largest 14 to 20), which is the gap a host closes by checking `icc` and `tags`.
- **EXIF orientation is not applied.** The reader reports it; `applyOrientation(image, orientation)`
  returns a new upright image (1 to 8, Pillow's `exif_transpose` mapping). Browsers now turn by EXIF
  orientation even under `imageOrientation: 'none'`.

### Hostile input

- `maxPixels` (default 100,000,000) and `maxBytes` (default 256 MiB) are checked before anything is
  allocated. JPEG allocates its coefficients at the first scan and PNG its pixels at the first row, so a
  header with nothing behind it costs no memory.
- JPEG work is bounded per frame: at most 500 scans (libjpeg-turbo's fuzzer uses the same limit) and at
  most 32 visits per coefficient block over all scans (libjpeg's own progression needs 6). A scan whose
  data ran out at a marker no restart can accept stops at once. Huffman lookups are built when a scan
  first uses a table.
- PNG inflate stops at the size the header implies, so a decompression bomb costs one input chunk of
  output.
- `opts.meter` (`{ steps, limit? }`) counts work: a step per segment, table, decoded block, restart, IDCT
  block, 64 output pixels, PNG chunk, scanline and 4 KB inflated. Past `limit` it refuses (`too-large`).
  The fuzz tests hold every case under a limit proven from the loops and under twice the measured highest
  steps per unit of declared work.

### Speed

A 12-megapixel decode (4000 x 3000) on the 4-core sandbox, Node 22: baseline 4:2:0 JPEG about 0.3 to
0.4 s, progressive about 0.4 to 0.6 s, an RGB PNG about 0.9 s; about 5x Pillow's SIMD libjpeg-turbo and
1.6 to 3x a browser's `createImageBitmap` plus `getImageData` for JPEG (`tools/lastra-corpus/bench.mjs`;
the table is in the design note §4).

### The corpus and the oracle

`tools/lastra-corpus/generate.py` draws every fixture from a seed (and builds its own ICC profiles) and
records the oracle in `fixtures/expected.json`: Pillow's decode for JPEG (with EOI appended for the cut
files, and libjpeg-turbo's C build for the two overflow files), the encoder's ground truth for PNG.
`tools/lastra-corpus/browser-compare.mjs` measures the distance to Chromium, Firefox and WebKit and pins
the known differences. The tests read only the committed files.

### Notices

The JPEG IDCT, upsampling, color tables, block smoothing and Huffman decoding are TypeScript
re-expressions of libjpeg-turbo. This software is based in part on the work of the Independent JPEG
Group. The IJG README and libjpeg-turbo's license file sit beside this file, unaltered
(`README.ijg.txt`, `LICENSE.libjpeg-turbo.md`).
