---
status: in-progress
summary: >
  An agent that arrives at lattice.style could find nine overlapping descriptions of how to write a
  deck, and the one built for agents (the dist-kits agent kit) taught Lattice as Marp: `marp: true`,
  `theme: cuoio`, three runtime `<script>` tags, and the sentence "A Lattice deck is a Marp deck first."
  That happened because the kit promised no install, Lattice was not on npm, and marp-cli was the only
  renderer left. This note replaces the nine with one generated agent pack served from lattice.style
  (`/llms.txt` → `/agents/start.md` → one file per layout → craft guides), mirrored to dist-kits. Lattice
  is the renderer (`npx @laticent/lattice`, written as if published, on the owner's instruction); Marp is
  one export page. Build gates hold the links, the size budgets and the Marp wording, and a nightly eval
  has a model write decks from `start.md` alone.
companion:
  - ./2026-09-05-agent-kit-by-destination.md
  - ./2026-08-30-agent-kit-and-dist-kits.md
  - ./2026-11-17-site-discovery.md
  - ./2026-08-02-marp-reference-register.md
---

# One agent pack, and Lattice as its renderer (2026-11-17)

The owner asked an agent to use lattice.style after #3277 shipped and say whether it helped. It did:
a deck written from the site alone rendered on the first try with zero lint errors. It also found that
the site and the kit disagreed about what a deck is. The owner's goal, in their words: agents should not
chase files or get the wrong information; they should get lean yet comprehensive information to create
and craft excellent decks.

## 1. What an agent could find, measured 2026-11-17

| Source | Where | Size | Problem |
|---|---|---|---|
| `/llms.txt` | site | 1.9 KB | Names the kit in one sentence, then lists `/components.md` under Reference |
| `/components.md` | site | **695 KB, ~170k tokens** | The obvious link for picking a layout, and it fills most of an agent's context |
| `.md` copies of docs pages | site | 4–25 KB each | 18 of 23 internal links point at the HTML page, not the copy (`/guides/cli/` is 226 KB of HTML; its copy is 20 KB) |
| `paste/*.md` (three sizes) | dist-kits | 3–8.8 KB | Good content; starts every deck with `marp: true` and `theme: cuoio` |
| `authoring/` (canon, rules, modifiers, primer) | dist-kits | 4–99 KB | `README.md` §"Three things that will bite you" is all Marp |
| `components/*.md` | dist-kits | 3–20 KB each | The best per-layout material we have |
| `upload/` (10 bundles) | dist-kits | 51–338 KB | The same material, rebundled |
| `repo/` drop-ins, `plugin/` | dist-kits | small | Copies of the paste text |
| `components.pick.md` | dist-kits only | 17 KB | The site does not serve it (404) |
| `design/skills/`, `design/skill.md`, `AGENTS.md` | repo | 13 KB per skill | Not reachable from the site |
| The Studio's system prompt | app | — | `DECK_CANON` plus the catalog (`docs/src/components/studio/chat-agent.ts:86`); the one agent context we exercise against real model output |

The kit's GitHub link (`github.com/…/tree/dist-kits/agent`) returns 230 KB of GitHub's HTML; the file
an agent wants is on `raw.githubusercontent.com`, which nothing links.

## 2. Why the kit taught Marp

Three causes, in order of weight.

1. **No renderer without a clone.** The kit promises "no clone, no install".
   `2026-08-30-agent-kit-and-dist-kits.md` measured `registry.npmjs.org/@laticent%2Flattice` as
   "Not found". The only renderer left was marp-cli plus the Marp kit, so `tools/build-agent-kit.mjs`
   built every deck shape around it. `2026-09-05-agent-kit-by-destination.md` §3 then moved the kit
   from `theme: indaco` to `theme: cuoio` because the Marp kit registers only `lattice`, `cuoio` and
   `cuoio-dark`. Each step was locally correct; together they made Marp the default identity.
2. **The Marp audit sorts by file.** `tools/marp-inventory.mjs` puts a whole file in one class.
   `build-agent-kit.mjs` legitimately documents export-to-Marp, so all 54 of its mentions land in
   `export`, which reads as approved, including the sentence that a Lattice deck is a Marp deck. The
   kit itself exists only as generated output on an orphan branch, which the audit never scans.
3. **No gate.** The register (`2026-08-02-marp-reference-register.md`) was a one-time audit; its tool
   is not in CI and today reports 549 untriaged files. About 237 example decks still carry
   `marp: true` for the VS Code preview (§5(b) of the 2026-07-10 audit), and agents copy our examples
   more than they read our docs.

## 3. The owner's calls (one round, 2026-11-17)

| Question | Answer |
|---|---|
| One generated pack served on lattice.style, with dist-kits becoming a copy of it? | **Yes** |
| Publish `@laticent/lattice` to npm? | **"Act like it is released, anticipating the future."** The pack documents `npx @laticent/lattice` as the render route. The publish itself is a release and stays the owner's (CLAUDE.md row 5) |
| How to prove the pack makes excellent decks? | **A nightly CI eval** |
| Keep `marp: true` in our decks for the VS Code preview? | **Revisit the 2026-07-10 decision** |

## 4. The design

### 4.1 One source, served as is

The site serves `dist/agent-kit/` verbatim at `/agents/` (`docs/scripts/sync-portal.mjs`), the
same tree `publish-kits.yml` mirrors to `dist-kits:agent/`. One tree means one set of relative
links, and the kit build fails on a link that leaves it, so every link resolves on the site and
on the branch alike. The folders keep the kit's names rather than new ones (`layouts/`,
`craft/`), because renaming them would break every link already published to dist-kits.

