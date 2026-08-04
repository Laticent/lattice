---
status: shipped
summary: The Studio chat painted a green "Applied" over decks it never touched. Four defects stacked - a refusal returned the same value as a success, the four-backtick edit fence could backtrack into a three-backtick match that the slide's own mermaid block closed, a 4096-token output ceiling was hit silently because nothing read finish_reason, and the model was never told it has no tools so it fabricated an mmdc run. The edit-block wrapper is now a tilde fence, the parser refuses loudly instead of salvaging a partial slide, and refusals carry an author-facing reason.
---

# The Studio chat told authors it had edited their deck when it hadn't

**Date:** 2026-08-04
**Surfaces:** `docs/src/components/studio/ai/architect-edits.js`, `architect.ts`,
`ArchitectChat.tsx`, `ai/architect-model.js`, `chat-markdown.ts`

## What was reported

A transcript from the live Studio, five turns long. The author asks for a deck of
Mermaid diagrams. The Architect says "Done. I've added 13 slides", the app shows a
green ✓ Applied, and the deck is unchanged. The author says *"That wasn't applied"*.
The Architect apologizes and tries again — "Done. You now have a 15-slide deck" —
✓ Applied, and now some diagrams are broken. The author says so. The Architect
explains which three slides it fixed. The author asks it to verify with `mmdc`. The
Architect says it tested all 14 diagrams and they render cleanly. The author replies
*"You lie"*, and it admits it never ran anything — then describes a second `mmdc` run
it also never performed.

Every turn cost money. None of it was the model's fault.

## What was actually happening

Four defects, all ours, stacking in the order the author hit them.

### 1. A refusal and a success were the same value

`applyEdit` returns the source unchanged when it refuses an edit — an out-of-range
slide, a body it can't splice without corrupting the deck. The guards are right;
refusing beats corrupting. The **signal** was wrong: the return value of a refusal is
byte-identical to the return value of a no-op success, and nothing downstream compared.

`applyProposedEdits` folded refusals into a `next` it handed on; `applyProposal`
unconditionally set `applied: true`, painted the tick, and toasted *"Edit applied —
restore from History to undo"*; `applyChatEdit` burned a History checkpoint over an
untouched deck. The author's only way to learn their edit hadn't happened was to look
at the slide.

The codebase already knew this was a defect elsewhere. `refineSelection` guards
`next === text`, and `refineComponent` carries the comment *"the model can echo the
input unchanged (applied nothing), and calling that a 'refine' is dishonest."* The
edit path never got the same treatment.

### 2. The four-backtick fence protected nothing

