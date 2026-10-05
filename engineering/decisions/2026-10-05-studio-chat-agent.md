---
status: shipped
summary: The Studio chat was a one-shot prompt, not an agent. Every turn it sends a ~25K-token dump of every layout plus the whole deck, it has no tools, it cannot read the docs that teach front matter, finishes, themes or deck budgets, and it cannot check its own edits. The cloud tier is now a tool-using agent loop - a ~6.7K-token always-on core (down from ~26.5K), the canonical docs fetched on demand, and the Coach's own linter run over every staged edit before the author sees it. On-device keeps the one-shot path.
companion:
  - ./2026-08-04-chat-edit-protocol.md
---

# The Studio chat becomes an agent

**Date:** 2026-10-05
**Surfaces:** `docs/src/components/studio/architect.ts` (`chatComplete`, `buildChatSystem`),
`ai/architect-model.js` (the OpenRouter backend), `ai/architect-knowledge.js`,
`ai/architect-edits.js`, `ArchitectChat.tsx`

## 1. What the author reported

> The chat in the studio seems broken. It sometimes fails on basic usage. It feels
> pre-canned: one can't have a conversation about the content of the deck and ideas one
> could want to introduce. It should know the components, universals, how to author a
> deck, how to apply finishes, how to configure the deck with front matter, the deck's
> word budget, best practices. It needs to be an agent I can talk to about anything but
> that still understands its purpose. It has to be efficient.

## 2. What the chat actually is today

`chatComplete` (`architect.ts`) makes **one completion per turn** and returns. There is no
loop and no tool. Everything the model knows has to fit in that single prompt:

| Part of the prompt | Size | Sent |
|---|---|---|
| Persona + `DECK_CANON` + `EDIT_PROTOCOL` | ~2.5K tokens | every turn |
| The Lattice primer (`buildLatticePrimer`) — every layout's skeleton | 91 KB, **~25K tokens** (measured on `dist/agent-kit/authoring/primer.md`, same function) | every turn |
| Findings, scorecard, retrieved canon, diagram errors | a few hundred tokens | every turn |
| The whole deck with `[slide N]` markers | grows with the deck | every turn, appended to the last user message |

Four consequences follow from that shape.

1. **It cannot know most of Lattice.** The primer covers layouts only. Nothing in the
   prompt mentions front-matter registers (`lib/base/base.registers.docs.md`, 90 KB:
   `finish:`, `mode:`, `preset:`, `venue:`, `split:` …), themes, finishes, lenses, speaker
   notes, or the deck-level skills in `design/skills/`. Grep the prompt builders for
   `finish:` or `front matter` and nothing comes back. Ask it to "give this a paper
   finish" and it has to guess.
2. **It cannot check itself.** `EDIT_PROTOCOL` has to tell the model "You have NO tools …
   never say you tested anything" (born from the 2026-08-04 transcript where it claimed
   an `mmdc` run). The linter that already runs in the browser (`lint-core`) never sees a
   proposed edit until after the author applies it.
3. **Edits ride on text parsing.** An edit is a `~~~lattice-edit slide=N` fence the parser
   has to find in free prose. `2026-08-04-chat-edit-protocol.md` documents four separate
   ways that broke; the fixes made failures *loud*, but a malformed or cut-off block still
   costs the author the turn. This is the most likely source of "fails on basic usage".
4. **Talking costs as much as editing.** "What do you think of slide 3's argument?" pays
   for the full 25K-token primer and the edit grammar, and the model is primed toward
   emitting edit blocks rather than discussing ideas — which reads as pre-canned.

## 3. The decision

Replace the one-shot chat with an **agent loop** on the cloud (OpenRouter) tier. The
transport already supports it: one probe of `~anthropic/claude-sonnet-latest` with a
`tools` array returned a well-formed `tool_calls` reply, `finish_reason: tool_calls`,
for $0.0013.

### 3.1 A small always-on core

The system prompt shrinks to what every turn needs:

- **Purpose and voice** — a Lattice deck collaborator: discuss the argument and ideas
  freely, and change the deck when asked.
- **The authoring contract** — the universals from `AUTHORING_RULES` and `DECK_CANON`
  (card nesting, title order, per-element word limits, no hex).
- **A one-line-per-component index** (name + when to use) and a one-line-per-register
  index (`finish:` — backdrop; `mode:` — light/dark …), so the model knows what exists
  and asks for the detail.
