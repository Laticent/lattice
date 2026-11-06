---
name: fix-findings
description: "Use when turning lint, Coach or overflow findings into fixes: reading lint:deck output, the common rule ids and their fixes, and fitting a slide without shrinking type."
kind: operate
studio: true
---

# Skill — Fix lint, Coach and overflow findings

> Read what the checker said, fix the cause on the slide, and leave the deck
> clean — without shrinking text, cutting meaning, or "fixing" things nobody
> flagged.

**Read this when** `npm run lint:deck` printed findings, the Studio Coach shows
cards, an export printed `⚠ OVERFLOW`, or the author asks "what's wrong with
this deck?". **You'll produce** the same deck with every error and warning gone
and the suggestions you chose to act on fixed, each fix at the root.

---

## The 10/10 bar

- **Zero errors, zero warnings.** `npm run lint:deck -- <file>` ends with
  `1 file(s) clean.` or `no errors or warnings`.
- **Fix the cause, not the message.** A `capacity-overflow` is solved by a
  different component or a split, not by deleting the fourth card's body.
- **Type never shrinks to make a slide fit.** No level of `fit:` changes type
  size, and you don't either: cut words, split the slide, or change component.
- **Suggestions are judgment calls.** Act on the ones that make the slide
  better; leave the rest and say why.
- **Machine fixes first.** `--fix` (CLI) or "Fix all issues" (Studio) applies
  the safe rewrites so you spend judgment only on what needs it.

---

## Mental model

Findings come from two checkers that share one core with the Studio:

| Checker | Source | Severity | Means |
|---|---|---|---|
| **Lint** | `lib/authoring/lint-core.js` | **error** (`✗`) | the slide renders wrong. Fix it. |
| | | **warning** (`⚠`) | something is ignored, clipped or about to break. Fix it. |
| **Review** | `lib/authoring/review-core.js` | **suggestion** (`ℹ`) | renders fine, communicates poorly. Advisory; never blocks. |

The Studio Coach grades the same findings (`lib/authoring/scorecard.js` via
`docs/src/components/studio/coach/coach-core.ts`) and shows each one as a card
with its severity, slide and rule id.

**Overflow is three different problems** that look alike:

1. **Too many items** for the component — `capacity-overflow` (warning) or
   `capacity-crowd` (suggestion). Fix: the component's escalation target, or a split.
2. **Too many words** — `wall-of-text` (slide over the deck's word or bullet
   budget), `density-overflow` / `density-crowd` (one item too long),
   `long-heading`. Fix: cut, or move detail to speaker notes.
3. **Too big for the room** — `capacity-scale` when `venue:` or `scale-*` makes
   the slide's content too large to fit. Fix: split, or a smaller venue.

The deck's word budget comes from its `profile:` (`lib/authoring/deck-profiles.js`):
the default allows 70 words and 6 bullets per slide; `profile: teaching`
allows 95. The `wall-of-text` message names whichever budget tripped.

---

## Where it lives

- **CLI**: `npm run lint:deck -- <file>` (`tools/lint-deck.js`). Flags:
  `--strict` fails on warnings too; `--json` is machine-readable; `--fix`
  rewrites the file with every machine fix and prints what it applied.
