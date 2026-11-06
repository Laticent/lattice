---
name: edit-deck
description: "Use when editing or restructuring a deck that already exists: find its argument, reorder, split or merge slides, keep the author's voice and change only what was asked."
kind: operate
studio: true
---

# Skill — Edit a deck that already exists

> Change a deck someone else wrote so it argues better, without making it
> sound like someone else wrote it, and without touching what nobody asked about.

**Read this when** the deck is already there and the ask is "tighten this",
"reorder the middle", "split slide 6", "merge these two", "make the argument
clearer" or "rewrite the closing". **You'll produce** the same `.md` file with
the smallest diff that does the job, still lint-clean, with its front matter
and slide separators intact.

For a deck from a blank file, use `deck.md`. For a change to how it looks
(theme, finish, layout swap for looks), use `restyle-deck.md`. For lint or Coach
findings, use `fix-findings.md`.

---

## The 10/10 bar

- **Smallest diff that does the job.** Every changed line traces back to the
  ask. Slides the author did not mention come back byte-identical.
- **The author's voice survives.** Their terms, their numbers, their names,
  their register. You fix structure and clarity; you do not rebrand the prose.
- **The argument reads top to bottom.** Read only the `##` headings in order:
  they should be the deck's case, one claim per slide, ending in one ask.
- **Structure stays valid.** Front matter untouched unless asked, one `---`
  between every slide, every slide still has its `<!-- _class: … -->` line.
- **Lint stays clean.** `npm run lint:deck -- <file>` reports no new error or
  warning on any slide you touched.

Mediocre looks like: a "light edit" that rewords every slide, a reorder that
silently drops a slide, a split that leaves both halves with the same heading,
a merge that produces a 90-word wall, or a deck that now speaks in your voice.

---

## Mental model

A deck is a **sequence of claims**. Each slide is one claim (the `##` heading)
plus the evidence for it (the body), in a component chosen for that evidence's
shape. Editing works at three levels, and you should know which one the ask is
at before you touch anything:

| Level | The ask sounds like | You change |
|---|---|---|
| **Argument** | "the story doesn't land", "reorder", "what's missing" | slide order, which slides exist, the headings |
| **Slide** | "split slide 6", "merge 3 and 4", "this one is too busy" | one or two slides' boundaries and bodies |
| **Line** | "tighten the wording", "fix the heading on 5" | words inside one slot |

Stay at the level asked. A line edit never reorders slides; a reorder never
rewrites bodies.

**How the engine finds slide boundaries.** The default divider is
`split: headings`: within each `---`-separated section, the first `#` or `##`
opens the slide and every later `#` or `##` starts a new one. An eyebrow and
`<!-- _class -->` line written above a heading travel with that heading. So:

- A slide with **no `##` heading** (a `big-number`, a heading-less `image`)
  needs a `---` on **both** sides, or it fuses with its neighbor.
- **Merging** two slides means removing one heading, not just a `---`.
- **Splitting** a slide means adding a second `<!-- _class -->` + `##` (and a
  `---`), not just a `---`.

Writing a `---` between every slide makes all three cases explicit, and the
`lint:deck` slide numbers then match what you see. Keep that style when the
deck already uses it, and don't strip `---` lines from a deck that has them.

---

## Where it lives

- **The deck**: one `.md` file. In Lattice Studio, the open deck in the editor
  (Markdown or Compose; both edit the same source).
- **Commands**:
  - `npm run lint:deck -- <file>` — errors (`✗`), warnings (`⚠`), then advisory
    suggestions (`ℹ`). Exit code 1 on any error.
  - `npm run lint:deck -- --fix <file>` — applies every machine fix in place.
  - `npm run new:slide -- <name>` — prints a component's skeleton when a split
    needs a different component.
  - `npx lattice <file>.md <file>.pdf` — render and look.
- **In the Studio**: the slide strip moves, duplicates and deletes slides
  (keys below), and the command palette (⌘K / Ctrl+K) has "Move slide left",
  "Move slide right", "Duplicate slide" and "Delete slide". ⌘Z / Ctrl+Z undoes
  from anywhere.
