---
status: shipped
summary: >
  The Architect's reply rendered TWICE, permanently, whenever the last token's paint frame
  was still queued as `chatComplete` resolved (#1787): the turn's `finally` cleared the
  streaming bubble but never canceled the frame, so the frame fired afterwards and set the
  buffer back with nothing left to clear it. Observed on a live Playwright run; reproduced
  deterministically in jsdom by stubbing `requestAnimationFrame` to a queue the test drains
  itself. Fixed by canceling the frame AND zeroing the guard id — the zero is load-bearing,
  since `onToken` reads a non-zero `rafRef` as "already scheduled" and a cancel-only fix
  would freeze the next turn's stream (pinned by its own test). Fixing it surfaced a second,
  worse defect in the same block: `busy` and `streaming` describe the PANEL but their
  teardown was gated on the turn's deck still being on screen, so switching decks mid-reply
  stranded `busy` at true forever — Send stayed replaced by Stop and that deck could never
  be sent from again. On the path of this change, so fixed with it (HARD RULE #18). The first
  fix for the stale bubble — clearing `streaming` on the deck change — was itself a regression
  a checker caught before it shipped (switching back showed a Stop button over an empty
  transcript); the buffer now carries its deck and the render filters, so nothing is cleared.
---

# A queued paint frame outlived the turn that scheduled it

**Closes #1787.**

## The symptom

Two identical `Architect` bubbles, side by side, holding the same reply — and they stayed
that way until the next send. Caught on a real run against the live model (`desktop`
Playwright project, production-built site) while #1781 was being fixed:

```yaml
- generic [ref=e127]:
    - text: Architect
    - paragraph: "I can help you change the heading on slide 2. However, I notice slide 2 is a `closing` layout…"
- generic [ref=e145]:
    - text: Architect
    - paragraph: "I can help you change the heading on slide 2. However, I notice slide 2 is a `closing` layout…"
```

## The root cause

A chat turn paints tokens through a rAF-coalesced `setStreaming`, and the turn's `finally`
clears that bubble. The `finally` never canceled the pending frame. With the last token's
frame still queued when `chatComplete` resolves, the ordering is:

1. `commit(...)` appends the assistant message — it renders from `messages.map`;
2. `finally` runs `setStreaming(null)` — the streaming block unmounts;
3. **the queued frame fires** and calls `setStreaming(bufferRef.current)` — the streaming
   block mounts again, holding the *whole* reply.

`streaming` is now non-null with nothing left to clear it: the next `setStreaming(null)` is
the next turn's `finally`, a send away.

**This is a race in production and a deterministic state in a test.** The reproduction does
not wait for the window — it *holds* it: `requestAnimationFrame` is stubbed to a queue only
the test drains, so "a frame was pending at completion" is a condition entered on purpose.

## The fix, and why the second line matters as much as the first

```ts
function cancelPaint(ref: React.MutableRefObject<number>) {
	if (ref.current) cancelAnimationFrame(ref.current);
	ref.current = 0;
}
```

Canceling alone is a half-fix that trades one defect for a quieter one. `onToken` schedules
a frame only `if (!rafRef.current)`, so a canceled-but-non-zero id reads as "a frame is
already scheduled" and the NEXT turn never queues one: the reply streams to a bubble that
stays empty until the whole turn commits. A test pins exactly that — it is the one case of
the five that passes against the original code and fails against the half-fix.

`cancelPaint` is called unconditionally, before the mount/deck guard. The frame belongs to
this turn whatever is on screen by the time it ends.

### The unmount path: checked, and NOT the same leak

#1787 suggests checking the unmount cleanup for the same defect. It cancels without zeroing,
and that is genuinely harmless: a real unmount discards the instance and its refs with it.
The only path that re-runs a mount effect on the SAME instance is StrictMode's double
invoke, which happens before any turn has scheduled a frame. It now goes through `cancelPaint`
for uniformity — one invariant ("`rafRef` is 0 whenever no frame is pending") rather than two
call sites that differ for no reason — but no test covers it, because there is no reachable
state to cover.

## The second defect, found in the same block

`busy` and `streaming` are **panel** state — the panel has exactly one turn in flight. Their
teardown was gated on `deckIdRef.current === sendDeckId`:

```ts
if (mountedRef.current && deckIdRef.current === sendDeckId) { setBusy(false); setStreaming(null); … }
```

Switch decks while a reply is streaming and that condition is false forever after, so
**`busy` never cleared**: the composer kept Stop in place of Send, and the author could not
send from that deck again without reloading. The stale bubble had a matching half — the
other deck's partial reply sat in this deck's transcript.

Only the COMMIT is deck-scoped, and it already carries its own guard inside `commit`. So the
teardown drops the deck condition.

### The first fix for the stale bubble was itself a regression

**Clearing `streaming` in the `[deckId]` effect was the obvious move, and it was wrong.** An
independent checker caught it before it shipped, along with the sentence in this note that had
made it look already-handled:

> Dropping it here is enough: the rAF paint is already deck-guarded, so it only comes back if
> the author switches BACK while the turn is still streaming, which is exactly when it should.

**It does not come back.** The deck guard decides whether a *newly arriving token's* frame
paints; the switch itself repaints nothing. So leaving deck-1 mid-reply and returning showed
that deck's own turn as a Stop button over an **empty transcript** — not even the thinking
dots, since `streaming` was `null` rather than `''` — until the next token arrived. On a slow
model, or in the tail after the last content chunk, that is the rest of the turn. The surface
worked before the change and not after: a window this change created, and HARD RULE #18 says
that one does not ship.

**What ships instead: the buffer carries the deck it belongs to**, and the RENDER filters:

```ts
const [streaming, setStreaming] = React.useState<{ deck: string; text: string } | null>(null);
const live = streaming && streaming.deck === deckId ? streaming.text : null;
```

Nothing is cleared on the switch, so returning shows the reply exactly where it is — still
arriving, because the paint's own deck guard is now redundant and gone, and the buffer keeps
updating while the author is elsewhere. Two states that could disagree for a render became one
object that cannot.

The same checker found the second half: `empty` (the *nothing has happened here* invitation)
is `messages.length === 0 && !streaming && !notice`, so on a deck with no history it started
rendering **beside a Stop button** — the placeholder and the composer saying opposite things.
`empty` now also requires `!busy`. A turn in flight elsewhere leaves that transcript blank,
which is honest, rather than reassuring and wrong.

**`busy` deliberately stays true across the switch.** It is the concurrency guard: `abortRef`,
`bufferRef` and `rafRef` are single-slot, so a second concurrent `run` would clobber the first.
Showing Stop on a deck with no visible stream is a wart that survives this change; removing it
means allowing concurrent turns, which is a different piece of work.

## Found in the same block, NOT fixed here

The `offline` / `blocked` / `catch` branches (`ArchitectChat.tsx:152-161`) call `setNotice(...)`
— and `onConnect()` — with **no** `mountedRef` or `deckIdRef` guard, unlike `commit`. A turn
that ends offline on deck-1 while the author is on deck-2 paints deck-1's notice into deck-2's
transcript and pops the Workspace sheet. Verified identical on `583103c` and here, so it is
**pre-existing and not caused by this diff** — HARD RULE #18's log-don't-widen branch. Filed as
**#1813**.

## Verified

`docs/src/components/studio/studio.chat-stream-commit.test.tsx`, seven tests, against four
versions of the source:

| version | result |
|---|---|
| `583103c` (before) | **5 of 7 fail** |
| cancel without zeroing the guard | **1 of 7 fails** — the next-turn paint test, and only that one |
| the first draft, clearing `streaming` on deck change | **2 of 7 fail** — the switch-back and empty-state tests, and only those |
| this change | 7 pass |

Full `npx vitest run` in `docs/` green.

**Not verified on the real surface.** The duplicate bubble was observed in a live Playwright
run, but the fix is pinned in jsdom only: an e2e that lands a frame in that window on demand
does not exist, and the live-model scenario that caught it spends the real key (HARD RULE
#24 — nightly/dispatch only). What is proven is the mechanism, its reproduction, and that
both defects' tests fail without the change.
