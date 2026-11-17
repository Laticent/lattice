---
status: proposed
summary: Audit of the Studio chat's tools against #3208 — the tool layer is already headless, but the path that turns the chat's draft into the edits the author applies cannot carry front-matter maps or slide moves, so that path is the first build; then nested-map edits, an edit-outcome signal, move_slides with heading preconditions, and refusal codes.
---

# How ready the Architect's tools are for an agent, and how to grow them

**Asked (2026-11-17).** The owner asked for an architect's audit of the Studio chat's tools (the
"Architect") against issue #3208, which lists 37 tool gaps found in one long editing session. The
audit asks three questions: how tightly each tool is bound to the UI; whether an agent can tell
how to use a tool from its schema alone; and whether the result and the UI's state stay in sync
when a model, not a person, calls the tool.

**The answer.**

1. **The tool layer is already headless** (§1). The coupling #3208 runs into is reach: most of
   what it asks for exists as plain functions the chat is not given (§2).
2. **But "expose the function" is not enough.** The chat edits a draft, and a separate step turns
   that draft into the per-slide edits the author applies. That step only knows slide
   replace/insert/delete and one-line front-matter keys, so a map edit is dropped and a slide move
   loses its narration renumbering. **Extending that step is the first build** (§3).
3. **Results are prose and refusals carry no code** (§4).
4. **Nothing tells the model whether its earlier edits landed** (§5). It can only infer the outcome
   by re-reading the deck.

Builds on `2026-10-05-studio-chat-agent.md` (the agent loop) and
`2026-11-06-skills-tools-and-chat-reach.md` §4 (the three-tier action registry).

