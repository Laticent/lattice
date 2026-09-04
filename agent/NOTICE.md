# Notices

## Lattice

Copyright (c) 2025-2026 SlideWright. Licensed under the **GNU Affero General
Public License, version 3** — the full text is in `LICENSE`, beside this file.

Most of this kit is documentation: the component references, the authoring
canon, the skills and the catalogs describe Lattice rather than being it. Decks
you write from them are yours, and were never covered either way.

**`review/check.mjs` is different.** It is the Lattice reviewer itself,
compiled to one runnable file — engine code handed over loose, not engine code
embedded in a rendered deck — so the AGPL applies to it in full and the output
exception in `LICENSE-EXCEPTIONS` does not reach it. Running it on your own
decks is ordinary use and asks nothing of you; redistributing it, or a service
built on it, is what the license speaks to.

## Third-party code inside `review/check.mjs`

The bundle inlines the packages below. The bundler strips their comments, so
their notices are reproduced in full in `THIRD-PARTY-LICENSES.txt`.

| Package | License |
|---|---|
| `entities` | BSD-2-Clause |
| `linkify-it` | MIT |
| `markdown-it` | MIT |
| `mdurl` | MIT |
| `punycode.js` | MIT |
| `uc.micro` | MIT |
