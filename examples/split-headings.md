---
marp: true
theme: indaco
paginate: true
header: "Lattice · slides from headings"
---

<!-- _class: title silent -->

`slides from your outline`

# Write the outline. Skip the separators.

There's nothing to set — every `##` is a slide by default, so a deck reads like
a document, with no `---` to remember or forget.

<!-- _class: divider light -->

## Headings already mark your slides.

The first `#` is the lead slide; every `##` after it opens a new one. You were
going to write those headings anyway — Lattice just lets them do the dividing
by default, so the body stays clean Markdown an outliner or linter is happy with.

<!-- _class: cards-grid -->

`How it reads`

## The mental model is the table of contents.

- One H1
  - The deck title — your lead slide.
- Each H2
  - A new slide, titled by the heading.
- No rules
  - Not a single `---` in the body.

<!-- _class: cards-grid -->

`The detail that matters`

## Your eyebrow and class ride along.

A slide's `<!-- _class -->` directive and its eyebrow sit above the heading in
source — and stay with it. The break is pulled back over that lead-in, so it
never orphans onto the slide before.

- Eyebrow first
  - The kicker above this title is on THIS slide, not the last.
- Directives travel
  - `_class: cards-grid` attaches to the heading it precedes.
- Same on export
  - The emulator and the marp-cli export divide identically.

<!-- _class: agenda progress-2 -->

`When you still want a rule`

## A dash still works when you need one.

1. Headings drive the common case `##`
2. A literal `---` still forces a break `hybrid`
3. Use it for a slide with no heading `image`
4. Or to split two slides under one idea `rare`

<!-- _class: cards-grid -->

`No silent surprises`

## A typo can't quietly change the split.

- The guard
  - `npm run lint:deck` flags an `unknown-split` value.
- The fallback
  - An unknown mode falls back to the default — your deck still renders.
- The vocabulary
  - Exactly two modes: `headings` (default) and `rule`.

<!-- _class: title silent -->

`nothing to set`

# Keep the content. Drop the dashes.

This very deck sets no `split:` key — the headings do the work. Add
`split: rule` only if you want to go back to splitting on `---`.
