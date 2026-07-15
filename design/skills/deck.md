# Skill — Create a deck

> Build a complete, boardroom-grade presentation from a blank `.md` file, in
> Lattice-Flavored Markdown (LFM), that renders 10/10 the first time.

**Read this when** you are asked to write a presentation, pitch, board update,
review, or any multi-slide deck. **You'll produce** a single `.md` file that the
`lattice` CLI renders to a vector PDF (and HTML / PPTX / PNG) with no edits.

---

## The 10/10 bar

A boardroom-grade Lattice deck is not "slides that render." It is:

- **One idea per slide**, and every `## ` heading is a **complete declarative
  sentence that IS the slide's claim** — not a label, not a question.
- **A narrative arc**: a title that states the stakes, sections that build the
  argument, a closing that names one ask. It reads as a story, not a file dump.
- **Rhythm**: prose claims interleaved with an evidence beat (a number, a chart),
  a human beat (a quote), a decision beat. It never runs three `content` slides
  in a row.
- **Restraint**: ≤ ~40 words of body per slide, ≤ 6 bullets, ≤ 4 cards. When
  content overflows, you **split the slide — never shrink the font.**
- **Right component per slide**, chosen by intent and by counting the content
  against the component's capacity — not from memory.
- **Zero lint errors** from `npm run lint:deck`.

Mediocre looks like: noun-phrase headings ("Q2 Results"), walls of text, the body
restating the heading, six cards crammed into a four-card grid, passive voice and
unnamed actors, and a closing slide that lists bullet-point next steps.

---

## Mental model

Every Lattice slide is a stack of four orthogonal choices —
**Function · Form · Substance · Finish** — but as a deck author you only touch
three of them directly:

- **Function** = *what this slide is for.* One of seven: Anchor (where am I),
  Statement (one claim), Inventory (a parallel set), Comparison (how options
  differ), Progression (ordered movement), Evidence (data), Imagery (a visual
  that carries meaning). You express Function by choosing a **component**.
- **Substance** = *what you write.* Plain markdown — headings, paragraphs, nested
  lists, inline-code "pills." The engine turns the shape of your markdown into the
  rendered slide.
- **Finish** = *how it feels.* Set once in front matter: `theme:` (palette),
  `mode:` (typographic hand), `finish:` (backdrop). See the `finish.md` and
  `theme.md` skills.

You pick the component (`<!-- _class: name -->`); the engine supplies the chrome
(masthead band, stage, footer, progress rail) automatically. Your eyebrow and
title "hoist" into the masthead; your body lands in the stage. You rarely think
about Form directly — the component already selected it.

---

## Where it lives

- **Your deck**: a single `.md` file anywhere (put demo decks in `examples/`).
- **The catalog** you pick components from: `dist/docs/components.json` (machine
  catalog — axes, tags, slots, skeletons, `capacity`, `density`, whenToUse,
  antiPatterns) and each `lib/components/<bucket>/<name>/<name>.docs.md`.
- **Commands**:
  - `npm run new:slide -- --list` — browse all components grouped by function.
  - `npm run new:slide -- <name>` — print a component's skeleton.
  - `npm run lint:deck -- <file>` — fast footgun check, no browser. `--strict`
    fails on warnings, `--json` is machine-readable.
  - `node lattice-emulator.js <deck>.md <out>.pdf` — render (extension picks the
    format: `.pdf` / `.pptx` / `.png` / `.html`). In the cloud sandbox, export
    `CHROME_PATH` first if a render says "no browser."
  - `npm run preview` — visual iteration loop (auto-scopes from `git diff`), pair
    with `SendUserFile` to actually look at the output.

---

## Recipe

1. **Front matter.** Start with the canonical boardroom block:
   ```yaml
   ---
   marp: true
   size: 4k
   theme: indaco
   paginate: true
   header: "Meridian Freight · Board update"
   ---
   ```
   `theme:` defaults to `indaco` if omitted. Add `finish:` / `mode:` only
   deliberately (see the finish/theme skills). A typo'd register value
   (`finish: atriumm`) silently renders the baseline — the linter catches it.

2. **Outline the narrative before writing any slide.** Decide the arc:
   title → [section divider → content]* → closing. Write the sequence of `## `
   headings first, as complete sentences — read top to bottom, they should *be*
   the argument.

