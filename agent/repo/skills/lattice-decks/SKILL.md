---
name: lattice-decks
description: Authors Lattice slide decks in Markdown. Use when writing, editing, or reviewing a presentation, slide deck, or .md file using Lattice layouts.
---

# Lattice decks

Write a slide deck as one Markdown file. One layout per slide.

## Steps

1. Read `references/writing-a-deck.md` for the file shape and the rules.
2. Read `references/pick-a-layout.md` and choose a layout per slide by intent,
   then check your content against its capacity.
3. Write the deck.
4. If the Lattice kit is on disk, run `node <kit>/review/check.mjs your-deck.md` and fix
   what it names. It is code, so it costs nothing and cannot be argued with.
5. Render it and look at it — `references/render.md` has the commands.

## Rules that break a deck if you get them wrong

- Every slide starts with `<!-- _class: NAME -->` and NAME is a real layout.
- Slides are separated by a line containing only `---`, with a blank line each side.
- Card layouts nest: `- Title` on one line, then `  - body` indented two spaces. Never `- **Title.** body`.
- Under a numbered `1.` row, indent the nested line **three** spaces, not two.
- A ledger or split row always has a body under its title — never a bare title.
- A statement layout's `1.` rows carry no `**bold**` lead-in.
- Every `<!-- -->` comment is closed.
- The title slide is `# H1`, then a backtick `eyebrow` line, then a plain subtitle — in that order.
- Colors and emphasis come from the layouts and modifiers. Never write a hex code.
