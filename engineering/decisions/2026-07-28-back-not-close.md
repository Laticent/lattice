---
status: shipped
summary: >
  On a phone every Studio drawer now dismisses with a LEADING back chevron naming where
  it goes, not a trailing X — and the iOS edge-swipe back gesture is bound to the same
  action, which is the fix for #1226 (the gesture used to navigate straight out of the
  Studio). The label is a property of the launch path, not the panel: a drawer reached
  from the menu returns there, the same drawer reached from the Eight-Cell Bar
  returns to the deck. Freeing the trailing slot gives the panel's own actions the
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
after   ‹ Deck │ [chip] Title ………………………………… [actions]
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
| the `···` menu | the menu's index | `‹ Menu` |
| a door inside the menu | the menu's index | `‹ Menu` |
| the Eight-Cell Bar / header / ⌘K | the deck | `‹ Deck` |
| the menu's index | the deck | `‹ Deck` |
| anywhere, while in Fabricate | the Fabricate view | `‹ Fabricate` |

This is not new state. `StudioShell` already tracks exactly this distinction as
`drawerPendingReturn` — the flag deciding whether the drawer re-opens when a panel closes —
so the chevron and the actual destination **cannot** disagree. It is published once for the
whole subtree via `PanelBackLabel` rather than passed as a prop to eleven call sites that
could each get it wrong.

### 3. Both names were scored, not picked

The first cut of this change renamed the index to **More** and left the host as
**Studio**. Both were wrong, and a scored comparison is what showed it. Criteria, weighted:
does the word name a **place** (×2) — not a relationship, a widget class, or the whole app;
is it **truthful** (×2); instantly **understood** (×1.5); **distinct** in-app (×1.5); and
**cheap** (×1). Two candidates were eliminated before scoring — *Actions* collides with the
command palette's own group heading, and the deck's own title truncates at 393px.

| index + host | P | T | U | D | C | /40 |
|---|---|---|---|---|---|---|
| **Menu + Deck** | 4.5 | 5 | 5 | 5 | 3 | **37.0** |
| More + Deck | 3 | 4.5 | 5 | 4.5 | 4 | 33.25 |
| Tools + Deck | 4.5 | 2.5 | 4 | 5 | 3 | 30.5 |
| Menu + Editor | 4 | 3 | 4.5 | 4.5 | 3 | 30.5 |
| Menu + Studio | 3 | 3 | 5 | 4 | 4 | 29.5 |
| Studio + Deck | 3.5 | 3.5 | 4 | 2 | 5 | 28.0 |
| All + Deck | 2.5 | 2.5 | 3.5 | 4 | 3 | 24.25 |
| More + Studio *(first cut)* | 1 | 2 | 5 | 3 | 5 | 23.0 |

Why the losing marks:

- **"More"** names a RELATIONSHIP to the Eight-Cell Bar — "the rest of them" — not a
  destination. It was the one chevron in the app answering *where does this go?* with
  *elsewhere*.
- **"Studio"** as the index names the WHOLE APP, so the panel and the thing behind it were
  both called the Studio. That is the collision that surfaced the instant this grew a
  chevron: a panel titled "Studio" above a control reading `‹ Studio`.
- **"Studio"** as the HOST is worse than it looks — it says you are *leaving* the Studio,
  and you never do. Every one of these panels is inside it.
- **"Tools"** (2.5 truth) — Send feedback, Show me and Version history are not tools.
- **"All"** (2.5 truth) — it is not all; six verbs live on the bar and never appear here.
- **"Editor"** (3 truth) — wrong whenever you are on the Preview pane, and this app has a
  deliberate Read posture where that is the default.

**The finding that decided it:** fixing the HOST name buys more than fixing the index name.
From the first cut, changing only More→Menu gains **+6.5**; changing only Studio→Deck gains
**+10.25**. The weaker label was the one added by this change, not the one the product owner
flagged.

