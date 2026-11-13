---
status: proposed
summary: Design for lastra, a zero-dependency image library (read, clean, decode, resize, encode, decide) that replaces about fifteen scattered image helpers in lib/core, the Studio and Calco. Owner rulings 2026-11-13 — own pure-JS decoders, internal now in the publishable shape, built before the export-size fixes D1 to D3. Proposes five slices, each byte-identical on every export until the decoder slice, and the review each one owes.
---

# lastra: one image library (2026-11-13)

**Status: proposed.** The owner asked for "a standard zero dependency general library that can be used in
other domains too", for stability first. Three forks were settled on 2026-11-13 (§7); the name and the open
questions in §8 are not.

## 1. Why

The owner's photo decks exported large again, and the investigation (this session, written up in the
follow-ups PR) found no new break: three size leaks that were each found before, written down, and left.
The pattern under them is that image work has no home. Each export path grew its own helpers, and each past
size regression lived in one of them:

- **2026-10-21**: PowerPoint and LibreOffice wrote every slide as PNG (`slide-picture.js`).
- **2026-10-25**: PDF and the player embedded every photo as added (`pdf-compose`, `player-images.mjs`).
- **2026-11-03**: three WebKit-only causes, one of them a regex in ONE of the four header readers
  (`2026-11-03-pictures-at-drawn-size.md`).

## 2. What exists (read 2026-11-13)

| Job | Today | Importers | Problem |
|---|---|---:|---|
| Type, size, alpha, rotation from the header | `lib/core/image-policy.js` `readImageInfo`, `pdf-compose/compose.mjs` `sniffImage`, Studio `media-store.ts` `sniffImageMime`, `lib/core/image-dimensions.js` | 13, 1, 30, 6 | four readers of one fact; they can disagree |
| EXIF orientation | `lib/core/exif-orientation.mjs` and a copy inside `image-policy.js` | 3 | the copy exists because `image-policy.js` must be a require-free leaf for the docs dev server |
| Metadata scrub (JPEG, PNG, WebP, GIF) | Studio only, `media-scrub.ts` | 3 | the CLI cannot scrub, so it cannot pack a camera photo into a `.lattice` without its GPS |
| JPEG encode | `lib/core/jpeg-encode.mjs` (ours: Safari wrote 1.5 to 2.2x its bytes) | 5 | none; it moves |
| PNG write, PNG IDAT read | `lib/core/canvas-encode.mjs`, `png-idat.mjs` | 3, 2 | tied to the slide camera's module |
| Resize | `lib/core/lanczos.mjs` | 2 | none; it moves |
| Recode plan | `image-policy.js` `planRecode`, `acceptRecode`; `image-recode.mjs` | 13, 4 | general thresholds mixed with Lattice's `images:` words |
| Decode | the host: canvas in the Studio, a Chrome page from the CLI (`lib/export/chrome-recode.js`) | | the CLI needs a browser to resize a photo; engines decode differently |

## 3. Scope

**In lastra.** Pure functions, bytes in and bytes out, the same in Node, a browser and a worker, no DOM:

- **read**: format, width, height, alpha hint, orientation, for PNG, JPEG, GIF, WebP, AVIF and SVG, from
  the header alone. One reader replaces the four.
- **clean**: strip metadata by an allow-list of blocks per format (the red-team lesson in
  `2026-10-12-library-media-assets.md` §3), keeping an orientation-only EXIF.
- **decode**: JPEG (baseline and progressive, 4:4:4, 4:2:2, 4:2:0, grayscale) and PNG (all color types and
  bit depths, Adam7) to RGBA. PNG inflate uses the platform's `DecompressionStream`, which Node 18+ and every
  target browser have; that is a platform API, not a dependency, and the PNG writer already relies on its
  twin.
- **resize**: Lanczos-3, as today.
- **encode**: our JPEG encoder and PNG writer, as today.
- **decide**: `planRecode` and `acceptRecode` with every threshold passed in.

