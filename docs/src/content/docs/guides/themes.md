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
theme: cuoio    # warm leather (the default — omit `theme:` for the same result)
---
```

## The palettes that ship

Two palettes are the canonical pair:

- **`cuoio`** — warm leather. The default: a deck that names no `theme:`
  renders on this.
- **`indaco`** — cool indigo. Pale-cool surfaces, saturated brand navy
  borders, dark slate ink. The cool counterpart.

Beyond those, Lattice ships a full set — fourteen palettes in all,
counting the canonical pair — `ardesia`, `atelier`, `brina`,
`burgundy`, `carbone`, `carta`, `concrete`, `crepuscolo`, `laguna`,
`magnolia`, `mustard`, `onyx` — most with a paired dark
canvas variant. You can preview every one of them live: open the
**[component reference](/components/)** and pick a palette
from the dropdown. The whole catalog re-renders in that palette's real
tokens, light or dark.

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
Copy `themes/indaco.css` to `themes/<name>.css`, change the `@theme`
directive, and edit the tokens. Layouts that rely on a missing token
fall back to unstyled rendering, which makes gaps easy to spot during
development. Diagram theming comes for free: palette-blind per-diagram
Mermaid overrides live in the engine and resolve against your tokens.

See [`design/theming.md`](https://github.com/slidewright/lattice/blob/main/design/theming.md)
in the repository for the full token reference and the Mermaid contract.
