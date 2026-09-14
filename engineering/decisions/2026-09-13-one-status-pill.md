---
status: shipped
summary: >
  Studio notification pills piled up. Not an architecture problem — Sonner has been the one
  toast primitive since 2026-07-14 — but two independent defaults: the Toaster never set
  `visibleToasts` (Sonner ships 3), and `StudioShell.notify` minted a fresh toast identity
  per message, so anything speaking twice inside the 2600ms dwell stacked. Library's bundle
  import made it worst, raising refusals in a loop — five pills in one tick, its own success
  line among them. Fixed by splitting toasts on whether they carry an affordance: disposable
  status text shares ONE id and rewrites one pill in place (`lib/notify.ts`), while a
  toast carrying Undo or Reload keeps its own slot, so unrelated text can never replace a
  button the reader was reaching for. `visibleToasts={2}` is then the real worst case, not a
  taste call (SUPERSEDED 2026-09-14 — the cap is 3, one slot per KIND; sticky and action can
  both be up, which this note got wrong. See 2026-09-14-notification-subsystem.md). The trap
  worth knowing: a fixed id is only HALF the mechanism — Sonner MERGES
  by id, so any field a later call omits inherits the previous message's value, which is why
  `notify` passes every field on every call including as `undefined`. Measured on the
  real Studio: 3 pills before, 1 after.
---

# One status pill, and why a fixed Sonner id is only half of it

**2026-09-13.** Status: settled. Supersedes nothing; sharpens
`2026-07-13-native-widget-shadcn-ownership.md` § "Batch outcome (e): toasts → Sonner".

## The report

> notification pills pile up in the studio. my expectation: we have one global
> notification pill everything is routed, or the previous pill disappears when a
> new notification arrives.

## What was actually wrong

Not the architecture. Sonner has been the single toast primitive since
2026-07-14, `ui/sonner.tsx` is the only file importing the `Toaster`, and every
floating pill in `docs/src` already went through it. The pile had two
independent causes, and they needed different fixes.

1. **`<Toaster>` never set `visibleToasts`**, so Sonner's default of 3 applied
   (`VISIBLE_TOASTS_AMOUNT`, `sonner@2.0.7 dist/index.mjs:411`). Three is a
   stack, and a stack of transient confirmations reads as a pile-up.
2. **`StudioShell.notify` minted a fresh toast identity per message** —
   `toast(msg, { duration: 2600 })`, prop-drilled to ~150 call sites across 15
   modules. Every status message was a new pill *by construction*.

A third thing produced the worst instance: `Library.tsx` raised its bundle-import
refusals in a **loop**, one toast each, so a bundle carrying four bad scenes
raised five pills in a single tick — and its own success line was one of the five
competing for three slots.

## What we did

**Two classes, split on whether the message carries an affordance.**

- **Status — disposable text.** One id at a time (`lib/notify.ts`).
  Sonner rewrites the existing toast rather than stacking a second one, so the
  previous message disappears the instant a new one arrives. This is the "one
  global pill" half of the report.
- **Actionable — Undo, Reload.** Keeps its own id and its own slot. Collapsing
  these into the shared pill would let an unrelated "Applied indaco." silently
  replace a button the reader was reaching for, and the Playground's stale-page
  notice is `duration: Infinity` *precisely* because it must outlive every status
  message around it. Status text is disposable; an affordance is not.
- **`visibleToasts={2}`** — **SUPERSEDED 2026-09-14: the cap is 3, one slot per kind.** The reasoning below was right that the number must be derived from the real worst case and wrong about what that worst case is; sticky and action CAN both be up. Kept because the correction is the point. It is therefore not a taste call but the real worst case:
  the status pill beside one actionable toast. Never a pile. **That claim was false
  when first written** and the cap is what made it matter: `showUndo` minted a new
  id per settings write and its reactive dismiss only fires when the source moves
  off `undo.next`, so two writes inside 5s left two Undo toasts — three with the
  pill, and the stock default of three had kept the oldest CLICKABLE where the cap
  makes it `pointer-events: none`. The older Undo was already a dead button (its
  `onClick` is guarded on `sourceRef.current === next`, which the second write
  falsifies), so `showUndo` now retires the previous toast before raising. The cap
  is true because the code makes it true, not because two felt like enough.

