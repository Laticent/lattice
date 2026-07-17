---
status: shipped
summary: >
  A dogfooding exercise (build a theme + finish + component + deck from scratch,
  aiming for a first-go 10/10) produced a friction map: the skills nail STRUCTURE
  but underspecify the LAST MILE — mistakes only a render reveals. Two of those
  became author-time `lint:deck` warnings in the shared kernel: `big-number-hero-heading`
  (the giant number authored as a `#`/`##` heading instead of the required first
  list item, so it renders blank) and `bookend-finish-contrast` (a title/closing
  bookend under a deck-wide `finish:` with no `finish-none`, so its inverse display
  text washes out on a light canvas). The big-number rule immediately surfaced and
  fixed a latent invisible-hero in examples/accessible-descriptions.md. The
  `new:component` scaffold checklist gained the two CSS footguns it doesn't stop
  (unlayered CSS; base-modifier bleed) and the enumerative roster tests a new
  component is designed to trip.
companion:
  - ./2026-07-17-skill-recertification.md
---

# Author-time guards for the render-only footguns

## Why

Creating a boardroom-quality asset from scratch is not yet 10/10 on the first go.
Driving a real exercise — a Japanese-spring theme, a `hanami` finish, a
`policy-recommendation` component, and a deck to exercise them — surfaced a
repeatable **friction map**, and the churn sorted into three kinds:

1. **Gate-caught churn (keep it).** The categorical-contrast gate and the overflow
   probe caught mistakes *instantly*, with the exact failure named. Cheap, safe,
   self-correcting — the system working as designed.
2. **Last-mile churn (close it).** Mistakes nothing warns about until you look at a
   rendered slide: the big-number hero authored as a heading (renders blank); a
   title/closing bookend washing out under a deck finish. The skills teach the
   right *structure* but these slip through to render.
3. **Skill-defect churn (fix at the source).** A skill that teaches something false
   — e.g. `component.md` once taught `@layer components {`, which is inert. Fixed +
   gated separately (see the skill re-certification companion note).

This note addresses **class 2**: convert render-only footguns into author-time
`lint:deck` warnings so the machine catches them, not the author's eyes.

## What changed

Both rules live in the single shared lint kernel `lib/authoring/lint-core.js`
(HARD RULE #7 — the CLI, `validate()`, and the Drawing Board share it), at
`warning` severity, and are covered by the `--all --strict` corpus sweep that CI
runs (`lint:deck:all`).

- **`big-number-hero-heading`.** `big-number`'s required `number` slot is
  `ul > li:first-child`. Authoring the number as a `#`/`##` heading (the intuitive
  move) leaves that slot empty and the giant number renders blank. The detector
  (`findBigNumberHeroInHeading`) fires only on the signature of the mistake — a
  heading present AND no top-level list item — so an empty stub (a different
  problem) and a slide that has the list item are both left alone. Running it over
  the corpus immediately found a **latent invisible-hero** in
  `examples/accessible-descriptions.md` (`# 100%` rendered blank); fixed in place
  (HARD RULE #18).

- **`bookend-finish-contrast`.** A deck-wide `finish:` paints its backdrop over
  every slide, including the `title`/`closing` bookends — whose inverse surface +
  display-white text it covers, washing the text out on a light canvas. The house
  pattern (see `examples/finish-backdrops.md`) is `finish-none` on bookends. The
  rule warns on a title/closing under a deck finish with NO explicit finish token,
  and stays silent when the slide opts out (`finish-none`) or makes an explicit
  choice (`finish-<name>`). Verified loud on the broken shape and silent on the
  corrected deck.

- **`new:component` scaffold checklist.** `tools/new-component.js` now prints the
  two CSS footguns the scaffold can't structurally prevent — keep the styles
  UNLAYERED (cascade.md), and watch for base-modifier bleed into generic elements
  (`base.modifiers.css`) — plus the enumerative roster tests a new component is
  *designed* to trip (`stage-catalog`; `component-manifest` partition for
  bucket-divergent buckets), so they read as a conscious acknowledgement, not a
  surprise red.

## Alternatives weighed, not taken

- **An engine fix for the bookend/finish case** (auto-suppress the deck finish on
  silent bookends) would eliminate the footgun outright — but it alters exported
  bytes (export sign-off), risks surprising a deck that *wants* a finish on its
  title, and is not reversible the way a warning is. Deferred; the lint warning is
  the light, tunable move.
- **A deck-lint rule for the KEY-INSIGHT / base-modifier bleed** was rejected: that
  collision is a *component-authoring* CSS issue, invisible to a deck author, so it
  belongs in the scaffold checklist and `component.md`, not `lint:deck`.
- **Making the roster tests self-derive** (so a new component doesn't trip them) was
  left alone: they are a deliberate tripwire that forces a conscious roster change.
  The scaffold now names them instead.