3. **Per slide, pick the component by intent + capacity.** Match the author's
   intent words to a component's tags/`whenToUse` in `dist/docs/components.json`.
   Then **count your content** and check the component's `capacity` — if the count
   exceeds `hard`, use the `escalateTo` target or split across slides. Before you
   author a `<!-- _class: X -->`, open `lib/components/<bucket>/X/X.docs.md` and
   grep `test/integration/baseline-decks/gallery.md` for a live example (HARD
   RULE #6).

4. **Fill the slots with plain markdown**, using the auto-detected patterns (see
   the skeleton below). Keep inside the word budgets. Push detail you'd *say* into
   speaker notes (see `speaker-notes.md`), not onto the slide face.

5. **Lint:** `npm run lint:deck -- deck.md`. Fix **every** error before rendering.

6. **Render** with the owned CLI and **look at it**:
   ```bash
   node lattice-emulator.js deck.md deck.pdf
   ```
   Then `SendUserFile deck.pdf` (or `tools/rasterize-for-review.sh`) and review
   real slides — is each heading a claim, is any slide a wall of text, does the
   rhythm hold?

---

## The contract / skeleton

Bookends are stereotyped. **Title** puts `# h1` first (MD041 wants h1 first),
then the eyebrow, then a one-sentence subtitle:

```markdown
<!-- _class: title silent -->

# Meridian Freight

`Board update · Q2 2026`

The quarter beat plan, but a carrier-capacity squeeze needs a board decision today.
```

**A content/evidence slide** puts the eyebrow *above* the heading, the heading as
a full sentence, then tight body:

```markdown
<!-- _class: kpi -->

`Performance · Q2 2026`

## Revenue, margin, and cash all came in ahead of plan.

1. $58.4M
   - Quarterly revenue
   - plan $52.6M · +11% `Ahead` `Board`
```

**Closing** is one sentence and a signature — never a bullet list of next steps:

```markdown
<!-- _class: closing silent -->

## Strong quarter — let's protect the peak.

`Elena Marsh · CEO · board@meridianfreight.example`
```

**Auto-detected patterns** (no modifier needed — the CSS reads the markdown
shape):

| Pattern | Write | Renders as |
|---|---|---|
| Eyebrow | a code-only paragraph **above** the `## ` | mono uppercase label |
| Subtitle | a code-only paragraph **below** the `## ` | italic framing line |
| Metadata pill | trailing `` `code` `` on a list row | rounded status chip |
| Key-insight | a trailing `> blockquote` on a card layout | accent takeaway bar |
| Below-note | `— Note: figures are pre-audit.` | hairline muted footnote |
| Numbered cards | author the cards as `1. 2. 3.` (indent sublists 3 spaces) | accent index tags |

**Card-style layouts use nested bullets — never inline bold titles** (HARD
RULE #5):

```markdown
- Ingest                                    ✅ title on its own line
  - Captures invoices from email and portals.   body nested underneath
```
```markdown
- **Ingest.** Captures invoices from email.  ❌ card-style-inline-title lint error
```

---

## What good looks like

A 12-slide board update:
`title → kpi → content → big-number → cards-grid → quote → matrix-2x2 → stats → roadmap → decision → content → closing`.

- Title states the stakes in one sentence.
- Every `## ` is a claim: *"We beat plan on revenue and margin — and we need your
  call on capacity by Friday."*
- The `big-number` slide is one hero metric with a referent, not a naked number.
- Card titles are parallel noun phrases of similar weight: *Strategic Bets /
  Quick Wins / Defer / Time Sinks.*
- The `decision` slide near the end names the one ask; the closing lands it in a
  sentence and stops.

---

## What bad looks like

- `## Overview` / `## Results` / `## Q2 Financials` — labels, not claims. Fix: say
  what the slide proves — *"Revenue grew 18%, led by APAC."*
- A `content` slide with 90 words and 9 bullets. Fix: split into two slides; push
  the detail to speaker notes.
- `## Revenue grew 18%` followed by a body that opens *"Revenue grew 18% because…"*
  — the body restates the claim instead of delivering the mechanism.
- Six cards in a `cards-grid` (hard cap 4) — `capacity-overflow`. Fix: escalate to
  `list-tabular` or split.
- A closing slide with a five-bullet "Next steps" list. Fix: one sentence; the
  next steps are a follow-up email.
- Every heading opening *"How [verb]ing X [verbs] Y"* — monotone. Vary cadence.

---

## Ship checklist

- [ ] Front matter present (`marp`, `theme`, `paginate`, a `header`); `size: 4k`.
- [ ] Title slide (`# h1` first) and a one-sentence closing slide, both `silent`.
- [ ] Every `## ` heading is a complete declarative sentence.
- [ ] Each slide's content counted against the component `capacity`; nothing over
      `hard`.
- [ ] Body within budgets: title ≤ 10 words, eyebrow ≤ 5, subtitle ≤ 12,
      key-insight ≤ 18; whole slide **aim ~40 words body** / ≤ 6 bullets (70 words is
      the hard backstop, not the target).
- [ ] `npm run lint:deck -- deck.md` is clean (no errors).
- [ ] Rendered to PDF and **actually looked at** — rhythm holds, no wall-of-text,
      no overflow.

---

## Common mistakes

1. **Inline bold card titles** (`- **Title.** body`) on a card layout — the #1
   gated footgun. Use nested `- Title` / `  - body`.
2. **Overstuffing a component** — count first, then filter by `capacity`.
3. **Noun-phrase or question headings** instead of declarative sentences.
4. **Restating the heading in the body** instead of delivering the mechanism.
5. **Picking components from memory** — tags/slots/skeletons evolve; read the
   catalog.
6. **Title-slide ordering** — eyebrow before `# h1` trips MD041; h1 comes first.
7. **Forgetting `silent`** on bookends (leaves header/footer/pagination on).
8. **`**bold**` inside a `kpi`/`stats` ordered item** (splits the number grid) and
   **bodyless number items** (the number won't render in display type).
9. **Typo'd `finish:` / `mode:` values** that silently ship the baseline.
10. **Hand-editing generated files** (`dist/**`, `*.docs.md`, `*.gallery.md`).

---

## Canonical sources

- `design/skill.md` — the deck-authoring contract + rendering modes.
- `design/editorial.md` — prose rules (heading-as-sentence, claim-and-deliver,
  concrete nouns, speak-first).
- `design/design-principles.md` — hierarchy, restraint, content limits.
- `design/design-system.md` — the four axes; the 7 functions, 12 forms, 4
  substances; the component catalog.
- `lib/base/base.docs.md` — eyebrow / subtitle / pill / key-insight / below-note
  and the front-matter registers.
- `spec/LFM-1.0.md` — the markdown dialect and front-matter surface.
- `AGENTS.md` — the agent authoring loop (count → capacity → density → lint →
  render).
- `dist/docs/components.json` — the machine catalog you select components from.
