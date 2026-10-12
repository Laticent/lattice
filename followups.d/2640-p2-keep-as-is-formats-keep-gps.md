---
origin: 2640
priority: P2
recorded: 2026-10-12
area: website
severity: medium
swimlane: engineering/decisions/2026-10-12-library-media-assets.md
source: https://github.com/Laticent/lattice/pull/2640
---

# AVIF, WebP, PNG and GIF photos keep their embedded metadata, GPS included, into every export

why now   — The importer re-encodes only JPEG-like files, which removes a phone's location. AVIF and GIF are
            stored as given and PNG and WebP are re-encoded only when oversized, so an EXIF or XMP block in
            one (Lightroom and Photoshop can write location into AVIF and WebP) rides into every webpage,
            PDF and PowerPoint export, because exports embed the stored bytes. The red team on PR #2640 found
            this; how common it is in practice is unmeasured.
where     — `docs/src/components/studio/media-import.ts` `planImage`. Options: always re-encode PNG (lossless,
            strips metadata) and WebP/AVIF to a high-quality lossless or JPEG form; or strip the EXIF/XMP
            chunks from the bytes without re-encoding.
done when — A WebP and an AVIF carrying a GPS tag are imported in a real browser and the stored bytes contain
            no GPS tag (checked by reading the stored blob), with the policy and its cost written in the
            design note §3.
