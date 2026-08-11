---
status: proposed
summary: >
  The export bundle concatenates the theme BEFORE the base, so base.tokens.css's plain :root
  block lands later at equal specificity and wins — 36 distinct tokens are dead on the export
  path, and EVERY ONE of the 32 selectable themes renders at least one of them (932 dead
  declarations counted per theme as loaded). Measured in real Chromium using each order
  verbatim, with the harness inlined in the note so the numbers are re-derivable — two earlier
  drafts published wrong counts by measuring each theme FILE standalone, which misses that a
  -dark variant and a11y-base inherit their parent's losses whole. The root cause is sharper than "the concat is in the wrong order": every theme
  declares `@import 'lattice';` at its top, which in CSS means the imported sheet's rules come
  FIRST and the importing theme wins — and lattice-emulator.js's OWN Mermaid token reader
  already models it that way at :852, citing that exact @import rationale in its comment,
  while the injected CSS at :691 does the opposite — as does a third site, :1548's
  engine.addThemes, which also puts the layout first. So two of the three places that order
  these stylesheets already agree with the themes, and the odd one out is the one that builds
  the page; and 9 tokens (134 declarations) consequently resolve TWO WAYS IN ONE RENDER:
  a gantt's baked SVG gets the palette's --diagram-active while the CSS around it gets the
  base's. Flipping the concat is one line and fixes both, but it ACTIVATES every dead
  declaration — verified visually: ardesia's code slide swaps the base's Night Owl syntax
  colors for ardesia's own curated muted ramp, which is what its author wrote and nobody has
  ever seen. That changes exported PDF bytes across nearly every theme, so it is a QUALITY-BAR
  sign-off gate and this record stops there rather than shipping the flip.
---

# The palette/base concat order — two models of one cascade

**#1527.** Found by the adversarial trio while reviewing #1457. Pre-existing, off that PR's
path, and nothing tracked it until now.

## 1. The mechanism, and the part the issue did not name

`lattice-emulator.js:691` builds the export bundle as:

```js
const css = paletteCSS + '\n' + layoutCSS;   // theme FIRST, base LAST
```

and drops it verbatim into the page. `lib/base/base.tokens.css`'s plain `:root { … }` block
therefore lands *later* at **equal specificity** and wins. Any token a palette declares at
`:root` that the base also declares at `:root` is silently overridden.

The issue framed this as a concat that happens to be the wrong way round. It is worse than
that: **the order contradicts what the themes themselves declare.** Every one of the 14
top-level palettes opens with

```css
@import 'lattice';
```

and in CSS an `@import`ed sheet's rules come *before* the importing sheet's own — that is the
whole point of the at-rule, and it is why a theme can override the base at all.
`loadPaletteWithImports` explicitly skips that import (`if (name === 'lattice') continue;`)
and the emulator re-appends the base **after** the theme, inverting the relationship the
theme wrote down.

**And the same file already models it correctly, 160 lines later.** `:852`:

```js
// Parse the combined cascade (layoutCSS first, then paletteCSS) …
// Theme declarations parsed last override defaults — matches the real browser cascade
// where `@import 'lattice'` at the top of every theme loads lattice.css first.
const PALETTE_VARS = parsePaletteVars(layoutCSS + '\n' + paletteCSS);
```

The Mermaid token reader puts the palette **last** and cites the `@import` rationale in as
many words.

**There is a third site, and it agrees with the reader.** `lattice-emulator.js:1548` —
`engine.addThemes([layout CSS, palette])` — hands `lib/engine` the layout first and the
palette second. It feeds the engine rather than the injected `${css}`, so it does not change
what the export paints; it means **two of the three places that order these two stylesheets
already agree with what the themes declare**, and the odd one out is the one that builds the
page.

So the export path holds contradictory models of one cascade, and the model with the
reasoning attached is not the one used to render.

## 2. Measured

**Method, stated so the numbers are re-derivable** — earlier drafts of this section published
two different wrong counts, so the harness is inline below rather than described. It mirrors
`loadPaletteWithImports` (`lattice-emulator.js:666`), which inlines every non-`lattice`
`@import` into ONE `paletteCSS` string, then compares real Chromium `getComputedStyle` on a
`section` under the export order (`paletteCSS + layoutCSS`) against the declared order
(`layoutCSS + paletteCSS`). A token whose computed value differs between the two is dead today.