The objection to **"Menu"** — that it names a widget class rather than a place — is true on
a desktop and false on a phone, where a menu IS a screen you travel to and back from, and
where it is the word users already have for this object. The app's three real dropdowns
(workspace launcher, deck switcher, and the tablet twin of this very panel) are never
*labeled* "menu" on screen, so nothing collides. The `···` glyph is kept: iOS opens menus
from `···` routinely, and it does not pull toward "More" hard enough to justify churning the
trigger's accessible name across ~15 assertions.

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

**WebKit 26 at `devices['iPhone 15 Pro']`, against the built site — 29/29 ad hoc, and 8/8
as the committed `@webkit` spec.** All twelve
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

**Two vacuous assertions were caught, and both are worth recording** — a green count with a
hollow member is the exact failure HARD RULE #23 exists to catch, and both were in the
*tests*, not the code.

1. In the first acceptance run, "Insert a component" reported its `before` title as the
   drawer's, because that panel renders live previews and the drawer was still mounted at the
   650ms settle, so the assertion read the surface that was leaving. Fixed by reading
   `.last()` and asserting the panel actually opened.
2. The unit suite asserted `expect(after).not.toHaveBeenCalled()` on a `vi.fn()` **never
   registered with anything** — it could not have been called under any implementation. Found
   by the independent checker, in the file whose own comment congratulates itself for catching
   the first one. Fixed by making the handler live.

The checker also established that **the verification had no committed artifact**: the WebKit
run lived in a scratch file, `playwright.config.ts` declared only Chromium projects, and no
e2e spec touched `goBack`. For a mechanism already reverted once for a device-only failure,
that is the guard missing exactly where it is most needed. There is now a `webkit-phone`
project at `devices['iPhone 15 Pro']` and `e2e/back-gesture.spec.ts` (8 cases, `@webkit`), so
the claim is re-runnable from the repo rather than asserted.

---

## What this does not fix

- The **close destination** is still two outcomes decided by which launcher you used. That
  is now *legible* (the chevron names it) rather than fixed.
- Off-Studio drawers are a **mixed** stack, and the first draft of this doc got it wrong.
  The Playground's two sheets, the site nav, the components-reference nav and `MetricDetail`
  are raw `Sheet`s, so they are untouched — but **`FeedbackSheet` is a `PanelSheet`**, mounted
  sitewide by `NavActions`, so off the Studio it *does* register and *does* render the
  chevron. That is an improvement in isolation (back closes the sheet instead of leaving the
  page) but it is inconsistent with the site nav *underneath* it, which does not register: back
  closes feedback, and the next back leaves the site with the nav still open. Making the
  off-Studio surfaces agree is the follow-up. Found by the independent checker, which also
  caught that off-Studio the chevron announced **"Back to Back"** — the generic fallback label
  run through a `Back to ${label}` template. Fixed: when the label IS the direction, the
  direction is the whole accessible name.

- **A stale entry survives a reload.** If the page reloads with a panel open (pull-to-refresh,
  a tab discard, or the Studio's own `location.reload()` after Privacy & Data clears a
  workspace — which fires with `WorkspaceSheet` still up), the entry we pushed outlives the
  document. The module now **adopts** it, so the counts do not drift; it does not consume it,
  so one back press with nothing open is spent on a panel that is gone. Consuming eagerly is
  worse and was measured, not assumed: in WebKit at iPhone 15 Pro the traversal to the previous
  entry is a FULL document load, so it would reload the whole Studio a second time on every
  such refresh to save a gesture the user may never make. The real fix is restoring the *panel*
  rather than the history around it — panel deep-linking, not a back guard.

- **A latent re-entry of the original race**, filed rather than fixed because no path reaches
  it. `reconcile`'s `history.back()` is asynchronous; if a registered overlay opened one
  macrotask after the last one closed, the pending traversal would resolve against the
  pre-push position and leave the controller believing it owns an entry it does not — verbatim
  the failure this design calls unrepresentable, triggered across two commits instead of
  within one. The checker could not reach it through the UI (the drawer→child→reopen path
  coalesces into a single reconcile, and there are no deferred panel opens), so today the
  safety margin is React's scheduling, not anything this module enforces. There is no
  "absorb the in-flight traversal" guard; adding one is the obvious hardening if a deferred
  open ever appears.