- **The deck's live state** — front matter, slide count, a slide outline (titles and
  `_class` per slide), the deck's word total against its budget, and lint findings.
  Full slide text comes through a tool.

Target: under ~8K tokens, against ~27K today, with the static half cached.

### 3.2 Tools — knowledge on demand, and edits as structured calls

| Tool | What it does | Backed by |
|---|---|---|
| `read_component(name)` | The full authoring doc, skeleton, variants and budget for one layout | the agent-kit component pages (`dist/agent-kit/components/*.md`, generated from `lib/components/**/*.docs.md`) |
| `read_guide(topic)` | A skill or register doc: `deck`, `finish`, `theme`, `lens`, `speaker-notes`, or one front-matter register | `design/skills/*.md`, one section of `base.registers.docs.md` |
| `read_slides(range)` | The exact source of the slides it needs | the live deck |
| `edit_slides(edits[])` | Replace / insert / delete slides | the existing `applyEditChecked` — structured JSON, no fence parsing |
| `set_front_matter(key, value)` | Configure the deck (`finish:`, `mode:`, `theme:` …) | a front-matter splice |
| `check_deck()` | Lint the *proposed* deck and parse its Mermaid diagrams | `lint-core` + `mermaid-check.ts`, already in the browser |

The loop: the model reads what it needs, stages edits, calls `check_deck`, fixes what the
checker finds, and only then ends its turn. The author sees the prose answer plus one
diff card for the whole staged change. The existing review-then-apply card, stale-slide
guard and History checkpoint all stay — only the *source* of the edits changes, from
parsed fences to tool arguments.

Guards carried over: the loop is capped (8 tool rounds per turn), the budget gate prices
each round before sending it, a Stop aborts mid-loop and keeps the prose so far, and tool
results that quote deck text are labeled as data (threat model §5.1, same as findings).

### 3.3 The on-device fallback

The small on-device models (Prompt API, WebLLM, Transformers) cannot drive a tool loop
reliably. They keep today's one-shot path and the short canon, unchanged.

## 4. Options weighed

| Option | Knows registers/finishes/skills | Checks its own edits | Prompt per turn | Risk |
|---|---|---|---|---|
| **A. Agent loop (recommended)** | yes, on demand | yes, `check_deck` before the author sees it | ~8K core + what it reads | the largest change; tool-call streaming is new code in the OpenRouter backend |
| B. Bigger one-shot primer (add registers + skills) | yes, always loaded | no | ~75K+ tokens | cost triples; the model drowns in docs it does not need; no self-check |
| C. One-shot chat + a separate "edit" tool call | partly | partly | ~27K | keeps the 25K primer tax and the two-mode feel |

## 5. What was settled with the owner

One `AskUserQuestion` round, all three recommendations taken: the agent loop (option A);
edits keep **review, then apply** — one card per turn covering every staged change; and the
on-device tiers keep the one-shot path unchanged.

## 6. What shipped, and where

| Piece | File |
|---|---|
| Prompt, tools, toolbox over a draft, the loop, draft → edits fold | `docs/src/components/studio/architect-agent.ts` |
| The reading shelf — lazy raw imports of the canonical docs | `docs/src/components/studio/agent-library.ts` |
| Wiring: routing, per-round budget gate, spend, Stop | `architect.ts` (`chatAgent`, `finalizeAgent`) |
| `tools` / `tool_choice` / streamed `tool_calls` on the OpenRouter backend | `ai/architect-model.js` |
| `check` — the Coach's assessment + Mermaid parse, run over the draft | `StudioShell.tsx` (`checkDraft`) |
| Activity trail, live tool line, front-matter rows in the review card | `ArchitectChat.tsx` |

Choices worth knowing before changing any of it:

- **Edits are staged on a draft, then folded back.** The agent edits in sequence (insert
  after 2, then replace the new 3), but the review card re-applies a batch against whatever
  the deck is at Apply time, highest slide first. `proposalFromDraft` turns the draft into
  edits in the ORIGINAL deck's numbering with a slide-level LCS, so the existing Apply path,
  stale-slide guard and History checkpoint work unchanged. A unit test pins the property
  that matters: applying the fold to the original reproduces the draft.
- **Front matter is per key, through the lossless line writer** (`writeFrontMatterLine`),
  never a whole-block replace — an author's own front-matter edit between propose and apply
  survives. Only single-line values; a nested block such as `finish-override:` is refused
  with a reason.