**Not in lastra.** Anything about a slide: the slide camera, the placed-picture rule, the image layout's
aspect buckets, Calco's "is this slide a photograph", the `images:` front-matter words, the panels. Those
stay in Lattice and call lastra.

**Out of scope for decode.** WebP, AVIF, GIF and HEIC decoding. They are read and cleaned, never decoded; a
recode of one stays with the host, as today. Revisit only with a measured need.

## 4. Why our own decoders (the owner's ruling, and what it buys)

- **The CLI drops its browser for pictures.** Today a resize from the CLI opens a Chrome page
  (`chrome-recode.js`). With a decoder, shrinking and cleaning a photo is plain Node.
- **The same pixels on every engine.** Engines differ in chroma upsampling and IDCT rounding, which is
  part of why the 2026-11-03 note had to align pictures per engine. One decoder gives one answer.
- **The cost.** About 1,000 to 1,500 lines for JPEG, and a corpus to prove them. It is the novel part of
  this note, so it gets the adversarial trio (§6).

The oracle for each decoder is a reference decode of a licensed corpus (libjpeg-turbo and libpng through
`python3` + PIL, run by a tool, not shipped), with a PSNR floor per file and an exact match where the
format
is lossless. Hostile inputs (truncated, oversized dimensions, a Huffman table that never terminates, a
decompression bomb) must refuse with a typed error inside a pixel and time budget, never hang.

## 5. Slices

Each slice is its own commit series. Slices 1 to 3 change no exported byte, proven by exporting the six
galleries and two photo decks before and after and comparing SHA-256 (the photo decks from a licensed
corpus, never the owner's).

1. **The fenced package.** `docs/src/lib/lastra` with `package.json`, a builder, a boundary gate
   (`checkLastraBoundary`) and zero dependencies. Move `read` (one reader, all four callers moved, the
   duplicate EXIF parser deleted), `resize`, `encode` and `decide` in. `image-policy.js` keeps the Lattice
   words and calls lastra.
2. **Clean moves out of the Studio.** `media-scrub.ts` becomes lastra `clean`; the Studio calls it. The CLI
   gains it, which unblocks packing `assets/` photos into a CLI-written `.lattice` and `--reopenable`
   (held back in the CLI `.lattice` PR for exactly this).
3. **PNG decode.**
4. **JPEG decode**, behind the trio.
5. **Hosts adopt decode.** The CLI's recode leaves Chrome; the Studio's recode moves into its worker pool
   (`followups.d/3148-p4-photo-resample-in-a-worker.md`). This slice changes picture bytes, so it owes the
   owner's export sign-off (dark and light, both photo decks).

Then D1 to D3 from the export-size investigation build on it.

## 6. Review tier and budget

- Slices 1 to 3: maker-checker (one `checker`), because they move code every export runs.
- Slice 4: the adversarial trio (red team, inversion, checker) on the decoders as they will ship. Novel
  code that parses untrusted bytes.
- Session count so far: two agents (the CLI `.lattice` builder and its checker). This note adds one checker
  per slice for 1 to 3 and three for slice 4: seven, nine in the session. Under the ~10 that needs an OK.

## 7. Owner rulings (2026-11-13)

1. **Decoders: our own, pure JavaScript.** Not passed in by the host.
2. **Internal now, in the publishable shape.** Fence, package and zero dependencies from slice 1. Publishing
   waits for its own ruling, the trio over the whole library and the license call
   (`2026-10-08-library-audit.md` §3).
3. **Order: the library before D1 to D3.**

## 8. Open

- **The name.** `lastra` is a photographic plate. Alternatives: `scatto` (a shot), `pellicola` (film).
- **The corpus.** Which licensed photo set (public-domain or CC0), its size, and whether it lives in the
  repo or is fetched by the corpus tool.
- **Speed on a phone.** A JS JPEG decode of a 12-megapixel photo against `createImageBitmap`, measured in
  WebKit before slice 5 makes it the Studio's default.