| Layer | URL | Holds | Budget |
|---|---|---|---|
| Router | `/llms.txt` | What Lattice is, then the pack first, the docs copies second, the 700 KB reference last | 4 KB (existing gate) |
| Start | `/agents/start.md` | The file shape with a whole three-slide deck, the short deck canon, the rules, the 19 common layouts one line each, one modifier from each of three groups, the notes, check and render, and links on (§4.9) | **1,500 tokens** (owner, 2026-11-27) on Claude's count: gated at 990 o200k; 966 today (Claude 1,429). Was 48,000 characters |
| All layouts | `/agents/layouts.md` | What `start.md` held until 2026-11-27, less the full canon: the rules in detail, the parts any slide can carry, the registers, every layout in one line (job, capacity, words per item, variants), the modifiers, the plugins' inline notation, skeletons for the 19 most-used layouts and 2 charts | none; read on demand (10,700 o200k tokens) |
| Plugins | `/agents/plugins/<name>.md` | The 16 plugin docs: pills, icons, sparks, checks, avatars, image, video, callout, legend, code, math, mermaid, function-plot, anima, meta, chart-family | read when a slide uses one |
| Small model | `/agents/paste/lattice-instructions-solo.md` | 19 layouts, self-contained, for a 4,096-token local context | 10,000 characters (existing) |
| Layouts | `/agents/components/<name>.md` | Capacity, slots, variant rule, common mistakes, skeleton | read only for layouts the deck uses |
| Craft | `/agents/skills/<skill>.md` | `design/skills/`: edit, restyle, chart from data, speaker notes, fix findings, and the rest | on demand |
| Export | `/agents/render/lattice-export-to-marp.md` | The one page that describes marp-cli | — |

`start.md` and `layouts.md` write nothing twice. Each section is a file or a value the kit already
builds (`DECK_CANON_SHORT`, the rules, the modifiers) or a field of `components.json` (purpose,
capacity, skeleton), so neither can disagree with the rest of the pack. The full `DECK_CANON` is
`authoring/deck-canon.md`, which `start.md` links.

### 4.2 Lattice is the renderer

- Front matter is Lattice's: `theme: indaco` and `paginate: true`. No `marp: true`.
- Render: `npx @laticent/lattice deck.md deck.pdf`, or open the file in the Studio at
  lattice.style/studio for a destination that cannot run a command (a Claude Project, a GPT, a Gem).
