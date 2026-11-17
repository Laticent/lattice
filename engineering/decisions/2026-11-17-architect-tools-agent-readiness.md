---
status: proposed
summary: Audit of the Studio chat's tools against #3208 — the tool layer is already headless; the gaps are capabilities that exist as pure functions but are not exposed, prose-only tool results, and a chat history that never learns whether an edit landed. Proposes finishing the action registry with one structured result shape.
---

# How ready the Architect's tools are for an agent, and how to grow them

**Asked (2026-11-17).** The owner asked for an architect's audit of the Studio chat's existing
tools (the "Architect") against issue #3208, which lists 37 tool gaps found in one long editing
session. The audit has three questions: how tightly each tool is bound to the UI; whether an
agent can tell how to use it from its schema alone; and whether its result and the UI's state
stay in sync when a model, not a person, calls it.

**The answer.** The tool layer is already headless. What blocks the issue's top items is not
coupling to React. It is three other things:

1. Most of the capabilities the issue asks for **already exist as pure functions**. The chat is
   not given them as tools (§2).
2. Every tool **returns prose**. The structure exists inside the toolbox and is flattened before
   the model sees it (§3).
3. **The chat history never records whether an edit landed.** That one gap is the root cause of
   the issue's "state mismatch" evidence and of items #5 and #27 (§4).

This note builds on `2026-10-05-studio-chat-agent.md` (the agent loop) and
`2026-11-06-skills-tools-and-chat-reach.md` §4 (the three-tier action registry), and does not
restate them.

## 1. What is already right

`docs/src/components/studio/architect-agent.ts` is the pure half of the chat agent:

- Every tool has a JSON Schema (`AGENT_TOOLS`, `ASSET_TOOLS`, and the act-tier and look tools in
  `chat-actions.ts`).
- `createToolbox` runs every tool against a **draft string** of the deck. The model call, the
  doc loaders, the linter and the slide renderer are injected, so a test drives a whole turn with
  a scripted model and no network or DOM.
- `chat-actions.ts` puts every tool in a tier (`read`, `draft`, `act`). Code enforces the tier
  twice, in `toolsForMode` (which tools the request carries) and `toolAllowed` (checked on every
  call). An untiered tool is refused in every mode.
- Every draft-tier result folds back into per-slide edits (`proposalFromDraft`), which the diff
  card shows and `ArchitectChat.applyProposal` re-applies against the **current** deck, not a
  stale snapshot.

Nothing in that path reads the DOM or a click handler. The descriptions also read as
instructions, not labels: `edit_slides` says exactly what `body` must hold, `view_asset` says when
**not** to call it, and `set_theme` / `set_finish` constrain the name to an `enum`.

## 2. Coupling: the gap is reach, not React

The UI coupling lives in the capabilities the chat cannot reach. For the issue's P1 items:

| #3208 item | Already exists as | Why the chat cannot use it |
|---|---|---|
| #1 nested front-matter maps (`acronyms:`, `lexicon:`, `say:`) | `setFrontMatterBlock` and `setFrontMatterAcronyms` in `docs/src/lib/front-matter.ts` — they quote keys and escape values | `set_front_matter` refuses multi-line values and block keys by design (`writeKey` and `isBlockKey` in `architect-agent.ts`). Only the Acronym editor's `onChange` reaches the map writers. |
| #2 move and copy slides | `moveSlide`, `duplicateSlide`, `carrySay` in `docs/src/components/studio/deck-ops.ts` — byte-preserving, and they renumber front-matter `say:` with the slide | Not exposed. The model retypes whole slides through `edit_slides`, which is where the issue's wording-drift risk comes from. |
| #3 spoken-text preview | `resolveDeck` in `docs/src/components/studio/narration-bake.ts` composes `slideToSpeech` (`lib/core/slide-speech.js`) with `acronymSpokenMap`, `lexiconMap` and `frontMatterSayMap` (`lib/core/resolve-narration.mjs`) — the same text the bake and Present narrate | Not exported, and full fidelity needs the render-side projection (`projectSectionsToScript`). Without a render it falls back to the markdown flatten, which can differ (`engineering/pipeline.md` §6). |
| #4 create and edit lenses | Reading is pure (`docs/src/lib/lente/project.ts`, `parseLensRegistry`); per-slide membership is `applyTag` | The **write** is a closure inside a React callback, `writeTags` and `writeRegistry` in `StudioShell.tsx`. This is the one real UI coupling in the P1 set. |

