studio: +340
The `.lattice` import funnel in `StudioShell` now restores the photos a file carries (a gate before the deck opens, and one toast), and `zip-limits.ts` exports the new `MAX_LATTICE_MEDIA_BYTES`. CI measured +327 B gz against main. The pack and restore code itself (`lattice-media.ts`, `LatticeOptionsPanel.tsx`) loads lazily with the Share sheet and the import path.
Given back: nothing yet; the funnel change is the minimum that restores photos before the deck's source is fixed.
