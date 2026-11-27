---
status: shipped
summary: The Architect chat header showed a model chip and one session figure, and nothing about the context window, this deck's spend, today's spend, or what was sent and run behind the three dots. All of it was already arriving in each response's usage block, in the model's streamed thinking, or in the agent loop, so showing it adds no request and no cost. The session figure is now a Chat metrics dropdown (spend three ways, context fill, cache share, last reply, and manual compaction with a nudge), and each reply has a Show work link listing what was sent, each model call, its thinking and every command with its arguments and result. Compaction saves less than it sounds, and the dropdown says how much before you press it.
companion:
  - ./2026-10-13-studio-chat-polish.md
  - ./2026-10-05-studio-chat-agent.md
---

# Chat transparency: metrics, Show work, compaction (2026-10-20)

**Surfaces:** `ChatCost.tsx` (the dropdown), `ChatTraceDialog.tsx` (Show work), `chat-trace.ts`,
`chat-compact.ts`, `chat-compact-run.ts`, `chat-agent.ts`, `architect-agent.ts` (`onRound`),
`ai/architect-model.js` (`onReasoning`), `ai/spend.js` (the ledger), `studio-store.ts`.

## 1. The ask

> it doesn't give you context window used. it doesn't tell you how much you spent overall in this
> session, this deck and today. [...] one should be able to get a view into what is being sent by us
> and what is being sent back (reasoning and commands being executed). [...] we want to support
> summarization and compaction of the conversation manually or automatically via the dropdown.

## 2. Audit: what was already free

Every figure below was already on the wire or in the agent loop. Nothing needed a new request.

| Wanted | Where it already was | Cost to show |
|---|---|---|
| Context window used | `usage.prompt_tokens` on the last call, and `contextLength` in the model catalog. `onUsage` kept only cost and total tokens. | None |
| Cache share, thinking tokens | `usage.prompt_tokens_details.cached_tokens`, `usage.completion_tokens_details.reasoning_tokens`. Ignored. | None |
| Spend this deck, today | Not stored: the tally held one session number (per tab) and one all-time number. | A ledger in `localStorage` |
| What was sent | The prompt builders run on the client (`agentSystemParts`, `deckForTurn`), so a per-part token estimate is local arithmetic. | None |
| The model's thinking | Streamed as `delta.reasoning` (or `reasoning_details`) beside the answer and dropped by the parser. Already billed. | None, as long as we never send a `reasoning` setting to get it |
| Commands | `runAgentLoop` held each call's name, arguments and result and kept only a short phrase. | Storage for a bounded trace |

What would add credit cost, and was left out: raising the reasoning effort to get more thinking to
show, a second model call to "explain" a turn, and any automatic compaction.

## 3. Decisions

1. **The session figure is the dropdown's trigger.** The model chip stays the picker. A 12 px ring
   beside the figure shows context fill and turns amber at 70% and red at 90%.
2. **The ledger books the same charges as the tally.** `recordSpend` and `adjustSpend` both write
   to it, bucketed by local day and deck (`{ "2026-10-20": { "<deckId>": [usd, tokens] } }`), kept
   120 days. One source of truth means session, deck and day cannot disagree. The Studio names the
   open deck with `setSpendDeck`; a charge made with none set books under `_`.
3. **Usage is saved on the reply** (`ChatMessage.usage`). The context meter reads the newest reply's
   usage, so it survives a reload and follows the deck, not the tab.
4. **Show work persists a bounded trace** (`ChatMessage.trace`, capped near 8 KB: arguments 1200
   characters, results 600, thinking 2000, thinking cut first when over). Persisted rather than
   session-only so yesterday's turn can still be audited.
5. **Compaction is manual, with a nudge.** One model call turns the older messages into a briefing of
   at most 250 words; the last six messages stay word for word. The dropdown offers it past 20 author
   turns or 70% of the window and shows the saving and the cost first. Undo keeps the original thread
   until the next send (memory only). No automatic compaction: it would spend credit unprompted.

## 4. What compaction buys, honestly

