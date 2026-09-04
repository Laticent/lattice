# Lattice agent kit

**Lattice turns plain Markdown into boardroom-quality slides.** One layout per slide,
chosen with `<!-- _class: NAME -->`; slides separated by a line containing only `---`.

This kit is everything you need to author Lattice artifacts well — no clone, no install.
It works with any model; nothing here is vendor-specific.

## Start here

| You are… | Read, in order | ~tokens |
|---|---|---|
| **writing a deck** | `authoring/deck-canon.md` → `authoring/rules.md` → `components/README.md` → `review/` | **~7.3k** once |
| …then one `components/<name>.md` per layout you use | the file for that component | + ~1.7k each |
| **drafting a whole deck** in one pass | `authoring/deck-canon.md` → `authoring/primer.md` | ~19k |
| **creating a theme, component, finish or lens** | `skills/README.md` → the one skill | 3.0k–5.6k each |
| **checking a deck you already wrote** | `review/README.md` | ~719 |
| **building a tool** over the catalog | `reference/README.md` | ~314 |

**Every folder has its own README.** Open the folder and it tells you what is inside and
in what order to read it. Take only what you need — nothing here expects you to load it all.

## The five folders

| Folder | For | Contains |
|---|---|---|
| [`authoring/`](./authoring/) | Writing a deck | The canon (what good looks like), the cross-cutting rules, and all 61 layouts with skeletons |
| [`components/`](./components/) | Choosing and authoring a layout | One file per component — what it is for, what it is **not** for, slots, budgets, mistakes |
| [`skills/`](./skills/) | Creating a NEW artifact from blank | 7 self-contained guides, each with its own 10/10 bar |
| [`review/`](./review/) | Checking your work | A runnable checker + the rubric it applies |
| [`reference/`](./reference/) | Building a tool | The machine catalogs and the Studio's own prompts |

## Two things worth knowing before you start

**Read `authoring/deck-canon.md` before you write slides.** It is what the Lattice Studio
sends its own model on every turn: how a deck argues, and the traps its reviewer flags with
the fix for each. The component files tell you how to author a layout *correctly*; the canon
is what makes the deck worth showing.

**Run `review/check.mjs` when you are done.** It is code, not a model — it costs no tokens,
runs offline in about a tenth of a second, and cannot be talked into approving a deck. A model
checking its own draft will tell you the draft is fine.

## The 13 component families

- **anchor** — where you are in the deck.
  `closing` · `divider` · `title`
- **statement** — one declarative claim per slide.
  `big-number` · `content` · `premise` · `quote` · `split-panel`
- **inventory** — parallel sets of related items.
  `actors` · `agenda` · `cards-grid` · `cards-stack` · `checklist` · `glossary` · `inventory` · `list` · `list-tabular` · `logo-wall` · `q-and-a`
- **comparison** — how two or more options differ.
  `compare-prose` · `compare-table` · `decision` · `matrix-2x2` · `pricing` · `redline` · `split-compare` · `verdict-grid`
- **progression** — ordered movement through stages or time.
  `cycle` · `list-criteria` · `list-steps`
- **evidence** — data that supports the argument.
  `kpi` · `stats`
- **imagery** — visuals that carry their own meaning.
  `image` · `scene` · `video`
- **chart** — series-substance data visualizations (SVG kernel).
  `funnel` · `gantt` · `journey` · `kanban` · `map` · `matrix-grid` · `piechart` · `progress` · `quadrant` · `radar` · `roadmap` · `state-chart` · `timeline-list` · `word-cloud`
  Shared contract: `components/_chart-family.md`
- **diagram** — graph-substance network visuals (external renderer).
  `diagram`
- **math** — typeset equations and proofs.
  `math`
- **code** — syntax-highlighted source code blocks.
  `code` · `compare-code`
- **legal** — citation-aware layouts for statutes, obligations, and regulatory change.
  `authority-chain` · `citation-card` · `obligation-matrix` · `policy-recommendation` · `regulatory-update` · `statute-stack`
- **connect** — cards the room can scan: join the network, save the speaker.
  `contact` · `wifi`

Which one, and which to avoid: [`components/README.md`](./components/README.md).

---

_Generated from the Lattice sources — do not hand-edit. Republished whenever an input_
_changes. ~token figures are bytes ÷ 4, a rough cross-model approximation. This file is ~1.1k tokens._
