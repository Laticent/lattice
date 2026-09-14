---
status: shipped
summary: >
  "We should have a notification subsystem and not handle notifications bespokely across the
  Studio." A census of every surface that tells a reader something found 79 of them, and the
  useful finding was that "toast vs not-toast" is the wrong axis: three orthogonal properties
  separate them — event or CONDITION (a condition has no dwell), broadcast or ADDRESSED (keyed
  to an entity and replayed on return), and whether the route mounts a `<Toaster>` at all (only
  two files do). Sorted on those, most of the 79 are irreducible and absorbing them would break
  working behavior. So the subsystem is deliberately narrower than "handles it all": `lib/notify.ts`
  owns the EVENT/broadcast class and gives each message a KIND that carries its policy (status ·
  action · sticky, one slot each), which is what finally makes the Toaster's cap structural; and
  `lib/announce.tsx` gives the condition strips the a11y half they were missing without moving
  where they render. The `notify` prop chain — 16 modules, 173 call sites — is retired for a
  module singleton, the repo's established cross-island pattern. Every call site's text is
  unchanged.
---

# A notification subsystem, and the four fifths of the problem it must not touch

**2026-09-14.** Status: shipped. Builds on `2026-09-13-one-status-pill.md`, which it
supersedes on the prop-chain question and inherits every mechanism note from.

## The ask

> we should probably have a notification subsystem that handles it all and we don't
> have notifications being handled in a bespoke way across the studio

Correct diagnosis. The pill work a day earlier fixed a symptom — three pills where
one belonged — and left the cause in place.

## The cause, named

**Every caller handed the system a bare string.** `notify(msg: string)`. Nothing in
that signature can say whether the message is disposable, carries an affordance
someone is reaching for, must not be missed, or belongs to a particular deck. So
policy had nowhere central to live and got re-decided, or not decided, at each call
site. Every symptom fell out of that one gap:

- The Library raised **one pill per refused item** in a loop — no rate policy existed.
- A status message could **evict an Undo** — no priority existed.
- `notify` was **prop-drilled through 16 modules** — a transport problem wearing an
  API's clothes; it was injected so tests could stub it.
- ArchitectChat **built its own store** — it needed per-deck keying and replay, which
  `notify(msg: string)` cannot express. Not sloppiness: the vocabulary gap forcing a
  fork.

## The census, and the axis that actually separates these

79 surfaces tell a reader something. The instinct is to sort them into "toast" and
"not yet a toast". That is the wrong axis and it is why the problem looks like ten
mechanisms. **Three orthogonal properties explain all 79:**

1. **Event or condition.** A toast has a lifetime of its own. A derived boolean has
   none — it must be on screen exactly as long as its predicate is true. No dwell can
   express that, and a refusal that expired while Save stayed disabled would be a lie.
2. **Broadcast or addressed.** A toast fires once into time, at whoever is looking.
   Some messages are addressed to an **entity** and must be waiting when the reader
   returns to it.
3. **Is there a `<Toaster>` on this route at all.** Two files mount one. Everything
   else — the landing page, the docs, the component reference, and any ErrorBoundary
   catching the tree that *owns* the Toaster — is structurally unreachable by `toast()`.

## What the subsystem owns

`lib/notify.ts` owns property 1's *event* side and property 2's *broadcast* side. A
message gets a **kind**, and the kind carries the policy:

| kind | policy |
|---|---|
| `status` | disposable text. One pill, rewritten in place. Never carries an action. |
| `action` | text plus one affordance. Its own slot; one at a time. |
| `sticky` | an affordance that must outlive everything around it. Never expires, never evicted. |

At most one of each is on screen. **That is what makes the Toaster's cap structural**
rather than a number someone liked: `visibleToasts={3}` is three *kinds*, not three
arbitrary messages, and the common case is one.

It was briefly 2, and that was wrong rather than conservative — the Playground's
never-expiring stale-page notice and a draft-backup Undo really can be up together.
A cap below the real worst case does not prevent the third message; it **hides** one,
`pointer-events: none`, starting with the oldest, which is the affordance someone was
reaching for.

`lib/announce.tsx` owns the a11y half of property 1's *condition* side — and only
that half. It renders no visible text, moves nothing, changes no layout.

## The stack is EXPANDED, and only the ceiling makes that safe

