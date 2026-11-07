---
name: import
description: "Use when bringing outside content into Lattice: pasted Markdown, a Marp deck, a PowerPoint or PDF, then cleaning the result into the house deck shape."
kind: operate
studio: false
---

# Skill — Bring outside content into Lattice

> Get someone's existing material — a Markdown doc, a Marp deck, a PowerPoint
> — into a Lattice deck that lints clean and argues like a Lattice deck.

**Read this when** the ask starts from content that already exists somewhere
else: "turn these notes into slides", "port my Marp deck", "import this
PowerPoint". **You'll produce** one `.md` deck in house shape: front matter,
one claim per slide, a component per slide, `npm run lint:deck` clean.

The honest summary first: **Lattice opens Markdown and its own exports
losslessly. It does not convert a foreign PowerPoint or PDF.** Everything else
is getting text into Markdown and then shaping it.

---

## The 10/10 bar

- **Nothing the author wrote is lost.** Every point in the source lands on a
  slide or in a speaker note. You reshape; you don't summarize away.
- **House shape, not a transcript.** Each slide has a `<!-- _class: … -->`
  line, a `##` heading that is a full sentence making a claim, and a body
  sized to its component.
- **Foreign syntax is gone.** No Marp theme names, `<!-- paginate -->`
  comments, `![bg left:40%]` sizes or remote images left for the linter to
  find.
- **Clean bytes.** LF line endings, no byte-order mark.
- **Lint-clean**: no errors, no warnings.

Mediocre looks like: a pasted document where every `##` became a slide titled
"Background", a Marp deck that still says `theme: gaia`, or a PowerPoint
"import" that is really a screenshot per slide.

---

## Mental model

Import is two steps, and only the first one is mechanical:

1. **Ingest** — get the content into a Lattice deck file. The format decides
   how (table below).
2. **Shape** — turn that text into one claim per slide with the right
   component. This is authoring, and it follows `deck.md` and
   `edit-deck.md`.

**What opens directly.** The Studio's "Import deck…" (in the deck switcher and
the command palette) and dropping a file anywhere on the Studio both go
through one reader, `docs/src/components/studio/deck-import.ts`. It sniffs the
file's bytes, not its name:

| You have | What happens | Fidelity |
|---|---|---|
| `.md` (also `.markdown`, `.mdx`, `.txt`) | Opens as the deck source | Lossless |
| `.lattice` (or one saved as `.zip`) | Opens with its comments and saved packages | Lossless |
| `.html` exported from Lattice ("Download as webpage") | Reads the deck out of the page | Lossless |
| `.pdf` / `.pptx` exported with "Re-openable in Lattice" (CLI: `--reopenable`) | Reads the `.lattice` carried inside | Lossless |
| A PDF or PowerPoint made anywhere else | **Refused**: "This PowerPoint has no editable deck inside…" | — |
| An image, Keynote file or other binary | Refused | — |

The refusal is deliberate: the reader never scrapes a rendered page into a
lossy draft (`engineering/decisions/2026-06-16-lattice-export-format.md`). A
PowerPoint importer that re-expresses slides as components is a proposal
(`engineering/decisions/2026-06-14-presentation-import.md`), not a shipped
feature.

**How Markdown becomes slides.** The default `split: headings` starts a new
slide at the first `#` and at every `##`, and at every `---`. So a pasted
document already splits into slides — one per section — but each one is a
plain slide with a label heading. That is the starting point, not the result.

**Marp decks are nearly native.** Lattice keeps Marp's slide model —
`marp: true`, `---` separators, `<!-- _class: … -->` — so a Marp deck renders.
What does not carry over is Marp's themes, its per-slide directive comments
and its background-image size syntax. `lint:deck` names each one.

---

## Where it lives

- **Studio**: "Import deck…" (⌘K / Ctrl+K, or the deck switcher); drag a file
  onto the Studio. Pasting into the editor also works: the editor normalizes
  line endings on paste.
- **CLI**: `npx lattice deck.md deck.pdf` reads a Markdown file and strips a
  BOM and CRLF/CR line endings on the way in (`readFileOrDie` in `lattice.js`).
