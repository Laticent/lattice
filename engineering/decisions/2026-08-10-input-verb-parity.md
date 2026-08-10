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

## Verification

Real surfaces, real input — CDP touch sequences for swipe, genuine key and wheel
events for the rest (HARD RULE #23). Three viewports (1440 / 820 / 390) × five
surfaces × five verbs, plus the guards:

- **70/70 combinations navigate.**
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
