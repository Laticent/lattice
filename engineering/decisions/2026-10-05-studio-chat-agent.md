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
| `fit` — the draft rendered off-screen, the runtime's overflow verdict per slide | `draft-fit.ts`, `export/deck-export.js` (`measureDeckFit`), `chat-agent.ts` (`withFit`) |
| The `≈ $` readout: a question and an edit, priced from the measured turn shape | `ChatCost.tsx`, `chat-agent.ts` (`agentTurnUsd`, forwarded by `architect.ts`) |

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

**Edit cost parity, the follow-up** (`followups.d/2518-p2`, closed here). The table above left
an edit at ~1.5x the old one-shot. Three changes, re-measured with the same harness rebuilt
from this section (`.scratch/bench/`, HARD RULE #24), the same six asks on a five-slide board
deck, Sonnet 5.5, the prefix warmed first so no column pays the one-time write, and a nonce in
each run's deck so no run reads another's tail from cache. Two runs each; cost from
`usage.cost`.

| Ask | Old one-shot | Agent on main | Agent, this change |
|---|---|---|---|
| Who is it for; weakest slide? | $0.021 | $0.014 | $0.013 · 1 call |
| What is missing for a board? | $0.026 | $0.020 | $0.016 · 1 call |
| Add a KPI slide | $0.021 | $0.030 · 3 calls | $0.022 · 2 calls |
| Fix the word budget | $0.026 | $0.088 · 7 calls | $0.023 · 2 calls |
| Slide 3 → timeline | $0.019 | $0.024 · 3 calls | $0.018 · 2 calls |
| Savile finish + dark mode | $0.028 (cannot set front matter) | $0.027 · 3 calls | $0.020 · 2 calls |

"Agent on main" is the first run of each ask (the second run of main's agent read the first
run's tails from cache, which a real author does not get). Every applied edit linted with 0
errors. Across the four edit asks the agent now costs $0.083 against the old $0.093, 11% less;
questions cost 40% less. One ask is still over: the KPI edit, by about $0.001 (5%), the price of
reading the layout's contract before writing it. What changed:

- **An edit that checks clean ends the turn.** `edit_slides` and `set_front_matter` take a
  `summary` for the author. When every call in a round was an edit that applied whole and the
  checker found no errors, `runAgentLoop` ends the turn with that summary instead of re-sending
  the whole conversation for the model to say it is done. That round was a third of an edit's
  cost. An error or a refused edit still gets its round. The prompt alone did not do this: told
  to write its summary beside the edit, Sonnet called the tool with no prose every time, so the
  summary is a required argument. Warnings on slides the turn wrote are appended to the reply,
  because the model never saw them.
- **`read_component` returns the doc's core, not all of it.** The contract (capacity, slots,
  the variant decision rule, common mistakes), when to use it and when not, and the skeleton.
  A worked example per variant made up most of `kpi`'s ~4K tokens; those sections are listed by
  name, one `section` call away. The doc's own Authoring example is dropped when the catalog's
  skeleton already rides in the same result.
- **A long guide returns its table of contents.** The cap fell from 24,000 characters to
  12,000. The "fix the word budget" turn read the whole 21K-character speaker-notes guide for
  the comment syntax: 7.6K tokens written to the cache for one line. The syntax is now one line
  of the always-on prompt.

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

**Found by the owner on production, after merge.** A turn on lattice.style answered "No change
suggested." with $0.00 spent, so no request had succeeded. Any failure on the agent's first
round fell back to the one-shot chat, which failed the same way, and the one-shot path reports
every failure as an empty reply. So a rejected key, an account out of credits or a dead model
all read as "No change suggested." The fallback now runs only when the model refused the tools
(`isToolRefusal`); any other failure is shown with its cause and remedy
(`describeModelError`). Verified on the real Studio with an invalid key at 390px: one
request, a 401, and the notice "OpenRouter rejected the connection — reconnect in Workspace →
AI. (OpenRouter said: User not found.)" The same request on production with a working key
built a 7-slide deck with 0 lint errors.

**The second checker pass, over the self-reviewed commits** (`followups.d/2518-p1`, closed
here). An independent checker read `withCheck`, `withCachedTail`, the transport's tools
handling and #2531's error routing, and reproduced each finding against the real wiring. All
fixed and pinned in `architect-agent.chat.test.ts` / `architect-agent.test.ts`:

- **An error inside a 200 stream was dropped.** OpenRouter reports a provider that drops
  mid-reply as an `error` object in the stream, after a 200. The parser never read it, so the
  turn ended as "No reply came back", and a half-streamed tool call ran on cut-off arguments.
  On a request with tools it now throws `OpenRouter error <code>`, which names the cause.
  Callers without tools keep their partial prose, as before.
- **A context-length 400 fell back to the one-shot.** `isToolRefusal` matched any 400 that
  mentioned "tool", and OpenRouter's overflow message counts "tool input" tokens. The one-shot
  then sent the larger old prompt, which overflowed too, and said "Nothing came back". The
  match now needs the refusal's own words and the transport's status prefix; a context-length
  error says the deck and attachments are too long for the model.
- **A failure after round one always read "the connection dropped".** A 429 between tool
  rounds, the likeliest case, now says it is rate-limiting; any OpenRouter status names its
  cause and remedy.
- **A Stop during a round that streamed only a tool call recorded $0** and skipped the
  exact-cost lookup. A round in flight is now estimated from its prompt and reconciled by its
  generation id whether or not prose streamed.
- **A 403 for flagged input said "reconnect".** It now says moderation flagged the request.
- **"Diagrams were not checked" was silent.** When Mermaid's parser did not run, the check
  now says so, so the model cannot claim the diagrams parse.
- **A retired model id no longer self-heals on the chat**, and the transport's comment said it
  did. Kept as a decision: the chat shows "pick another model" with OpenRouter's words rather
  than moving the author onto the default model without saying so. Comment and test corrected.
- **Answered, not changed:** the checker suspected Google models would refuse the tool schemas
  (a `type` array, an empty `properties`). One live turn on `google/gemini-2.5-flash` took the
  tools with a 200. And it could not tell whether the rolling cache mark on a `tool` message
  reaches Anthropic; the benchmark above shows it does, since each round's `cached_tokens`
  include the previous round's tool results.

**A checker over the follow-ups themselves** (tier 1, the same pass the brief asked of each
item). It reproduced four defects in the new code, all fixed and pinned in
`architect-agent.test.ts` / `architect.test.ts`:

- **A malformed edit inherited the previous edit's clean verdict.** A round of a clean edit
  plus an edit whose arguments were cut off ended the turn, the second edit silently dropped.
  An edit whose arguments do not parse now counts as refused.
- **Fit rows are rendered sections, not source slides.** `split: headings` renders three
  sections for two slides, so section N named the wrong slide and charged an untouched one.
  Continuation pages (`N.k`) now fold into slide N, and a deck that still renders more sections
  than slides has its fit reported by section and charged to nothing.
- **A front-matter change that broke fit everywhere read as clean.** "Mine" was decided by
  slide text, which a `size:` or `finish:` change does not touch. Once the turn changes front
  matter, every slide is the turn's.
- **An old error on an untouched slide held every turn open**, undoing the saving above on any
  deck that already had one. The turn now answers for errors on the slides it changed (and
  deck-level ones once it changed front matter), and the check tells the model the rest were
  already there.

Also fixed: the readout priced a deck past the inline limit by its whole text, though the turn
carries an outline; and a stream error now releases the response body. Left as they are: fit
is measured in the live deck's theme and mode, not one the agent just set on the draft; and a
slide rewritten to match another original slide's text counts as untouched. Both are rare and
named here so nobody mistakes them for coverage.

**Startup JavaScript, again.** Both follow-ups first put code where startup pays for it, and
it only showed once `main` gained the plugin split (#2525): measured on the branch alone the
Studio grew 29–38 B, on the PR merged into `main` (what CI builds) 361 B. Bisected by merging
`main` into each commit: the fit check's `import('./draft-fit')` in StudioShell cost ~172 B
(every chunk the export renderer needs went into the shell's preload map), and the readout's
`agentTurnUsd` in `architect.ts` ~170 B. The fix is the rule §6 already states: the shell hands
the render settings to the agent as data, the lazy `chat-agent.ts` imports `draft-fit`, and
`agentTurnUsd` lives in `chat-agent.ts` behind a five-line forwarder (the readout shows nothing
until the agent module lands, then re-prices). Merged into `main`: −15 B, nothing to declare.

## 10. What this does NOT do

- **It sees fit, not looks.** Since the follow-up (`followups.d/2518-p3-agent-cannot-see-slides`),
  every check renders the draft off-screen the way export does (`draft-fit.ts` →
  `measureDeckFit`, imported by the lazy agent from settings the shell hands over as plain
  data, `fitRender`) and reads back the runtime's own per-slide verdict: `.overflow`,
  `.clip-marked`, `.illegible`. A slide the turn wrote that overflows or cuts text counts as an
  error and holds the turn open; the same on an untouched slide is reported, not charged. It
  does not judge how a slide looks, and the prompt says so. The render uses the live deck's
  palette and mode, not a theme the agent just set — fit barely depends on them. Proven on the
  real Studio with a mocked model (`docs/e2e/chat-agent-fit.spec.ts`): a 28-item slide comes
  back "slide 2 overflows its frame, has text cut off", and the turn takes a second round. And
  with a live model on the real Studio (Sonnet 5.5, a real key, `.scratch/` only): asked to put
  22 sentence-long items on one slide, it wrote them all, got that verdict back, read the `list`
  layout, and split them 6/6/5/5 across four slides before the turn ended clean. A render that
  cannot finish within 15 seconds reports fit as not measured, never as fine, and so does a slide
  whose diagram had not drawn when it was measured. The FIRST check on a cold page fits inside
  that limit (§11).
- **The on-device tiers are unchanged** — still the one-shot path, short canon, and fenced
  edit blocks.
- **The `≈ $` readout is an estimate of a typical turn.** It shows a range, a question to an
  edit (`agentTurnUsd`), from the turn shapes measured above: a question is one call that
  writes ~1,000 tokens; an edit is two, the second re-reading the prompt from cache plus ~2,500
  tokens of layout docs and writing ~700. On the bench deck it reads $0.014–0.020 warm against
  $0.015 and $0.021 measured, and $0.053 for a cold first question against $0.049. It replaced
  one figure priced at the 4,096-token output ceiling, which quoted every turn at ~3x a
  question's real cost (the follow-up had guessed it under-quoted). The ceiling still prices the
  budget GATE, which must hold the worst case. Long turns, like a whole new deck, cost more than
  the range; the spend tally records the exact cost from `usage.cost`.

## 11. The first fit check on a cold page (follow-up `2539-p3-fit-check-cold-start`)

**Result: the 15-second limit (`DRAFT_FIT_TIMEOUT_MS`) holds, so it stays, and no pre-warm
was added. One defect turned up on the way and is fixed:** on a slow link, the first diagram
of a session could be MEASURED BEFORE IT DREW, and the checker reported that slide as fitting.
It now reports the slide's fit as not measured (below, "A diagram that has not drawn has no
verdict").

The worry was arithmetic. `createCaptureFrame` bounds its waits at 10 s (load), 8 s (fonts),
0.5 s (paint) and 4 s (diagrams), which can add up past 15 s, so the first edit of a session
might get "fit not measured". In practice, the first check is fast. The live preview has
already fetched the files the fit check needs (`lattice-runtime.js`, the theme fonts, and
Mermaid when the deck has a diagram). The fit check's own new download is one 350-byte chunk
(`draft-fit`), and none of its waits gets near its limit.

**How it was measured.** The real Studio from `npm run build:e2e`, then re-run after
`inject-modulepreload.mjs` + `hoist-stylesheets.mjs` to make it production-shaped (same
numbers). Every run used a fresh browser context, so the HTTP cache started empty, and a
3-slide deck with one Mermaid diagram. A mocked model calls `check_deck` (no key spent, HARD
RULE #24). The time runs from handing back that tool call to the model's next request, which
carries the checker's verdict. That covers the lint, the Mermaid parse and the fit render,
running side by side as in `withFit`. Three runs per row, in milliseconds:

| Condition | Studio settled before the first message | First message sent while the page is still loading |
|---|---|---|
| Unthrottled | 416 · 398 · 378 | 392 · 409 · 356 |
| 4× CPU slowdown | 1,646 · 1,605 · 1,677 | — |
| Slow link (1.6 Mbps, 150 ms latency) | 2,628 · 2,168 · 2,178 | 6,372 · 6,356 · 6,358 |
| Slow link and 4× CPU | 3,496 · 3,515 · 3,354 | 7,800 · 7,688 · 7,436 |

All 27 runs reported "Fit, measured from a real render of the draft: all 3 slides fit". The
throttled rows come from Chrome DevTools emulation and model a slow machine and a slow link.
They are not a device measurement.

**One trap in the method, recorded so the next timing spec avoids it.** The first attempt
mocked the model with Playwright's `page.route()`. While any route is installed, that call
makes every request in the page skip the HTTP cache, so the fit frame re-downloaded the
runtime (347 KB) and Mermaid (877 KB) that the page already held. That produced 12.5 s
settled and 20.5 s (timed out) unsettled on the slow link. Those figures are wrong: they
measure re-downloads that a real author's browser does not make. Mocking `window.fetch` from an
init script leaves the cache alone (304s in the log). See `engineering/gotchas/docs-site.md`
§"A timing spec re-downloads everything".

**The case the preview cannot pre-fetch: a draft that adds the deck's FIRST diagram.** The
deck on screen has no diagram, so Mermaid (877 KB) has never been downloaded, and the agent's
edit inserts a Mermaid slide. The edit's own check has to fetch Mermaid (a full `200` in every
run) before the frame can draw the diagram. The mock sends `edit_slides` and `check_deck` in one
round, because a round of edits alone ends the turn without another request. So each time
below covers the cold edit check PLUS a warm `check_deck`, and overstates the cold check alone:

| Condition | Studio settled before the first message | First message sent while the page is still loading |
|---|---|---|
| Unthrottled | 1,111 · 1,128 · 974 | 1,552 · 1,208 · 1,208 |
| Slow link and 4× CPU | 10,042 · 9,827 · 9,853 | 9,853 · 10,446 · 9,690 |

All 12 runs returned "Fit, measured" for the edit and for `check_deck`, and in every one the
diagram had drawn before the frame was measured.

**Against the real deployed site, and finding the cut-off.** The same spec ran against this
branch's Cloudflare Pages preview, with its real hosting, brotli compression and caching
(Mermaid transfers 831 KB there, 3.2 MB uncompressed), through the sandbox's proxy. Unthrottled,
the first-diagram case took 3.8–4.1 s on that real network path. To find where it breaks, the
link was throttled only AFTER the Studio settled, isolating the check's own downloads, with a 4×
slower CPU. A probe in the page recorded each capture frame's diagram state just before the frame
was measured and disposed:

| Link | Turn time | Edit check's diagram when measured |
|---|---|---|
| 1.6 Mbps | 10.2–11.7 s | drawn |
| 1.2 Mbps | 11.8 s | drawn |
| 1.0 Mbps | 13.4–14.2 s | drawn |
| 0.85 Mbps | 15.5 s | drawn |
| 0.7 Mbps | 16.8–17.3 s | **not drawn** (`unavailable`) |
| 0.5 Mbps | 23.2 s | not measured by the probe |

The turn time passes 15 s below ~0.9 Mbps without the fit check timing out. The slow part is
the Studio's Mermaid PARSE check (`checkDraft` → `mermaid-parse`), which has no time limit and
waits for the whole download. That costs latency, never a wrong answer, so it stays.

**A diagram that has not drawn has no verdict.** At 0.7 Mbps the fit frame's 4 s diagram wait
(`waitForDiagrams`) expired while Mermaid was still downloading. The frame released the figure
to its source text and measured the slide with that text in the diagram's place, and the
checker told the model "all 3 slides fit". That was a guess dressed as a measurement, which the
fit check's contract forbids. `measureDeckFit` now flags a slide holding a figure that is still
pending or was released (`undrawn`), and the checker leaves it out of the verdict: "the other 2
slides fit. Fit was not measured for slide 3: a diagram there had not drawn …". It is not
charged as an error, because the model cannot fix a download. A parse error is not `undrawn`: it
draws its error box, which is what the author sees. Re-run on the real Studio after the fix:
0.7 Mbps returns that sentence, and 1.6 Mbps still returns "all 3 slides fit".

Not done, and why: warming Mermaid when the chat opens would let the first diagram draw on
slower links, but it would spend 831 KB on every chat session, with or without diagrams. The
idle warm-up (`studio-warm.ts`) deliberately warms Mermaid only for a browser that has already
shown a diagram. Below ~0.8 Mbps, the honest "not measured" is the answer.
