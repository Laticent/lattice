---
title: Themes & palettes
description: How Lattice palettes work, the palettes that ship, and how to author your own.
---

Lattice components are **palette-blind**: every color goes through a
`var(--token)`. The engine (`lattice.css`) defines the structure; a
*palette* supplies the tokens. Swapping palettes restyles every deck
without touching a single component.

## Selecting a palette

Set `theme:` in the deck's front matter:

```yaml
---
theme: indaco   # cool indigo (default)
---
```

## The palettes that ship

Two palettes are the canonical pair:

- **`indaco`** — cool indigo. Pale-cool surfaces, saturated brand navy
  borders, dark slate ink. The default.
- **`cuoio`** — warm leather. The warm counterpart.

Beyond those, Lattice ships a full set — fourteen palettes in all,
counting the canonical pair — `ardesia`, `atelier`, `brina`,
`burgundy`, `carbone`, `carta`, `concrete`, `crepuscolo`, `laguna`,
`magnolia`, `mustard`, `onyx` — most with a paired dark
canvas variant. You can preview every one of them live: open the
**[component reference](/components/)** and pick a palette
from the dropdown. The whole catalog re-renders in that palette's real
tokens, light or dark.

## Using a palette in a web app

A theme file such as `@laticent/lattice/themes/indaco.css` is a **Marp theme**.
Its first rule is `@import 'lattice'`, which only Marp's theme set resolves, so
a bundler stops on it: Vite fails with `[postcss] ENOENT: no such file or
directory, open 'lattice'`, and webpack with `Can't resolve 'lattice'`.

What to import depends on what the page does.

**To show slides, render them with the engine.** The engine composes the
stylesheet a slide needs: the slide box, and each palette's tokens scoped to
every slide, so a `dark` slide flips its canvas. Register the engine's CSS, then
the palette and every theme it imports (`cuoio-dark` imports `cuoio`; a theme
manifest's `extends` names its parent):

```js
import fs from 'node:fs';
import { createRequire } from 'node:module';
import engine from '@laticent/lattice/engine';

const require = createRequire(import.meta.url);
const read = (spec) => fs.readFileSync(require.resolve(spec), 'utf8');

engine.addThemes([
  { name: 'lattice', css: read('@laticent/lattice/css') },
  { name: 'cuoio', css: read('@laticent/lattice/themes/cuoio.css') },
  { name: 'cuoio-dark', css: read('@laticent/lattice/themes/cuoio-dark.css') },
]);
const { html, css } = engine.render(markdown, 'cuoio-dark');
// Put `css` in a <style> and `html` in the page. For a dark palette, give the
// page `color-scheme: dark` as well.
```

Rendered this way, in Node, and placed in a page, six component galleries
(51 slides) matched the CLI's own HTML render pixel for pixel in `indaco` and
in `cuoio-dark`. Without `color-scheme: dark` on a dark palette's page, the
browser paints a white canvas, which shows through the slide's top rule.

**To use a palette's tokens in your own UI, import the palette.** Every shipped
theme has a palette of the same name, dark variants included: the theme's
tokens with its imports resolved, so `palette/cuoio-dark.css` carries cuoio's
tokens and then the dark canvas pin. It imports cleanly in Vite and webpack:

```js
import '@laticent/lattice/palette/indaco.css';
```

Importing the engine's CSS beside it (`@laticent/lattice/css`) also builds, but
it is **not** a slide renderer. That stylesheet does not size the slide, and the
palette's tokens resolve once on the page root, so a `dark` slide keeps the
light canvas. Measured on the same 51 slides, it matched none of them. Use the
engine for slides.

## The contract every palette honors

1. **Single text color** on each surface — no reliance on
   auto-inversion.
2. **Two lightness bands** for fills: a tinted band and a mid-tone band.
3. **Saturation reserved** for two jobs only — borders, and alarm
   signal (saturated red on critical/error states).
4. **WCAG AA** for every text-bearing token against the surface it
   appears on, asserted by the contrast test suite.

## Authoring a new palette

A palette is a pure token-declaration job — no per-palette layout CSS.
Copy `themes/indaco/indaco.css` to `themes/<name>/<name>.css`, change the `@theme`
directive, and edit the tokens. Layouts that rely on a missing token
fall back to the engine's defaults, which makes gaps easy to spot during
development. Diagram theming comes for free: palette-blind per-diagram
Mermaid overrides live in the engine and resolve against your tokens.

**The Craft track teaches this end to end, with a live editor on every
page** — what each color paints, both contrast floors, the categorical
cycle, and light/dark from one file. Start at
[Theme anatomy](/craft/themes/anatomy/).

See [`design/theming.md`](https://github.com/Laticent/lattice/blob/main/design/theming.md)
in the repository for the full token reference and the Mermaid contract.