- **Lint**: `npm run lint:deck -- <file>`; `--fix` applies the machine fixes.
- **Line endings**: `.gitattributes` keeps the repo LF;
  `engineering/decisions/2026-08-04-line-endings-lf-boundaries.md` lists every
  place author text enters and is normalized.
- **The other direction**: `npm run export:marp` and the Studio's Share sheet
  write a Marp bundle — that's export, not import.

---

## Recipe

1. **Identify the source** and pick the ingest route from the table above. For
   a foreign PowerPoint or PDF, get its text out first (copy each slide's
   title and body, or export an outline from the tool that made it) and paste
   it as Markdown. Pictures come across as files saved beside the deck.

2. **Normalize the bytes** if any tool other than the Lattice CLI or Studio will
   read the file:
   ```bash
   perl -0pi -e 's/\A\xEF\xBB\xBF//; s/\r\n?/\n/g' deck.md
   ```
   That strips a leading UTF-8 BOM and turns CRLF and lone CR into LF. The
   Lattice CLI and Studio already do this at the door, but a BOM has cost a
   wrong palette, a lost `size:` and an extra slide in tools that did not.

3. **Add the front matter** if the source has none, or replace a Marp one:
   ```yaml
   ---
   marp: true
   size: 4k
   theme: indaco
   paginate: true
   header: "Short deck name · Audience"
   ---
   ```

4. **Lint once, raw**, to see what the source brought with it:
   `npm run lint:deck -- deck.md`. Typical findings on a Marp deck:

   | Rule | Source of it | Fix |
   |---|---|---|
   | `unknown-theme` | `theme: gaia` / `default` | a Lattice palette name from the message |
   | `paginate-comment-retired` | `<!-- paginate: false -->` / `<!-- _paginate: … -->` | `no-pagination` on the slide's `_class:` |
   | `bg-side-unread` | `![bg right:40%](…)` on a plain slide | `<!-- _class: image -->` and `![bg right](…)` |
   | `bg-ratio-unread` | a `:40%` panel size | drop the ratio; the layout sets its share |
   | `web-image` | a picture loaded from a URL | save it beside the deck, link by relative path |
   | `unknown-class` | a Marp class such as `invert` | a Lattice component, or delete it |
   | `card-style-inline-title` | `- **Title.** body` bullets | `--fix`, or nested `- Title` / `  - body` |

