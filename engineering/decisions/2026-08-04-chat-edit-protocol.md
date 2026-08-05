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

### One default cloud model, and it is the one the UI promises

The Studio overrode `createArchitectModel`'s `defaultModel` to
`~anthropic/claude-haiku-latest`, on the reasoning that the author "upgrades
deliberately". The Workspace picker rendered two panels away has always said
**"Defaults to Claude Sonnet"** — so an author who never opened the picker was
authoring on a model the UI denied they were using. That is a contributor to the
churn in its own right: a small model was drafting fourteen Mermaid diagrams while
the panel claimed otherwise.

Two defaults in two files is how that drifts. The override is gone; the Studio
inherits `DEFAULT_OR_MODEL` (`~anthropic/claude-sonnet-latest`), and a test pins it.

Two copy lines named a pinned version against an alias that moves by design
("Claude Sonnet 4"): the picker's, and the pre-connect blurb in `WorkspaceSheet`.
The second was found only by driving the real Workspace panel — a grep for
"Defaults to" misses "defaulting to". Both read "the latest Claude Sonnet" now.

One consequence worth stating plainly: `docs/e2e/openrouter-live.ts` derived its
**cost guardrail** from that default ("the model stays on the Studio default
`~anthropic/claude-haiku-latest` — the cheapest capable family"). That tier spends
OUR `OPEN_ROUTER_KEY` on the sanctioned nightly workflow, so moving the default to
Sonnet would have quietly raised its per-call spend ~3x — against a raised output
ceiling, compounding it. The harness now PINS the cheap model itself. A spend
guardrail must not depend on a product default someone else is free to re-tune.

### One sentence in the prompt about tools

`EDIT_PROTOCOL` now states the model has no shell, cannot render or validate anything,
and must never claim it did.

### The chat is grounded in Mermaid's own verdict

Forbidding the fabrication only converts it into "I don't know". `mermaid-check.ts`
supplies the answer: it extracts every ```mermaid fence per slide and runs Mermaid's own
`parse()` over it, and the errors ride a new `ChatGrounding.diagrams` channel into the
prompt, labelled as measured and attributed to the parser.

Not by scraping the preview. The runtime's `.mermaid-error` boxes are the same data, but
they live inside the preview iframe and the Studio's live preview renders only the
CURRENT slide — a source that structurally cannot account for a deck. Asking the parser
directly can.

It is a RENDER diagnostic, not an authoring lint rule, so it deliberately does not become
a lint finding: `lib/authoring/lint-core.js` is pure, fs-free and shared with the CLI
(HARD RULE #7), and cannot take a ~3MB dependency. Hence its own channel. The library
loads lazily and only for a deck that actually contains a diagram, from the same vendored
`mermaid-v11.min.js` the preview and the export bundle already use.

Three states, deliberately distinguished — `undefined` (not checked; the model says
nothing), `[]` (checked, all clean; the model can say so, which stops it inventing a
problem to be helpful), and a non-empty list (these, exactly these).

Verified against the real library in the running Studio: a valid diagram returns clean, an
unknown type and garbage each return Mermaid's own message, and a **truncated**
`classDiagram` returns `Parse error on line 3: Expecting 'STRUCT_STOP', 'MEMBER', got
'EOF_IN_STRUCT'` — which is precisely the corruption defect 2 used to create. The reducer
keeps that pairing: taking only the first line, the obvious reduction, yields a bare
"Parse error on line 3:" — a location with no diagnosis.

### The price strip prices the prompt it sends

The budget *gate* was taught to count the ~16.5K-token primer ("would under-count a chat
turn several-fold"); the readout the author actually reads never was, and priced the deck
source alone. It looked plausible only because its output assumption erred the other way —
two errors cancelling, which stops working the moment either moves, as raising the ceiling
just did.

It also moved. The readout owned a full-width strip between the transcript and the
composer; it now rides the panel header, right-aligned opposite the title, and is portalled
into the mobile sheet's header rather than reappearing one row lower. `ChatCost` is one
component for both surfaces — a widget per surface is what HARD RULE #15 forbids.

`chatSystemTokens` prices the real system turn via the already-exported `buildChatSystem`.
It weights a cached prefix at roughly a tenth: after the first turn of a thread the primer
is a cache READ, and charging it at full rate on every turn would replace an under-count
with an over-count rather than fix anything.

## What the adversarial trio found (HARD RULE #25)

Red team, Munger inversion, and an independent checker, run against the FIRST version of
this change. They agreed on the shape of the worst finding, and it was mine.

**The fix contained the bug it was written to remove.** `checkDiagrams` returned `[]` both
for "checked, all clean" and for "the library could not load", and `buildChatSystem` turned
`[]` into *"Every Mermaid diagram in this deck parses cleanly"* — labelled *measured, treat
it as authoritative*. Offline, a blocked script, a 404 on the vendored asset: the app
asserted a verification it never performed. Worse than the original defect, because a
model's fabrication is soft — the author typed "you lie" and it folded — while this one is
in the system turn, the model is told to trust it, and the author cannot see it. The
failure was memoized for the session. `checkDiagrams` now returns `null` for "no answer";
`[]` is reserved for a run that actually happened.

Everything else they found in this change, fixed here:

| Finding | Was |
|---|---|
| U+2028 in a Mermaid error | Broke the JSON-quoted bullet in the SYSTEM turn — `JSON.stringify` doesn't escape it, `trim` doesn't strip it, `split('\n')` doesn't split on it. The message is *fully* attacker-authored for an undetectable diagram type. |
| `extractDiagrams` fence-blindness | A diagram documented inside an outer fence was reported as a real error to "fix exactly" |
| `~~~lattice-edit-example` | Parsed as a live edit — the token had no boundary |
| Empty replace body | Blanked the slide and reported success |
| Delete of the last remaining slide | Ate the front matter's closing `---`, turning the YAML into body text |
| `after=<huge>` | Silently appended instead of refusing |
| An opener in the model's fenced prose | Became a live proposal — including one echoed from an untrusted deck |
| Unterminated opener | Discarded the rest of the reply and blamed a truncation that may not have happened |
| Fence-collision refusal | Left the wrapper's orphan closer in the prose, so the chat renderer swallowed the explanation itself |
| "Applied 3 of 4" | Two counters, two units — `applied` counted slides, `refusals` counted blocks |
| Stale diagram grounding | The signature keyed on code only, so inserting a slide above a diagram kept the old slide number authoritative |
| `CHAT_MAX_TOKENS` | Set on the SHARED model, re-tuning every Studio cloud path and pushing the hard-stop gate to price ~$0.25 to shorten a sentence |
| Uncapped parse loop | Serial, on the parent page's main thread — ~1.5s freeze for a hostile deck, per debounce tick |

**What held under attack, and is worth recording as such:** the `<script src>` injection is
clean — `mermaidUrl` is a build-time same-origin constant, and `mermaid.parse()` does not
render, so HARD RULE #22's model is not weakened (tested with `onerror` payloads,
`securityLevel: loose`, `javascript:` clicks — no DOM mutation, no network). The tilde
fence rules hold against every payload tried. JSON-quoting holds for `"`, `\` and newlines.
Descending-sort ordering with multi-slide inserts is correct.

**Deliberately NOT fixed here, because it is off-path and architectural:** the slide
splitter and the renderer disagree about what a boundary is — `--- ` with a trailing space,
`***`, and U+2028 all desync numbering, so an edit can land on the wrong slide. That is
pre-existing, shared with `lib/authoring/slide-split.js`, and reaches well beyond this
change; dragging it in would break HARD RULE #17. It needs its own issue.

## What this does NOT fix

**The apply path is not verified end-to-end on the real surface.** Seeing the "Applied 2
of 3" badge and the refusal notice requires a real model reply on a real key. The model
default, the copy, and the diagram check were driven on the running Studio; that path was
not.

## The reproductions

Kept as tests, because each one presented to the author as "it says it worked and it
didn't": `test/unit/playground/architect-edits.test.js` → *"edit protocol — the failures
that produced silent corruption"*, and `docs/src/components/studio/architect.test.ts` →
*"applyProposedEditsChecked — refusals are reported, not swallowed"*.