- **From the Studio chat**: `read_slides` reads exact Markdown; `edit_slides`
  stages `replace` (the whole slide, `<!-- _class -->` line to last line),
  `insert` (after slide N; 0 means before the first) and `delete`. In the
  default Review mode the author sees one diff card for the turn and applies it
  or not; in Auto mode a clean edit applies at once and History restores it,
  but an edit that deletes slides or rewrites most of the deck still waits.

---

## Recipe

1. **Read the whole deck before changing anything.** Front matter first (theme,
   `profile:`, `split:`, `header:`), then every slide. Note the author's terms
   for things — product names, units, how they write numbers.

2. **Write the argument out.** List the `##` headings in order. Mark each one:
   is it a sentence that makes a claim? Does it follow from the one before?
   Where is the ask? This list is your map; most structural asks are solved on
   it before you touch a slide.

3. **Pin the ask to a level** (argument, slide or line) and name the slides in
   scope. Everything else is read-only.

4. **Make the change.**
   - **Reorder**: move whole slides, `<!-- _class -->` line through the last
     line, with their speaker notes. Re-read the headings in the new order.
   - **Split**: each half gets its own component, its own claim-heading and
     its own `---`. Count each half against its component's `capacity` in
     `dist/docs/components.pick.md`. If a half changes component, open that
     component's `lib/components/<bucket>/<name>/<name>.docs.md` first (HARD
     RULE #6).
   - **Merge**: keep one heading — the one that states the combined claim —
     and fold the other slide's evidence in. Re-count: a merge that crosses
     the component's `capacity` or the deck's word budget is a split waiting to
     happen; push detail into speaker notes instead.
   - **Line edit**: change the words, keep the slot. A card title stays a card
     title; a nested body stays nested.

5. **Move cut detail into speaker notes, don't delete it.** A plain HTML
   comment after the slide's content is that slide's note:
   `<!-- Have the per-clinic numbers ready. -->`. The author can still say it.

6. **Lint**: `npm run lint:deck -- <file>`. Fix every error and warning on the
   slides you touched. Suggestions on untouched slides are not yours to fix
   unless asked; mention them instead.

7. **Render and look** (`npx lattice deck.md deck.pdf`). Check the reorder
   reads as a story and no slide clips.

---

## The contract / skeleton

The slide unit you move, split or merge is everything from one
`<!-- _class -->` line to the next `---`:

```markdown
---

<!-- _class: content -->

## Monday mornings still undo most of the gain.

Walk-ins double on Mondays, and the shared rota cannot cover all six clinics at once.

<!-- Monday is the slide the board will ask about; have the per-clinic numbers ready. -->

---
```

A heading-less slide keeps a `---` on both sides:

```markdown
---

<!-- _class: big-number -->

`Median wait, Q3`

- 18 min
  - down from 27 min in Q2, across all six clinics.

---
```

A full worked deck after a restructure (lint-clean) — the ask was "lead with
the result, end on the decision":

```markdown
---
marp: true
size: 4k
theme: indaco
paginate: true
header: "Northwind Clinics · Ops review"
---

<!-- _class: title silent -->

# Northwind Clinics

`Ops review · Q3 2026`

Wait times fell by a third, and one staffing call decides whether that holds.

---

<!-- _class: big-number -->

`Median wait, Q3`

- 18 min
  - down from 27 min in Q2, across all six clinics.

---

<!-- _class: cards-grid three -->

## Three changes cut the wait, and none of them cost headcount.

- Triage at the door
  - A nurse sorts walk-ins before they reach the desk.
- Booked return visits
  - Follow-ups leave with a time slot, not a phone number.
- One shared rota
  - Clinics lend staff to each other on the busy mornings.

---

<!-- _class: content -->

## Monday mornings still undo most of the gain.

Walk-ins double on Mondays, and the shared rota cannot cover all six clinics at once.

<!-- Monday is the slide the board will ask about; have the per-clinic numbers ready. -->

---

<!-- _class: split-compare -->

`Decision required`

## Monday cover needs one choice before the winter peak.

The rota holds every day but Monday, and winter adds a fifth more walk-ins.

- Stretch the rota
  - No new cost
  - Monday waits pass 25 min again
- Hire two floating nurses
  - $190k a year
  - Holds the 18 min median every day

> We recommend hiring two floating nurses before December.

---

<!-- _class: closing silent -->

## Approve two nurses and keep the wait under twenty minutes.

`Dana Ruiz · COO · ops@northwind.example`
```

