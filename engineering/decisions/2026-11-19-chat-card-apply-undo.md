---
status: proposed
summary: How the Studio chat's change card lets the author see, apply, discard and take back an AI edit one slide at a time or all at once, on top of Filo (the Studio's one undo history) and Version history; a prototype at /proto/change-card/ tests the card models and a "preview for real" button before anything is built.
---

# Apply, discard and undo in the chat's change card

**Asked (2026-11-19).** While reviewing PR #3317 (pick which edits to apply, a full-height card),
the owner asked how apply, discard and undo should work **for one slide and for the whole deck**, and
how that fits **our undo library**. The owner then set the method: **prototype it, have a UI/UX
expert review it, and let the author preview a change in the Studio's own preview before applying
it.** This note records the facts, the choices and the prototype that will decide between them. It
builds nothing in the Studio.

**Settled with the owner (2026-11-19):**

| Question | Answer |
|---|---|
| Method | **Prototype first, then a UI/UX expert review**, then decide. Not built in the Studio until then |
| Seeing a change | **A preview button** that shows the proposed deck in the Studio's preview, rendered for real, before anything is applied |
| Undo after the deck moved on | **Decided after the prototype** (§5) |
| History checkpoints | The owner asked whether a card's actions should **accumulate into one saved version**, with pros, cons and the best experience (§6) |
| Where it lands | **This PR (#3317), this note first** |

## 1. What exists today

All facts are from the code at `5f6c73d` and later on this branch.

- **"The undo library" is Filo** (`docs/src/lib/filo/history.ts`, design record
  `2026-10-27-filo-undo-history.md`). Every write to the deck source goes through it, through the
  shell's setters (`StudioShell.tsx` `setSource`, `setSourceFromEditor`, `setSourceFromCompose`,
  `setSourceFromHistory`), and ⌘Z, the header Undo and Redo and both editors all use it. **It is
  strictly linear**: it undoes the newest step, then the one before. It keeps 100 steps by default
  (`DEFAULT_ENTRIES`), survives a reload (`studio-filo-persist.ts`), and stops at a "gap" (an outside
  change) rather than guessing across it.
- **A chat Apply is one Filo step** labeled "AI chat edit" (origin `ai`, committed whole, never as a
  diff: `studio-filo.ts` `BROAD`). One ⌘Z undoes the whole card **while it is still the newest
  step**. The card does not say so: it tells the author to "restore from History", and after Apply it
  shows a badge and no Undo.
- **Version history** (`checkpoint-store.ts`) is separate from Filo: whole-deck copies, **at most 25
  per deck** (`SNAP_CAP`), labeled free text. Every chat Apply saves "Before AI chat edit" first
  (`applyChatEdit`); Auto waits for that save to land and refuses to apply without it. Restoring a
  version replaces the whole deck and first saves "Before restore". `replaceCheckpoints` can rewrite
  an entry in place.
- **Nothing reverts one slide.** Not Filo, not Version history, not the Coach: the Coach's per-finding
  fix is one Filo step like the chat's, and its "Apply all" is one step for the batch.
- **Slides have no stable ids.** Every caller addresses a slide by its 1-based position. Whether a
  proposal still fits is decided by **content**: `isStale` compares the slide's text with the edit's
  `before`. An insert or delete shifts every position after it. Stable ids are the **slide spine**'s
  job (`followups.d/3287-p1-lente-slide-spine.md`), which is not built.
- **The use-case layer** (`2026-11-17-use-case-layer.md`, proposed) says agent edits are **staged as a
  changeset, then submitted**, that a changeset applies **whole or not at all**, and that the check
  runs on **what was committed**. The chat is its first host: "Review: a card."

## 2. What the card has to do

Three jobs, at two levels (one slide; the whole card):

1. **See** the change. Today: a text diff. Asked for: the slide **as it will look**, in the real
   preview.