`Library`'s import now composes one message — a headline plus, when anything was
refused, the refusals named beneath it (`refusedDetail`, sibling of the existing
`rejectedMessage`). **Composing is not optional there, it is forced**: the funnel's
`catch` named the real reason and its `finally` then spoke unconditionally, so once
both landed on one pill the generic line overwrote the diagnostic in the same tick
and a corrupt file reported as an empty one. The reason is recorded and becomes the
headline, with whatever did land underneath it. Sharing a pill converts "two
messages" from redundancy into data loss, and every caller that speaks twice in a
tick inherits that.

Two things the pill's detail channel needed before it could carry a list. Sonner
renders `description` as a **bare text node** — no `<br>`, no block children — and
neither its stylesheet nor this repo's set a `white-space` rule on
`[data-description]`, so the newlines collapsed and each refusal's name glued onto
the previous one's reason. The primitive sets `whitespace-pre-line` on the element
rather than per call, so any future multi-line description is correct by default.
And the gate's messages lead with the finding and follow, after an em dash, with the
rationale — carried whole, two refusals filled ten lines on the real Studio, because
the rationale is the long half and repeats verbatim per item. The pill keeps the
finding.

## The part that is easy to get wrong

**A fixed id is only half the mechanism.** Sonner merges an incoming toast into
the live one of the same id — `{...toasts[i], ...toast}` in the Toaster's own
subscriber, `dist/index.mjs:972-983`. **Not `Observer.create`**, which is where
the obvious reading of the package lands: the default `toast()` export runs
`toastFunction` → `ToastState.addToast` (`:373`, `:135`), which appends and
publishes with no merge and no `alreadyExists` branch. Worth keeping straight,
because only `Observer.create` clears `dismissedToasts`, so anyone reasoning about
dismissal from the wrong citation gets the opposite answer.

So any field a later call OMITS keeps the value the previous message left behind.
Written inline,

```js
toast('Deck saved', { id: theSharedId })
```

after a message that carried a description renders "Deck saved" with the older
message's explanatory lines still attached — and, because the primitive switches
to a 16px card whenever `[data-description]` is present, in the wrong *shape*
too.

`notify` therefore passes **every field it governs on every call, including as
`undefined`**, which is what clears the previous one. That invariant is the whole
reason it is a function rather than three characters at the call site, and
`notify.test.ts` pins it. It governs `description` and `action`; the rest of
Sonner's option surface is never set on this pill by anyone, because the id is not
exported and `notify` is the only writer. An earlier draft of this note claimed
the stronger "every field" and paired it with a test asserting `action` was never
PASSED — which pins exactly the thing that would make a stray `action`
un-clearable. The key is now present and `undefined`, which is what clearing means.

## The bill for a fixed id, which nothing else in the design pays

Sharing one id introduces a bug that per-message ids cannot have, and it was
caught by an independent check of this change rather than by any gate.

**Auto-close does not remove a toast.** It starts a 200ms exit animation and
schedules `removeToast(toast)` for the end of it (`TIME_BEFORE_UNMOUNT`,
`dist/index.mjs:425,574`), and that pending removal matches **by id value** —
`toasts.filter(({ id }) => id !== toastToRemove.id)`. So a message raised on the
same id inside that window renders, and is then deleted 200ms later by the
*previous* message's timer. It flashes and vanishes. The window opens 2600ms
after the last message and stays open for 200ms — an ordinary pace for someone
working, not a corner case.

Before status messages shared an id this was unreachable: every toast carried its
own auto-increment id, so no pending removal could ever name a live one.

