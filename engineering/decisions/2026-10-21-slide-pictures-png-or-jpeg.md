---
status: in-progress
summary: A .pptx or .odp slide picture is a JPEG when the slide is continuous tone (a photograph or a soft wash) and that is under 70% of the PNG, and a PNG otherwise, and the cheap shot is taken first. A 35-slide photo deck went from 76.6 MB to 16 MB and from 44 s to 15.5 s. Measured on the owner's deck; the CLI export and the real Studio export were both run, and the owner's own Studio file was not.
---

# Slide pictures: PNG or JPEG (2026-10-21)

**The question.** The owner asked why a Studio export of a 35-slide deck of mostly image slides
is so large. Their source `.lattice` is 6.9 MB (19 photographs of 0.2 to 0.5 MB).

**Why.** Every `.pptx` and `.odp` slide is stored as one picture, rasterized at 2× (2560 × 1440
for an `hd` deck), and always as PNG. PNG is lossless, so a photograph does not compress:
76.6 MB for the 35 slides in the CLI's `.pptx`, 5.9 MB for the largest. The Studio uses the same
recipe (`rasterizeSectionToPngBytes`, `exportOffice`). Its PDF export already had a JPEG option
(`pageFormat: 'jpeg'`, quality 0.95); PowerPoint and LibreOffice had none.

## What was measured

On the owner's deck (35 slides), the same 35 slide pictures re-encoded:

| Encoding | Size |
|---|---:|
| PNG (before) | 76.6 MB |
| PNG at 1920 × 1080 (a smaller PNG) | 55.0 MB |
| JPEG q95 | 23.5 MB |
| **JPEG q92, or the PNG where it is smaller** | **15.1 MB** |
| JPEG q90 | 14.0 MB |
| JPEG q85 | 11.5 MB |

Every one of the 35 slides was smaller as a JPEG; none was smaller as a PNG. Shrinking the PNG
only saves 28% and loses sharpness, so it was not an option. q92 sits between q90 and q95 and
keeps text beside a photo clean.

## The rule

`docs/src/lib/calco/picture.ts` owns it. Keep the PNG when it is 600 KB or less (a flat slide).
Otherwise also encode a JPEG at quality 92, and keep it when it is under 70% of the PNG. The
70% is deliberate: a 10% saving is not worth a lossy picture. A capture that keeps a rounded
corner as transparency (`.png` output) is never a JPEG, which would paint the corner black. The
writers read the file signature (`imageMime`) and name the part `.jpg`/`image/jpeg` or
`.png`/`image/png`.

## The order of the two shots is the cost

The first version shot the PNG, then the JPEG, and compared. On the owner's deck that was
wasteful: **a PNG screenshot of a photograph took 1.2 s on average (42 s of the 57 s export) and
the JPEG took 0.36 s**, and the PNG was thrown away on every slide. Raster time was 55 of 57 s;
browser start, render and file assembly were about 3 s. So the page now says which order to use,
before any shot (`isContinuousTone`, a function that runs in the page):

- **Continuous tone** (raster images, or smooth gradients such as a finish's wash, cover a quarter
  of the slide): JPEG first. Keep it when it is 100 KB or more; the PNG is never shot. Below that
  the slide is nearly flat, so the PNG is shot too and the sizes decide.
- **Anything else**: PNG first, as before; a JPEG is tried only if the PNG is over 600 KB.

A wrong guess costs one extra shot, never a worse file. The gradient case matters: in the
owner's deck, 16 of 35 slides are text on a soft `nimbus` wash, 1.0 to 1.3 MB as PNG and 160 to
220 KB as JPEG, and the first predictor (images only) missed them. Fast PNG mode
(`optimizeForSpeed`) was tried and rejected: 28 s against 41 s, and files 1.7 times larger.

## Results

CLI, the owner's 35-slide deck, same machine (plain `.pptx`):

| Version | Time | Size |
|---|---:|---:|
| PNG always (before) | 44 s | 76.6 MB |
| PNG then JPEG, compare | 57 s | 15 MB |
| **JPEG first for continuous tone** | **15.5 s** | **16 MB** |

Other CLI decks (flat slides): `cards-stats-actors-kpi` and `chart-finish` stay all PNG;
`accent-finishes` and `card-tags` turn 3 and 1 gradient title slides into JPEG; `finish-backdrops`
(a wash on every slide) turns 11 of 15 into JPEG, 3.3 MB for the file.

**The real Studio**, 8 photo slides to PowerPoint, click to download, two runs each: **`main` 7.3 and
7.5 s, 38.2 MB; this change 5.3 and 5.4 s, 8.9 MB.** The Studio's own bottleneck is the clone and
draw on the main thread (html-to-image), which this does not touch; its file assembly already runs in a
worker (`pptx-assemble-worker.js`).

Picture quality, one text-over-photo slide at full resolution against a PNG of the same render:
mean difference 1.5 on a 0 to 255 scale, 99.9% of pixels within 13 levels; the two are not
distinguishable by eye.

The editable `.pptx` on the in-flight shared-backgrounds branch measured 68 MB before this
change, 63.9 MB of it in 21 opaque pictures: the photos are the slides' layout backgrounds there.
That branch needs the same rule for its background pictures (`Background.image`).

## What is still a screenshot, and what could replace it

A photo slide is a screenshot because Calco's model is one picture of everything it cannot turn into
a native object, and the reader leaves images in that picture on purpose. The better design for an
image slide is to lift the photo out and place the original file (0.2 to 0.5 MB, never re-encoded)
as a real, cropped picture object, and photograph only what is left. That would make the file
smaller still and lossless, and it is where a photo background could become a locked layout
background without a second copy. It is a reader change, not a format switch, and is not done.

Parallel capture is the other lever: the CLI shoots one slide at a time in one tab, and a second
and third tab opened on the finished HTML could shoot concurrently. Not measured, so not claimed.

## Checked, and not checked

- Unit tests: the helpers, both writers' part names and media types, and the CLI's choice with
  a fake browser handle (a flat slide shoots once; a photo shoots twice; a transparent capture
  never becomes a JPEG).
- **The real Studio**: `docs/e2e/pptx-export-photo-size.spec.ts` drives the Studio's PowerPoint
  export with a photo slide and a flat slide and reads the `.pptx` back. It fails on the old
  code (`image-1-1.png`) and passes now.
- `test/integration/export/calco-tone.test.js` runs `isContinuousTone` in a real Chromium: a photo
  as a background or an image, and a wash, say yes; flat text, a thin gradient rule, a thumbnail and
  vector images say no.
- **Not run**: the owner's own `.lattice` through the Studio. The CLI ran its content.
- **Not opened** in desktop PowerPoint, Google Slides or Collabora.