- **The last round sends `tool_choice: 'none'`, not "no tools".** Anthropic-family endpoints
  refuse a history that holds tool calls unless the tools are defined, so dropping them on
  the final round would 400.
- **The budget gate prices every round**, because each round re-sends the conversation so
  far; a hard-stop cap has to hold across all of them.
- **The docs are read from source, not from `dist/agent-kit/`.** The kit is generated from
  the same files, but `dist/` is not committed, and a lazy `?raw` import keeps every doc off
  the startup path.
- **The agent is not startup JavaScript, and that took three tries.** Shipped eagerly it
  cost the Studio 13.1KB gz against a 2KB per-PR allowance (route budget). Moved behind a
  dynamic import (`chat-agent.ts`, via `loadChatAgent()` in `architect.ts`), it still cost
  ~2.2KB: Vite writes every chunk a lazy module statically needs into the EAGER importer's
  preload map, and importing `architect.ts` / `front-matter` from the agent listed ~95 chunk
  names — the whole Studio. Importing those dynamically instead made Rollup re-split shared
  chunks and cost +3.5KB. What works: the lazy modules import only their own files, and
  `architect.ts` hands over everything startup already holds (`chatAgentDeps()` →
  `init()`, `bindKernel()`). Measured +830–846 B against `main`, declared in
  `docs/route-budget.d/2518-studio-chat-agent.md`. `FRONT_MATTER_KEYS` moved to
  `front-matter-keys.ts` (re-exported by `editor-complete.ts`): a dynamic import of
  `editor-complete` from the agent re-split the Playground's `slide-context` (+212 B).

## 7. What was measured

**Prompt size**, same 74-component catalog: the old static prefix was 95,278 characters
(~26.5K tokens); the agent's is 24,201 (~6.7K tokens), and it reaches strictly more — every
component doc, the deck/finish/theme/lens/speaker-notes skills, the editorial and design
principles, and all ~70 front-matter keys with their register docs.