Sonner's collapsed stack zeroes the content of every pill but the front one
(`[data-expanded='false'][data-front='false'] > * { opacity: 0 }`). Looking at two
kinds on screen — which is the whole claim that an affordance keeps its own slot —
showed what that means: a draft-backup Undo sitting behind a status message was a 4px
edge with an **invisible but still clickable** button in it. That is a worse outcome
than either being replaced or being absent, and no test would ever have said so.

`expand` fixes it, and the per-kind ceiling is what makes `expand` sane: with an
unbounded stack it would be a wall; with at most three kinds it is at most three
lines, and the common case is still one.

**Expanding then exposed a content defect the collapsed stack had been hiding.** The
Playground's handoff raised two near-identical sentences — "Loaded the deck from X —
your previous draft is backed up." and "Loaded the deck handed off from X." — which
were never both readable at once, so nobody had read them as the repetition they are.
`backupDraft` now reports whether it spoke and the caller stays quiet when it did.
Worth stating plainly: **the bug was always there, and the only thing that found it
was looking at the rendered surface.**

## What it must NOT own, and why each resists

This is the more valuable half of the census. Absorbing these would break working
behavior to satisfy a tidiness goal.

| Surface | The one property that makes it irreducible |
|---|---|
| ArchitectChat's per-deck notice | **Addressed and replayed.** Consumed by the next turn on that deck, never by time. It also feeds the panel's empty-state predicate. |
| The nine panel condition strips | **A condition has no dwell.** On screen exactly while the predicate holds; an expiry or a dismissal would be a lie. |
| The five sr-only live regions | **Announcement with no visual**, plus node-identity control a system owning its own node cannot grant. |
| `ErrorBoundary` | **It reports the death of the tree that owns the `<Toaster>`.** |
| `DeckPreview`'s failure | It renders on five routes that mount no `<Toaster>`. |
| The Playground's handoff bar | **It must not expire** — the choice belongs to the reader, and one of its buttons is "Not now". |
| The Playground's `pg-status` line | A **render-state readout**: always present, always currently true. Not a message queue. |
| `PresentOverlay`'s withheld lens | A fail-closed **substitute for content**, not a message about it. |

The three progress-indicator families (`role="status"` spinners, export button
status, skeleton fallbacks) are not notifications at all. They inflate the count and
would be the first thing a consolidation wrongly absorbed.

## The prop chain is retired

`notify` reached 173 call sites through 16 modules (re-derive: `grep -rn "notify(" docs/src --include=*.tsx --include=*.ts | grep -v "\.test\." | grep -vE "notifyAction|notifySticky|function notify|__resetNotify"`; the count moves with the tree, so quote the command, not just the number). The 2026-09-13 note declined to
touch it, on the honest ground that it was a real dependency-injection seam — six
suites assert on it. That reasoning was right about the seam and wrong about the
conclusion: **a module singleton is no less testable**, it is the repo's established
cross-island pattern (`lib/component-browser-store.ts` is the canonical example), and
the seam simply moves from a prop to `vi.mock`. The six suites still assert.

