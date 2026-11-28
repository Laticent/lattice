# Licensing: which part is which

This repository holds code under two licenses and specifications under a third. This page says
which is which. Each package's own `package.json` `license` field and the `LICENSE` file in its
folder are the authority for that package; this page is the map.

Copyright 2025-2026 Sharmarke Aden, doing business as Laticent.

## Apache-2.0: the public libraries

These 15 libraries are licensed under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0).
Each one keeps its own `LICENSE` (the Apache text) and `NOTICE` in its folder, and both ship in
its npm package.

| Package | Folder |
|---|---|
| `@laticent/cadenza` | `docs/src/lib/cadenza/` |
| `@laticent/filo` | `docs/src/lib/filo/` |
| `@laticent/fluido` | `docs/src/lib/fluido/` |
| `@laticent/fuoco` | `docs/src/lib/fuoco/` |
| `@laticent/lastra` | `docs/src/lib/lastra/` |
| `@laticent/ltt` | `docs/src/lib/ltt/` |
| `@laticent/markup` | `docs/src/lib/markup/` |
| `@laticent/mosaico` | `docs/src/lib/mosaico/` |
| `@laticent/segno` | `docs/src/lib/segno/` |
| `@laticent/segno-languages` | `docs/src/lib/segno-markdown/` |
| `@laticent/squadra` | `docs/src/lib/squadra/` |
| `@laticent/suono` | `docs/src/lib/suono/` |
| `@laticent/tavola` | `docs/src/lib/tavola/` |
| `@laticent/veduta` | `docs/src/lib/veduta/` |
| `@laticent/vetrina` | `docs/src/lib/vetrina/` |

Two of them carry third-party code under its own permissive terms, which travel with the package:

- `@laticent/segno-languages` ports parsing rules from markdown-it (MIT). Its terms:
  `docs/src/lib/segno-markdown/LICENSE.markdown-it.md`.
- `@laticent/lastra`'s JPEG decoder and encoder are based in part on libjpeg-turbo and the work of
  the Independent JPEG Group (the IJG License and the Modified 3-clause BSD License). Their terms:
  `docs/src/lib/lastra/decode/LICENSE.libjpeg-turbo.md` and `decode/README.ijg.txt`.

No library has an AGPL, MPL or proprietary runtime dependency. The optional peers are React,
Yjs, y-protocols, lib0 and Trystero, all MIT.

None of these libraries had been published before the change to Apache-2.0, so each one's first
public version is Apache-2.0. Earlier commits of their source in this repository's history were
under AGPL-3.0-only.

## AGPL-3.0-only: the engine, the Studio and everything else

Everything in this repository that is not listed above or under "CC-BY-4.0" below is licensed
under the [GNU Affero General Public License, version 3 only](LICENSE). That includes:

- the engine: `lib/`, `themes/`, the CLI (`lattice.js`), and the npm package `@laticent/lattice`
  (`packages/lattice/`);
- the plugins in `lib/plugins/`;
- Lattice Studio, the docs site and the Playground (`docs/`, outside the library folders above);
- `@laticent/calco` (`docs/src/lib/calco/`) and `@laticent/trama` (`docs/src/lib/trama/`): editable
  PowerPoint and OpenDocument export, and graph-chart layout and routing, are product features the
  owner keeps under the AGPL (2026-11-28);
- `@laticent/lente` (`docs/src/lib/lente/`). Its suggestion rules (`suggest.ts`) encode which
  Lattice components belong in which reader lens, which is Lattice's own design policy;
- `@laticent/cenno` (`docs/src/lib/cenno/`), which is private and not published.

The [Lattice Output Exception](LICENSE-EXCEPTIONS) is an additional permission on top of the AGPL
for the engine assets Lattice embeds in a deck it renders. Read its §Limits for what it covers.

## CC-BY-4.0: the specifications

The specifications in `spec/` and their conformance cases (`spec/conformance/`, and the LTT fixtures in
`docs/src/lib/ltt/conformance/`, which `spec/LTT-1.0.md` names as its tests) are licensed
under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/), as each document's **License**
line says. A library that implements a specification (for example `@laticent/ltt` for
`spec/LTT-1.0.md`) is licensed as its own row above says, not as the specification is.

## Third-party code in the engine

The engine ships third-party code under its own licenses. The full texts are in
`assets/licenses/`, beside each vendored copy in `lib/plugins/<name>/vendor/`, and in the
generated `dist/THIRD-PARTY-LICENSES.txt` that ships in `@laticent/lattice`.

## Names and logos

No license here grants a right to use the names "Lattice" or "Laticent" or their logos. See
[TRADEMARKS.md](TRADEMARKS.md).
