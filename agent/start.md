# Write a Lattice deck (engine 1.0.0-rc.1)

All 80 layouts: [layouts.md](./layouts.md).

## 1. The file

```markdown
---
theme: indaco
pagination: true
---

<!-- @meta{layout=title, class=silent} -->

# Deck title goes here

`Category · Date or audience`

One-line subtitle that frames the deck.

---

<!-- @meta{layout=list} -->

## Slide heading.

- First short bullet point.
- Second short bullet point.
- Third short bullet point.
- Fourth short bullet point.
- Fifth short bullet point.

---

<!-- @meta{layout=closing, class=silent} -->

## Closing takeaway or call to action

`Optional eyebrow`
```

`theme:` picks the palette; `color-mode: dark` goes dark. Each slide opens with one `<!-- @meta{layout=NAME} -->`.

## 2. What a good deck is

- ONE idea per slide. Every "## " heading is a COMPLETE DECLARATIVE SENTENCE that IS the claim — never a label ("Q2 Results"), never a question. The body DELIVERS the claim; it never just restates the heading.
- ARC: a title that states the stakes -> sections that build the argument -> a closing that names ONE ask. The headings alone should read as the argument.
- RESTRAINT: aim ~70 words of body and <= 6 bullets per slide (95 under `profile: teaching`; title <= 10 words). When content overflows, SPLIT the slide — never shrink the font.
- BOOKENDS: the title slide is "# h1" then a backtick `eyebrow` then a one-sentence subtitle; the closing is ONE sentence plus a signature (never a bulleted next-steps list); both carry `silent`.

## 3. Rules

- Slides are separated by a line containing only `---`, with a blank line each side.
- Rows on `cards-grid`, `matrix-2x2`, `decision`, `kpi`, `list-steps`, `list-tabular`, `stats`, `timeline-list` nest the body under the title, never `- **Title.** body`; `agenda` rows are one plain line; a row on `split-panel` always has a body.
- Colors and emphasis come from the layouts and modifiers. Never write a hex code.
- Content is never a heading: `big-number` is `- 92%`, `quote` is `> …`; `kpi` and `stats` rows are `1. $2.4B` then `   - Total revenue` (three spaces under a `1.`).
- Notes, never shown: `<!-- @note{…} -->` speaker note, `<!-- @say{…} -->` words to speak, `<!-- @alt{…} -->` alt text, `<!-- @handout{…} -->` handout.

## 4. The 19 common layouts

- title: the first slide
- closing: the last slide
- divider: a section break
- content: a claim plus a short paragraph
- list: 3-5 short bullets
- cards-grid: 2-4 named items with one line each
- stats: 2-4 numbers side by side
- kpi: 3 metrics with targets and status
- big-number: one number that is the whole point
- quote: someone's words
- list-steps: numbered steps in order
- list-tabular: a name plus a value, per row
- timeline-list: dated milestones in order
- checklist: done / partly done / not started
- table: 2-3 options scored on the same criteria
- decision: the option chosen and the ones rejected
- matrix-2x2: items sorted into four quadrants
- split-panel: one claim plus the points that back it
- agenda: what the deck covers

Skeletons: components/NAME.md. Nothing fits? `content` or `list`; never invent a name.

## 5. Modifiers

As `<!-- @meta{layout=cards-grid, class=dark} -->`: `dark` (mood), `tone-pass` (tone), `insight-key` (insight); more in [authoring/modifiers.md](./authoring/modifiers.md).

## 6. Check, render, read more

```sh
node review/check.mjs deck.md
npx @laticent/lattice deck.md deck.pdf
```

Web or no shell: [render](./render/lattice-render-a-deck.md). More: [full canon](./authoring/deck-canon.md).