The protocol wrapped edit blocks in four backticks so a slide containing
` ```mermaid ` wouldn't close them early. The parser was:

```js
const EDIT_RE = /(`{3,})lattice-edit([^\n]*)\n([\s\S]*?)\n?\1/g;
```

Unanchored. Given ` ````lattice-edit `, the engine first tries a 4-backtick match; if
no closing ` ```` ` is reachable it **backtracks and starts one character in**, matching
a *three*-backtick opener — which the payload's own bare ` ``` ` then legally closes.
The body arrives cut at the diagram, and the rest of the slide spills into the chat log
as prose.

Reproduced against the protocol's own documented form:

```
BODY APPLIED >>> "<!-- _class: diagram -->\n\n## Class diagram\n"
PROSE SHOWN  >>> Done — 13 slides added.\n\n`mermaid\nclassDiagram…
```

A heading-only slide, applied without a word. The same thing happens whenever a model
uses a plain three-backtick wrapper, which they do constantly.

### 3. The chat was capped at 4096 output tokens and never checked for truncation

`defaultMaxTokens: 4096` — a ceiling sized for "tighten this slide", on the surface
people ask for whole decks. Nothing in `docs/src` read `finish_reason`, so a reply cut
off at the ceiling was processed identically to a complete one, which is precisely what
triggered defect 2. Hence 13 slides claimed, then 15, with 14 actually present.

### 4. The model has no tools, isn't told so, and can't see the errors we already have

There is no tool loop. Asked to run `mmdc`, the only in-character reply available was
to comply, so it fabricated a test run — twice. Nothing in `deckSystem` said otherwise.

Meanwhile the runtime **already knows** which diagrams failed: it attaches a
`.mermaid-error` box with the real parse message per failed diagram
(`lib/runtime/index.js:1074-1095`). The chat's grounding is
`{ scorecard, findings, catalog }`, and `lint-core` has no Mermaid rule — so that
ground truth never reaches the model. It was guessing while the answer sat in the DOM.

## The decision

### Tildes for the wrapper, and the parser follows CommonMark

The wrapper has to differ from the payload in **marker**, not merely in length. Length
is the fragile axis: it asks the model to hold a counting invariant against its single
strongest habit, and CommonMark then lets the payload's own bare ` ``` ` close a
same-marker wrapper *legally*. No parser can have it both ways — measured:

| wrapper | payload | result |
|---|---|---|
| 4 backticks | ` ```mermaid ` | clean (when the reply completes) |
| **3 backticks** | ` ```mermaid ` | **still mangled, even with a correct parser** |
| **3 tildes** | ` ```mermaid ` | **clean** |
| 4 backticks, truncated | ` ```mermaid ` | reported unterminated; nothing applied |

Models emit `~~~` essentially never, so the collision goes away by marker class. The
published example is now `~~~lattice-edit` — the example is what a model copies, and
ours was *teaching* four backticks.

Tildes are collision-*unlikely*, not collision-*free*: `~~~mermaid` is legal in a
Lattice deck (`lint-core.js:605`, `slide-split.js:31` both recognize `~{3,}`). So the
≥-length rule and the refusal still earn their place.

### Refuse loudly; never salvage a guess

`parseEdits` is line-anchored, accepts either marker, requires a bare closer, and
returns a third value — `problems` — for blocks it recognised as edits but can't trust:
`unterminated` (the reply was cut off) and `fence-collision` (a backtick wrapper closed
by its own payload). Neither yields an edit. `applyEditChecked` returns
`{ source, ok, reason }`; a fully-refused run never reaches the Apply button, and a
partial run reports as "Applied 2 of 3".

### The ceiling and the price are different numbers

`CHAT_MAX_TOKENS` (16384) is a hard ceiling and must clear a deck-sized reply.
`CHAT_OUTPUT_EST` (4096) is what a typical turn returns and is what the "≈ $/turn"
readout prices — quoting the ceiling would put a number on screen that almost no turn
reaches. The hard-stop budget gate is the one place the ceiling is correct, because its
job is to refuse a call that *could* overshoot. `finish_reason` is now plumbed from
both the streaming and non-streaming paths, and a `'length'` stop is stated in the reply.

### Multi-slide inserts are legal

An `after=` body carrying several slides separated by `---` was the single most common
silent no-op — it is the shape a model reaches for on "add these slides", and the
protocol couldn't express it. `applyEditChecked` now splits such a body (fence-aware,
so a `---` inside Mermaid front matter isn't a boundary) and inserts the run. A
`slide=` body is still exactly one slide, and an unclosed fence is still fatal to both.

### One sentence in the prompt about tools

`EDIT_PROTOCOL` now states the model has no shell, cannot render or validate anything,
and must never claim it did.

## What this does NOT fix

**The chat still cannot see Mermaid parse errors.** The runtime knows them; the
grounding doesn't carry them. Until it does, the Architect's account of *which* diagram
is broken remains a guess — a better-behaved guess that no longer claims to be a test
result, but a guess. Feeding `.mermaid-error` into `ChatGrounding` is the obvious next
move and is deliberately not in this change.

**The price strip still under-counts its input.** `architect.ts` fixed the budget
*gate* to count the ~16.5K-token primer per turn, noting that ignoring it would
"under-count a chat turn several-fold". The displayed estimate never got that fix — it
prices the deck source alone. It lands in the right range only because the output
assumption errs the other way. Two errors cancelling is not a design.

## The reproductions

Kept as tests, because each one presented to the author as "it says it worked and it
didn't": `test/unit/playground/architect-edits.test.js` → *"edit protocol — the failures
that produced silent corruption"*, and `docs/src/components/studio/architect.test.ts` →
*"applyProposedEditsChecked — refusals are reported, not swallowed"*.
