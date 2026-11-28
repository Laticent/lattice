---
marp: true
theme: indaco
size: hd
pagination: true
header: "Lattice · custom logo"
logo: sample:logo-acme-mark.svg
---

<!-- @meta{layout=title, class=silent} -->

# Custom Logo

`Lattice · Discreet brand mark in one line of front matter`

A grayscale watermark in the top-right corner — brightness adapts to dark and light canvases without per-author variants.

---

<!-- @meta{layout=divider, class=light} -->

`How it works`

## A filter, not a fork.

CSS desaturates the injected image to a faint grayscale watermark and inverts the brightness on dark-canvas layouts so the mark stays legible on every theme.

---

<!-- @meta{layout=content} -->

## How it lands in the DOM.

A build-stage rewriter injects an `img` element with class `deck-logo` as the first child of every selected section — same shape Marp uses for `header` and `footer`. CSS positions it absolutely top-right and applies the filter chain. A real DOM element rather than a `::before` pseudo is what lets the logo compose with `::before`-based chrome like the SVG-mark backgrounds.

```yaml
logo: sample:logo-acme-mark.svg bottom-center accent   # the file, then optional words: placement color size scope
```

Build-time only. The directive does not render in the marp-vscode preview pane because the extension does not run the engine's plugins.

---

<!-- @meta{layout=compare-prose} -->

## When to use which style.

- Auto · default
  - A faint grayscale watermark, brightness inverted on dark-canvas layouts so the mark stays legible on every theme. Best for marks you want present but not loud — a watermark, not a statement.
- Brand
  - Original colors preserved, with nothing behind them (add the `plate` word for a soft surface plate). Best for logos whose colors carry meaning — government insignia, university crests, marks that *are* the brand.

---

<!-- @meta{layout=content, class=tint-corner at-tl tint-edge at-right} -->

## Layered gradient background, logo on top.

`tint-corner at-tl` adds a top-left radial glow; `tint-edge at-right` adds a right-edge linear wash; both compose into the section's `background-image` slot. The watermark sits on top, darkened automatically because the canvas is light — same SVG, same rule, the filter just inverts brightness based on the layout class.

---

<!-- @meta{layout=content, class=mark-orbit} -->

## SVG-mark background and logo coexist.

`mark-orbit` draws its concentric-ring accent through `section::before`. Earlier iterations of this feature put the logo on `::before` too — and the two collided. The current implementation injects the logo as a real `img` element, so it sits on a different render layer. Every treatment — `tint-*` or `mark-*` — composes with the logo.

---

<!-- @meta{layout=closing} -->

`Lattice · custom logo`

## One line of front matter. One CSS rule. Every theme.
