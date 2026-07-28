---
status: shipped
summary: >
  On a phone every Studio drawer now dismisses with a LEADING back chevron naming where
  it goes, not a trailing X — and the iOS edge-swipe back gesture is bound to the same
  action, which is the fix for #1226 (the gesture used to navigate straight out of the
  Studio). The label is a property of the launch path, not the panel: a drawer reached
  from the overflow returns there, the same drawer reached from the Eight-Cell Bar
  returns to the editor. Freeing the trailing slot gives the panel's own actions the
  corner to themselves, at the app's 44px touch floor. The mechanism owns ONE history
  entry for the whole overlay stack and reconciles it after the commit — the reverted
  first attempt owned one per level from a depth-keyed effect, whose per-level teardown
  raced a sibling's push. Pointer transports keep the X and gain no history entries.
---

# Back, not close — one dismissal idiom per transport, and a gesture that agrees with it

**Date:** 2026-07-28
**Status:** shipped
**Closes:** #1226
**Follows:** `2026-07-28-one-panel-height.md` (one height, one header, one subhead, one tablist)

---

## The two problems, and why they are one problem

**#1226, reported from a real iPhone 15 Pro and reproduced in WebKit.** With any drawer
open, the edge-swipe-from-the-left back gesture navigated page history — i.e. straight out
of the Studio.

```
── WebKit 26.0, devices['iPhone 15 Pro'] (393×659) ──
in the Show me door : drawer @ Show me
after back gesture  : (no drawer) | url: about:blank
```

**The product owner's ask, separately:** put a back button on every drawer and delete the
close button, so icon actions can sit on the right without sharing the corner with a close.

These read as two asks — one behavioral, one layout — and they are the same ask. The drawer
already had a `‹ Studio` chevron on its two doors, and its eleven destinations had an `X`.
So the app shipped **both idioms at once** while its own primitive's docblock claimed "a
single X, same corner, drawer and dock alike — the chevron is retired." The chevron was
never retired. And an `X` is the affordance that *disagrees* with the gesture a phone user
actually reaches for: swipe back, and you got something the X would never have done.

Fixing the gesture without fixing the affordance leaves a control that lies about the
navigation model. Fixing the affordance without the gesture leaves the bug.

---

## What changed

### 1. The affordance, phone only

```
before  [chip] Title ………………………………… [actions] [X]
after   ‹ Studio │ [chip] Title ……………………………… [actions]
```

Tablet and desktop keep the trailing `X`. That is not an oversight — a pointer surface has
no back gesture, so a back chevron there would be an affordance with nothing to agree with,
and #1226's acceptance check #5 requires desktop history to stay untouched. **The transports
already differ deliberately** (a phone gets a bottom sheet, a pointer surface gets a side
sheet); this is that same split, one layer up.

### 2. The label names the destination, and the destination depends on how you got there

The drawer's own rule, which was right and stopped at the drawer's edge: *a chevron plus
the literal name of where it goes, not an icon you have to interpret.*

| you opened it from | back goes to | reads |
|---|---|---|
| the `···` overflow | the overflow's index | `‹ More` |
| the Eight-Cell Bar / header / ⌘K | the editor | `‹ Studio` |
| a door inside the overflow | the overflow's index | `‹ More` |
| the overflow's index | the editor | `‹ Studio` |

This is not new state. `StudioShell` already tracks exactly this distinction as
`drawerPendingReturn` — the flag deciding whether the drawer re-opens when a panel closes —
so the chevron and the actual destination **cannot** disagree. It is published once for the
whole subtree via `PanelBackLabel` rather than passed as a prop to eleven call sites that
could each get it wrong.

### 3. The overflow is retitled "More"

Forced by the above, and an improvement on its own. The index was titled **Studio** — the
*app's* name, on the overflow menu. Survivable while its only affordance was an `X`; not
survivable once it grew a chevron reading `‹ Studio`, which would have said *the place you
are and the place you would return to are the same place*. Its trigger has always been
"More controls". The panel now answers to it, and that is also what makes its destinations'
`‹ More` true.

### 4. Actions get the touch floor

