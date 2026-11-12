studio: +123
playground: +147
home: +100
getting-started: +100
The e2e census (#3156) replaced fixed sleeps with signals the app publishes for tests, the way the Stage and the instant shell already publish theirs. `overlay-back.ts`, which every route ships eagerly, writes its settled state and a generation on `<html>` (`data-overlay-back`, `data-overlay-back-gen`), +100 gzip bytes; the back-gesture specs used to sleep 650 ms for a level registered after paint. The Playground island adds the walk's land state (`data-pg-land`, `data-pg-lands`, +47) and the Studio island counts deck imports (`data-deck-imports`, +23). Nothing in the app reads any of them.