So the issue's first open question ("which of these already exist and only need exposing?") has a
concrete answer: #1, #2 and most of #4 are thin wrappers; #3 needs one export and a decision about
the render-free fallback; #4's write needs lifting into `lib/lente/` first.

## 3. Schema quality: what an agent cannot tell from the contract

- **Slide numbers are positions.** After any move or insert, every number the model holds is
  wrong. `edit_slides` documents that "numbers refer to the draft as it stands", which is right
  inside one turn but gives no protection across turns or against the author editing meanwhile.
  The diff card already guards this with `isProposedEditStale` (it compares the slide's text at
  propose time with its text now). That guard belongs in the tool contract as a precondition.
- **Results are prose with instructions mixed in.** `create_deck` returns "tell the author it is
  ready to confirm below, never that it was created". That is guidance for one model inside the
  data. Meanwhile the structured `EditVerdict` (`refused`, `checked`, `errors`, `warnings`) is read
  by the loop (`settled()`) and never reaches the model as fields.
- **Refusals have no code.** `refuse('Only single-line values can be set here…')` is the whole
  contract, so the model has to work out the alternative itself. This is #28.

### Draft schemas for the first three wrappers

```jsonc
{
  "name": "set_front_matter_map",
  "description": "Add, change or remove entries in a nested front-matter map: acronyms, lexicon or say. Use this for pronunciation fixes; use set_front_matter for single-line keys. Entries you do not name are kept. Returns the whole map after the change.",
  "input_schema": {
    "type": "object",
    "properties": {
      "map": { "type": "string", "enum": ["acronyms", "lexicon", "say"] },
      "set": {
        "type": "object",
        "additionalProperties": { "type": ["string", "null"] },
        "description": "Term to spoken form. null removes the entry. Write the term exactly as it appears on the slide; a possessive or plural is its own term."
      },
      "summary": { "type": "string", "description": "One sentence to the author." }
    },
    "required": ["map", "set", "summary"]
  }
}
```

`acronyms` entries also carry an optional glossary definition (`AcronymEntry`), and `say` is keyed
by slide number; the built tool should give each map its own value schema rather than share one.

```jsonc
{
  "name": "move_slides",
  "description": "Move or copy a range of slides without retyping them. Content, notes and say: lines move byte for byte. Use this instead of edit_slides whenever a slide's text does not change.",
  "input_schema": {
    "type": "object",
    "properties": {
      "from": { "type": "integer", "minimum": 1 },
      "to": { "type": "integer", "minimum": 1, "description": "Last slide of the range; defaults to from." },
      "after": { "type": "integer", "minimum": 0, "description": "Place the slides after this slide of the draft; 0 puts them first." },
      "copy": { "type": "boolean", "default": false },
      "expect_revision": { "type": "string", "description": "The revision you read. The call is refused if the deck changed since." }
    },
    "required": ["from", "after"]
  }
}
```

```jsonc
{
  "name": "preview_speech",
  "description": "Return the exact text the voice reads for some slides, after acronyms, lexicon, say: lines and notes apply. Lists which substitutions fired and which hard-looking terms matched nothing. Read-only; use it before guessing a pronunciation.",
  "input_schema": {
    "type": "object",
    "properties": { "from": { "type": "integer", "minimum": 1 }, "to": { "type": "integer", "minimum": 1 } },
    "required": ["from"]
  }
}
```

