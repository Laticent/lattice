# design/skills/ — the "create a killer X from scratch" skills

Seven self-contained skill files. Each teaches an LLM (or a human) how to
create **one** kind of Lattice artifact from a blank file and hold the
boardroom 10/10 bar the first time. Each names what good looks like, what bad
looks like, what to do, and what not to do — with the concrete tokens, slots,
budgets, gates, and commands inlined so you can execute the whole task from the
one file.

## Load the right skill

| You want to create… | Open |
|---|---|
| A **deck** — a full presentation from a blank `.md` | [`deck.md`](./deck.md) |
| A **theme** — a palette (`themes/<name>.css`) | [`theme.md`](./theme.md) |
| A **component** — a new `<!-- _class: X -->` layout | [`component.md`](./component.md) |
| A **chart component** — a data visualization in the chart family | [`chart-component.md`](./chart-component.md) |
| A **finish** — a `finish:` backdrop layer stack | [`finish.md`](./finish.md) |
| A **lens** — a reader-side subset projection of a deck (Lente) | [`lens.md`](./lens.md) |
| **Speaker notes, reviews, and captions** — the channels that travel with a slide | [`speaker-notes.md`](./speaker-notes.md) |

## How these differ from the rest of `design/`

The rest of `design/` is the **canon** — the "why" behind the engine's rules —
and its governing law is *link, don't restate*. These skills deliberately break
that law: each is a **synthesized teaching layer whose job is to stand alone**,
so an agent building an artifact never has to chase a link mid-task. The
load-bearing rules (skeletons, token lists, capacity/density budgets, gate
commands) are inlined on purpose.

To keep the canon the single source of truth anyway, **every skill ends with a
"Canonical sources" section** pointing at the real owning doc. When a skill and
its canonical source disagree, the canonical source wins — open an issue and fix
the skill. Treat each skill as a fast path, not a fork.

## The shared shape

Every skill follows the same spine, so once you have read one you can navigate
all of them:

1. **The 10/10 bar** — the quality rubric for *this* artifact.
2. **Mental model** — the minimum concept you need (where it sits in
   Function · Form · Substance · Finish, or in the reader/authoring pipeline).
3. **Where it lives** — the exact files, directories, and npm scripts.
4. **Recipe** — numbered, end-to-end, blank file → shipped.
5. **The contract / skeleton** — a copy-paste starting point.
6. **What good looks like / What bad looks like** — concrete, side-by-side.
7. **Ship checklist** — the gates that must be green.
8. **Common mistakes** — the anti-patterns, each with the fix.
9. **Canonical sources** — links back to the owning canon.

## Non-negotiables that cut across all seven

- **Palette-blind.** Layout and finish CSS never hardcodes a color — every color
  is `var(--token)` or `color-mix()` of one. Only `themes/*.css` and
  `*.tokens.css` hold hex. (HARD RULE #3.)
- **Never hand-edit generated files.** `dist/**`, every `<name>.docs.md`, every
  `<name>.gallery.md`, and the snippets are generated. Edit the source (the
  manifest, the theme, the CSS) and run `npm run build`. (HARD RULE #2.)
- **US English** everywhere a human reads words, including hyphenated identifiers
  (`gray`, `catalog`, `-ize`, `-or`). (HARD RULE #21.)
- **Space with `padding` / `gap`, never `margin`** in engine layout CSS — margin
  is invisible to the height math the overflow probe depends on. (HARD RULE #20.)
- **One source of truth across render paths.** Transforms land in the shared
  kernel, never one path. (HARD RULE #1.)
- **Record user-visible changes** in `CHANGELOG.md` `## Unreleased` as they land.
  (HARD RULE #10.)
