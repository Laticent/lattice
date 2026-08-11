---
status: shipped
summary: >
  #1560's background-shorthand hoist was verified on the PDF/PNG raster path only; PPTX and the
  exported HTML player were left UNVERIFIED. Both are now measured, before and after the commit,
  across all six hoisted sites, and both are inert: 14 PPTX slide rasters byte-identical, 14 HTML
  player slide screenshots byte-identical, and the player's DOM outside its inlined <style>
  byte-identical. The player's FILE bytes do change, by exactly 5,060 in each geometry, as the
  issue predicted. One result is worth keeping and contradicts the loose reading of "zero
  computed-style differences": the computed background is NOT identical. The shorthand is TWO
  layers (the decoration, plus a final layer whose color is the canvas and whose image is `none`)
  and the longhands are ONE layer plus background-color, so all 11 site-by-geometry cells differ
  in their raw layer list, 2 layers to 1. Nothing that PAINTS differs, because the dropped layer
  had `background-image: none`. Exercising the sixth site needed a geometry nobody had rendered:
  AUTOSPLIT_APPLIES gates auto-split off for the `wide` aspect family, so section.compare-code-block
  cannot exist in a 16:9 render at all — every landscape sweep of this change, including #1560's
  own 26 renders, was structurally incapable of reaching it.
---

# The hoist on the two surfaces nobody had rendered

