---
title: Make it yours
description: Three short tracks that teach you to build a Lattice theme, component, and finish from scratch — with a live editor on every page.
---

Lattice dresses a slide in three separable layers, and you can author all
three yourself. Each is a small, self-contained file. None of them requires
you to touch the engine.

| Layer | What it decides | The file you write |
|---|---|---|
| **Theme** | Every color in the deck | `themes/<name>.css` — a list of colors |
| **Component** | How one slide is arranged | `<name>.styles.css` — about twenty CSS rules |
| **Finish** | The texture or glow behind the words | One block in `base.finish.css` |

They stay separate on purpose. A theme designer picks colors without
touching layout. A layout designer arranges boxes without picking colors.
Change one and the other two keep working — that is why a deck can swap
palettes without a single slide breaking.

## Start here

**[Theme anatomy →](/craft/themes/anatomy/)** if you want the deck in your
brand's colors. Themes are the easiest of the three: a theme is a list of
colors and nothing else, and you can get a usable one in about fifteen
minutes.

**[Component anatomy →](/craft/components/anatomy/)** if the sixty-one
shipped layouts cannot express the slide you have in mind. This is the one
that needs CSS you write yourself, though usually less than you expect.

**[Finish anatomy →](/craft/finishes/anatomy/)** if the words are right and
the page feels flat. Finishes are pure atmosphere: a wash of color, a faint
grid, a keyline frame.

## How to read these

Every page carries a **live lab** — a real slide beside a real editor.
Change the CSS and the slide repaints as you type. Nothing is saved, so
break things freely; **Reset** puts each lab back the way it was.

The labs run the same engine that renders your PDFs, so what you see is
what you would get. Two differences worth knowing:

- The lab renders one slide, not a deck.
- The lab CSS is layered on top of the engine's own, so a rule that looks
  ignored is usually losing a specificity contest rather than a typo. Each
  track says where that bites.

Read the pages in the order the sidebar lists them. Each one assumes the
one before it.

## When you would rather click than type

The [Studio](/studio/) has visual workbenches for all three: pick ten
colors and it derives a full theme with a contrast report, or build a
finish from dropdowns and sliders. These pages teach the file underneath,
which is what the Studio writes for you — worth knowing either way, and
the only path if you want the file in version control.