**The fix is to reuse the id only while the pill is actually live**, which is the
only case that needs it — that is what rewrites in place with no stacking. Once
the pill has closed or is closing, the next message gets a fresh id: nothing
pending can name it, and there is nothing to stack with, because the old pill is
already on its way out. Liveness comes from Sonner's own `onAutoClose` /
`onDismiss` rather than a clock of ours, so a hover that pauses the dwell keeps
the pill live and keeps the rewrite in place.

**Liveness is tokened, not compared by id.** A rewrite in place reuses the id by
design, so an id is exactly what cannot tell a superseded raise from the current
one. A stale callback marking the live pill dead would rotate the next message
onto a fresh id and put two pills on screen where one was asked for.

`notify.dom.test.tsx` guards this against the **real** Sonner — real package,
real `<Toaster>`, real time — because the race lives in Sonner's own store and
timers and is invisible to the mocked sibling test that owns the merge contract.
Proven to fail: pinned back to a fixed id, the second message asserts as `''`.

Two related behaviors, both read from the same source and worth knowing:

- **The dwell re-arms on update.** The per-toast timer effect depends on the
  toast object's identity, and `remainingTime` is only decremented by
  `pauseTimer` (hover / expand / hidden document). A rewritten message therefore
  gets its full duration, not the remainder of the one it replaced
  (`dist/index.mjs:581-610`).
- **An update does not re-animate.** Two identical messages in a row look inert.
  Accepted deliberately: the pill is already on screen saying the right thing,
  and a pulse would add motion to a calm surface for a case the Studio's call
  sites barely produce.

## Evidence

Measured on the real Studio (`npm run build:e2e` + `astro preview`, Chromium
desktop), not a harness — three confirmations through the real deck-switcher menu
inside one dwell:

| Build | Pills on screen |
|---|---|
| without the shared id | **3** |
| with it | **1** |

`e2e/status-pill.spec.ts` carries that arm. It counts in one shot after the pill
renders rather than through a retrying `toHaveCount`, because a retrying matcher
polls while the stack drains and reports the count it settles on — this spec
reported `Received: 0` against the broken build, where the number that matters
is 3.

Three more arms drive the REAL import funnel, because each covers something no
other tier can see:

| What | Why only the real surface |
|---|---|
| a refused bundle names each refusal on its own line | `white-space` has to WIN a cascade; jsdom loads no Tailwind sheet, so `getComputedStyle` returns `''` for every utility |
| the same toast's computed `white-space` is `pre-line` | same — and Sonner's own `[data-sonner-toast]` rules are unlayered (HARD RULE #26), so a matching class can silently lose |
| a corrupt bundle reports WHY, not that the file was empty | the loss was one message overwriting another in the same tick |

Both feed a crafted `lattice-asset/1` zip through the Library's real file input.

The pill was looked at in both color modes, in both shapes: the one-line capsule
(`.scratch/pill-{light,dark}.png`) and the description card
(`.scratch/card-{light,dark}.png`). The card is the one that mattered — an earlier
draft of this note claimed "the refusals named beneath it" having only ever looked
at the capsule, which is exactly the surface where the collapsed newlines and the
ten-line wall would have been visible.

## What is NOT changed

**Superseded on 2026-09-14 by `2026-09-14-notification-subsystem.md`**, which
generalized this one pill into three kinds and retired the prop chain below. The
mechanism notes above still hold — they are what that kernel is built on.

- ~~The `notify` prop chain stays.~~ **Retired.** It was the injection point every Studio test and
  the `use-studio-demo` tour rely on; collapsing 15 modules onto a direct
  `toast()` import would trade a testable seam for less plumbing, which is a
  separate call from this one.
- The toast surface is still per-app (`StudioShell`, `PlaygroundApp`). Landing,
  Starlight docs and the component-reference routes still have no `<Toaster>`, so
  a `toast()` from an island there is a no-op. Making it global is a route-budget
  and island-chunking question (`docs/astro.config.mjs`'s `chunkGraphPlugin`
  emits the artifact that would settle it) and is not in this change.