- Check: the bundled `review/check.mjs`, which is code, not a model.
- Marp: only `/agents/render/lattice-export-to-marp.md`, which describes Export to Marp from the Studio or
  `npm run export:marp`. The runtime `<script>` tags, `html: true` and the Marp kit live there.

`npx @laticent/lattice` fails until the package is published. That gap is the owner's stated choice,
not an oversight. The owner plans the release for Sunday 2026-11-22; the audit that day, of every
place that assumes or denies the package is published, is `followups.d/3305-p1-npm-publish-audit.md`.

### 4.3 dist-kits becomes a copy

`publish-kits.yml` keeps mirroring `dist/agent-kit/` to `dist-kits:agent/`. The destination pages
(`start/`, `upload/`, `repo/`, `plugin/`) stay, because upload products cap file count and need
bundles; every one of them is generated from the same pieces as the site pack, so they cannot disagree.

### 4.4 Gates

In the kit build (`assertPack` in `tools/build-agent-kit.mjs`), so `npm run build` fails:

1. Every relative link in every kit `.md` names a file the kit carries.
2. `start.md` holds its budget: `START_TOKEN_MAX`, 990 o200k tokens since 2026-11-27 (§4.9).
   It was `START_MAX`, 48,000 characters.
3. Marp framing appears only in `render/lattice-export-to-marp.md` (and `skills/import.md`, whose
   job is importing Marp decks): no `marp: true` line, no "a Marp deck", no `--theme-set`, no
   marp-cli, no `@marp-team/` package. This is the sentence-level check the register's file-level
   classifier could not make.

In `test/unit/tools/agent-kit-structure.test.js`:

4. `layouts.md` (until 2026-11-27, `start.md`) names every layout in `components.json`, with its variants on its line, and every
   plugin that has a doc, which the pack also carries. The owner asked whether agents would know
   variants, budgets, modifiers and plugins: the first draft carried modifiers and budgets but
   listed no variant names and no plugin at all.
5. Every skeleton in `layouts.md`, `start.md`'s own example deck, and every example deck lints with
   zero errors and zero warnings.
   This found the starter deck's kpi pills in the pre-2026-10 form: three warnings in the one file
   the kit tells a model to copy, and the pills rendered as plain code.

Each gate was driven red (a `marp: true` front matter, a dead link, the old pill form) and restored.

On the site, `docs/scripts/md-twins.mjs` now points a `.md` copy's link at the other page's copy
when it has one, and `--check` fails a copy that still links the HTML page.

### 4.5 The nightly eval