2. **Decide**: apply, or discard. Today: tick slides, then one Apply for the card (#3317).
3. **Take back** after applying. Today: ⌘Z while newest, otherwise a whole-deck restore from History.

## 3. Card models (the prototype compares these)

| | A. Live rows | B. Pick, then one Undo | C. Pick, then per-slide Undo |
|---|---|---|---|
| Before Apply | each row: Apply · Discard · Preview; header: Apply all | tick rows, one Apply (#3317 today) | tick rows, one Apply |
| After Apply | each row shows its state (waiting · applied · discarded · undone) with the next action; header: Undo all | one Undo for what was applied | each applied row: Undo; header: Undo all |
| A row left out | stays waiting; apply it later | dropped | dropped |
| Gains | every slide can be decided at any time; the card is a lasting record | smallest change; easy to read | per-slide take-back without a new decision model |
| Costs | most states to explain; the card stays "live" in a long thread | no per-slide take-back | a left-out row is gone; two different steps (pick, then undo) |

**How a pick fits "whole or not at all".** The author's pick is the changeset they submit. Each
press submits one changeset (one row, or all ticked rows), and that submission applies whole or not
at all. What the agent's own check validated was the whole draft, though, so **after a partial
apply the deck check must run again on what landed** (the Coach already re-assesses on every edit;
the card should show its verdict for the slides it touched).

## 4. Preview for real

A **preview** button on each row and in the card header. Pressing it:

- shows the **proposed deck** in the Studio's preview pane (the real renderer, the deck's theme), with
  that row's slide in view;
- marks the pane plainly as a preview: a band reading "Previewing the AI's changes · not applied",
  with **Apply** and **Back** in it;
- **writes nothing**: no Filo step, no checkpoint, the editor untouched. Any edit to the deck, a deck
  switch, or Back leaves the preview;
- for a row, previews **that row alone** applied to the current deck; for the header, every ticked row.

Open in the prototype: whether the band also offers a before/after toggle, and whether a phone shows
the preview as a full-screen sheet over the chat.

## 5. Undo after the deck moved on (decided after the prototype)

Filo undoes only its newest step, so a later edit buries the apply. Two answers:

- **True undo, newest only.** Offer Undo while the apply is the newest step (a real ⌘Z, so Redo
  works); after that, point to History. Honest and simple, but the button disappears as soon as the
  author types.
- **Revert by content.** Undo is a **new forward step** that puts the slide's `before` back, found by
  its text, not its position: it applies only while the slide still reads exactly the edit's `after`,
  and otherwise refuses and says "Slide 3 changed since this edit". ⌘Z undoes the revert itself.
  Works any time, per slide and per card; costs one more state ("undone") on the card. An insert is
  reverted by removing the inserted slide if it still matches; a delete needs the neighbor's text to
  find where the slide went back, and refuses if that is ambiguous.

The prototype shows both. Either way the card drops "restore from History to undo" for wording that
matches what exists.

## 6. History checkpoints: one per card, accumulated

The owner asked whether a card's actions should accumulate into **one** saved version. Four ways,
against the 25-copy cap:

| | Slots a 4-slide card uses | Gains | Costs |
|---|---|---|---|
| **A. One copy before the card's first Apply** (today's behavior, per card) | 1 | cheap; one way back to before the AI touched the deck | the label says nothing about what the card did; later per-slide actions add nothing to History |
| **B. One copy per action** | up to 8 (apply and undo each row) | finest restore points | three busy cards push older versions out; History fills with near-identical rows |
| **C. One entry per card, kept current** (recommended) | 1 | one History row per AI turn, whose label stays true: "Before AI chat edit · slides 2 and 4 applied, 3 undone"; never adds slots | restoring it still discards everything after the card's first Apply, including the author's typing (true today too; restore saves "Before restore" first, so it is reversible) |
| **D. Save the result** when every row is settled ("After AI chat edit") | 1 | a milestone to jump forward to | not a way back; "settled" is hard to define while rows can stay waiting |

**Recommendation: C.** It is A with an honest, updated label: the first Apply on a card saves the
deck as it was before the card, and every later action on that card rewrites that entry's label in
place through `replaceCheckpoints`. Fine-grained steps stay in Filo, which keeps 100 and is made for
them; History keeps one copy per AI turn, which is what the 25 slots are for. D can be added later
if authors ask for milestones.

## 7. The prototype

`/proto/change-card/` (`docs/src/components/proto/ChangeCardProto.tsx`), isolated like
`/proto/chat-figures/`: deleting the page and the island reverts it, and nothing else imports it.

- A chat column with the card, a switch between models A, B and C, and a switch between the two
  undo behaviors of §5.
- A preview pane that renders the deck with `DeckPreview` and shows the "previewing" band.
- A simulated History list that shows what each checkpoint option of §6 would record.
- A typed edit to slide 3 ("you changed the deck since"), so the undo behaviors can be compared.

It must answer: which card model the author reads correctly at first glance; whether preview belongs
on every row or only the header; and which undo behavior to keep.

## 8. The UI/UX review (2026-11-19)

One reviewer, briefed with the owner's goals and the prototype but not with this note's
recommendations, drove the prototype at 1440, 820 and 390px and with the keyboard. Its
recommendation, and what it would change:

- **Card: A's live rows plus C's per-row Undo, and no checkboxes.** Every row carries Apply, Discard
  and (once applied) Undo; the header carries "Apply remaining N" and "Undo all". Ticking first
  creates an in-between state (ticked, not applied), and unticking a row then pressing Apply discards
  it without the word "discard" ever appearing. **This reverses the checkbox picker #3317 ships.**
- **Rows fold to one line** for long proposals (`Slide 4 · "Pipeline" → "Pipeline up 18%"`), with the
  diff behind a chevron; the header shows progress ("4 of 10 applied"). No inner scroll box.
- **Preview** from every row and from the header; the band names its scope ("Previewing slide 2 · not
  applied"), offers a **Before/After** toggle, and leaves on Esc. On a phone: a full-screen sheet,
  swipe between changed slides, a sticky bottom bar with 44px targets.
- **Undo by content, decided before the click.** The card can tell whether a slide still reads what
  the AI wrote, so a row the author has edited since shows "You've edited this slide since" and no
  Undo, instead of a live button that then refuses. States: Applied (Undo) · Edited since · Undone
  (Apply again). "Newest only" was rejected: one keystroke sends the author to a whole-deck restore.
- **History: one entry per card, label kept current**, reworded so it does not read as if the copy
  contains the changes: "Before AI edit · 10:42 · 'Make slides 2 and 3 lead with…' (2 of 3 applied)".
- **Defects found:** raw Markdown in the diff (a word-level diff of the slide text, with "Show source"
  for power users); focus lost after Apply; no live region for results; 24 to 28px touch targets;
  Discard as a bare X beside Apply; stale header labels after a partial apply; 10px monospace row
  titles; heavy icon borders; the prototype's card not themed in dark mode.
- **Not asked, but material:** mark rows stale before the click; per-row outcomes for a partial bulk
  apply; keyboard verbs (J/K, Enter, Backspace, Space, Esc); **tell the AI which rows were applied,
  discarded or undone**, or it proposes the same edit again; name rows by slide title, since inserts
  renumber.

## 9. What this note does not do

- It does not build per-slide undo, preview or the checkpoint change in the Studio.
- It does not give slides stable ids; content matching stands in until the slide spine lands.
- It does not change Filo. Every option above writes through the shell's setters as an ordinary
  step.
