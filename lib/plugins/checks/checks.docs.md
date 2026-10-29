# checks

The six answers a criterion can have, drawn as a disc:

```markdown
- Build in-house
  - [x] Certified
  - [-] Residency
  - [!] Export
  - Full control of every axis.
```

| Shortcut | Full form | Answer | Drawn as |
|---|---|---|---|
| `[x]` | `@check{pass}` or `@check{yes}` | yes | a solid disc with a check |
| `[-]` | `@check{warn}` or `@check{partly}` | partly | a solid disc with a dash |
| `[!]` | `@check{fail}` or `@check{no}` | no | a solid disc with a cross |
| `[?]` | `@check{unknown}` | unknown | a hollow ring with a question mark |
| `[ ]` | `@check{todo}` or `@check{open}` | open, not yet looked at | a hollow ring, empty |
| `[/]` | `@check{skip}` or `@check{na}` | does not apply | a neutral disc with a slash |

Each answer means the same thing on every slide. A layout supplies only its own WORDS for an answer (verdict-grid
says "yes", pricing says "included", obligation-matrix says "applies"), never a different answer. Design:
`engineering/decisions/2026-10-18-checks.md` (the name, the owner, containment) and
`engineering/decisions/2026-09-24-six-state-marks.md` (one meaning per marker).

This is an **embedded plugin**: part of how Lattice draws a slide, so it loads on every render and has no off switch.
It owns the vocabulary (the registry, `shared/registry.js`), the drawing (`checks.styles.css`, from the `--mark-*`
mask tokens), the grammar, the words and narration, autocomplete and lint. No component re-implements any of it.

## The author's contract

**The shortcuts.** `[x] [-] [!] [?] [ ] [/]` leading a list item or a table cell, on a layout that reads them
(checklist, verdict-grid, pricing, obligation-matrix, roadmap, and any table carrying `state-cells`); or anywhere as
inline code, `` `[x]` ``, which draws the disc in running text. `[X]` is NOT a check: GitHub reads it as a ticked box.

**The full form** is inline code, and works anywhere inline code does:

| You write | You get |
|---|---|
| `` `@check{pass}` `` | The disc alone, in running text |
| `` `@check{yes, label=Residency}` `` | A pill holding the check and the word "Residency" |
| `` `@check{no, label="Audit, EU"}` `` | A label with a comma is quoted, like any Segno text |
| `` `@check{yes, label=Residency, lg}` `` | The pill at a pill's size: `sm`, `md` (the default) or `lg` |
| `` `@check{yes, sm}` `` | The disc alone, scaled by the same factors a pill's size uses |

The answer comes first: one of the six ids (`pass warn fail unknown todo skip`), which are canonical, or its spoken
word (`yes partly no open na`). Case does not matter. The label is a named parameter, `label=`, never text after the
answer, so a label can hold any character. In the Studio, typing `@check{` offers the six answers with what each
means, then `label=`.

**What stays literal.** `` `[data-mark]` ``, `` `[0]` ``, `` `[ REDACTED ]` `` and any span that is not exactly one of the
six three-character shortcuts. `` `\[x]` `` shows the literal `[x]`, backslash removed. A bare `{pass}` is a pill that
says "pass": the full form needs its name.

## For components

A component never draws a check of its own and never builds a chip around one. It reads `[x]` through the list-text
grammar (`lib/core/list-text-grammar.js`, read by this plugin's `shared/leading.js`) and asks `shared/compose.js` to place the check in a container:

| Container | Who uses it | What it is |
|---|---|---|
| `pill` | verdict-grid's criteria, obligation-matrix `pills` | The pills plugin's capsule, the check as its lead, the label after it |
| `row` | pricing's feature rows | The check, then the label, in the component's own row |
| (a cell) | obligation-matrix, `state-cells` | The bare check, sized by the cell |

The pill never learns what a check is (it is handed a lead), and the check never learns what a pill is. The
component places the container and may say one thing only it knows (verdict-grid strikes the label of a `[/]`
criterion). Narration reads a composed check as the item's answer, in the layout's words.

## The registry

`shared/registry.js` holds the six as one table, `CHECKS`: each row's `id`, `marker`, shape class, `--mark-*` mask,
tone token, whether it is hollow, its spoken word, the spoken `aliases` the full form accepts, and its meaning. The
stylesheet, the narration word maps, manifest label sets and the Studio's marker picker cannot import it, so
`test/unit/core/state-marks.test.js` pins each to it. Adding an answer is adding a row; the test then names every
surface that does not know it yet.

## How a check is sized

Every answer draws the same disc: in one container, at one size, the six answers paint the same diameter, sit at
the same height and keep the same gap to their words, in all five `checks-*` styles. A style's rim never changes the
footprint, because the disc gives it back; only `checks-bold` is larger, on purpose. In a pill the disc is
0.85 of the pill's type and sits where the pill's own icon sits, at `sm`, `md` and `lg`.
`test/integration/invariants/check-marks-uniform.test.js` holds all of this, to half a pixel; the measurements and
the defects it closed are `engineering/decisions/2026-10-18-checks.md` §21.