Every call site's **text** is unchanged, because the kernel kept `notify(message,
opts?)` as the ergonomic form for the overwhelmingly common kind. What went away is
16 prop declarations, 15 passings, and the dependency arrays that tracked them.

## Two numbers that were arbitrary, now one

The action dwell was 5000ms in the Studio and 6000ms in the Playground, with no
recorded reason for the difference. A kernel means one number: **6000**, the longer.
A missed Undo is a lost edit; a second of extra pill is not.

## The announcement layer

25 surfaces reached a screen reader with **nothing at all** — visible text, announced
to no one. What makes this a component rather than an attribute is that whether an
announcement happens is a property of the **node's history**, and this repo has been
caught by it from both directions: a freshly *inserted* live region is mostly not
announced (StudioShell's scope echo keeps one persistent node for exactly this
reason), and a region whose `aria-live` arrives *with* its text is also not announced
(WalkBar relies on that deliberately, to stay quiet on boot). So the node is mounted
always, empty when there is nothing to say, and only its text changes. The obvious
`{msg && <p aria-live>…</p>}` is the first of those two failures.

**The visible strip is the sighted rendering; the region is the a11y one.** They carry
the same words, so exactly one belongs in the accessibility tree — the strip is marked
`aria-hidden`. Otherwise the sentence sits there twice and a reader navigating the
panel meets it twice.

Applied to five refusals and terminal failures. Deliberately **not** applied to
progress that ticks, nor to a keystroke-level validator that briefly had it: a field
validating on every keypress would talk over the typing it describes. That belongs on
the input via `aria-describedby`.

## Evidence

Measured on the real Studio and Playground, built and driven in Chromium:

| Claim | Arm |
|---|---|
| the refusal reaches a screen reader **exactly once** | `Accessibility.getFullAXTree` over CDP in `e2e/fabricate.spec.ts` — one `StaticText` node. Proven to fail: without the `aria-hidden`, 2. |
| several confirmations leave one pill | `e2e/status-pill.spec.ts`, three real menu actions inside one dwell |
| a refused import names each refusal on its own line | crafted `lattice-asset/1` zip through the real Library file input |
| a corrupt bundle reports **why** | same input, a non-zip buffer |
| a status message raised inside the previous one's **exit window** survives it | `e2e/status-pill.spec.ts`, real wall-clock dwell, real Sonner |
| an action message raised inside a **clicked** affordance's exit window survives it | same file — the close path Sonner never reports |

Plus 4194 unit tests, `npm run lint`, and `npm run build:check`.

### The exit window, and why it took two tries to measure

The 200ms window is the kernel's whole reason for rotating ids, and for a while it was
measured only in jsdom (`src/lib/notify.dom.test.tsx`) — against the real Sonner
package, but with no animation frames, no layout and timers that are not the browser's.
The first attempt to close that gap drove the window with a **faked clock**, and it
**passed with the defect pinned in**. It was deleted rather than shipped: an arm that
cannot fail is not coverage.

What works is to stop timing the window and start **observing** it. Sonner sets
`data-removed="true"` on the toast element at the exact instant the window opens, so a
`MutationObserver` installed in the page fires on that attribute and raises the next
message from inside the same microtask — a few milliseconds in, deterministically,
however loaded the box is. The click it dispatches is programmatic, which is the single
synthetic step and is there because a CDP round-trip cannot make a 200ms deadline;
everything the click then runs is the real app in a real browser.

The same move settles the other end. Waiting out the window with a 600ms sleep is a
guess about how loaded the box is, and the `SANCTIONED_E2E_SLEEPS` gate said so — but
the window has an event of its own: the pending `removeToast` DETACHES the exiting
element when it fires, so "no toast is still marked `data-removed`" is the deadline
passing, polled rather than assumed. No sanction needed.

Both arms are **proven to fail**, each against the defect it exists for, and the matrix
is what makes them discriminating rather than merely red:

| Build | status arm | action arm |
|---|---|---|
| as shipped | pass | pass |
| `raiseSlot` never rotates the id (trap 2 off) | **fail** — 0 pills | **fail** — 0 pills |
| `notifyAction` stops reporting the click as a close | pass | **fail** — 0 pills |

The bottom row is the one worth keeping: it is the finding the checker raised, it breaks
*only* the kind that carries a button, and the status arm staying green is what says the
action arm is measuring the wrap rather than the rotation. Both fail arms were re-run
against the final assertion shape, not an earlier one. Twelve consecutive green runs of
both, two workers, no flake.

One counting note, because it cost a cycle: Chromium gives every `StaticText` node an
`InlineTextBox` child carrying the same string, so counting raw name matches doubles
every occurrence and the assertion never means what it reads as.

## What is deliberately still open

- **The toast surface is still per-app.** Landing, Starlight docs and the
  component-reference routes mount no `<Toaster>`, so a `notify()` from an island
  there is a no-op. Making it global is a route-budget and island-chunking question
  (`docs/astro.config.mjs`'s `chunkGraphPlugin` emits the artifact that would settle
  it), not a notification question.
- **Roughly twenty surfaces still have no announcement.** The five applied here are
  the refusals and terminal failures; the rest are progress readouts where a region
  would be noise, or deliberately silent (`aria-hidden` decorative dots, two explicit
  `aria-live="off"` sites). Logged rather than swept: a blanket pass would have
  announced the ticks.
- **`Library.tsx:330` carries a British `centre`.** Pre-existing, off-path, logged
  per HARD RULE #18.