- **Studio**: the Coach panel (activity rail, "Coach", or ⌘K → "Coach — check
  this deck"); ⌘K → "Fix all issues" appears when any finding has a machine
  fix. A Coach card's fix button drafts a change and shows a diff with Apply
  and Discard.
- **Studio chat**: `check_deck` runs the same linter and review;
  `edit_slides` and `set_front_matter` return the checker's verdict with their
  result.
- **Export**: the CLI prints an `⚠ OVERFLOW` line for a slide that clips; the
  Studio preview rings it.

---

## Recipe

1. **Run the checker.**
   ```bash
   npm run lint:deck -- deck.md
   ```
2. **Read each finding as five parts:** severity, `slide N` (slide 0 is the
   front matter), the rule id with the component in brackets, the message,
   then `at:` (the offending line) and `fix:` (what to do).
   ```text
   ⚠ deck.md · slide 2 · capacity-overflow [cards-grid]
       'cards-grid' fits about 4 items; this slide has 6. Landscape slides don't split, so the extra ones may be cut off.
       at: <!-- _class: cards-grid -->
       fix: Switch to list-tabular, or split across slides.
   ```
3. **Apply the machine fixes.** `npm run lint:deck -- --fix deck.md` (or "Fix
   all issues" in the Studio). It rewrites what it can do safely — inline card
   titles into nested bullets, a near-miss register value into the real one —
   and refuses any fix that would change the slide count, drop the front
   matter, or edit inside a code fence. Re-run lint after.
4. **Fix the remaining errors and warnings by hand**, using the table below.
   Before you change a slide's component, open its
   `lib/components/<bucket>/<name>/<name>.docs.md` (HARD RULE #6).
5. **Decide on each suggestion.** Fix the ones that sharpen the slide. For the
   rest, say in one line why they stand ("the closing is the ask; `no-ask` is
   reading the wrong slide").
6. **Re-lint until clean**, then render and look at every slide you changed.

### Common rule ids and their fixes

| Rule | Sev. | What it means | Fix |
|---|---|---|---|
| `card-style-inline-title` | error | `- **Title.** body` on a card layout | `- Title` then `  - body` (HARD RULE #5). `--fix` does it. |
| `statement-ol-bold` | error | `**bold**` inside a numbered statement item | Remove the bold; the layout already weights it. |
| `capacity-overflow` | warning | more items than the component holds | The `fix:` line's escalation target, or split. |
| `capacity-scale` | warning | too much for the `venue:` / `scale-*` size | Split, or pick the venue that matches the room. |
| `unknown-class` | warning | a `_class:` token the engine doesn't know | Check the spelling; renamed classes name the new one. |
| `unknown-finish` / `unknown-mode` / `unknown-theme` / `unknown-key` | warning | a front-matter value or key the deck ignores | Use a value the message lists, or delete the line. |
| `paginate-comment-retired` | warning | `<!-- paginate: … -->` does nothing | `no-pagination` on the slide's `_class:`. |
| `web-image` | warning | a picture loaded from another site | Save it beside the deck; link by relative path. |
| `typed-shape-glyph` | warning | a typed `✓` `→` `●` doing a drawing's job | `[x]` for a check, a word ("to", "then") for an arrow, a `-` list for a bullet (HARD RULE #29). |
| `code-line-clipped` | info | a code line wider than its pane; the tail is cut | Wrap the line, or give the code its own slide. |
| `label-title` | suggestion | heading is a label ("Overview") | Rewrite as the slide's claim. |
| `long-heading` | suggestion | heading over the profile's word cap | One assertion; move qualifiers to the body. |
| `wall-of-text` | suggestion | slide over the word or bullet budget | Cut, split, or move detail to notes. |
| `density-overflow` / `density-crowd` | suggestion | one item runs long | One short clause per item. |
| `metric-no-referent` | suggestion | a hero number with no comparison | Add the baseline: "up from 27 min". |
| `duplicate-heading` | suggestion | two slides share a heading | Each slide states its own claim. |
| `stub-slide` | suggestion | a heading with no body | Add the evidence, or fold it into a neighbor. |
| `no-ask` | suggestion | no recommendation anywhere | A `decision` slide or a "we recommend…" line near the close. |
| `image-no-alt` | suggestion | image without alt text | `![what it shows](path)`. |

For a rule not listed here, the `fix:` line is the instruction. Grep
`lib/authoring/lint-core.js` or `lib/authoring/review-core.js` for
`rule: '<id>'` to read the check itself.

---

## The contract / skeleton

**Before** — one error, two warnings, three suggestions:

```markdown
---
marp: true
size: 4k
theme: indaco
finish: atriumm
paginate: true
header: "Field service · Q3 update"
---

<!-- _class: title silent -->

# Field Service Update

`Operations · Q3 2026`

Eight fixes are live, and routing alone gives each technician forty minutes a day back.

---

<!-- _class: cards-grid -->

## Overview

- **Routing.** Vans now take the shortest legal route between jobs, which saves about forty minutes a day for each technician on the road.
- **Parts.** Each van restocks from the nearest depot.
- **Scheduling.** Customers pick a two-hour window.
- **Billing.** Invoices go out the same day.
- **Training.** New hires shadow for two weeks.
- **Safety.** Every van carries a first-aid kit.
- **Feedback.** Customers rate the visit by text.
- **Returns.** Unused parts go back the same week.
```

Lint output, one line per finding (the full output adds the message, `at:` and `fix:`):

```text
⚠ slide 2 · capacity-overflow [cards-grid]
✗ slide 2 · card-style-inline-title [cards-grid]
⚠ slide 0 · unknown-finish [atriumm]
ℹ slide 2 · label-title
ℹ slide 2 · wall-of-text
ℹ slide 2 · density-crowd
```

**After** — `--fix` handled the inline titles and the finish typo; the split,
the headings and the cut were judgment. The deck is lint-clean:

```markdown
---
marp: true
size: 4k
theme: indaco
finish: atrium
paginate: true
header: "Field service · Q3 update"
---

<!-- _class: title silent -->

# Field Service Update

`Operations · Q3 2026`

Eight fixes are live, and routing alone gives each technician forty minutes a day back.

---

<!-- _class: cards-grid three -->

## Three fixes put technicians in front of customers sooner.

- Routing
  - Vans take the shortest legal route, saving forty minutes a day.
- Parts
  - Each van restocks from the nearest depot.
- Scheduling
  - Customers pick a two-hour window.

<!-- Routing is the headline: the forty minutes is per technician, per day, between jobs. -->

---

<!-- _class: list-tabular -->

## Five smaller fixes close the gaps around each visit.

1. Billing
   - Invoices go out the same day.
2. Training
   - New hires shadow for two weeks.
3. Safety
   - Every van carries a first-aid kit.
4. Feedback
   - Customers rate the visit by text.
5. Returns
   - Unused parts go back the same week.

---

<!-- _class: closing silent -->

## Fund winter routing and keep the forty minutes.

`Sam Okafor · Head of Field Service`

We recommend extending the routing contract through March.
```

---

## What good looks like

- Eight cards became a three-card grid of the customer-facing fixes and a
  `list-tabular` ledger of the rest: two slides, two claims, nothing lost.
- The 23-word card body became an 11-word clause, and the detail ("per technician,
  between jobs") moved into a speaker note.
- "Overview" became the slide's claim.
- One suggestion was left on purpose, with a sentence saying why.

---

## What bad looks like

- **Shrinking the type.** Adding `compact` or a smaller venue to make eight cards
  fit. Fix: escalate or split; the reader still has to read it.
- **Deleting to silence.** Dropping cards five to eight to clear
  `capacity-overflow`. Fix: move them to a second slide.
- **Bold-stripping the wrong way.** Clearing `card-style-inline-title` by
  removing the bold and leaving `- Routing. Vans take…` on one line. The card
  now has no title. Fix: nested `- Title` / `  - body`.
- **`fit: trim` as a cure.** It only cuts prose, declines when the cut would be
  invisible, and is all-or-nothing; measured on the shipped decks it resolved
  one of six clipping slides. Fix the content.
- **Chasing every suggestion.** Rewriting a teaching deck's slides to the
  default 70-word budget. Fix: declare `profile: teaching` if that's what the
  deck is.
- **Fixing slides nobody asked about** during a targeted fix. Mention them.

---

## Ship checklist

- [ ] `npm run lint:deck -- <file>`: no errors or warnings.
- [ ] Machine fixes applied (`--fix` or "Fix all issues"), then re-linted.
- [ ] Every overflow fixed by a split, a component change or a cut — no type
      shrink.
- [ ] Each changed component's `.docs.md` read first.
- [ ] Each remaining suggestion either fixed or explained in one line.
- [ ] Cut detail moved to speaker notes.
- [ ] Rendered; no `⚠ OVERFLOW` line, every changed slide looked at.

---

## Common mistakes

1. **Reading slide numbers off by one.** Slide 0 is the front matter; slide 1
   is the first slide.
2. **Fixing the message's example literally.** "e.g. Revenue grew 18%" is a
   pattern, not a heading to paste.
3. **Running `--fix` and not re-linting.** It prints what it applied; anything
   it refused is still there.
4. **Treating a suggestion like an error.** Suggestions never block. Decide.
5. **Ignoring a warning because the slide "looks fine" in the preview.** A
   `web-image` warning means the CLI export leaves the picture out without
   `--allow-remote`; an unknown key means the setting never applied.
6. **Changing component without reading its docs.** The new slots differ:
   `list-tabular` takes `1.` rows; `split-compare` takes exactly two options
   and a blockquote verdict.
7. **Tuning `fit:` to hide clipping.** `fit: report` only flags; `heal` splits
   only at portrait and square sizes; `trim` rarely helps. None changes type
   size, and none replaces a content fix.

---

## Canonical sources

- `AGENTS.md` § Author, then lint, then render — the lint loop.
- `tools/lint-deck.js` — the CLI, its flags and exit codes.
- `lib/authoring/lint-core.js` and `lib/authoring/review-core.js` — the rules.
- `lib/authoring/deck-profiles.js` — the per-genre word budgets.
- `lib/base/base.registers.docs.md` § The `fit:` front-matter register — what
  the engine may do to fit a slide, and what `trim` does not do.
- `dist/docs/components.pick.md` — capacity and escalation targets.
- `design/editorial.md` — how to rewrite a heading as a claim.
- `engineering/decisions/2026-10-26-squadra-lint-library.md` — the fix driver
  behind `--fix` and "Fix all".
