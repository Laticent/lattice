studio: +194
playground: +152
home: +100
getting-started: +100
The e2e census (#3156) replaced fixed sleeps with signals the app publishes for tests, the way the Stage and the instant shell already publish theirs. `overlay-back.ts`, which every route ships eagerly, writes its settled state and a generation on `<html>` (`data-overlay-back`, `data-overlay-back-gen`), +100 gzip bytes; the back-gesture specs used to sleep 650 ms for a level registered after paint. The Playground island adds the walk's land state (`data-pg-land`, `data-pg-lands`) and keeps `history.state` through its URL write (+52 together), and the Studio island counts deck imports (`data-deck-imports`) and publishes `__latticeFiloProbe` (+94 together). Nothing in the app reads any of them. `__latticeFiloProbe` is a read-only hook the iOS undo probe reads at a miss (Filo's text, the shell's source and the editor's trailing emissions, followups.d/3040-p3). The numbers are CI's measure on f1f6536e (run 43274898269).