**#1596.** Not a defect — a stated gap in a merged change, carried forward as a
card rather than left in a PR body. The conclusion is the one #1560 reasoned to;
what changed is that it now has artifacts from the surfaces it is about
(HARD RULE #23).

## 1. What was open

#1560 split six canvas-bearing `background:` shorthands into
`background-color` + `background-image` longhands, so a theme missing a token
loses the decoration rather than the whole canvas. It verified that inert on the
**PDF/PNG raster path**: 26 byte-identical renders, an independent sweep of
7 themes x 88 section-class combinations x 9 background longhands, and the whole
committed gallery.

**PPTX and the exported HTML player were never exercised.** Both consume the
same `dist/lattice.css` and the equivalence was established at the
computed-style level, so it *should* carry — but "should carry" is reasoning,
not evidence. The player is the more interesting of the two: `lattice-emulator.js`
inlines `lattice.css` into it, so its bytes genuinely do change with this diff.

## 2. Method

A six-slide deck exercising every hoisted site — `divider`, `content dark`,
`content accent dark`, `code`, `compare-code`, and a `compare-code` slide long
enough to auto-split — rendered to **PPTX** and to the **HTML player** at two
geometries, on the tree as it is and on the same tree with #1560's five CSS
files reverse-applied (`git apply -R` of the commit's `lib/**` hunks, then
`node tools/build-css.js`; the full `npm run build` refuses, because
`checkBackgroundLayerVars` correctly rejects the pre-hoist form).

Three comparisons, because the surfaces fail differently:

| surface | what is compared |
|---|---|
| PPTX | every full-bleed slide raster under `ppt/media/`, by SHA-256 |
| HTML player | a Chromium screenshot of every slide it paints, by SHA-256 |
| HTML player | the document with its `<style>` blocks elided, byte for byte |

and a fourth that reads the browser directly: `getComputedStyle` on each of the
six selectors, per background layer.

**The sixth site needed a geometry nobody had rendered.** `section.compare-code-block`
is emitted by the `cover-code` carousel, which only runs when a slide overflows
— and `AUTOSPLIT_APPLIES` (`lattice-emulator.js:1442`) turns auto-split **off**
for the `wide` aspect family. At 16:9 a `compare-code` slide clips instead of
splitting, so that selector **cannot appear in a landscape render at all**. Every
landscape sweep of this change was structurally incapable of reaching it; the
one place it was covered was #1560's synthetic class-combination sweep, which
applies the class to a section rather than producing one. So the deck is
rendered at `hd` **and** at `size: portrait`, and coverage is the union.

## 3. Measured

**PPTX — inert.** 14 slide rasters (6 at `hd`, 8 at `portrait`), all
byte-identical before and after.

**HTML player — inert where it paints, different where it was expected to be.**

| | before | after |
|---|---|---|
| slide screenshots, 14 of them | \_\_ | byte-identical |
| DOM with `<style>` elided | \_\_ | byte-identical |
| `hd.html` file size | 2,413,584 | 2,418,644 (+5,060) |
| `portrait.html` file size | 2,416,066 | 2,421,126 (+5,060) |

The +5,060 in each is the inlined comment and rule form — exactly what the issue
predicted would change and what it predicted would not.

**The computed background is NOT identical, and that is worth stating plainly.**

```
section.dark                     painted:same   raw-layer-list:differs (2→1 layers)
section.accent.dark              painted:same   raw-layer-list:differs (2→1 layers)
section.divider                  painted:same   raw-layer-list:differs (2→1 layers)
section.code pre                 painted:same   raw-layer-list:differs (2→1 layers)
section.compare-code pre         painted:same   raw-layer-list:differs (2→1 layers)
section.compare-code-block pre   painted:same   raw-layer-list:differs (2→1 layers)   [portrait only]
```

All **11** site-by-geometry cells differ structurally; **0** differ in what they
paint. The reason is mechanical: `background: <ribbon>, var(--bg)` is a
**two-layer** background — the ribbon, then a final layer carrying the color with
`background-image: none` — while the longhand form is **one** layer plus
`background-color`. So `background-image` reads `<gradient>, none` before and
`<gradient>` after, and every per-layer property differs in arity to match. A
layer whose image is `none` draws nothing, and `background-color` is identical in
every cell, so the painted result is the same — which the 28 byte-identical
rasters and screenshots independently confirm.

This does not contradict #1560; its sweep said "zero *substantive* computed
differences", and "substantive" was carrying exactly this. It is written down
here because "the computed style is identical" is the wrong sentence to repeat,
and someone will otherwise repeat it.

## 4. The harness can fail

A comparison that cannot report a difference is not evidence. Perturbing one
hoisted site's canvas in `dist/lattice.css` — `section.divider`'s
`background-color: var(--surface-inverse)` to a literal magenta — and re-rendering
takes the report to `✗ section.divider painted:DIFFERS` in both geometries, with
the PPTX and screenshot hashes diverging on that slide alone. The unperturbed
comparison is clean immediately afterwards.

<details>
<summary>The harness (node + <code>puppeteer-core</code>, needs <code>CHROME_PATH</code>)</summary>

Deck: six slides carrying `_class: divider`, `content dark`, `content accent dark`,
`code`, `compare-code`, and a second `compare-code` long enough to overflow. Rendered
twice — once as authored, once with `size: portrait` added to the front matter.

```bash
# AFTER (the tree as it is)
for g in hd portrait; do
  src=deck.md; [ $g = portrait ] && src=deck-portrait.md
  node dist/lattice-emulator.js "$src" "after/$g.pptx" indaco -q      # writes after/$g.html too
  (mkdir -p "after/$g-pptx" && cd "after/$g-pptx" && unzip -qo "../$g.pptx")
  node tools/screenshot-slides.js --html "after/$g.html" --out "after/$g-html-png" --scale 1 -q
done

# BEFORE (the same tree, minus the hoist)
git show <hoist-sha> -- 'lib/**/*.css' > hoist.patch
git apply -R hoist.patch
node tools/build-css.js          # NOT `npm run build` — checkBackgroundLayerVars rejects the old form
#   …repeat the render loop into before/…
git checkout -- lib/ && node tools/build-css.js

# Compare
for f in before/*/ppt/media/* before/*-html-png/*; do
  cmp -s "$f" "${f/before/after}" || echo "DIFFERS: $f"
done
```

Computed-style arm — the part that distinguishes structural from painted:

```js
import fs from 'node:fs'; import puppeteer from 'puppeteer-core';
const SITES = [['section.dark','section.dark'], ['section.accent.dark','section.accent.dark'],
  ['section.divider','section.divider'], ['section.code pre','section.code pre'],
  ['section.compare-code pre','section.compare-code:not(.compare-code-split) pre'],
  ['section.compare-code-block pre','section.compare-code-block pre']];
const P = ['background-image','background-position','background-size','background-repeat',
           'background-origin','background-clip','background-attachment'];
const strip = (h) => h.replace(/<style[\s\S]*?<\/style>/g, '<style/>');
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
const page = await b.newPage();
const read = (f) => page.goto(`file://${process.cwd()}/${f}`, { waitUntil: 'networkidle0' })
  .then(() => page.evaluate((sites, props) => {
    const layers = (v) => { const o = []; let d = 0, c = '';       // split on TOP-LEVEL commas
      for (const ch of v) { if (ch === '(') d++; else if (ch === ')') d--;
        if (ch === ',' && !d) { o.push(c.trim()); c = ''; } else c += ch; } return o.concat(c.trim()); };
    return Object.fromEntries(sites.map(([label, sel]) => [label,
      [...document.querySelectorAll(sel)].map((el) => {
        const cs = getComputedStyle(el), cols = props.map((p) => layers(cs.getPropertyValue(p)));
        const n = Math.max(...cols.map((c) => c.length));
        const all = Array.from({ length: n }, (_, i) =>
          Object.fromEntries(props.map((p, j) => [p, cols[j][i] ?? cols[j].at(-1)])));
        return { color: cs.getPropertyValue('background-color'), raw: all,
                 paints: all.filter((l) => l['background-image'] !== 'none') };  // `none` draws nothing
      })]));
  }, SITES, P));
for (const g of ['hd', 'portrait']) {
  console.log(g, 'DOM outside <style>:',
    strip(fs.readFileSync(`before/${g}.html`, 'utf8')) === strip(fs.readFileSync(`after/${g}.html`, 'utf8')));
  const [x, y] = [await read(`before/${g}.html`), await read(`after/${g}.html`)];
  for (const [label] of SITES) {
    const key = (v, f) => JSON.stringify(v.map((e) => [e.color, f(e)]));
    if (!x[label].length) { console.log(` · ${label}: not present at this geometry`); continue; }
    console.log(` ${label}  painted:${key(x[label], (e) => e.paints) === key(y[label], (e) => e.paints)}`,
                ` raw:${key(x[label], (e) => e.raw) === key(y[label], (e) => e.raw)}`);
  }
}
await b.close();
```
</details>

## 5. What this does not cover

- **One theme.** Everything above is `indaco`. #1560's raster sweep already
  covered four palettes plus a 7-theme computed sweep on the PDF path, and the
  mechanism under test is theme-independent (it is about layer arity, not token
  values), so this did not re-run 32 themes on two more surfaces.
- **The player's chrome, not just its slides.** The screenshots are of the slide
  elements. The transport bar, caption band and notes drawer are painted by rules
  this diff never touched, and were not separately captured.
- **PowerPoint itself.** The PPTX comparison is of the slide rasters
  `pptxgenjs` embeds, which is what a viewer sees, but the file was not opened in
  PowerPoint or Keynote.
- **`section.compare-code-block` on the PDF path at 16:9 remains unreachable**,
  and that is a property of `AUTOSPLIT_APPLIES` rather than anything this change
  introduced. Worth knowing next time a sweep claims to have covered it.
