---
title: Ship your component
description: The files, the gates, and the list that says a layout is finished.
---

A component is finished when the manifest describes it honestly, the CSS
obeys the three rules, and a demo deck proves the numbers were found by
rendering rather than guessed. This page is that list.

## What ships

```text
lib/components/<bucket>/takeaway/
  takeaway.manifest.json      ← you write this
  takeaway.styles.css         ← you write this
  takeaway.transform.js       ← only if the DOM has to be rebuilt
  takeaway.docs.md            ← GENERATED
  takeaway.gallery.md         ← GENERATED
  takeaway.gallery.light.pdf  ← rendered
  takeaway.gallery.dark.pdf   ← rendered
plus
  examples/takeaway.md        ← the demo deck
  examples/takeaway.pdf       ← its rendered PDF
```

Two files are yours. The build writes the rest from your manifest, so
hand-editing any of them loses the edit on the next build.

## The thirteen buckets

Every component lives in one:

`anchor` · `statement` · `inventory` · `comparison` · `progression` ·
`evidence` · `imagery` · `chart` · `diagram` · `math` · `code` · `legal` ·
`connect`

Seven mirror the Function axis; the rest are defined by what the author
writes or by the domain.

## The checklist

**The contract**

- [ ] The `function.form` pair is one the system already sanctions.
- [ ] `description` is a real sentence about when to reach for this.
- [ ] Three to five `tags` that say something the axes do not.
- [ ] `slots` name every part, with a selector and a description each.
- [ ] `skeleton` is the smallest usable slide.
- [ ] `sample` is real prose, not placeholder text.
- [ ] `capacity` and `density` are numbers you found by rendering.
- [ ] A `stressDoc` at the hard limit.
- [ ] `whenToUse` — three or four entries.
- [ ] `antiPatterns` — three or four, each naming where to go instead.
- [ ] `related` components, each with a `when` clause.
- [ ] Every declared variant has a `variantDocs` entry.

**The CSS**

- [ ] Every color is `var(--token)` or a `color-mix()` of one.
- [ ] Space is `padding` and `gap`. No margins beyond a bare `margin: 0`.
- [ ] Every selector hangs off `> .cell-stage`.
- [ ] No `@layer` wrapper.
- [ ] Reflow rules, if any, match the manifest's `adapt.mode`.

**Before you push**

- [ ] `examples/takeaway.md` written, six to ten slides, PDF committed.
- [ ] `npm run build` run; nothing generated was hand-edited.
- [ ] `npm run build:check` green.
- [ ] `npm test` green.
- [ ] The light and dark gallery pages rendered — and looked at.

## Do not list universal variants

Modifiers like `dark`, `compact`, `accent` and the state markers are added
to every component automatically, and listing them in your manifest's
`variants` fails the build. That field is for variants **specific to your
layout** — `numbered`, `four`, `three`.

## The commands

```bash
npm run new:component -- takeaway --bucket statement \
  --function statement --form canvas --substance structure

npm run preview -- examples/takeaway.md      # fast visual loop
npm run lint:deck -- examples/takeaway.md    # check against the catalog
npm run build                                # regenerate docs + gallery
npm run build:check                          # the gates
npm test                                     # the unit suite
```

## Where to go next

- Give it colors that are yours: [Theme anatomy](/craft/themes/anatomy/).
- Give the deck atmosphere: [Finish anatomy](/craft/finishes/anatomy/).
- Browse what already exists before building more:
  [the component reference](/components/).