5. **Shape each slide.** For every slide: write the claim as the `##` heading,
   count the items, pick the component from `dist/docs/components.pick.md`,
   read its `lib/components/<bucket>/<name>/<name>.docs.md` (HARD RULE #6), and
   pour the source's words into its skeleton. Long paragraphs become a short
   body plus a speaker note (`<!-- … -->` after the content).

6. **Add the bookends** — a `title silent` slide and a one-sentence `closing
   silent` slide — if the source had none.

7. **Lint to clean, render, look.** `npm run lint:deck -- deck.md`, then
   `npx lattice deck.md deck.pdf`.

---

## The contract / skeleton

A pasted planning doc, as it arrives:

```markdown
# Onboarding plan

We want new hires productive in 30 days.

## Week 1

- Laptop setup
- Meet the team

## Week 2

- First ticket
```

The same content in house shape (lint-clean). The weeks became one
`cards-grid three` with a claim-heading, and the source's goal became the
title subtitle:

```markdown
---
marp: true
size: 4k
theme: indaco
paginate: true
header: "Onboarding plan · Engineering"
---

<!-- _class: title silent -->

# Onboarding Plan

`Engineering · 2027`

New engineers ship their first change in their second week, and own a service by day thirty.

---

<!-- _class: cards-grid three -->

## Each week of the first month ends in something the new hire shipped.

- Week one
  - Laptop, accounts and a first pairing session with the team.
- Week two
  - A first ticket merged, reviewed by their buddy.
- Weeks three and four
  - On-call shadowing, then one small service of their own.

---

<!-- _class: content -->

## A named buddy answers the questions a wiki cannot.

Each new hire gets one engineer for the month who reviews their code and joins their first on-call shift.

---

<!-- _class: closing silent -->

## Name a buddy before the start date.

`People team · onboarding@example.com`

We recommend assigning every buddy a week before the hire starts.
```

When the source is thin, ask the author for the missing facts rather than
inventing them. The example above assumes the author supplied weeks three and
four and the buddy detail.

---

## What good looks like

- A 40-section Markdown doc became 12 slides, because sections that made one
  point were merged and the rest went into speaker notes.
- A Marp deck kept every slide and every word; only front matter, directive
  comments and image syntax changed, and lint is clean.
- A foreign PowerPoint was rebuilt from its text outline, and the author was
  told plainly that layout and pictures were not carried over automatically.
- Remote images were downloaded once and linked by relative path.

---

## What bad looks like

- **The transcript.** Every `##` of the source became a slide headed
  "Background", "Goals", "Next steps" — `label-title` on each. Fix: rewrite
  each heading as the claim that section makes.
- **The promised PowerPoint import.** Telling the author a `.pptx` from another
  tool will open. It will be refused. Fix: say so, and rebuild from its text.
- **Screenshots as slides.** Pasting a picture of each old slide. Nothing is
  searchable, lintable or restylable. Fix: rebuild from text.
- **Marp leftovers.** `theme: gaia`, `<!-- _paginate: false -->`, `![bg
  left:30%]` still in the file. Fix: the table in step 4.
- **A slide with 140 words.** A pasted paragraph left whole. Fix: one claim on
  the slide, the rest in a speaker note.
- **Invented facts** to fill a component's slots. Fix: leave the slot out or
  ask.

---

## Ship checklist

- [ ] Ingest route matches the source format; a foreign PPTX/PDF was rebuilt
      from text, not "imported".
- [ ] LF endings, no BOM.
- [ ] Front matter is Lattice's: a real `theme:`, `size: 4k`, `paginate`,
      `header`.
- [ ] Every slide has a `<!-- _class: … -->` line and a claim-heading.
- [ ] Every point from the source is on a slide or in a speaker note.
- [ ] No remote images; no Marp-only directives or theme names.
- [ ] Title and closing bookends present, both `silent`.
- [ ] `npm run lint:deck -- <file>`: no errors or warnings.
- [ ] Rendered and looked at.

---

## Common mistakes

1. **Trusting the file extension.** The Studio reads bytes; a `.pptx` mailed as
   `.zip` opens if Lattice made it, and a renamed foreign file is refused for
   what it is.
2. **Forgetting `split: headings`.** A source with `#` and `##` inside one
   `---` section becomes several slides. To keep a Marp deck's `---`-only
   splits exactly, either keep one heading per section or set `split: rule`.
3. **Skipping the raw lint.** It is the fastest list of what the source
   brought with it.
4. **Keeping a Marp class because it renders.** A class Lattice doesn't know
   gets no layout from it (`unknown-class`); pick the component the content needs.
5. **Leaving the author's labels as headings.** The import is where a
   document's section names turn into slide claims.
6. **Writing your own ingest tool** without normalizing line endings and the
   BOM. Read the line-endings decision first; ingests are listed in
   `SANCTIONED_EOL_BOUNDARIES` in `tools/check-ownership.js`.

---

## Canonical sources

- `docs/src/components/studio/deck-import.ts` — what "Import deck…" reads and
  refuses, and why.
- `docs/src/components/studio/deck-import-accept.ts` — the file picker's list.
- `engineering/decisions/2026-08-04-line-endings-lf-boundaries.md` — LF, BOM
  and the ingest boundary list.
- `engineering/decisions/2026-10-05-reopenable-exports.md` — how a Lattice PDF
  or PPTX carries its own source.
- `engineering/decisions/2026-06-14-presentation-import.md` — the proposed
  (not shipped) importer for foreign decks.
- `spec/LFM-1.0.md` §2 and §6 — slide separators, front matter, and the Marp
  relationship.
- `lib/base/base.registers.docs.md` § The `split:` front-matter divider.
- `design/skills/deck.md` and `design/skills/edit-deck.md` — shaping the
  imported text into a deck.