**Measuring each theme FILE standalone is the mistake both earlier drafts made.** A `-dark`
variant is `@import 'parent'; :root { color-scheme: dark; }` and `a11y-base` is
`@import 'onyx';` — measured alone they lose nothing of their own, measured as the emulator
loads them they carry their parent's losses whole.

| | |
|---|---|
| distinct tokens affected | **36** |
| themes with at least one dead declaration | **32 of 32** |
| dead declarations, counted per theme as loaded | **932** |

**There is no clean theme.** The worst are `cuoio` (35), the `atelier`/`brina`/`burgundy`/
`laguna`/`magnolia`/`mustard` group (32 each) and `ardesia`/`concrete`/`crepuscolo` (31);
the lightest are `indaco` (16) and `carta` (18). Each `-dark` variant matches its parent
exactly, which is the inheritance above showing up in the data.

The 36 tokens are the twelve `--hljs-*`, the `--diagram-*` state family, `--code-text`,
`--code-inline-fg`, the `--chart-state-*` trio, the `--on-dark-*` tier, `--on-accent`, and —
worth noticing — `--pass` / `--fail` / `--warn` / `--seq-500`, which are **semantic status
colors**.

*(An earlier draft published "426 declarations across 18 palette files", then "31 of 32
themes". The first counted only declarations physically written in each file, measured
standalone; the second kept that standalone basis and added a wrong exemption for `a11y-base`.
A static textual count over `:root` blocks gives a lower figure again — roughly 386–402
depending on how `:root, section` blocks are treated — because it cannot see computed
inheritance. The computed measurement above is the one that describes what renders.)*

**The sharpest consequence: 9 tokens resolve two different ways in the same render.**
`--diagram-active`, `--diagram-active-mark`, `--diagram-critical`, `--diagram-critical-mark`,
`--diagram-done`, `--diagram-done-mark`, `--diagram-note`, `--diagram-today` and `--fail` are
read by **both** the CSS and the Mermaid token map. The baked SVG gets the palette's value
(reader = palette last); the CSS around it gets the base's (injected = base last). A gantt bar
and the CSS that frames it are painted from the same token name and different values.

<details>
<summary>The harness (node, needs <code>CHROME_PATH</code>)</summary>

```js
import fs from 'node:fs'; import path from 'node:path'; import puppeteer from 'puppeteer-core';
const R = process.cwd(), T = path.join(R, 'themes');
const layoutCSS = fs.readFileSync(path.join(R, 'dist/lattice.css'), 'utf8');
function loadWithImports(file, seen = new Set()) {          // mirrors lattice-emulator.js:666
  if (seen.has(file)) return ''; seen.add(file);
  const c = fs.readFileSync(file, 'utf8'); let imported = '';
  for (const m of c.matchAll(/@import\s+["']?([A-Za-z0-9_-]+)["']?\s*;/g)) {
    if (m[1] === 'lattice') continue;
    const p = path.join(path.dirname(file), `${m[1]}.css`);
    if (fs.existsSync(p)) imported += loadWithImports(p, seen) + '\n';
  }
  return imported + c;
}
const declared = (css) => [...new Set([...css.replace(/\/\*[\s\S]*?\*\//g, '')
  .matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))].sort();
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
const page = await b.newPage();
for (const f of fs.readdirSync(T).filter((x) => x.endsWith('.css')).sort()) {
  const paletteCSS = loadWithImports(path.join(T, f)), toks = declared(paletteCSS);
  const read = async (css) => { await page.setContent(
    `<!doctype html><html><head><style>${css}</style></head><body><section></section></body></html>`);
    return page.evaluate((n) => { const s = getComputedStyle(document.querySelector('section'));
      return Object.fromEntries(n.map((k) => [k, s.getPropertyValue(k).trim()])); }, toks); };
  const now = await read(`${paletteCSS}\n${layoutCSS}`), flipped = await read(`${layoutCSS}\n${paletteCSS}`);
  console.log(f, toks.filter((t) => now[t] !== flipped[t]).length);
}
await b.close();
```
</details>

## 3. What flipping the order actually does

Candidate 1 from the issue — `layoutCSS + '\n' + paletteCSS` — is one line and fixes both the
dead declarations and the two-model split at once. It is also **not** cosmetic. Rendered a
roadmap / code / status deck under ardesia, cuoio, onyx and carta, before and after:

| palette | slides changed (of 3) |
|---|---|
| ardesia | 1 |
| cuoio | 2 |
| onyx | 1 |
| carta | 2 |

