---
status: shipped
summary: >
  Studio notification pills piled up. Not an architecture problem — Sonner has been the one
  toast primitive since 2026-07-14 — but two independent defaults: the Toaster never set
  `visibleToasts` (Sonner ships 3), and `StudioShell.notify` minted a fresh toast identity
  per message, so anything speaking twice inside the 2600ms dwell stacked. Library's bundle
  import made it worst, raising refusals in a loop — five pills in one tick, its own success
  line among them. Fixed by splitting toasts on whether they carry an affordance: disposable
  status text shares ONE id and rewrites one pill in place (`lib/status-pill.ts`), while a
  toast carrying Undo or Reload keeps its own slot, so unrelated text can never replace a
  button the reader was reaching for. `visibleToasts={2}` is then the real worst case, not a
  taste call. The trap worth knowing: a fixed id is only HALF the mechanism — Sonner MERGES
  by id, so any field a later call omits inherits the previous message's value, which is why
  `showStatus` passes every field on every call including as `undefined`. Measured on the
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

- **Status — disposable text.** One id (`lib/status-pill.ts`, `STATUS_TOAST_ID`).
  Sonner rewrites the existing toast rather than stacking a second one, so the
  previous message disappears the instant a new one arrives. This is the "one
  global pill" half of the report.
- **Actionable — Undo, Reload.** Keeps its own id and its own slot. Collapsing
  these into the shared pill would let an unrelated "Applied indaco." silently
  replace a button the reader was reaching for, and the Playground's stale-page
  notice is `duration: Infinity` *precisely* because it must outlive every status
  message around it. Status text is disposable; an affordance is not.
- **`visibleToasts={2}`** is therefore not a taste call but the real worst case:
  the status pill beside one actionable toast. Never a pile.

`Library`'s import now composes one message — a headline plus, when anything was
refused, the refusals named beneath it (`refusedDetail`, sibling of the existing
`rejectedMessage`).

## The part that is easy to get wrong

**A fixed id is only half the mechanism.** `Observer.create` MERGES into an
existing entry rather than replacing it — `{...toast, ...data}`,
`dist/index.mjs:152-168`. So any field a later call OMITS keeps the value the
previous message left behind. Written inline,

```js
toast('Deck saved', { id: STATUS_TOAST_ID })
```

after a message that carried a description renders "Deck saved" with the older
message's explanatory lines still attached — and, because the primitive switches
to a 16px card whenever `[data-description]` is present, in the wrong *shape*
too.

`showStatus` therefore passes **every field on every call, including as
`undefined`**, which is what clears the previous one. That invariant is the whole
reason it is a function rather than three characters at the call site, and
`status-pill.test.ts` pins it — including that it never carries an `action`.

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

The pill was also looked at in both color modes (`.scratch/pill-{light,dark}.png`
at the time of writing): a single capsule, correct in each.

## What is NOT changed

- The `notify` prop chain stays. It is the injection point every Studio test and
  the `use-studio-demo` tour rely on; collapsing 15 modules onto a direct
  `toast()` import would trade a testable seam for less plumbing, which is a
  separate call from this one.
- The toast surface is still per-app (`StudioShell`, `PlaygroundApp`). Landing,
  Starlight docs and the component-reference routes still have no `<Toaster>`, so
  a `toast()` from an island there is a no-op. Making it global is a route-budget
  and island-chunking question (`docs/astro.config.mjs`'s `chunkGraphPlugin`
  emits the artifact that would settle it) and is not in this change.