**How this was checked.** A first draft went to an independent `checker` and a Munger `inversion`
agent. Both found, separately, that the first draft called #1, #2 and #4 "thin wrappers" when the
apply step cannot carry their output. The checker confirmed that with two scratch tests against the
real functions (§3). This version folds in every confirmed finding. §5's gap was then observed in a
scripted-model turn through the real toolbox and history mapping (§5). No live model turn ran (HARD
RULE #23), so how a real model behaves on that history is not observed.

## 1. What is already right

`docs/src/components/studio/architect-agent.ts` is the pure half of the chat agent. It has no
`document`, `window`, `localStorage` or React.

- Every tool has a JSON Schema (`AGENT_TOOLS`, `ASSET_TOOLS`, and `makeLookTools` /
  `CREATE_DECK_TOOL` / the render tool in `chat-actions.ts`).
- `createToolbox` runs deck tools against a **draft string**. The model call, the doc loaders, the
  linter, the renderer and the Library are injected, so a test drives a whole turn with a scripted
  model (`architect-agent.test.ts`).
- `chat-actions.ts` puts every tool in a tier (`read`, `draft`, `act`). Code enforces the tier
  twice: `toolsForMode` decides which tools a request carries, and `toolAllowed` runs on every call.
  An untiered tool is refused in every mode.
- The descriptions read as instructions: `edit_slides` says what `body` must hold, `view_asset` says
  when **not** to call it, and `set_theme` / `set_finish` limit the name to an `enum`.

**Two exceptions to "deck tools only change the draft"**, worth naming before anything is built on
the property: `caption_asset` (tier `draft`) writes the caption to the Library during the call,
with no card and no History checkpoint; and `create_deck` (tier `act`) queues a `ChatAction` rather
than returning source.

## 2. Coupling: the gap is reach, not React

| #3208 item | Already exists | What stands between it and the chat |
|---|---|---|
| #1 nested front-matter maps | `setFrontMatterAcronyms` (keys unquoted, by design) and `setFrontMatterBlock` (keys always quoted) in `docs/src/lib/front-matter.ts`. The Acronym and Lexicon editors call them. | `set_front_matter` refuses multi-line values and block keys (`writeKey`, `isBlockKey`). **`say:` has no writer.** `setFrontMatterBlock` would write `"1": …`, and `parseSayMap` (`lib/core/resolve-narration.mjs`) reads only bare digit keys, so that narration would be silently ignored. The issue also names `finish-override:` and `progress-rail`; both are out of scope here because neither has a writer and neither came up in the session's evidence. And §3 applies. |
| #2 move and copy slides | `moveSlide`, `duplicateSlide`, `carrySay` in `docs/src/components/studio/deck-ops.ts`. They keep untouched slides' bytes and renumber `say:` with the slide. | They act on one 0-based slide, so ranges and split slides (the `*At` variants) need composing. And §3 applies: the move's renumbering never reaches the deck. |
| #3 spoken-text preview | The narration resolve in `narration-bake.ts` (`resolveDeck`, not exported). In order: inline `say`, front-matter `say`, chart narration, the render projection (`projectDeckScript` in `narration-projection.ts`), then `slideToSpeech` as the last fallback. Acronyms and lexicon apply in `buildTrack`. Hidden slides are skipped, and opening and closing lines are spoken. | One export. The projection needs a DOM render, so any host without one gets only the fallback text. **Speaker notes are deliberately not narrated** (`narration-resolve.ts`), although the issue asked for them. |
| #4 create and edit lenses | Reading is pure (`docs/src/lib/lente/`). Membership is a tag inside the slide's own text (`applyTag`), so it moves with the slide. | The write is about 8 lines in `StudioShell.tsx` (`writeTags`, `writeRegistry`) composing `applyTag`, `replaceSlide`, `parseLensRegistry` and the registry writer. Its one outside input is the workspace lens setting (`wsLenses`), which a headless host must be given. The registry is a front-matter block, so §3 applies. |

## 3. The real prerequisite: the path from draft to applied edit

The chat never applies its draft as a whole. `proposalFromDraft` (`architect-agent.ts`) compares the
original slides with the draft's slides (an LCS match on trimmed text) and emits only:

- slide `replace`, `insert` and `delete`, and
- one-line `frontmatter` edits for keys the chat set, read back with `getFrontMatter`.

The card then re-applies those edits with `applyEditsChecked` (`architect.ts`), which writes front
matter only through `writeFrontMatterLine`. The checker's scratch tests show what that does to the
new tools:

| Probe | Result |
|---|---|
| `setFrontMatterAcronyms` on the draft, with `acronyms` marked as touched | The proposal is **empty**. `getFrontMatter` reads `undefined` for a block key on both sides, so the edit is dropped with no message. |
| `moveSlide(deck, 0, 2)` on a deck with `say: {1, 3}` | The draft renumbers `say:` correctly. The proposal becomes "insert a retyped copy after slide 3, delete slide 1", and applying it leaves `say:` unchanged, so the moved slide speaks another slide's line. |

Three more consequences follow from the code:

- `autoHold` (`chat-actions.ts`) holds any edit set containing a `delete`, so Auto would hold every
  move as "it deletes slides".
- The card's stale check is positional and never fires for an insert, so a slide the author edits
  before pressing Apply can be overwritten by the old text the move re-inserts.
- The lens registry is a front-matter block too, so #4 hits the same drop.

**So the first build is new edit kinds**, each carried through `AgentRawEdit`, `proposalFromDraft`,
`describeEdit`, the card's stale check, `applyEditsChecked` and `autoHold`:

- `fm-block`: replace one whole front-matter block, shown on the card as a block diff;
- `move` / `copy`: slide references, not retyped bodies, carrying the `say:` renumbering.

The alternative, applying the whole draft source with a per-slide display, is simpler but drops the
property that an author's interim edits to *other* slides survive Apply. That is why this note
recommends new edit kinds.

## 4. Schema quality: what an agent cannot tell from the contract

- **Slide numbers are positions.** After a move or insert, every number the model holds is wrong.
  The card's guard does not cover it: `isProposedEditStale` (`architect.ts`) has **no callers**, and
  the card uses a private copy (`isStale` in `ArchitectChat.tsx`) that only **warns** ("Apply will
  replace your current version"), compares by position and never fires for an insert. The cheap fix,
  with no format change, is a **heading precondition**: every slide-addressed call carries the
  heading the model expects at that number, and the tool refuses with `STALE` when it differs.
- **Results are prose.** The structured `EditVerdict` (`refused`, `checked`, `errors`, `warnings`)
  is read only by the turn loop (`settled()`). The model sees the prose `withCheck` writes.
- **Refusals have no code.** `refuse('Only single-line values can be set here…')` is the whole
  contract (#28). A stable code plus the existing sentence costs little and lets the model and the
  author tell "not supported" from "try again".

### Draft schemas for the first three tools

```jsonc
{
  "name": "set_front_matter_map",
  "description": "Add, change or remove entries in the acronyms or lexicon map: pronunciation fixes. Use set_front_matter for single-line keys. Entries you do not name are kept. Returns the whole map after the change.",
  "input_schema": {
    "type": "object",
    "properties": {
      "map": { "type": "string", "enum": ["acronyms", "lexicon"] },
      "set": {
        "type": "object",
        "additionalProperties": { "type": ["string", "null"] },
        "description": "Term to spoken form; null removes the entry. Write the term exactly as it appears on the slide. A possessive or plural is its own term."
      },
      "summary": { "type": "string", "description": "One sentence to the author." }
    },
    "required": ["map", "set", "summary"]
  }
}
```

`acronyms` entries also take an optional glossary definition (`AcronymEntry`), so the built tool
gives each map its own value schema. `say` joins the enum only once it has a writer that emits bare
digit keys, and only if the tabled `say:` map survives (§8).

```jsonc
{
  "name": "move_slides",
  "description": "Move or copy a range of slides without retyping them. Slide content and notes carry over unchanged, and say: entries are renumbered to follow their slides. Use this instead of edit_slides whenever a slide's text does not change.",
  "input_schema": {
    "type": "object",
    "properties": {
      "from": { "type": "integer", "minimum": 1 },
      "to": { "type": "integer", "minimum": 1, "description": "Last slide of the range; defaults to from." },
      "after": { "type": "integer", "minimum": 0, "description": "Place the slides after this slide of the draft; 0 puts them first." },
      "copy": { "type": "boolean", "default": false },
      "expect_heading": { "type": "string", "description": "The heading you expect slide `from` to have. The call is refused with STALE if it differs." }
    },
    "required": ["from", "after", "expect_heading"]
  }
}
```

```jsonc
{
  "name": "preview_speech",
  "description": "Return what the voice reads for some slides, after inline say, front-matter say, acronyms and lexicon apply. Lists which substitutions fired and which hard-looking terms matched nothing. Speaker notes are not narrated. Hidden slides are skipped. Read-only; use it before guessing a pronunciation.",
  "input_schema": {
    "type": "object",
    "properties": { "from": { "type": "integer", "minimum": 1 }, "to": { "type": "integer", "minimum": 1 } },
    "required": ["from"]
  }
}
```

Without a render, `preview_speech` returns the substitutions and the unmatched terms, **not** a
claimed full text. The author sees the same "approximate" label the model does.

## 5. Output and state sync

**What the model is told today.** A stored turn is `ChatTurn = { role, content }`, and
`ArchitectChat` sends `history.map(m => ({ role, content }))`. The `applied`, `appliedCount`,
`refused` and `autoHeld` flags the card records are never sent, and tool results do not cross
turns. The current deck **is** sent every turn (`deckForTurn`, or its outline plus `read_slides` for
a long deck), so the model *could* re-read the deck to see what landed. Nothing **tells** it. The
one existing signal is in compaction: older replies are tagged `[edits applied]` or `[edits
proposed, not applied]` for the summarizer (`chat-compact.ts`). It is lossy and covers only older
turns.

**Observed in a scripted turn (2026-11-17).** A scratch test drove turn 1 through the real
`createToolbox` and `runAgentLoop`: a scripted model inserted a divider and replied "Added a divider
before Next steps, as slide 3." Turn 2's messages were built with the real `modelText` and the
mapping at `ArchitectChat.tsx:594`, plus the deck appended the way `chat-agent.ts:183` appends it
(that one line was copied into the test, not called). With the same deck, the history the model gets
is **byte-identical** whether the author applied or discarded the card. It repeats turn 1's "as slide
3", and it contains no outcome word (applied, discarded, declined). When the card was discarded, the
appended deck has no divider. Its absence from the deck is the only thing that could tell the model
the edit did not land.

**Why a history replay would not fix #3208's evidence.** That session was splitting a deck: 47+
slides fell to 35–36. Turn 4's "slide 47" could truthfully read "applied" and still be gone later,
because later edits renumber everything. A line like "turn 4: applied 3 of 4; slide 47 refused"
would mislead in exactly that case.

**Proposal: state the present, not the history.** Append one line to the **last user turn only**:
"The deck now has 36 slides. Slide numbers from earlier turns no longer hold. Re-read before citing
a slide." Add, per earlier proposal, a status of `applied | partial | discarded | pending |
superseded`, written as a refusal **code**, never a free-text reason (some reasons quote deck or
model text, which in a line that reads as host truth is a prompt-injection channel).

That needs new persisted state. Today `discardProposal` sets `proposed: undefined` and records
nothing, and a failed Apply leaves the message unchanged. The new field must travel through the Yjs
chat thread (Yjs is the CRDT library behind shared chat, `2026-11-12-chat-threads-crdt.md`), the
workspace backup and the legacy-key merge. **#5 and #27 are "new host state", not free.**

**How a change reaches React.** Deck tools change the draft. The card's Apply or Auto writes it
through `onApply` / `onAutoApply`, and both save a History checkpoint (Review in `StudioShell.tsx`,
Auto before applying). Keep that: a deck action changes Studio state only by producing source edits
the card applies. `caption_asset` is the standing exception (§1). Moving it behind the card is a
fair follow-up, but no evidence in #3208 asks for it.

## 6. Proposal

**One record per action generates every list.** Today four parallel lists must agree: `TOOL_TIERS`,
the schema arrays, the `run` switch, and `EDIT_TOOLS` / `READ_TOOLS`. Each draft case also resets
the verdict and calls `withCheck` by hand. A new case that forgets the reset inherits the previous
call's clean verdict, and the turn ends "settled" without a check. So:

1. **An action record:** `id`, `tier`, input schema, description, `run(ctx, args)`. It generates the
   four lists, and the palette half of 11-06 §4 (`studio-commands.ts`) reads the same records.
2. **The dispatcher, not each case, resets the verdict and runs the check** for every draft-tier
   action. A table test asserts that every draft action returns a fresh, checked verdict.
3. **`run` returns `{ ok, code?, text, check? }`.** `text` is today's prose, so the model reads what
   it reads now; `code` is the stable refusal code. Honesty guidance ("never say it was created")
   stays in `text`, because every consumer needs it.
4. **Do not change the result wording without a measurement.** The one live run (11-06 §4.2) showed
   that moving a rule changes behavior. Build #34's replay of the #3208 session first, through the
   opt-in live runner (HARD RULE #24), and compare.

**Out of scope here: an MCP server.** 11-06 §8 says it has no consumer, and the Studio is a static,
bring-your-own-key browser app with no transport. Two notes for whoever builds it: a remote host
that auto-answers a confirm looks exactly like a person pressing yes, so a host-side confirm is not
a safety boundary across that trust line; and a deck-wide revision check belongs where edits are
committed, not in a draft tool. Inside the Studio the model's own edits change the draft, so a
deck-wide revision would refuse the model's second call.

### Order

1. **The apply path:** the `fm-block` and `move`/`copy` edit kinds (§3) with their stale and
   `autoHold` rules; one action record; the check in the dispatcher.
2. **`set_front_matter_map`** for `acronyms` and `lexicon`. Pronunciation was the most-repeated pain
   in the session.
3. **The present-state line** with persisted proposal status (§5).
4. **`move_slides`** with the heading precondition.
5. **Lift the lens write** into `docs/src/lib/lente/`, taking `wsLenses` as a parameter; then lens
   tools.
6. **`preview_speech`**, with the narrowed fallback.

### Where #3208's other items stand (classified: P1 plus selected items)

- **Need the §3 edit kinds first:** #1, #2, #4, and #14 and #21 (which change what a card is).
- **New code on existing pieces:** #6 (the existing find/replace is bound to the editors,
  CodeMirror and ProseMirror, and is not field-aware), #7, #8 and #24 (building blocks exist in
  `cadenza`, `review-core` and `lint-core`; per-element budgets are unverified).
- **New host state:** #5, #27, #10.
- **Follow from the registry:** #26 (self-description generated from the records) and #28
  (refusal codes).
- **Send data out:** share links and #23, behind #32 and #33 as the issue says. A local PDF export
  (part of #11) sends nothing out and does not need that gate.

## 7. What this note does not do

- It builds no tool. It is the design for the slices in §6's order.
- It runs no live model turn and measures no cost.
- It does not change the tiers, the modes or the confirm, which 11-06 settled. 11-06 lets Auto skip
  the confirm for an act the author allowed by name; nothing here changes that.

## 8. Settled with the owner, and what was tabled (2026-11-17)

- **The front-matter `say:` map is tabled.** It is the only front-matter key that points at a slide
  by number; every other per-slide fact (lens membership, `_class`) lives inside the slide. A
  reproduction showed the bug: in a `split: headings` deck, `carrySay` counts on-screen slides while
  the voice counts slides as written, so moving a slide can silently drop another slide's line. The
  owner considers the map a mistake and tabled the fix until the spine below is designed:
  `followups.d/3287-p2-front-matter-say-map-numbering.md`. Until then, chat tools write only the
  in-slide `<!-- say: … -->`, and `set_front_matter_map` leaves `say` out of its enum (§4).
- **Slide identity becomes its own proposal: a slide spine in Lente.** The owner proposed one owner
  of "what are this deck's slides" (boundaries, ids, order, splitting, hidden slides, lens
  membership, every structural edit, and views for the Studio, the CLI export and the chat). The
  outline already keeps ids that survive edits (`docs/src/lib/deck-outline/`), and about a dozen
  separate splitters disagree on numbering today. Its design is
  `followups.d/3287-p1-lente-slide-spine.md`. Until it lands, the chat tools use the heading
  precondition (§4), which needs no ids.
- **Where the edit-outcome signal comes from and where it goes.** The model keeps no state between
  turns, so the last leg is always text in the next request. That line goes at the end of the newest
  user message, which leaves the cached prefix alone (the trace's `sent.tools` in `chat-agent.ts`
  measures it). Its facts should come from the Studio's Fuoco hub (`docs/src/lib/fuoco/hub.ts`), the
  two-way bus that already tags every update with who made it and an outline revision, once the chat
  joins it as a named origin (11-06 §6). The hub keeps no log of who edited what today; that small
  log is part of §6 step 3.