`preview_speech` must say in its result whether it used the render projection or the markdown
fallback, so the model never presents an approximation as the exact text.

## 4. Output and state sync

**Why the chat described edits the deck did not contain.** A stored turn is
`ChatTurn = { role, content }` (`architect.ts`). When the author applies or discards a card,
`ArchitectChat.applyProposal` records `applied`, `appliedCount` and `refused` on the **message**,
but the history sent to the model on the next turn carries only `content`. The model reads its
own "added a divider at slide 47" and has no way to learn it was never applied. Items #5 and #27
are mostly this one gap.

**The cheapest fix:** on each turn, prepend one status line per earlier proposal ("turn 4:
applied 3 of 4; slide 47 refused") and a short hash of the current deck to the turn's context.
That needs no new UI and no new tool.

**How a background agent's change reaches React.** Every tool changes the draft string; the diff
card or Auto mode writes it through `onApply` / `onAutoApply`, and Auto saves a History checkpoint
first. Because every change ends as a source edit through the same writer a human uses, a headless
caller needs no second state channel. Keep that property: an action never mutates Studio state
except by returning new source.

## 5. Proposal: finish the action registry, one result shape

Do not build a separate MCP server. Finish the registry `2026-11-06-skills-tools-and-chat-reach.md`
§4 designed and §8 shaped for a later MCP or CLI-JSON reader.

1. **One action shape:** `id`, `tier`, a JSON Schema for the input, a description, and
   `run(ctx, args) → Result`. `ctx` holds the draft and the injected dependencies, as
   `createToolbox` does today.
2. **One result shape**, formatted per consumer:

   ```ts
   type Result =
     | { ok: true; changed: { slides: number[]; keys: string[] }; revision: string; check?: EditVerdict; data?: unknown; next_step?: string }
     | { ok: false; code: 'NESTED_KEY' | 'STALE' | 'OUT_OF_RANGE' | 'UNKNOWN_NAME' | 'MODE'; reason: string; alternatives: string[] };
   ```

   The chat renders it as compact text through one formatter; an MCP server would send the JSON.
   Guidance now buried in results ("never say it was created") moves to `next_step`, which only
   the chat formatter reads.
3. **Lift the write paths that live in components**, starting with `writeTags` / `writeRegistry`
   into `lib/lente/`, then wrap `deck-ops`, the front-matter map writers and the narration resolve
   as actions. Each is already a function from source to source.
4. **Keep the author's confirm as a host capability.** The act-tier confirm is a safety boundary
   (§4 of the 11-06 note: the one place injected text can do harm), not a UI artifact. A headless
   host supplies `confirm(payload)`: in the Studio it draws today's confirm; over MCP it maps to the
   protocol's user-elicitation request. A host that cannot supply it gets act-tier calls refused,
   never auto-approved.
5. **Every draft-tier action takes `expect_revision`**, reusing the stale guard, so a background
   agent cannot overwrite an edit the author made in between.

### What this means for #3208's list

- **Thin wrappers over existing code:** #1, #2, #3 (with the fallback caveat), #4 (after the lift),
  #6, #7, #8, #24.
- **Need new host state:** #5 and #27 (cheap, §4), #10, #14, #21.
- **Send data out of the workspace:** #11 and #23, which stay behind #32 (privacy boundary) and
  #33 (injection test set), as the issue already says.

## 6. Open, for the owner

- **Prompt-cache cost of the result shape.** If the chat formatter reproduces today's wording, the
  cached prefix is unchanged; that should be measured on a real turn before the shape lands.
- **Stable slide identity for lenses.** Lens membership rides on per-slide tags (`applyTag`), which
  already survive reordering because the tag moves with the slide. Whether the *tools* should also
  address slides by a stable id instead of by position is a separate fork from the lens storage.

## 7. What this note does not do

- It does not build any tool. It is the design for the slices that follow.
- It does not run a live model turn or measure cost; §6's first item owes that.
- It does not change the tiers, the modes or the confirm, which the 11-06 note settled.
