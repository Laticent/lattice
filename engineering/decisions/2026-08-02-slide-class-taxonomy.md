---
status: proposed
summary: >
  `_class` is a whitespace-separated token bag with no declared structure, and
  every Studio writer has had to reinvent the structure privately. The engine
  knows five exclusive axes (tone, insight, scale, period, claim) but nine
  universal groups exist, and the 179 variant tokens the 61 components declare are
  registered as exclusive NOWHERE — `applyVariant` derives that family at call
  time from a prop. So a writer that consults the shared vocabulary still sees
  `spotlight` and `ops` as unrelated additive tokens, and a slide accumulates
  members of the same family until two badges render at once. That single missing
  fact — the CLASSIFICATION of every token into an exclusive group or an additive
  flag — is the root of both the reshape stacking bug (#1281) and the
  no-semantic-understanding autocomplete (#1284). This note proposes one generated
  taxonomy as the source of truth, and scopes the two large Studio features
  (#1294 navigation, #1295 presenter/projector) that were deferred alongside them.
builds-on: 2026-07-18-slide-variants-in-gallery.md, 2026-07-03-slide-context-editor.md
---

# The slide class taxonomy — what stacks, what replaces

**Date:** 2026-08-02 · **Status:** Proposed · **Decision owner:** Sharmarke

A slide's `_class` is a bag of whitespace-separated tokens. Nothing in the repo
says which of those tokens can coexist. Every writer that edits the bag has
therefore had to answer "does this token replace something, or add to it?"
privately, and they answer it differently — which is why Reshape stacks classes
(#1281) and why autocomplete offers every token in the catalog on every line
regardless of what the slide already is (#1284).

Those are not two bugs. They are one missing fact, read by two consumers.

## The symptom

Reshape a `kpi` slide to `spotlight`, then to `ops`, and the directive reads
`_class: kpi spotlight ops`. Both variants apply, the later rule wins by CSS
source order rather than by intent, and nothing warns. Type into the `_class:`
line instead and autocomplete cheerfully offers all 61 component names on a slide
that already names one, plus all 127 universal modifiers, with no notion that
`wip` and `draft` are two values of one register.

## The root cause

The vocabulary is real but structurally incomplete. Measured against the live
tree (`buildVocab()` in `lib/authoring/lint.js`):

| | count |
|---|---|
| component names | 61 |
| modifier tokens (all) | 270 |
| universal modifiers | 127 |
| **declared exclusive axes** | **5** — `tone`, `insight`, `scale`, `period`, `claim` |
| universal groups | 9 — `mood`, `decoration`, `typography`, `chrome`, `social`, `state`, `tone`, `insight`, `claim` |
| variant tokens declared by components | **179**, across 38 of the 61 components |
| variant tokens that collide with a component NAME | **3** — `decision` (compare-prose), `stats` (math), `quadrant` (radar) |

Two gaps follow directly.

**1. The component's own variants are exclusive nowhere.** `applyVariant`
(`docs/src/components/studio/slide-variants.ts`) treats a component's declared
variants as one pick-one family — correctly — but it learns that family from a
`componentVariants` **prop passed in at the call site**, not from the shared
vocabulary. `exclusiveAxes` contains none of those 179 tokens. So Reshape, which
is handed the prop, behaves; and every other writer that consults the shared
vocabulary — autocomplete, the inline linter's conflicting-variants rule, a
hand-typed edit — cannot see the family at all and treats `ops` and `spotlight`
as unrelated additive tokens.

**2. Four universal groups have exclusivity in fact but not in declaration.**
Of the nine universal groups, `tone`, `insight` and `claim` have matching
exclusive axes, and `typography` is fully covered by the `scale` + `period` axes.
The rest are undeclared:

- `state` (8: `wip`, `draft`, `tbd`, `confidential`, `redacted`, `archived`,
  `pinned`, `revised`) — a slide carries ONE state stamp; two tokens render two
  badges.
- `decoration` (6: the `tint-*` / `mark-*` treatments) — one treatment per slide.
- `mood` (`dark` / `light`) — genuinely exclusive, and **already solved the way
  this record argues for**, which makes it the counter-example rather than the
  tell. Both render paths build a `colorModeSet` from the same
  `lib/core/color-mode.js` (`plugins.js:45`/`307`, `lib/runtime/index.js:56`/`1237`),
  and that module says so in its own docstring. It is one declaration with two
  readers, not two hand-maintained copies.
- `chrome` (7) and `social` (1) — these really ARE additive, except the
  `form` / `no-form` pair, which is a toggle.

**`mood` is the proof the shape works, and the measure of what is missing.** Its
exclusivity is declared once, in a shared module, and every consumer that needs
it reads it from there — which is exactly what this record proposes for the other
groups. The gap is not that `mood` is done badly; it is that `mood` is the ONLY
group done this way, and the mechanism it uses is bespoke to the color axis
rather than something a new group can join.

Two consequences for the proposal, both learned from looking at `mood` properly:

- **The color guards must not be "derived from the `mood` axis."** An earlier
  draft of this record proposed exactly that. It would drop tokens:
  `UNIVERSAL_GROUPS.mood` is `['dark']`, while `COLOR_MODE_TOKENS` is `['dark',
  'light', 'color-light', 'color-system', 'color-inherited', 'print']`. The
  taxonomy must READ `lib/core/color-mode.js` as the authority for that axis, not
  replace it.
- **`mood` cannot simply be declared as a sixth exclusive axis.**
  `test/unit/components/exclusive-axes.test.js` requires every axis token to be a
  real universal/semi-universal and every axis to have ≥2 members; `light` is a
  `BASE_MODIFIERS` entry, deliberately kept out of the universals so it stays
  clear of `divider.light`. So `mood: ['dark','light']` fails that test as
  written, and the count below is four new axes, not five.

## The proposal

**One generated taxonomy, classifying every token in the vocabulary.** Extend the
vocabulary build (`lib/authoring/lint.js` `buildVocab`) to emit a `tokenKind`
resolver alongside the existing sets, classifying each token as one of:

- **`component`** — the layout. Exactly one per slide; a second REPLACES the
  first. (The default-component rule, `lib/core/resolve-component.js`, already
  depends on being able to answer "is this token a component" — it currently gets
  that from the generated stage catalog, which this subsumes.)
- **`variant:<component>`** — a form of one component. Exclusive within that
  component; meaningless on any other, which is the fact autocomplete needs in
  order to stop offering `ops` on a `quote` slide.
- **`axis:<name>`** — a member of a pick-one register (`tone`, `state`,
  `decoration`, `insight`, `scale`, `period`, `claim`). Exclusive within the
  axis; the existing five become seven once `state` and `decoration` are
  declared. `mood` is NOT in that list — it keeps its own declaration in
  `lib/core/color-mode.js`, which the taxonomy reads rather than restates (see
  above).
- **`flag`** — genuinely additive (`no-header`, `no-paginate`, `numbered`,
  `safe`). Stacks freely.
- **`toggle:<name>`** — a paired on/off flag (`form` / `no-form`,
  `lifted` / `flat`). Exclusive within the pair.

**It cannot be a flat map, and that is the design's sharpest constraint.** Three
tokens are already claimed twice: `compare-prose` declares a variant `decision`,
`math` declares `stats`, and `radar` declares `quadrant` — and `decision`,
`stats` and `quadrant` are each *also* a shipped component name. A global
`token → kind` table would have to pick one meaning for each and would be wrong
on the other, which is exactly the "one private answer per writer" failure this
whole record exists to end. So the taxonomy is a **function, not a lookup**:
`tokenKind(token, component)`, resolved against the slide's own component. On a
`radar` slide `quadrant` is `variant:radar`; anywhere else it is the `quadrant`
component. The component is resolved FIRST (that is what
`lib/core/resolve-component.js` already does), and every other token is
classified in its light.

This also fixes the gate. `checkClassTaxonomy` cannot assert "every token
resolves to exactly one kind" — the three collisions above would fail it on the
day it lands. What it can assert, and what actually protects the invariant, is:
every token resolves to exactly one kind **per component**; no token is claimed
by two axes; and a collision between a component name and some component's
variant is *declared* rather than discovered — an allowlist entry, in the house
style of `SANCTIONED_*`, so a fourth one is a deliberate decision and a stale
entry fails the gate.

Then **one writer**. `setGroupToken` already implements "replace within a group";
the change is that every writer routes through a single `applyClassToken(chunk,
token)` that looks the token's kind up in the taxonomy and picks replace-vs-add
from it, instead of each writer carrying a private answer. `applyVariant` becomes
a thin caller rather than the place the knowledge lives.

The two consumers then fall out:

- **#1281** — Reshape stops stacking because the taxonomy, not a prop, decides.
  The Inspector, a hand edit's quick-fix, and any future writer get the same
  answer for free.
- **#1284** — autocomplete becomes context-aware without new logic: read the
  line's existing tokens, resolve the component, and offer `variant:<that
  component>` + every `axis` not yet satisfied + unused `flag`s. Members of an
  already-satisfied axis are offered as REPLACEMENTS (they are what Reshape
  would do), not as additions. What autocomplete cannot do today is not a
  missing feature — it is a missing input.

**Gate it.** A `checkClassTaxonomy` guard in `tools/check-ownership.js`, asserting
the three things named above — one kind per token *per component*, no token in two
axes, name/variant collisions declared not discovered — plus: every exclusive
group in the taxonomy has exactly one declaration, and `lib/core/color-mode.js`
stays that declaration for the color axis rather than being duplicated into it.
The rot this closes is the reason the gap exists at all.

### Sequencing

The taxonomy lands first and alone, with `state` and `decoration` — the two
groups that are exclusive in fact and declared nowhere — migrated onto it as
proof it is load-bearing. (`mood` is not the migration candidate: it is already
declared once and read by both paths, which is the shape being generalized, not
a debt being paid.) #1281 and #1284 are then mechanical and independently
reviewable. Neither should be attempted before it — both would otherwise grow a
third and fourth private copy of the classification.

## The two deferred features

Scoped here so they are not lost, and because both were triaged in the same pass.

**#1294 — navigation across every mode.** Arrow keys, touch swipe and wheel
should move between slides in read, write (preview focused), present, build
(preview focused) and project. Today the pieces exist but are scattered and
partial: `StudioShell` has swipe + horizontal-wheel handlers on the preview
holder and `PresentOverlay` has its own wheel and arrow handling, with no shared
contract, no keyboard path outside Present, and no vertical-wheel support. The
work is a single `useSlideNavigation` hook owning the gesture thresholds, the
wheel debounce and the key map, adopted by both surfaces — not new behavior per
mode. Sized as its own PR because it touches focus management on five surfaces
and its correctness claim is about real touch and real trackpads, which per HARD
RULE #23 cannot be settled in jsdom.

**#1295 — presenter / projector split.** Present currently opens one window that
co-mingles speaker notes and the next-slide preview with the delivered slides.
The issue specifies the target: a Presenter Dashboard on the laptop and a clean
Projector View in a second window, synchronized over an instance-isolated
channel, with a synchronous `window.open` (popup blockers), focus pulled back to
the dashboard, state recovery on mid-presentation refresh, and a 500ms heartbeat.
`docs/src/components/studio/studio-presenter.ts` is the existing seam. This is a
feature, not a fix, and its acceptance is a real two-monitor test — again
unreachable from CI. It should not ride a triage PR.

## What was NOT decided

The engine's default palette (`lib/core/resolve-palette.js`, still `indaco`).
Moving it to `cuoio` to match the new site default repaints ~96 decks with no
`theme:` and rewrites 431 committed PDFs — an export-bytes change requiring the
owner's sign-off, and one that would pull the six long-running galleries into an
unrelated diff against HARD RULE #8. Logged, deliberately unshipped.