`.github/workflows/agent-pack-eval-nightly.yml` runs `tools/agent-pack-eval.mjs`, both sanctioned
under HARD RULE #24. Two arms: a capable model gets only `start.md`, a small model only the solo
paste text. Each writes a deck from three fixed briefs (a board ask, a lesson, a data review), and
each deck must lint with no errors or warnings, render, report no overflow, hold 6 to 16 slides,
use at least four layouts and carry no `marp: true`. It fails visibly when the
secret is unset (#1931), prints its cost, and never runs per PR. Adding it is a new CI job, which CLAUDE.md
row 2 reserves for the owner; the owner chose it in §3.

### 4.6 The 2026-07-10 revisit

Removing `marp: true` from our decks is independent of the pack (it builds and tests against `main`
alone), so it ships as its own branch and PR (HARD RULE #17) with its own note superseding §5(b) of
the 2026-07-10 audit.

### 4.7 A broken skeleton, found by rendering the pack's own example

The owner looked at the starter deck's `list-steps` slide and saw every step drawn as one bold
block. The cause was upstream of the kit: `list-steps.manifest.json`'s `skeleton` read
`1. First step — a sentence describing what you do here.`, while the gallery and
`lib/core/list-shapes.js` both say the canonical ledger shape is `1. Name` with an indented
`- body`. The whole `1.` line is the step's title, so a dash-joined body renders as part of it.
Every copy inherited it: the component's own docs, `components.json`, `start.md`, the starter
deck, and five example decks. No rule caught it, because `ledger-inline-title` only looks for
`- **Title.** body`.

Fixed at the source: the skeleton is nested, the slot description says which line is the title,
a new warning (`list-steps-inline-body`) flags the one-line form and `--fix` splits it, and
`test/unit/components/skeletons-lint-clean.test.js` lints every skeleton and variant sample in the
catalog, so a teaching shape the linter rejects cannot ship. A scan of all 80 skeletons against
their galleries found no other layout with this mismatch.

### 4.8 The parts every slide shares

The owner then asked about the universal parts: the key insight, the below-note and the rest.
The pack carried neither `lib/base/base.docs.md` nor `base.registers.docs.md`; an agent met the key
insight only in one rule's passing mention and the front-matter registers not at all. Both now ship
(`authoring/universal.md`, `authoring/registers.md`), and `start.md` §4 summarizes them from their
own headings: each "Auto-detected authoring pattern" with its first sentence, and every register
key. Each layout line also says when that layout takes no key insight or below-note, read from
`authoring.blocks` in `components.json` (the same predicate the render uses). That brought
`start.md` to about 42,700 characters (~10.7k tokens), so its budget moved from 40,000 to 48,000.

Shipping the universal reference surfaced two more teaching defects, both fixed at the source:
its key insight example used `- **Title.** body` (a lint error on `cards-grid`), and three of
its front-matter examples still carried `marp: true`. The new
`test/unit/components/skeletons-lint-clean.test.js` lints every one of its examples for errors.

### 4.9 The entry point is budgeted in tokens (2026-11-27)

**The owner's decision:** "we use 1.5K tokens. 48K characters means nothing in the agentic world."
`start.md`'s budget is 1,500 tokens, replacing the 48,000 characters of §4.1 and gate 2 (owner,
desk session_015KSkL4AtPNjvKkBShG56Nu, 2026-11-27). Measured before the change, `start.md` was
46,311 characters and 12,324 o200k tokens, eight times over.

So the pack has two layers where it had one. `start.md` is the short contract and `layouts.md` is
the reference behind it: everything `start.md` used to carry, moved whole, with the structure
gates that guarded it (gates 4 and 5). The full canon (its traps, rhythm and chrome budgets) stays
in `authoring/deck-canon.md`, linked from `start.md`. `start.md` keeps only what a deck cannot be
written without (966 o200k tokens, measured):

| Section | Source | o200k tokens |
|---|---|---|
| Title, version, the link to all layouts | `packages/lattice/package.json` `version` | 32 |
| The file: a whole title, list and closing deck, and how a record names a layout | `DECK_SETTINGS` (`theme`, `pagination`, `color-mode`), each layout's `skeleton`, `silent` on the bookends as the canon says | 158 |
| What a good deck is | `DECK_CANON_SHORT`, less its RIGHT COMPONENT bullet (§4 is that bullet, as a list) | 221 |
| Rules | `essentials(SOLO_LAYOUTS)`, less what the canon and §1 already say and the unclosed-comment rule the linter reports; where content goes on each listed layout with no heading slot (from the slot contracts) and the `NUMBER_SLOT_LAYOUTS` row, from their skeletons; the notes, from `NOTE_NAMES` | 193 |
| The 19 common layouts | `SOLO_LAYOUTS` + `SOLO_INTENT`, the solo text's own list | 235 |
| Modifiers | a record with a modifier, the first token of three `UNIVERSAL_GROUPS` (mood, tone, insight), and the link | 63 |
| Check, render, read more | the checker, `npx @laticent/lattice`, the render page, the full canon | 70 |

What `start.md` no longer says, and where each now lives:

| No longer in `start.md` | Now in |
|---|---|
| Every layout beyond the 19, with capacity, word budgets and variants | `layouts.md` §3 |
| The skeletons beyond `title`, `list` and `closing` | `layouts.md` §6 and `components/<name>.md` |
| The universal parts (key insight, below-note and the rest) and the deck-wide registers | `layouts.md` §2 |
| The inline notation (pills, icons, sparks, checks) | `layouts.md` §5 |
| The detailed rules: kpi row colors, kpi key-insight fit, the `big-number`/`quote` claim, timeline status words, `profile:` | `layouts.md` §1 and §2 |
| The full canon: traps, rhythm, chrome word budgets | `authoring/deck-canon.md` (linked) |
| The canon's RIGHT COMPONENT bullet | `start.md` §4's list does its job; `authoring/deck-canon.md` |
| The ledger and statement rules for layouts outside the 19 (`authority-chain`, `regulatory-update`, `split-compare`, `principles`) | the linter, which reports both (`split-bodyless-item`, `statement-ol-bold`); `main`'s `start.md` never carried them either |
| Every modifier token but `dark`, `tone-pass` and `insight-key` (chrome, decoration, state, table and the rest) | `authoring/modifiers.md` (linked); `silent` is in §1's deck |
| "Every `<!-- -->` comment is closed" | the linter, which reports it as an error (`unterminated-comment`) |
| The skills link | the kit README; `start.md` keeps the full-canon link |
| The starter-deck link | the kit README's `examples/` row |

Every slide record in `start.md` is written by `lib/core/meta-comment.mjs` `metaClass`, and every
front-matter key is read from `DECK_SETTINGS` and refused when retired, so a later rename changes
`start.md` without an edit to the generator. The generator's other slide directives (the paste
texts, the upload bundles, the README) are left as they were: the @meta cut (#3563) rewrites them,
and touching them here would only make the two changes collide.

The worked decks agree with the canon. The canon says both bookends carry `silent`, so `start.md`'s
deck and the paste texts' worked decks write it; the skeletons, which are shapes, leave it to the
author. A test holds the two together (`every worked deck writes \`silent\` on its bookends`).

**Why the gate is 990 and not 1,500.** The gate counts offline with o200k_base, the tokenizer the
repo already ships (`gpt-tokenizer`, the CLAUDE.md router gate's); the build makes no network call.
Claude is the pack's main reader, so the 1,500 must hold on Claude's count. The first draft gated at
1,300 o200k on a guessed 15% margin. Measured on the real counters (Anthropic's `count_tokens` and
Gemini's `countTokens`, both free count-only endpoints, no generation), the guess was wrong:

| `start.md` | o200k | Gemini 3.x | Claude 5 (Opus, Sonnet, Haiku, Fable alike) |
|---|---|---|---|
| `main` (before) | 12,324 | — | — |
| first draft (1,300 gate) | 1,273 | 1,360 | 1,956 |
| first 990 push | 984 | 1,040 | 1,476 |
| after eval run 1 (kpi rule) | 981 | 1,037 | 1,459 |
| after eval run 2 (big-number rule) | 984 | 1,042 | 1,460 |
| after the general rule | 983 | 1,040 | 1,458 |
| as merged (after eval run 3) | 966 | 1,022 | 1,429 |

Claude counts this file at **1.51×** o200k (1.54× on the draft); Gemini at 1.06–1.07×. So the gate
is 990 o200k, about 1,495 on Claude's count (the desk picked this over keeping 1,300, 2026-11-27).
The ratio belongs to this file, not to Markdown in general: **re-count `start.md` on Claude's and
Gemini's counters in the per-release check**, and move `START_TOKEN_MAX` if the ratio moves.
`tools/agent-pack-eval.mjs`'s budget and workflow stay the owner's open calls; this change leaves the
eval as it is.

**The eval, run on the 990 file (2026-11-27, run 46023640639, the owner's "raise it").** Claude
Sonnet 5.5 had only `start.md` in its prompt and wrote one deck per brief; the run cost USD 0.08.

| brief | main, old 12k `start.md` (run 45998307020) | run 1: first 990 file (46023640639) | run 2: + kpi rule (46026988831) | run 3: + general rule (46032981944) |
|---|---|---|---|---|
| board-ask | pass: 7 slides, 6 layouts, 2 suggestions | pass: 7 slides, 6 layouts, 2 suggestions | **fail**: `big-number` number written as a heading | pass: 8 slides, 6 layouts, 2 suggestions |
| teaching | pass: 10 slides, 8 layouts, 0 suggestions | pass: 8 slides, 6 layouts, 2 suggestions | pass: 8 slides, 6 layouts, 2 suggestions | **fail**: a body nested under each `agenda` row |
| data-review | pass: 6 slides, 6 layouts, 1 suggestion | **fail**: the export clipped slide 3 | pass: 7 slides, 7 layouts, 3 suggestions | pass: 6 slides, 6 layouts, 1 suggestion |
| cost (USD) | 0.23, both arms | 0.08 | 0.075 | 0.077 |

Slide 3 was a `kpi` written as `- Customer satisfaction: 91%` with a sentence under each row. The
file carried no `kpi` skeleton, so the model guessed the shape. Rewriting only that slide to the
skeleton's shape (`1. 91%`, then the label and one short context line) renders with no overflow.
So `start.md` now teaches the number-row shape for `NUMBER_SLOT_LAYOUTS` (`kpi`, `stats`), using the
`kpi` skeleton's own first row as the example, inside the 990 gate.

Run 2 passed data-review and failed board-ask the same way: its `big-number` slide wrote
`# 3.8 days` as a heading, which leaves the number slot empty (`slot-contract`,
`big-number-hero-heading`). The rule now says a number is a list item, never a heading, and gives
the `big-number` skeleton's first item too. With only that slide rewritten, the deck lints clean and
renders with no overflow. The pattern is the cost of the cut: a layout whose skeleton is not in
`start.md` is a guess for a model that cannot open `components/<name>.md`, and both failed guesses
were content written as a heading. So the rule is generated, not listed by hand: every layout
`start.md` lists whose slot contract (`lib/authoring/slot-contract.generated.js`) has no heading slot
is named with the form its required slot takes (today `big-number`, a list item, and `quote`, a
`>` blockquote), plus the `NUMBER_SLOT_LAYOUTS` row (`kpi`, `stats`). Every other listed layout has
an `h2` title slot, so a heading there is right. A new headingless layout enrolls itself, and a test
derives the same set from the contracts. The three briefs' expected-shape decks lint clean against
it and render with no overflow. Run 3 is the last eval round for this PR (the raise-loop cap).

Run 3 passed board-ask and data-review and failed teaching on a rule `start.md` itself taught:
"A row on `agenda`, `kpi`, … always has a body under its title". The model nested a body under each
`agenda` row, and `agenda` reads one list level (`list-depth-unsupported`). The sentence comes from
`essentials()`, which every paste text shares, and it drew its layouts from `LEDGER_LAYOUTS`, the
inline-bold set, rather than from the layouts lint holds to a nested body (`SPLIT_SLOT_LAYOUTS` and
`NUMBER_SLOT_LAYOUTS`). The defect was older than this PR (`main`'s paste texts teach it too); it is
fixed at its source, so the paste texts, the repo drop-ins and `start.md` now name `split-panel`,
`split-compare`, `kpi` and `stats` only. A test pins the set to lint's. The teaching deck with its
agenda rows left bare lints clean and renders with no overflow. No fourth run: the desk capped the
loop at three, so the fix is verified locally, not by the eval.

**The engine version is stamped** into `start.md`, `layouts.md` and `/llms.txt`, read from
`packages/lattice/package.json`. `publish-kits.yml` now republishes on a change to that file, so a
release republishes the pack with its new number.

## 5. Left out

- Publishing to npm (owner's call, §3).
- Rewriting `tools/marp-inventory.mjs` to judge sentences instead of files. Gate 3 covers the pack,
  which is where the wrong sentence did damage; the repo-wide register is a separate job.
