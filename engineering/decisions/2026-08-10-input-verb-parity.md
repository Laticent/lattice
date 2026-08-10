---
status: shipped
summary: Every Studio surface that shows a slide now accepts all three input verbs — keyboard, wheel, touch — at every breakpoint, with no gating on device class, screen width, or a pointer-capability probe. #1294 measured the gap on the real surface - arrow keys were dead at the Read/Write/Build stops, a plain mouse wheel was dead everywhere in the shell (the handler tested deltaX alone, so it answered a trackpad and ignored the deltaY every wheel mouse emits), and the presenter screen took the keyboard but neither wheel nor swipe. One root cause - the rule for an input verb was owned per surface instead of by lib/core/present-transport.mjs, which held keyAction and swipeAction but never a wheel rule. Fix - createWheelGate joins the kernel (dominant axis, 40px threshold, 480ms cooldown, self-contained so it still inlines into the presenter popup); the shell, Present and the presenter screen all read the kernel for all three verbs; docs/src/lib/deck-nav.ts holds the DOM-side typing guard the DOM-free kernel cannot; presenter stage frames become pointer-events:none so gestures reach the window. Two judgment calls - Space navigates on a stage but not in the shell (SHELL_KEYMAP is PRESENT_KEYMAP minus Space), and gesture/keyboard navigation no longer takes the caret while a filmstrip click still does. Verified 70/70 on real surfaces across 1440/820/390. The exported HTML player is deliberately untouched (export bytes need sign-off) and remains one verb short.
---

# Input-verb parity: every surface takes keyboard, wheel and touch

**Date:** 2026-08-10 · **Issue:** #1294 · **Status:** shipped

## The rule

> Every surface that shows a slide accepts **all three input verbs** — keyboard,
> wheel, touch — at **every breakpoint**. No verb is gated on device class, screen
> width, or a pointer-capability probe.

That is the whole decision. The rest of this note is why it has to be stated, and
what it cost to make true.

## Why device class cannot decide

The tempting shape is a matrix: phones get swipe, desktops get the wheel and the
keyboard, tablets get some of each. It reads as tidy and it is wrong at every cell.

- A "desktop" is as often a touchscreen laptop as a tower with a wheel mouse. The
  same machine has both, and which one the reader reaches for changes between
  slides.
- A tablet takes a keyboard case, a Bluetooth mouse and ten fingers — frequently
  within one sentence. Propped on a lectern it is a presenter screen; in a lap it
  is a phone with a bigger screen.
- A phone is the one device that *usually* means touch, and a paired keyboard is
  still a normal thing to own.

So a capability probe can only ever answer "what is attached", never "what is the
reader about to use". The cheap, correct answer is to listen for everything,
everywhere, and let the reader's hand decide. The cost is three listeners per
surface; the benefit is that no reader ever finds a surface that ignores them.

## What was actually broken (#1294)

Measured on the real Studio at 1756×1024 before the fix — five surfaces × four
verbs:

| Surface | Arrow keys | Wheel (mouse, `deltaY`) | Wheel (trackpad, `deltaX`) | Swipe |
|---|---|---|---|---|
| Read | ✗ | ✗ | ✓ | ✓ |
| Write | ✗ | ✗ | ✓ | ✓ |
| Build | ✗ | ✗ | ✓ | ✓ |
| Present | ✓ | ✓ | ✓ | ✓ |
| Presenter screen | ✓ | ✗ | ✗ | ✗ |

Two distinct defects, one shared root cause.

