---
status: in-progress
summary: A .pptx or .odp slide picture is a JPEG when the slide is a photograph and that is under 70% of the PNG, and a PNG otherwise. A 35-slide photo deck went from 76.6 MB to 15 MB. Measured on the owner's deck; the CLI export and the real Studio export were both run, and the owner's own Studio file was not.
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
70% is deliberate: a 10% saving is not worth a lossy picture. A flat slide is never touched, so
its bytes do not change. A capture that keeps a rounded corner as transparency (`.png` output)
is never a JPEG, which would paint the corner black. The writers read the file signature
(`imageMime`) and name the part `.jpg`/`image/jpeg` or `.png`/`image/png`.

## Results on the owner's deck (CLI, same machine)

| Export | Before | After | Time |
|---|---:|---:|---|
| `.pptx` plain | 76.6 MB | 15 MB | 44 s → 53 s |
| `.pptx --editable` (main) | — | 11 MB | 55 s |
| `.odp` | — | 15 MB | 53 s |

The time rises by about a quarter on this deck because each photo slide is photographed twice
(PNG first, then the JPEG). A flat slide is photographed once.

The editable `.pptx` on the in-flight shared-backgrounds branch measured 68 MB before this
change, 63.9 MB of it in 21 opaque pictures: the photos are the slides' layout backgrounds there.
That branch needs the same rule for its background pictures (`Background.image`).

## Checked, and not checked

- Unit tests: the helpers, both writers' part names and media types, and the CLI's choice with
  a fake browser handle (a flat slide shoots once; a photo shoots twice; a transparent capture
  never becomes a JPEG).
- **The real Studio**: `docs/e2e/pptx-export-photo-size.spec.ts` drives the Studio's PowerPoint
  export with a photo slide and a flat slide and reads the `.pptx` back. It fails on the old
  code (`image-1-1.png`) and passes now.
- **Not run**: the owner's own `.lattice` through the Studio. The CLI ran its content.
- **Not opened** in desktop PowerPoint, Google Slides or Collabora.
