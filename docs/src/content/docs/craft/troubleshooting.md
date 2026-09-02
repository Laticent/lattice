---
title: When something looks wrong
description: The failures that actually happen — what each one looks like, why it happens, and the fix.
---

Sorted by what you are looking at, because that is what you know when
something has gone wrong. Every one of these is a real failure with a
known cause; none is a mystery.

## The colors are wrong

**A deck looks right in one palette and wrong in another.**
Something names a color instead of a token. Search your CSS for `#` — one
hex literal is enough. The fix is `var(--token)`, or a `color-mix()` of
one. Nothing reports this; the slide renders, in the wrong color, forever.

**Charts and diagrams are in somebody else's colors.**
Your theme does not set the categorical tokens, so they fall back to the
default palette's. See [Colors for charts and
diagrams](/craft/themes/categorical/) and
[Ship your theme](/craft/themes/checklist/) — the full list is 98 tokens,
and a theme that stops at twenty looks *almost* right.

**Dark mode is unreadable, or nothing changes when you switch.**
Your colors are flat values instead of `light-dark()` pairs, so the theme
has one canvas whatever the deck asks for. [Light and
dark](/craft/themes/light-dark/).

**Labels vanish inside chart segments in dark mode only.**
`--cat-on-fill` is a fixed dark color. It has to flip — `var(--text-heading)`
— because the fill goes pale in light mode and deep in dark. The build
refuses this one, so you will see it as a failure rather than in the deck.

**Diagram boxes float with no edge.**
`--diagram-stroke` is too pale. It has to read against white.

**Every node in a diagram is the same dark box with unreadable text.**
Your theme defines none of the `--cat-N-fill` / `--cat-N-mark` pairs. Unlike
most tokens these have **no engine default** — they resolve to nothing, and
the nodes fall back to the surface color with body ink on top. Define the
twenty-four values; `npm run new:theme` copies a working set.

## A CSS rule does nothing

**The rule is right and nothing happens, in a lab on this site.**
A lost tie. CSS typed into a lab is appended raw, while the engine's own
rules are prefixed with `article.lattice >` — which adds both a class and an
element name, so yours loses. Repeating the component class —
`section.takeaway.takeaway > .cell-stage` — buys back the class, and that is
enough against an engine rule that names no class of its own. Against one
that does, notably `section.form > .cell-stage`, you need the class a third
time. A **shipped** component file goes through the same prefixing and ties,
so it needs none of this except in the two cases
[The three CSS rules](/craft/components/css-rules/) names.

**Your whole stylesheet lost at once.**
You wrapped it in `@layer`. An unlayered rule beats a layered one whatever
the selectors say, and the engine is unlayered. Remove the wrapper.

**A heading will not take your styling.**
The heading is not in the stage. It lives in the masthead Cell, which the
engine owns — `> .cell-stage h2` matches nothing.
[Component anatomy](/craft/components/anatomy/).

**Your rule works, but only on some slides.**
Ten layouts are sovereign and have no stage at all. If you are styling one
of `title`, `closing`, `divider`, `image`, `scene`, `math`, `premise`,
`compare-code`, `split-compare` or `split-panel`, anchor on
`section.<name>` instead.

## Something is wrong only in the PDF

**A gray cloud across the page where a soft fade should be.**
A finish layer fades to `transparent` in its export face. It has to end on
`var(--fin-canvas)`. [Screen and print](/craft/finishes/screen-and-print/).

**The title slide exports nearly blank.**
The finish mixes toward `var(--bg)` instead of `var(--fin-canvas)`, so a
light wash composites over the dark bookend and the white display text
disappears into it. One token, whole fix.

**A texture stops repeating, or a wash tiles.**
The `--fin-size` / `--fin-position` / `--fin-repeat` lists are out of step
with the number of layers. One entry per layer, texture first, then wash.

**The page number disappeared behind a frame.**
The frame is drawn on `section::after`, which is reserved. Use
`--fin-frame`.

## Something is wrong in the build

**"missing N core token(s)".**
The eleven required tokens are not all declared directly. Inheriting them
does not count.

**A variant you declared has no docs.**
Every entry in `variants` needs a matching `variantDocs` entry. The build
would otherwise generate a page describing something nobody wrote.

**`capacity` was rejected.**
Either `axis` is not one of `item`, `row`, `col`, `cell`, `line`, or you
declared a capacity without a `stressDoc`.

**Your tags were rejected.**
Three to five, each from the controlled vocabulary — `TAG_GROUPS` in
`lib/components/index.js` — and each shared with at least one other
component. An invented word fails at load; a real term nothing else uses
fails the clustering gate. They also have to say something the axes do not:
`["statement", "canvas"]` just repeats the manifest.

**A generated file keeps coming back.**
It is generated. Edit the manifest and run `npm run build`; the `.docs.md`
and `.gallery.md` are written from it.

**A test passes and proves nothing about your theme.**
The token-contract suite takes its scope from the manifests. Until
`themes/<name>.manifest.json` says `role: "base"`, your palette is not in
it.

## Something is wrong in the lab on this site

**You edited a number in a finish lab and nothing happened.**
Every finish value appears twice: once in the screen face and once in the
`-opaque` export twin, which the browser never renders. Edit the first one.

**The Dark button does nothing.**
On the pages before [Light and dark](/craft/themes/light-dark/), the lab's
theme is written in flat colors and has only one canvas, so the button is
hidden. Where you can see it, it works.

## Still stuck

Every page in this track links its canonical source in the repo, and the
[glossary](/craft/glossary/) covers the vocabulary — including the three
words that mean different things in different rooms.