`size="icon-sm"` is 30px. That was survivable while an action sat **next to** a 44px close:
the close set the row's touch expectation and the action borrowed it. Alone in the corner it
is the app's own 44px floor breached on the control the panel most wants tapped — Reader
views' add, the Library's import. `PanelHeader` now lifts them to 44 on a phone. The
Eight-Cell Bar, the StudioDrawer and the back control all hold 44 (#1211); this is that
floor reaching the last place that had escaped it.

---

## The mechanism, and why it is shaped this way

`docs/src/lib/overlay-back.ts`. **One history entry for the whole overlay stack, owned in
one place.**

### What was tried and reverted

`useSheetBackGuard(depth, onBack)` owned **one history entry per open level**, from one
`useEffect` keyed on `depth`. It failed in WebKit:

```
in Themes door : drawer @ Studio   ← the door never opened
back #1        : (no drawer)
back #2        : about:blank        ← still left the app
```

Entering a door tore down the depth-1 effect, whose cleanup called `history.back()` to
rewind its entry — **asynchronously** — while the depth-2 effect was already calling
`pushState`. The two interleaved and the history stack ended up corrupted, taking the
drawer's own level state with it.

### The two changes that make that race unrepresentable

**1. One sentinel, not one per level.** However deep the stack goes, we own exactly one
history entry. Depth lives in a plain array, which costs nothing and cannot interleave.
There is no per-level entry to rewind, so there is no cleanup-driven `history.back()` to
race a sibling's `pushState`.

**2. Reconcile on a microtask, never inside a cleanup.** This is the load-bearing one, and
it is specific to how this app hands off between panels. `closeDrawerAndOpen` runs
`setMoreOpen(false)` and the child's open **in one commit**. A synchronous reconciler would
see a momentarily-empty stack mid-commit, fire `history.back()` for it, and land that queued
pop on the entry the child had *just* pushed — leaving the controller believing it owns an
entry it does not, i.e. the next back gesture leaves the app. **The identical failure,
relocated.** Batched, the close and the open net out to no history traffic at all.

A third, smaller one: the registration effect depends on `active` **only**, with `onBack`
riding a ref. A fresh closure every render is the norm at these call sites; if that re-ran
the effect, every render would pop and re-push.

### Registration lives in the primitive

`PanelSheet` registers itself when it is a bottom sheet, so all eleven drawers are covered
at once — including the four that never adopted `PanelBody` and would have been missed by a
consumer-level fix. That is the same trap the safe-area reservation fell into one PR ago.
`StudioDrawer` registers twice (sheet, then door); hook order is stack order, so nothing
tracks depth.

### Scope

Studio drawers only, phone only. Present, the guided tour, `MetricDetail` and the Playground
sheets are deliberately **not** wired — decided with the product owner rather than left
ambiguous, since #1226 flagged it as "worth deciding once".

---

## Verification

Per HARD RULE #23, the surface is named and the artifact comes from it.

**WebKit 26 at `devices['iPhone 15 Pro']`, against the built site — 25/25.** All twelve
drawers open → back → closed and still on `/studio/`; the door pops to the index before the
index closes the drawer; a subsequent back genuinely leaves; chevron-close and scrim-close
each leave no residue; the drawer's return-to-drawer behavior survives dismissal by back;
desktop gains no history entry and keeps its `X`.

`page.goBack()` drives the **same history navigation** the iOS edge-swipe maps onto — that
navigation is the mechanism under test. The physical gesture is an OS input this sandbox
cannot synthesize. **UNVERIFIED on a physical device:** the swipe itself, and whether iOS's
own interactive-swipe animation interacts badly with a `pushState` that happens mid-gesture.

**Unit — `docs/src/lib/overlay-back.test.tsx`, 6 cases, driven through React** because the
commit batching *is* the race. The assertions are about **history traffic** (how many
entries we push and pop), not merely whether `onBack` fired — the traffic is what got
corrupted last time and is invisible to a callback-only test. The same-commit case was
confirmed to **fail** against a synchronous reconciler before being kept.

One check in the first acceptance run passed **vacuously**: "Insert a component" reported
its `before` title as `More`, because that panel renders live previews and the drawer was
still mounted at the 650ms settle, so the assertion read the outgoing drawer. Reading
`.last()` rather than `.first()` and asserting the panel actually opened turned it into a
real check. Worth recording — a green count with a vacuous member is the exact failure
HARD RULE #23 exists to catch, and it was in the *test*, not the code.

---

## What this does not fix

- The **close destination** is still two outcomes decided by which launcher you used. That
  is now *legible* (the chevron names it) rather than fixed.
- Off-Studio drawers — Playground ×2, the site nav, the components-reference nav,
  `MetricDetail` — keep an `X` on a phone and do not trap back. In scope to revisit; out of
  scope here by decision.
