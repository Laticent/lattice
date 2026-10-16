---
origin: 2640
priority: P3
recorded: 2026-10-13
area: website
severity: low
swimlane: engineering/decisions/2026-10-12-library-media-assets.md §6
source: https://github.com/Laticent/lattice/pull/2640
---

# Live collaboration shows a guest a stand-in for every Library photo the host's deck names

why now   — Every other way a deck leaves the browser now carries its photos (the `.lattice`, the Markdown zip, the
            Marp bundle, the re-openable PDF and PowerPoint). The live channel still sends only the deck text, so a
            guest who joins sees stand-ins where the host sees pictures. Owner decision 2026-10-13: split this out of
            the file-export work, because it needs its own design.
where     — `docs/src/components/studio/live/` (live-controller.ts, the Tavola app channel). `lattice-media.ts`
            `packLatticePhotos` / `restoreLatticePhotos` hold the pack and the untrusted-restore halves.
done when — A guest's Studio sees that the deck names a photo it lacks and asks the host for it over the channel; the
            host answers with the bytes (or a refusal); the guest's Library gains it through `restoreMedia`, so the
            same type sniff, metadata scrub and caps apply. The design states a per-photo and a per-session size
            limit, whether the host is asked to consent before bytes leave, and what a view-only guest gets. An e2e
            joins from a second browser profile with an empty Library and sees the picture.
evidence  — `docs/e2e/library-images-export.spec.ts` drives every file export against a fresh profile; none covers live.
verify    — Two browser profiles in one Playwright run, host adds a photo, guest joins, guest's preview shows the pixel.
