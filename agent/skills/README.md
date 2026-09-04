# Creating something new

Each file here teaches you to build **one** kind of Lattice artifact from a blank file,
end to end. They are self-contained on purpose: the tokens, slots, budgets and commands
are inlined so you never have to chase a link mid-task.

## Which one

| You want to create… | Open |
|---|---|
| A **chart component** — a data visualization | [`chart-component.md`](./chart-component.md) |
| A **component** — a new `<!-- _class: X -->` layout | [`component.md`](./component.md) |
| A **deck** — a full presentation from a blank `.md` | [`deck.md`](./deck.md) |
| A **finish** — a backdrop layer stack | [`finish.md`](./finish.md) |
| A **lens** — a reader-side subset of a deck | [`lens.md`](./lens.md) |
| **Speaker notes, reviews and captions** | [`speaker-notes.md`](./speaker-notes.md) |
| A **theme** — a palette | [`theme.md`](./theme.md) |

## What each one gives you

Every skill follows the same nine-part shape, so once you have read one you can navigate
all of them: the **10/10 bar** for that artifact · a **mental model** · **where it lives** ·
a numbered **recipe** · a copy-paste **contract** · **what good and bad look like** ·
a **ship checklist** · **common mistakes** · **canonical sources**.

They name the falsifiable bar — the rules you can check. The last mile is taste, and every
skill ends in the same place for that reason: **render it and actually look at it.**

## Reading these outside the Lattice repository

These files ship **verbatim** from the Lattice repo, so they cite things a kit reader does
not have. That is deliberate — rewriting them would fork a second copy that drifts from the
originals. Read the references as context, not instructions:

- **`npm run …` commands and paths like `lib/…`, `tools/…`** assume a clone of the Lattice
  repository. Skip them unless you have one.
- **"HARD RULE #N"** cites the engine's own engineering rules. The ones these skills
  actually reference:

| Rule | What it says |
|---|---|
| #1 | Render paths share one source of truth |
| #2 | Never hand-edit `dist/` |
| #3 | No hex literals in layout CSS — always `var(--token)` |
| #4 | Typography is the 12-token `--fs-*` system |
| #8 | Isolate feature/fix content from the six long-running galleries |
| #11 | Universal role-based token names are canonical |
| #15 | Don't reinvent — reuse, for tooling AND UI |
| #20 | No `margin` in engine layout CSS — space with `padding` / `gap` |

Nothing in the recipes depends on being able to follow those citations — they explain
*why* a step exists, not *how* to do it.