**The shell's wheel was horizontal-only.** `Math.abs(e.deltaX) < 30 ||
Math.abs(e.deltaX) <= Math.abs(e.deltaY)` returns early for a pure-`deltaY` event
— which is exactly what a wheel mouse emits, always. The rule answered a trackpad
and ignored every mouse. Present, three files away, already read the *dominant*
axis and worked fine.

**The shell had no keyboard handler at all.** Its only `window` keydown covered
⌘K, ⌘. and Escape. Present hand-wrote its own list (`ArrowRight`, `' '`,
`ArrowLeft`), and the presenter window hand-wrote a third (`ArrowRight`, `' '`,
`PageDown`, `ArrowLeft`, `PageUp`). Three lists, three different key sets, and a
shared `PRESENT_KEYMAP` in the kernel that none of them read.

The root cause is the same one `lib/core/present-transport.mjs` was created to
end: **the rule for an input verb was owned by each surface instead of the
kernel.** The kernel already held `keyAction` and `swipeAction`; it never held a
wheel rule, so the wheel is precisely where the two surfaces drifted, and the
keymap is precisely where three surfaces ignored what the kernel offered.

## What changed

- **`createWheelGate` joins the kernel.** Dominant-axis (so a mouse, a trackpad
  and a tilt-wheel all read), a 40px flick threshold, and a 480ms cooldown that
  collapses one physical flick — trackpad momentum fires dozens of events — into
  one slide. It is a *stateful gate* rather than a pure predicate because the
  cooldown is the whole trick, and per-caller cooldown state is what let the two
  implementations drift (480ms/40px vs 400ms/30px). Self-contained, so it still
  inlines verbatim into the presenter popup per this module's contract.
- **Every surface reads the kernel.** The shell, Present and the presenter screen
  now share one wheel rule, one swipe rule, one keymap. Present gained
  PageUp/PageDown/Home/End for free by routing through `keyAction`; the presenter
  screen gained wheel and swipe.
- **`docs/src/lib/deck-nav.ts` holds the one thing the kernel cannot.** The kernel
  is DOM-free by construction, so "is this keystroke the author typing?" lives
  docs-side: `SHELL_KEYMAP` (the Present keymap minus Space) and `shellKeyAction`.
- **The presenter screen's stage frames became `pointer-events: none`**, so a
  wheel or swipe over the slide reaches the window instead of being swallowed by
  the iframe — the same rule the shell's preview holder already used.

## Two judgment calls worth naming

**Space navigates on a stage, never in the shell.** On a full-screen stage there
is nothing else Space could mean. In the shell it activates the focused button and
scrolls the page; taking it would break both. `SHELL_KEYMAP` is therefore
`PRESENT_KEYMAP` minus `' '` — a deliberate, single, documented divergence rather
than a second hand-written list.

**Gesture and keyboard navigation no longer take the caret.** `goToSlide` focused
the editor on any navigation when a fine pointer was present. That is right for
*clicking a filmstrip row* — picking a slide is intent to edit it, so the caret
lands there (#1288, #1291), and that path is unchanged. It is wrong for turning
the deck: if the arrow key that moves the slide also drops focus into CodeMirror,
the *next* arrow press moves the caret instead. Navigation would work exactly
once. So `goToSlide` takes a `focus` override and every gesture/keyboard path
passes `false`.

## What the review round caught

The first cut of this change passed every gate, a 70/70 real-surface matrix, and
an e2e suite — and still shipped four defects. An independent checker found them.
They are worth naming, because each one hid in the same blind spot: **the tests
covered the verbs the matrix enumerated, and every defect lived in a cell the
matrix did not have.**

1. **`Home` and `End` navigated BACKWARD one slide.** The shell's mover was
   `action === 'next' ? … : …` — a two-way collapse over a keymap that carries
   four actions, so `first` and `last` both fell through to "prev". `End` on
   slide 4 went to slide 3, and `preventDefault` stole the browser's own
   behavior on the way, so the key did something wrong *instead of* something
   right. The unit test asserting `SHELL_KEYMAP.End === 'last'` passed
   throughout: the map was right and the consumer ignored it. **The
   CHANGELOG shipped the claim "Home/End work too" while they did not.**
2. **The new global keydown double-fired on every roving-tabindex widget.**
   Radix's roving focus calls `preventDefault()` and does *not* stop
   propagation, so the event still reached the window listener: one `ArrowRight`
   on the Inspector's pill tabs both moved the highlight and turned the deck —
   which re-pointed a slide-scoped Inspector at a different slide mid-edit. The
   fix is to honor `e.defaultPrevented`, which covers every such widget
   generically, with a widened role list behind it for widgets that own arrows
   without calling `preventDefault`.
3. **`hasTouch: true` on the `tablet` Playwright project moved 4.2% of the
   pixels in a committed `@visual` baseline** — 4× the configured tolerance —
   because `(pointer: coarse)` raises `.cm-content` to 16px (`editor-theme.ts`,
   the iOS zoom-on-focus defense) and re-wraps every line. The irony is exact:
   the `desktop-touch` project exists *because* folding touch into an existing
   project changes unrelated specs, and the same mistake was then made to
   `tablet` and `mobile`. Fixed the same way — `tablet-touch` / `mobile-touch`
   are their own projects, and the visual baselines keep the pointer state they
   were blessed under.
4. **`PresentRail` lost its roving-focus contract for `Home`/`End`.** It shields
   the arrows with `stopImmediatePropagation` but never needed to shield
   `Home`/`End`, because Present used to ignore them. Routing the full shared
   keymap through Present made them live, so one `End` press both moved the
   rail's focus and jumped the deck. Moving focus is not activating.

The lesson generalizes past this change: **a verb matrix proves only the cells it
contains.** Three of the four defects were in a key or a project the matrix never
enumerated, and the fourth was in a widget interaction no navigation test would
think to drive. A checker reading the diff for blast radius found all four in one
pass.

## Verification

Real surfaces, real input — CDP touch sequences for swipe, genuine key and wheel
events for the rest (HARD RULE #23). Three viewports (1440 / 820 / 390) × five
surfaces × five verbs, plus the guards:

- **70/70 combinations navigate.** This matrix was an ad-hoc harness and is **not
  committed**, so the claim is not independently reproducible — the `@parity` e2e
  suite is its durable successor, and it now carries the `Home`/`End` cell the
  matrix lacked. Prefer the suite; treat the 70/70 as the history of how the gap
  was found, not as a standing gate.
- Caret in the editor: arrows move the caret, not the deck; typing still types.
- Two consecutive arrow presses both move the deck (the focus-steal regression
  this would otherwise have shipped).
- A wheel over the presenter's speaker-notes panel scrolls the notes and does not
  turn the slide.
- Clicking a filmstrip row still takes the caret, on a fine-pointer context.

Not verified here, and stated as such: **real iOS/Android Safari**. The touch
sequences are genuine CDP touch events in headless Chromium, which is not the same
surface as a physical phone. The swipe rule itself is unchanged from what already
shipped and works there; only its reach (the presenter screen) is new.

## What this does NOT cover

The exported HTML player (`lib/export/player-core.mjs`) has the keyboard and swipe
but no wheel. It is deliberately untouched: a change there alters the bytes of an
exported artifact and needs sign-off before it ships (CLAUDE.md § Quality Bar). It
now diverges from the parity rule by one verb, which is a known, recorded gap
rather than an oversight — closing it is a separate, sign-off-gated change.