**Four real turns** against `~anthropic/claude-sonnet-latest` (resolved to Sonnet 5.5) on a
three-slide board deck, driven through the real prompt, tools and loop from a throwaway
harness (HARD RULE #24 — nothing under `test/` touches the key):

| Ask | Rounds | Tools it chose | Cost |
|---|---|---|---|
| "Who is this deck for, and which slide is weakest?" | 1 | none | $0.033 |
| "Give it an editorial finish and open in dark mode." | 3 | read `finish`, `color-mode`; finish guide; set both; check | $0.062 |
| "Add a KPI slide after slide 2: $4.2M up 12%, churn 3.1%, NPS 54." | 3 | read `kpi`; insert; check | $0.037 |
| "Is anything over the word budget? Fix it." | 3 | read `content`; replace; check | $0.029 |

Every proposal re-checked clean (0 errors) after Apply. The model discussed the deck without
tools when no tool was needed, read before it authored, refused to invent figures it had not
been given, and said "I haven't seen it rendered" rather than claiming a check it did not run.

**Matched before/after** (owner asked for it, after the four-turn table above). Same deck, the
same six asks, `~anthropic/claude-sonnet-latest` (Sonnet 5.5), the same cache marks as
production, and the same linter afterwards; cost from OpenRouter's own `usage.cost`. Harness:
`.scratch/bench-chat.test.ts` (throwaway, HARD RULE #24).

| Ask | Old one-shot | Agent, first cut | Agent, shipped |
|---|---|---|---|
| Who is it for; weakest slide? | $0.019 · 10.4s | $0.013 · 10.5s | $0.049 · 7.3s (one-time cache write; warm ≈ $0.011) |
| What is missing for a board? | $0.018 · 8.6s | $0.009 · 6.4s | $0.011 · 7.9s |
| Add a KPI slide | $0.018 · 7.2s | $0.036 · 11.2s · 3 calls | $0.030 · 12.1s · 3 calls |
| Fix the word budget | $0.019 · 8.3s | $0.108 · 15.9s · 5 calls | $0.037 · 20.6s · 6 calls |
| Slide 3 → timeline | $0.019 · 9.6s | $0.029 · 10.9s · 3 calls | $0.024 · 10.5s · 3 calls |
| Savile finish + dark mode | $0.023 · 12.1s — **not done** | $0.043 · 7.6s · 4 calls | $0.025 · 7.4s · 3 calls |

The old prompt is 37.9K input tokens per message (OpenRouter's count); the agent's is 10.9K.
Every applied edit, old and new, linted with 0 errors; only the agent could change front
matter. Read honestly: **questions cost about 40% less; an edit costs about 1.5x the old
one-shot** (about one cent more), the price of reading the layout's contract and checking
the result before the author sees it. The first cut cost 3x on edits; two changes took it
to 1.5x. `edit_slides` and `set_front_matter` now return the checker's verdict themselves,
which removes the separate check round. And `withCachedTail` (`or-cache.js`) marks the
newest message, so each tool round reads the earlier rounds from cache. The cold cache
write is smaller too: the agent's 10.9K-token prefix against the old 37.9K, about 3.5x less
to write after every hour-long lull (derived from the token counts, not measured cold).

**The real Studio**, built and driven in headless Chromium at 1440 / 820 / 390: one turn
asking for the `savile` finish plus a KPI slide streamed a live "Reading a component…" line,
ended with the trail "Read the finish key · Read kpi · Set finish · Edited slides · Checked
the deck" and one review card of two edits; Apply took the deck from 7 to 8 slides with the
KPI slide at 2 and `finish: savile` in its front matter.

## 8. Found on the way

**The composer was unusable in the docked desktop column.** That column is ~200px, and four
28px buttons beside the field left it ~20px wide: the placeholder broke one word per line and
a typed message could not be read. Not caused by this change, but on its path, and a likely
part of "the chat seems broken". The row now wraps: the field asks for 8rem, and the button
group drops to a second line when it cannot fit beside it (`CHAT_COMPOSER_ROW` in
`panel-shells.tsx`, shared with the loading skeleton so the two cannot drift).

## 9. What the maker-checker pass found (HARD RULE #25)

One independent checker, which fuzzed the fold over 8,000 random turns. Every finding is
fixed and pinned by a test in `architect-agent.test.ts` / `architect-agent.chat.test.ts`:

- **A blank deck grew a phantom empty slide.** `applyEditChecked`'s insert kept the empty
  chunk a blank deck splits to, so the first slide written into a new deck brought an empty
  second one, and Apply re-created it after the agent deleted it (698 of 8,000 fuzzed turns).
  Fixed in the shared splicer, so the on-device path's fenced edits get the fix too. A seeded
  300-turn round-trip test now starts from empty decks as well.
- **`set_front_matter` corrupted block keys.** On `style: |` or a `finish-override:` with
  indented children, the one-line writer duplicated the key or orphaned the block's body.
  `isBlockKey` now refuses those with a reason — which is what §6 already claimed.
- **Deck text reached the system turn unquoted.** The brief's front matter and each slide's
  `_class` are now JSON-quoted and labeled as data, like the findings.
- **A Stop in round 2+ double-charged round 1.** The estimate now covers the aborted round
  only; finished rounds already reported their exact cost.
- **Transport errors were invisible.** The model wrapper turned every failure into an empty
  floor reply, so the agent printed "No reply came back". A failure on a call that carries
  `tools` now reaches the agent. Before any round finishes, that means the model (or route)
  will not take tools, and the turn **falls back to the one-shot chat**. After a round has
  finished, the reply says the connection dropped. Before this, picking a model without tool
  support would have made every turn come back empty. `tool_calls` fragments without an
  `index` now continue the open call rather than spawning nameless ones.

**Found driving the fallback on the real surface, after the checker.** The one-shot fallback
for a model without tool support had only been tested with a scripted backend. Driven for
real in the Studio with `nex-agi/nex-n2.5-mini`, which lists no tool support, it never ran.
OpenRouter answers that model's tool request with a 404, "No endpoints found that support tool
use". The transport's retired-model self-heal (`isDeadModelError`) matched on "no endpoints
found" and silently re-sent the turn on the default model, with tools. The author's chosen
model was swapped for a pricier one without a word, and the cost landed on the author. Fixed:
a tool-use refusal is no longer treated as a retired model. The same run, re-driven: the tools
request gets a 404, then the agent falls back to a tools-free request on the author's model,
which gets a 200 and an answer. Pinned in `architect-agent.chat.test.ts`.

## 10. What this does NOT do

- **It cannot see the slides.** `check_deck` is lint, review and Mermaid's parser; no tool
  renders or rasterizes. A visual check would need the preview frame's own measurements, a
  separate piece of work.
- **The on-device tiers are unchanged** — still the one-shot path, short canon, and fenced
  edit blocks.
- **The `≈ $/turn` readout prices round one.** A turn's tool rounds are not knowable before
  it runs; the authoritative per-round cost still lands in the spend tally from `usage.cost`.
