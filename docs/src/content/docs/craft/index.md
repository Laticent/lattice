---
title: Make it yours
description: Three short tracks that teach you to build a Lattice theme, component, and finish from scratch — with a live editor on nearly every page.
---

You can change how every Lattice slide looks by writing three small files:
one picks the colors, one arranges the words, one paints the background.
Each is short enough to read in a sitting.

| Layer | What it decides | The file you write |
|---|---|---|
| **Theme** | Every color in the deck | `themes/<name>.css` — a list of colors |
| **Component** | How one slide is arranged | `<name>.styles.css` — about twenty lines of CSS |
| **Finish** | The texture or glow behind the words | One block in `base.finish.css` |

They stay separate on purpose. A theme designer picks colors without
touching layout. A layout designer arranges boxes without picking colors.
Change one and the other two keep working, which is why a deck can swap
palettes without a single slide breaking.

## Before you start

**Themes and components are files you add.** Drop a `.css` file in `themes/`,
or a folder in `lib/components/`, and the engine picks it up — you are adding
to it, not changing it.

**A finish is different, and the finishes track says so where it matters.** A
finish needs its name registered in `lib/core/resolve-finish.js`, which is
engine code, plus an entry in the docs site's own catalog. It is two small
edits, but they are edits to files you did not create.

**All three tracks assume a checkout and a terminal.** Every "build your first
X" page opens with a command — `npm run new:theme`, `npm run new:component` —
that runs inside a clone of the repo. If you do not have one,
[Getting started](/getting-started/) sets it up in a few minutes.

**You can read every page and use every lab without any of that.** The labs
run in your browser, and nothing on these pages needs installing to follow
along. What needs a checkout is *shipping* what you built. If you want to
design without ever opening a terminal, the [Studio](/studio/) builds all
three visually and hands you the finished file.

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

Nineteen of the twenty-five pages carry a **live lab**: the slide on top,
its source underneath. The three checklists, this hub, the glossary and the
troubleshooting page are reading, not doing. Edit the source and the slide repaints as you
type. Nothing is saved, so break things freely — a **Reset** button appears
in the lab's header the moment you change anything, and puts it back.

The labs run the same engine that renders your PDFs, so what you see is
what you would get. Two differences worth knowing:

- The lab renders one slide, not a deck.
- A rule you type into a lab can lose to the engine's own rule, even when it
  is written correctly. Each track says where that bites.

Read the pages in the order the sidebar lists them. Each one assumes the
one before it.

Three things sit outside the tracks, for when you need them:
**[worked examples](/craft/examples/theme/)** show each finished file whole,
so you can check your own against one; **[when something looks
wrong](/craft/troubleshooting/)** is sorted by what you are looking at; and
the **[glossary](/craft/glossary/)** covers the vocabulary, including the
three words that mean different things in different rooms.

## When you would rather click than type

The [Studio](/studio/) has visual workbenches for all three: pick ten
colors and it derives a full theme with a contrast report, or build a
finish from dropdowns and sliders. These pages teach the file underneath,
which is what the Studio writes for you — worth knowing either way, and
the only path if you want the file in version control.
