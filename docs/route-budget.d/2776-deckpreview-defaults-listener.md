home: +46
playground: +6

`DeckPreview` now listens for `lattice:plugin-defaults` and schedules a render (about 40 bytes gzipped), so a preview follows a host that narrows its plugin defaults after the deck is open (#2759). The home route mounts a `DeckPreview`. The playground route moved 6 bytes in the same build; this PR changes no playground-only code, so the shared chunk that carries the listener is the likely source. The listener cannot be dropped: the event is the only signal a host gives.
