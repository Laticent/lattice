---
status: shipped
summary: Polish the Studio Deck inspector's running-chrome controls. Header & footer become text-DECLARATION fields (type the copy the band renders; blank clears it) instead of title-stamping toggles. The four furniture controls move into a dedicated "Every slide" group whose label carries the "repeats on every slide" sense once, so the rows are plainly named (Header / Footer / Page numbers / Section rail) — the lone "Running header" naming was inconsistent. The whole drawer now states its deck-wide scope in plain words, and the chip reads "deck-wide" (parallel to the per-slide drawer's "slide N").
---

# Deck inspector — declared furniture & an obviously deck-wide scope

**Ask (2026-07-04):** three points on the Studio's Deck settings drawer.
1. We call the enabled header "Running header," but footer / pagination / rail
   don't follow the same naming convention — make the family consistent.
2. Think about how we denote these settings as deck-wide / global. Is it obvious
   today that *everything* in the drawer applies to the whole deck?
3. Enable editing the header & footer **text** — that's the whole point. We are
   not toggling; we are declaring what the header and footer will read.

## Design model

The Deck inspector is the deck-wide **source of defaults**; the per-slide "Slide
settings" drawer (`SlideContext.tsx`) is where a single slide **overrides** them
(its Chrome tab already teaches "the slide's *furniture* — the running header,
footer, page number, and the section-progress rail," with "inherited from the
deck" cues). So the two surfaces are already an inherit/override pair — the fix
is to make the Deck side read as the deck-wide origin and to let the author
declare the actual header/footer copy.

Three axes, and the moves taken (one `AskUserQuestion` round; author picked the
naming scheme and redirected the scope question):

- **Naming of the four furniture controls.** Options: prefix all four with
  "Running"; "Running" only on the header/footer print-term pair; or drop the
  prefix and let a group label carry the "every slide" sense once. **Chosen:**
  the group label carries it — rows are plainly named **Header · Footer · Page
  numbers · Section rail**, no repeated "Running" prefix (which read clunky on
  "Running section rail" anyway).

- **Deck-wide denotation.** The author's redirect: the point is that the *whole*
  drawer is deck-wide — and no, that wasn't obvious. The only cue was a small
  "this deck" chip that reads like "the current deck," not "applies to every
  slide." **Chosen:** state the scope in plain words in the drawer header, and
  rename the chip **deck-wide** (parallel to the per-slide drawer's `slide N`
  chip). The scope line points authors to Slide settings for per-slide changes.

- **Header/footer as declarations.** **Chosen:** replace the two toggles (which
  stamped the deck title) with **text fields**. Presence of text is the switch —
  a blank field clears the front-matter directive, turning the band off. Commit
  on blur / Enter so the source (and the editor + every export) isn't rewritten
  on each keystroke; a local draft re-syncs when the stored value changes
  underneath (deck switch, restore, AI edit).

## What shipped (`docs/src/components/studio/StudioShell.tsx`)

- **Header & footer text fields** — a new `TextRow` (label + help line + a
  full-width `Input` from the shadcn primitives, HARD RULE #15). Reads
  `header:` / `footer:` front-matter; writes the trimmed value or clears the key.
  Placeholders seed an example (`e.g. <deck title>` / `e.g. Confidential`).
- **A dedicated "Every slide" group** (a `Frame` glyph) holding Header · Footer
  · Page numbers · Section rail, moved out of the crowded "Look" group. Its desc
  names the four elements and says they repeat across the deck and are inherited
  per slide.
- **Deck-wide scope, stated** — the desktop inspector header and the mobile
  Sheet header gained a plain-language line ("Everything here applies to the
  whole deck; each slide inherits it. To change one slide, open its Slide
  settings.") and the chip now reads **deck-wide**.

## Docs / tests

- `guides/authoring.md` — the Studio paragraph now says header/footer are text
  fields in the **Every slide** group (was "these live as switches").
- Unit (`studio.controls.test.tsx`) — the old "Footer switch" test is replaced
  by a Header/Footer *declaration* test (type → blur → directive; clear → gone).
- E2E (`inspector.spec.ts`) — the "running-header toggle" test now fills the
  Header text field.
- `CHANGELOG.md` `## Unreleased` › Changed.

## Not in scope

- The playground (`deck-config.js`) already used header/footer text fields and
  is frozen (Studio-succession) — left as-is.
- The engine/front-matter contract is unchanged: `header:` / `footer:` /
  `paginate:` / `class: no-progress` are the same directives; only the Studio UI
  that writes them changed.
