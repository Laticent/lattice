---
origin: 2918
priority: P1
recorded: 2026-10-26
area: engine
severity: low
swimlane: engineering/decisions/2026-06-16-lattice-export-format.md §Decision 3 — the round-trip envelope (import *our own* export, losslessly)
source: https://github.com/Laticent/lattice/pull/2918
---

# Put a first-slide thumbnail inside every `.lattice` file

why now   — the owner asked, while testing #2918 on an iPhone, for `.lattice` files to show a
            preview of their first slide in Files, Finder and Explorer. No OS reads an image out of
            a file type it doesn't know: iOS and macOS need an installed app with a thumbnail
            extension for the type, Windows needs a registered thumbnail provider, and Linux needs a
            `.thumbnailer` file. Every one of those readers needs the image to already be in the
            file, so storing it is the first step and it does not wait for the desktop app. Zip
            formats that do this already: `.pptx` (`docProps/thumbnail.jpeg`), `.key`
            (`preview.jpg`), `.odp` (`Thumbnails/thumbnail.png`).
where     — the shared write path, `lib/core/reopenable.js` (`LATTICE_DECK_FILE`,
            `LATTICE_MANIFEST_FILE`, the zip assembly), which the Studio's
            `docs/src/components/studio/lattice-file.ts` and the CLI's `--reopenable` both use
            (HARD RULE #1). The Studio already renders slide thumbnails, so it can pass in an image;
            the CLI renders with Chrome, so it can take a screenshot of slide 1. The reader
            (`readLatticeFile`) ignores parts it doesn't know, so older Studios still open the file.
done when — a `.lattice` from the Studio and one from the CLI each carry a first-slide PNG at
            one fixed path that the manifest names; reading either file back is unchanged;
            the image stays small enough not to bloat a deck (a size cap, like the zip-limits
            ones); and the export-format decision doc records the path. Optional in the same PR:
            the Studio's Library deck cards show it.
evidence  — the PNG unzipped from a Studio export and a CLI export of the same deck, sent for
            sign-off in dark and light mode, since this changes the bytes of an exported file
            (QUALITY BAR export exception); and the round-trip tests still passing.
verify    — tier 0 for the image itself. The OS readers are later work owned by the desktop app
            (the Tauri app in this repo): an iOS/macOS thumbnail extension, a Windows thumbnail
            provider, a Linux `.thumbnailer` file and a `.lattice` file-type icon. Until those
            ship, a PDF exported "Re-openable in Lattice" is what shows a first-slide preview on
            every OS, iOS included.