Opened and looked at, not just diffed. The clearest case is ardesia's `code` slide: **before**
the flip it renders in the base layer's Night Owl-ish syntax palette (purple `const`, orange
numbers, pink interpolation); **after**, it renders in ardesia's own curated ramp — muted
blues, teals and greens, quieter and visibly of-a-piece with the theme. That second rendering
is what ardesia's author wrote and what no user has ever seen.

So the flip does not "fix a bug" so much as **turn on curated declarations that have never
rendered, in every theme that ships**. That is very likely the right outcome — the palettes were authored to be seen —
but it is a change to the shipped appearance of nearly every theme, not a no-op.

## 4. Why this record stops here

**This changes the bytes of an exported artifact across all 32 selectable themes.** CLAUDE.md's QUALITY BAR
makes that the one explicit exception to acting without being asked: it requires the owner's
inspection, with a representative deck rendered in both dark and light mode, before it ships.
So the deliverable here is the measurement and the model, and the flip is **not** in this
change.

Three directions remain open, and the measurement changes how they rank:

1. **Flip the concat** (`:691`). One line; fixes the dead declarations and the two-model split
   together; changes exported bytes across nearly every theme. Now the clear front-runner, because
   §1 shows the current order contradicts both the themes' own `@import` and the file's own
   token reader — this is restoring the declared cascade, not choosing a new one.
2. **`:where(:root)` on the base's token defaults.** Zero-specificity, so any theme `:root`
   wins regardless of order. Same visual outcome as (1) with a larger diff, and it leaves the
   two models disagreeing about anything *not* wrapped. Note `parsePaletteVars` cannot see
   `:where(:root)` at all (`checkNoSafeDefaultTokens` documents this), so this would move
   tokens out of the Mermaid reader's view — a second-order hazard (1) does not have.
3. **Gate it.** Fail the build when a palette declares a `:root` token the base also declares
   at `:root`, and require the base to use a zero-specificity default there. Useful *with*
   (1) or (2), not instead: on its own it makes the dead declarations a build error rather than
   a render defect, which needs one of the fixes anyway.

**Recommendation: (1), then (3) to hold the line** — but the visual sign-off is the gate, and
it is the owner's.

## 5. What is already known and must not be lost

`--cat-N-ink` is **deliberately exempt** from this hazard: `base.tokens.css` declares no
`:root` default for that tier precisely because the base would win here
(`base.tokens.css:414-426`, and `design/theming.md`'s on-canvas-ink section, which records the
measurement — the curated `#006D70` became the mark `#008386`). That comment is proof the
hazard was understood in 2026-08; it was simply never generalized past the one family. Whatever
direction is taken, that exemption's *reason* disappears under (1) — the base could then safely
declare an ink default — but the exemption itself should not be removed in the same change.

## 6. Not verified

**Most of this section is now measured — see `2026-08-11-palette-concat-signoff.md` (#1527's
sign-off package), which also CORRECTS §3's reading: the flip is not purely an activation of
better values. It reveals two masked authoring defects, one of which (a11y-achromatopsia's
dark-mode status greys) makes an accessibility deck unreadable.**

- **~~No render sweep across the affected themes.~~ DONE.** Four were rendered (ardesia, cuoio,
  onyx, carta) out of 32. The full sweep — all 32 themes, both modes, 576 slides a side — found
  202 changed slides and **no theme where the flip is invisible**, in either mode.
- **PPTX and HTML export paths.** Only the PDF/PNG path was exercised. Both consume the same
  bundle, so the same inversion should apply, but it was not measured. **UNVERIFIED.**
- **~~The Studio / docs-site preview paths were not measured.~~ MEASURED — they are already
  correct.** `lib/engine`'s `composeCss` inlines the base at the theme's own `@import 'lattice'`
  position, so the palette wins: 932 of 932 disputed tokens resolve in the preview exactly as the
  flip would, and none as the export does. **Preview and export disagree today, on all 32 themes**,
  and the flip makes them agree rather than swapping which one is wrong.
- **~~Whether every activation is desirable.~~ NO — and this paragraph called it.** The four
  sampled palettes looked better afterwards; the other 28 theme-modes did not all. A palette
  carrying "a stale declaration written against an older base and never re-checked *because* it
  was dead" is exactly what the sweep found: `a11y-achromatopsia` declares flat status greys with
  no `light-dark()` pair, unreadable on the dark canvas, masked all this time by the base's
  colored value winning.
