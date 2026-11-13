---
status: shipped
summary: >
  The Marp versions a Lattice hand-off works with are a RANGE held at both ends, not a pin: marp-cli 4.x (marp-core 4.x)
  and Marp for VS Code 3.x. CI renders every Marp suite on the floor (marp-cli 4.0.0 with marp-core 4.0.0, the
  test/fixtures/marp-cli pin) on every change and on the newest 4.x every night; Marp for VS Code 3.0.0 and 3.6.1 were
  driven by hand in a real VS Code. One record, MARP_SUPPORT in lib/export/marp-bundle.js, feeds the bundle's package.json,
  both READMEs' generated support line and the test that ties the fixture to it. An exact pin (4.5.1, one commit earlier)
  was reverted: it governed only Lattice's own npx line.
---

# Marp versions: a range, proven at both ends

**Date:** 2026-11-10 · **Decided by:** the owner ("we don't know what version of the plugin a user might have installed.
pinning to a specific version creates challenges"), choosing "a range, both ends tested" · **Record:** `MARP_SUPPORT` in
`lib/export/marp-bundle.js` · **Held by:** `test/unit/tools/marp-cli-pin.test.js`, `test/helpers/marp-cli.js`, the five Marp
integration suites, and the integration nightly's `LATTICE_MARP_CLI=range` arm.

## Why not a pin

A recipient renders a Lattice deck through one of two Marp engines, and Lattice chooses neither:

| Route | What runs | Does a version Lattice prints reach it? |
|---|---|---|
| marp-cli | the `npx` line Lattice prints, or any marp-cli they already have, or the one inside Marp for VS Code's export | only when they paste the line |
| the VS Code preview | the marp-core bundled in their Marp for VS Code, which updates on its own | never |

An exact pin (`4.5.1`) made Lattice's own suggestion reproducible and nothing else. What Lattice's files depend on is a small
set of host behaviors: Marp's theme rules (`@theme`, `@size`, `@import` by name), the `html` option, the config `engine`
(marp-cli only), the `svg > foreignObject > section` slide structure, and, in VS Code, the preview's `<meta>`, `<base>` and
`vscode.markdown.updateContent`. So the support is a range, with its ends tested.

## The ends, measured

marp-cli resolves marp-core with a caret, so a fresh install of ANY marp-cli 4.x gets the newest marp-core (4.4.0 today). The
version that renders is marp-core's, and an older one reaches a recipient only through an old lockfile or global install. So
the floor was taken on both packages, marp-core forced with an npm `overrides`.

Each row rendered the kit's Sample-Deck (13 slides), a video deck and a plugin probe through real marp-cli and read the
result in Chromium: the runtime loaded, the theme registered, the Mermaid diagram, the chart, the split panel, the video
figures and cards, the pills, and the PDF's page count. Every row matched the reference (13 pages; 1 diagram, 1 split panel,
5 bars, 3 pills; 3 video figures, 2 cards):

| marp-cli | marp-core | result |
|---|---|---|
| 4.0.0 | 4.0.0, 4.1.0, 4.2.0, 4.3.0 | identical |
| 4.0.0, 4.3.0, 4.5.0, 4.5.1 | 4.4.0 | identical |

An Export-to-Marp bundle (its HTML allowlist, notes engine and baked math) rendered on 4.0.0 / 4.0.0 matched 4.5.1 / 4.4.0.
The five Marp integration suites (52 tests) pass on the floor fixture and on `LATTICE_MARP_CLI=range` (4.5.1 / 4.4.0).

Marp for VS Code, driven in VS Code 1.145.2 at the *Disable* security level: 3.0.0 (the first release with the
`markdown.marp.html` setting the kit writes) and 3.6.1 both drew the Sample-Deck whole (runtime, theme, diagram, chart, split
panel) and the video deck's figures and cards.

## What holds it

- The fixture (`test/fixtures/marp-cli`) pins marp-cli and marp-core to the floor; `test/helpers/marp-cli.js` refuses to run
  when either installed version differs from `MARP_SUPPORT`, and `marp-cli-pin.test.js` checks the same without an install.
- The bundle's `package.json` asks for `MARP_SUPPORT.cli.range`; both READMEs name the major only in the `npx` line (`cmd.exe`
  reads a pasted `^` as an escape character) and print `marpSupportLine()`, generated from the record.
- The nightly renders the newest release in the range. A red night means a new Marp release broke a hand-off: fix it, or
  narrow the range.
- The runtime warns once when it runs on a Marp slide whose Lattice stylesheet did not register
  (`warnIfMarpThemeUnregistered`), the one failure that otherwise says nothing.

## What it does not cover

Marp for VS Code is checked by hand, on the date in `MARP_SUPPORT.vscode.checked`; nothing re-checks it on a schedule. A
nightly arm that boots VS Code would be a new CI job (an owner decision), and the harness that drove it lives in
engineering/gotchas/vscode.md rather than in the tree. marp-core 5 and Marp for VS Code 4 are outside the range until rendered.