---

## What good looks like

- Asked to "move the result up front", you moved one slide and changed
  nothing else. The diff is one block of lines moving.
- Asked to split a six-card slide, you produced a `cards-grid three` and a
  `list-tabular`, each with its own claim-heading, and both headings advance
  the argument instead of repeating it.
- Asked to merge two thin slides, the result has one heading stating the
  combined claim, stays under the deck's word budget, and the dropped detail
  sits in a speaker note.
- The author wrote "walk-ins" and "the rota"; your edits say "walk-ins" and
  "the rota", not "unscheduled patients" and "staffing schedule".

---

## What bad looks like

- **The silent rewrite.** "Tighten slide 4" comes back with slides 2–9
  reworded. Fix: revert everything outside slide 4.
- **The fused slide.** A `big-number` moved without its trailing `---` now
  renders on the same page as the next slide's heading. Fix: a `---` on both
  sides of every heading-less slide.
- **The twin headings.** A split leaves `## Revenue grew` on both halves —
  `duplicate-heading` flags it. Fix: each half states its own claim.
- **The wall.** A merge stacks two bodies into 95 words — `wall-of-text`. Fix:
  keep the stronger evidence, move the rest to notes, or don't merge.
- **The orphaned note.** A reorder moved the slide and left its
  `<!-- note -->` behind on the previous slide. Fix: notes move with their slide.
- **The new voice.** Contractions removed, jargon added, numbers reformatted
  from "$190k" to "USD 190,000". Fix: match the author's style, not yours.
- **The front-matter drive-by.** You "cleaned up" `header:` or switched
  `theme:` during a content edit. Fix: front matter changes only when asked.

---

## Ship checklist

- [ ] Every changed line traces to the ask; untouched slides are byte-identical.
- [ ] Front matter unchanged unless the ask named it.
- [ ] Every slide still starts with its `<!-- _class: … -->` line; every
      heading-less slide has a `---` on both sides.
- [ ] Read the `##` headings alone, in order: they make the case and end on
      one ask.
- [ ] No two slides share a heading.
- [ ] Each touched slide counted against its component's `capacity`.
- [ ] Cut detail moved into speaker notes, not lost.
- [ ] `npm run lint:deck -- <file>`: no errors or warnings on touched slides.
- [ ] Rendered and looked at.

---

## Common mistakes

1. **Editing before reading the whole deck.** You miss that slide 9 already
   says what you are adding to slide 3. Read first, map the headings, then edit.
2. **Deleting a `---` to "merge"** while both headings stay. Under
   `split: headings` the two `##` still make two slides. Remove a heading.
3. **Splitting without a new heading.** A bare `---` in the middle of a slide
   gives the second half no claim and no component. Add `<!-- _class -->` + `##`.
4. **Moving a slide without its notes or its eyebrow.** Move the whole unit.
5. **Changing the component during a line edit.** If the words no longer fit
   the component, say so and offer the swap; that is a restyle or a split.
6. **Fixing every Coach suggestion while you're in there.** Out-of-scope
   findings get mentioned, not fixed.
7. **Inline bold card titles** (`- **Title.** body`) when you rewrite a card.
   Keep the nested `- Title` / `  - body` shape (HARD RULE #5).
8. **Rewriting numbers.** Units, rounding and currency format are the
   author's. Change a number only when it is wrong, and say so.

---

## Canonical sources

- `design/editorial.md` — headings as claims, cadence, card titles, closing style.
- `design/skill.md` — the deck-authoring contract.
- `lib/base/base.registers.docs.md` § The `split:` front-matter divider — how
  slides divide (`headings` vs `rule`).
- `spec/LFM-1.0.md` §2.2 (slide separators) and §3.5 (speaker notes).
- `AGENTS.md` — the count → capacity → lint → render loop.
- `dist/docs/components.pick.md` — capacity per component, for splits.
- `design/skills/deck.md` — the 10/10 bar for a whole deck.
- `design/skills/speaker-notes.md` — what goes in a note.
