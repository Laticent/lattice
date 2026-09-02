---
title: Ship your theme
description: The full color contract, the commands that check it, and the list that says when a theme is done.
---

A theme is finished when it defines every color the engine can ask for,
clears both contrast floors on both canvases, and looks right when you
render a real deck and look at it. This page is that list.

## The full contract

The tour covered around twenty colors. A shipping theme defines **98**.

The gap is not decoration. Every color a theme leaves out falls back to the
default palette's value — so a theme that stops at the surfaces, the ink
and the accent renders its charts, its code blocks and its diagrams in
*somebody else's colors*, and does it quietly. It will look almost right.
That is worse than looking wrong.

Beyond the groups on [the token tour](/craft/themes/tokens/), define:

| Also required | Count | Notes |
|---|---|---|
| `--hljs-*` code syntax colors | 12 | each readable on `--code-bg` |
| `--cat-N-fill` / `--cat-N-mark` | 12 pairs | the [categorical cycle](/craft/themes/categorical/) |
| `--cat-N-ink` | 12 | generated, not hand-picked |
| `--chart-cat1…8`, `--chart-state-*` | 13 | the chart family's own palette |
| `--diagram-*` | several | stroke, line, lifecycle, alarm |
| `--scheme-dark-*` | 10 | the dark inputs your pairs read |
| `--pass-bg` / `--warn-bg` / `--fail-bg` | 3 | tinted signal grounds |
| `--seq-500` | 1 | anchors a nine-step gradient ramp |

The exact list lives in `test/unit/palette/token-parity.test.js`.

### Two that catch everyone

**`--seq-500`** anchors a ramp: the engine derives nine more steps from it,
receding toward the page and advancing away from it. Both halves of its
light/dark pair have to sit **mid-range on their own canvas**. Anchor it
near either end and the derived steps have nowhere to travel, so they
collapse into each other while every one of them still technically clears
the page. Check where the steps land, not where the anchor sits:

```bash
node tools/composed-contrast.js evergreen
```

**`--on-accent`** is curated by hand, per theme, for that theme's accent, in
both canvases. Nothing derives it, and no derived quieter tier of it may
carry text — the derivation spends exactly the margin the curation buys.

## The checklist

- [ ] `/* @theme <name> */` matches the filename and the manifest's `name`.
- [ ] The file declares no `@size` — the page box belongs to the engine.
- [ ] All eleven core tokens set directly: `--bg`, `--bg-alt`, `--border`,
      `--text-heading`, `--text-body`, `--text-secondary`, `--text-muted`,
      `--muted-mark`, `--accent`, `--accent-soft`, `--surface-inverse`.
- [ ] Every surface, ink and accent token is a `light-dark()` pair.
- [ ] `--cat-on-fill` and `--cat-on-mark` flip with the canvas.
- [ ] The categorical three-layer contract holds in both canvases.
- [ ] `node tools/derive-cat-ink.js` run and its output committed.
- [ ] `--seq-500`'s dark half re-anchored mid-range, checked with
      `composed-contrast`.
- [ ] `<name>-dark.css` is the three-line wrapper.
- [ ] All 98 tokens defined directly, not inherited.
- [ ] The theme added to `THEMES` in
      `test/unit/palette/token-parity.test.js` — until it is there, a green
      test run proves nothing about your palette.
- [ ] The theme added to `.vscode/settings.json` under
      `markdown.marp.themes`.
- [ ] `npm run test:palette` green.
- [ ] `npm run build:check` green.
- [ ] The component gallery rendered in **both** canvases and looked at.

## The commands

```bash
npm run new:theme evergreen        # scaffold
node tools/derive-cat-ink.js       # generate the twelve categorical inks
node tools/contrast-audit.js       # every text token vs its surface
node tools/cvd-audit.js            # how it reads to color-blind viewers
node tools/composed-contrast.js evergreen
npm run test:palette               # the palette suite
npm run build:check                # the blocking gates

node lattice-emulator.js test/integration/baseline-decks/gallery.md \
  /tmp/gallery.pdf -p evergreen    # render the gallery and LOOK at it
```

## The last step is not a command

Every item above is checkable, which means every item above can pass while
the palette is merely acceptable. The gap between "clears the floors" and
"reads like a designed document" is taste, and the only way through it is
to render a real deck, look at every page, and fix what is short of good.

## Where to go next

- Build the layouts to go with it: [Component anatomy](/craft/components/anatomy/).
- Add atmosphere behind the words: [Finish anatomy](/craft/finishes/anatomy/).
- Pick colors visually instead: the [Studio](/studio/) derives a full theme
  from ten choices and reports every contrast pair as you go.
