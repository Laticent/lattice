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