Persisted history is user and assistant text only; tool results are not kept. The two big per-turn
costs, the ~16.5K-token primer (read from cache) and the deck source, are untouched. Compaction
shrinks only the thread's own text, so it pays once a thread is long. In the e2e run an 18-message
thread of 60-word messages saved about 1.7K tokens a turn for about $0.013 once. It also rewrites the
history, which writes the cache tail again once. The dropdown shows both figures before the button
is pressed, so the author decides on the numbers.

## 5. Verified

On the real Studio, built with `build:e2e`, model mocked (HARD RULE #24), Chromium at 1440, 820 and
390 px: `docs/e2e/chat-transparency.spec.ts` (5 specs) drives a two-round reply with streamed
thinking and a command, opens the dropdown and checks the figures, opens Show work and expands a
command, then compacts a 24-message thread and undoes it. Unit tests cover the ledger, trace
bounding, compaction maths, the summarizing call and the reasoning stream parser.

## 6. Independent review (maker-checker)

One checker read the diff and found races and small defects, all fixed before merge: a send, regenerate or applied edit could slip in
while a compaction ran and be overwritten, with Undo then deleting it (sending is now refused while compacting, a compaction that finds
the thread changed writes nothing, and Undo shows only while the thread is exactly what the compaction produced; the e2e spec fails
without the guard); a charge booked to whichever deck was open when it landed rather than the deck that made it (a turn, a Stop's
reconciliation and a compaction now capture the deck at their start); a briefing cut off at the token ceiling was accepted; the
message cap could drop the briefing; Show work called an estimate "billed" after compaction; malformed imported `usage`/`trace` could crash
the header; a stray `reasoning: ""` hid `reasoning_details`; and the end-of-turn catalog lookup could hold a reply for 4 s. A full storage
used to lose the whole thread: traces now stay on the newest 20 replies and the save retries with fewer traces before it drops anything else.
Left as known: the meter keeps the previous model's window until the next reply after a model switch.

## 7. Real stream captured (2026-10-20)

Two tiny calls to `anthropic/claude-sonnet-4.5` through OpenRouter on the owner's key, about $0.002 in all (a throwaway script in
`.scratch/`, HARD RULE #24). **What the chat sends today (no `reasoning` setting): no thinking comes back at all.** The deltas carry only
`content`; `reasoning_tokens` is 0. With a reasoning request on, each chunk carries BOTH `reasoning` (a string) and `reasoning_details`
(an array), the same text twice, so the parser's "take `reasoning`, else the details" never double counts, as designed. The usage block
carries `cached_tokens` and `reasoning_tokens` as read. So Show work's Thinking section appears only for models that think by default; on
Claude with default settings it shows the commands, cost and sizes but no thinking. Showing Claude's thinking would mean sending a
`reasoning` setting, which bills those tokens, and that was left as a decision for the owner, not done here.

## 8. Follow-up: one line in the transcript, the rest in a sheet (2026-10-20)

The owner drove #2813's preview on a phone and found the transcript too heavy. Under every reply sat an activity sentence that
wrapped to five lines, a separate "Show work" link and, while streaming, a one-line italic ticker of the model's thought that started
mid-word and was clipped on the right. Their ask: the Claude Code app's pattern, where a reply carries a short snippet and a tap opens
the details.

- **A finished reply keeps one line.** `ChatActivityRow` shows the activity sentence clipped to one line with an ellipsis; the whole row
  is the button that opens Show work. The separate link is gone. A reply saved before traces existed keeps the sentence as plain text.
- **Show work is a bottom sheet under 640 px**, the centered dialog above it. Same content, one `TraceBody`. Each round's "Thinking"
  summary now carries the first line of the thought, so the sheet reads as a list of snippets before anything is expanded.
- **The streaming thought wraps over two lines at its latest words.** The store keeps the last 200 characters, which can open mid-word;
  `thoughtTail` starts the snippet on a word boundary and marks the cut with an ellipsis.
- **Not changed:** the streaming row is not tappable. It lasts seconds and is replaced by the finished row, so a live sheet was not
  worth a second code path. Say so if you want it.

## 9. Follow-up: the header title beside a long model name (2026-10-25)

On a phone the Chat sheet's header carries the model chip and the session figure (§3). With a model named like "Anthropic:
Claude Sonnet 4.5" the owner's iPhone showed the title as "C". Reproduced in WebKit on the iPhone 15 Pro profile and in
Chromium at 390 px: the title's box was 11 px wide for 32 px of text.

**Cause.** `PanelHeader` gave the title `flex: 1 1 0%` and the actions slot `shrink-0`. A title with a zero basis has no width
of its own to defend, so the actions took their full width (the chip's `max-w-[10.5rem]`) and the title got what was left.

**Fix.** The Chat sheet passes `fluidActions`, and in that mode `PanelHeader` gives the title its own width as a basis
(`basis-auto`) and lets the actions take the squeeze first (`shrink-[1000]`). The chip already truncates (`min-w-0`), so it
shows "Anthropic Claude S…" and the title shows "Chat". Measured title `scrollWidth`/`clientWidth` 32/32 at 390 and 820 in
Chromium, WebKit and Firefox; `e2e/chat-header-title.spec.ts` holds it in `mobile` and `webkit-phone`.

**The other header it touches.** The Library is the one other `fluidActions` header. Docked at 1440 its "Library" title
measured **0 px wide** before (the search field took the row) in all three engines, and is whole after; at 820 and 390 its
header is unchanged. A header without `fluidActions` is unchanged. Real iOS is UNVERIFIED.

**The Library's header search, found by the owner on a tablet (2026-10-25).** In the same header the search field was 44 px
tall beside the 32 px Import button. It predates this change: on a touch screen the field's text is 16 px (the coarse-pointer
rule that stops iOS zooming) and the box grew around it. `PanelSearch` now has `size="sm"`, a fixed 32 px box for a header
row, which the Library and its loading shell use off the phone. Measured on an 810 px and a 1080 px iPad profile in WebKit:
44 → 32 px, equal to the button. `e2e/library-header-search.spec.ts` holds it at 1440 and 820 in Chromium, WebKit and
Firefox with touch on.

## 10. Follow-up: usage and cache truth (#3533 S01–S03, 2026-11-27)

Four figures the metrics dropdown and Show work read were wrong in a way that looked right.

| Figure | Before | Now |
|---|---|---|
| The cache share, when the provider sends none | `cached: 0`, shown as "0% read from cache" | `cached: null`, shown as "unknown" (`cachedOf` in `chat-agent.ts`). A thread saved before keeps its 0 |
| The cache share on Anthropic's own key | Always 0: that key reports `cache_read_input_tokens`, and the chat read only `prompt_tokens_details.cached_tokens` | `anthropicUsage` reports both, and `cachedOf` reads either |
| A cache write's price on a direct Anthropic key | 1.25× for every write | From Anthropic's own `cache_creation` split, 1.25× for 5-minute and 2× for 1-hour tokens; without the split, the rate the request's own marks ask for (`requestWriteRate`). The direct key writes 5-minute marks today, so its old flat 1.25× happened to be right |
| A round a Stop or an error ends | Charged only when prose or a generation id had arrived, and only on a Stop; never in the usage line or Show work | Settled once by `settleOpenRound`: a round that reported its usage is listed at that figure and charged nothing more; a round with no chunk yet (refused with a 429 or 402, or stopped before its first chunk, on its HTTP 200 or earlier) is charged nothing; a round that sent a chunk and never reported is charged as an estimate. A chunk means a token, a thought, a tool call or a generation id. The rule is measured, not assumed: see **Measured: when a stopped request is billed** below. The estimate shows in the ledger, the usage line (`costEstimated`, shown as `≈` on "Last reply") and Show work. The generation id, when one arrived, corrects the ledger to the exact cost on a Stop and on an error alike. A Stop now ends both transports' streams as an abort, checked on every line: before, the stream loops broke on the signal and then reported the partial usage and the half-streamed tool calls as a finished reply, so the round read as billed at a figure without its output and the tool ran after the Stop |
| The budget gate and the Stop estimate | Left out the tool definitions, about 3K tokens a round in Review | Count them (`schemaTokens`) |

**Show work's ledger.** Each call reads its cost, input with its cached share (or "cache unknown"), and output, and a stopped
call is marked "stopped, estimated" with `≈` figures. The total line keeps cumulative input across the calls apart from the
largest single call: the first is what was billed, the second is how full the window got.

**What stays an estimate.** OpenRouter's `usage.cost` is the provider's own figure and is used as is. A stopped round's estimate
prices its whole input at the full input rate, because the provider never said how much of it was cached. That is usually above
the billed figure (most of a round's input is a cheap cache read) but it is not a bound: it counts tokens as text ÷ 4, and
OpenRouter counts this prompt at about 1.45 times that. `e2e/chat-show-work-ledger.spec.ts` shows it: a stopped call estimated at
about 12K input tokens beside reported calls of 17K. On OpenRouter the generation id corrects it; on a direct key it stands.

**Measured: when a stopped request is billed.** `tools/stop-billing-probe.mjs` sent one request of about 6.6K input tokens to
Haiku 5.5 through OpenRouter five ways and read each against the key's own usage counter (run 46071814895 of
`agent-pack-eval-nightly.yml`'s `stop_probe` dispatch, 2026-11-27, $0.003 billed in all; the owner approved the spend):

| Stopped | Billed | Ledger |
|---|---|---|
| never (control) | $0.00117 | the reported cost |
| before the HTTP 200 | nothing | nothing |
| on the HTTP 200, before any chunk | nothing | nothing (an estimate of ≈ $0.00066 before this run) |
| on the first chunk | $0.00087 | ≈ $0.00066 (0.76×) |
| mid-stream, about 400 characters in | $0.00093 | ≈ $0.00071 (0.76×) |

So billing starts at the first chunk, not at the 200, and the chat now counts a round as accepted from its first chunk; it charged
the 200-only case before. The estimate runs under the bill by about a quarter here, which matches the text ÷ 4 count above; on
OpenRouter the generation id, which arrives with the first chunk, corrects it to the exact cost. One sample per case, on one model
and one route: a direct Anthropic, OpenAI or Gemini key was not measured, and the chat applies the same first-chunk rule to them.

**The maker-checker pass** caught two regressions in this change's first cut, both reproduced with a scripted backend: a round
that reported its usage and then errored was charged twice ($0.0309 for $0.003), and a refused request was charged a permanent
estimate about 28 times its real cost. Both are fixed and held by tests, with the Stop-before-send and Stop-between-chunks cases.

A second checker pass found that "accepted" was detected too late (a Stop after the HTTP 200 and before the first chunk was
$0; the probe above later showed that request is in fact not billed, so the first-chunk rule stands), that the direct Anthropic stream and the OpenRouter stream reported partial usage after a Stop, and that the error-path cost
correction had no test. All three are fixed and tested. The fourteen on-request keys are derived from the table's `export` and
`raw` groups (`isOnRequestKey`) rather than listed: a hand-kept list of directive names trips `test/unit/core/meta-keys.test.js`.

**Verified.** `architect-agent.chat.test.ts` drives the real wiring with a scripted backend (no network, no spend): an accepted,
unreported round is charged and listed as an estimate; a reported-then-failed round is charged once; a refused round and a
round stopped before it was sent are charged nothing; a missing cache report reads as unknown. `direct-providers.test.ts` streams a
1-hour write and a cache read through the Anthropic transport. Each test goes red with its source at `origin/main`.

**The prompt trim (#3533, owner's D4: "fix the wrong instructions and any stray gunk").** The chat's static prefix described
every front-matter key. Fourteen are export and preview switches or raw-CSS escape hatches the agent has no reason to set on an
edit (`ON_REQUEST_KEYS` in `architect-agent.ts`), and `lexicon:` and `acronyms:` were rows of their own for two older spellings
of `terms:`. The prompt now lists the fourteen by name on one line, names the two spellings on the `terms:` row, and cuts a long
row at a word instead of inside one. Measured with `gpt-tokenizer` (o200k): the static prefix goes from 7,901 to 7,489 tokens,
**−412 on every request** in every mode. Nothing is lost: `read_front_matter` serves the whole table, and
`e2e/chat-model-facing-strings.spec.ts` has the model ask for one of the fourteen and reads the full description in what the
built Studio sent back. That case found a defect on the way: `read_front_matter` lowercased the key before matching, so the
five camelCase keys (`backgroundColor` and the rest) had always read as "not a front-matter key". It now matches without case.
