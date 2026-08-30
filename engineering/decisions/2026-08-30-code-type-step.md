---
status: shipped
summary: >
  `code` set its block at `--fs-meta`, the deck's SMALLEST role — the size labels,
  eyebrows and pills use — so the one layout whose whole purpose is that the code IS
  the slide read at chrome size. It now reads at `--fs-body-compact`, one canonical
  role up: +19.7% at landscape, +17.1% at square, +33.1% at portrait/reel. No new
  token: HARD RULE #4's 12-token system is closed and `checkTypographyTokens` rejects
  a `--fs-code`, and `compare-code-block` already used this role. `compare-code`
  itself is deliberately NOT moved — measured, two shipped gallery slides would start
  clipping. Two numbers fell out of it and are now MEASURED rather than asserted: the
  line-width budgets (122→102 columns at wide, and `tall` now takes the tighter of
  its two @sizes) and the vertical wall, which was documented as 20 lines but held 16
  before this change and holds 14 after. Separately, `code` gained the below-note by
  dropping a coda claim, and the annotation by being added to the opt-in union that
  register actually lives in. An independent checker pass found four things this note
  had asserted rather than measured; §6 records them, because three were wrong.
---

# `code` gets its own type step, and stops claiming a paragraph it never used

**Date:** 2026-08-30 · **Status:** shipped
**Trigger:** owner, after the shell-grammar work landed: *"did we increase the code
font? did we improve the contrast with the code background?"* — the answer to both
was no, which prompted *"do the code-specific type step. also let's make sure the
universal below note, key insight and annotation are supported."*

Contrast was measured and left alone: all twelve `--hljs-*` tokens already clear AA
on every theme's `--code-bg` (`checkHljsContrast`, no exemptions), and the two the
shell grammar leans on hardest measure 10.71:1 and 10.53:1 on indaco. Nothing to fix.

---

## 1. The type step

`code` and `compare-code` both set their block at `--fs-meta` — 1.17cqi at landscape,
the role the type system reserves for *chrome*: eyebrows, citations, pills, corner
tags. So the layout whose entire premise is "the code IS the slide" rendered its
subject at the smallest size on the deck.

**`--fs-body-compact` (1.40cqi) is the fix, and it is not a new token.** HARD RULE #4
closes the 12-token role system, and `checkTypographyTokens` rejects any `--fs-*`
outside `CANONICAL_FS_TOKENS` — a `--fs-code` would fail the build with "map it to a
role token, not a t-shirt size." `body-compact` is the canonical role for *dense
reference text*, which is exactly what a code block is, and `compare-code`'s own
full-width `compare-code-block` variant already read at it. So this is the type
system being used as designed rather than extended.

**`compare-code` deliberately stays at `--fs-meta`.** Its two panes are half-width
and clip rather than wrap at landscape. Measured against every shipped deck: at the
stepped size its budget falls 57→47 columns, and two gallery slides
(`gallery.md`, `gallery-jargon.md`, both `calibrator.decisions.log_if_relevant(signal)`
at 48 columns) would newly clip. One line in `read-across-carousel.md` is already over
today's budget at 74 columns — pre-existing, logged here, not touched.

## 2. Both numbers that follow from it were asserted, not measured — now both are measured

**Line width.** `CODE_LINE_BUDGET` in `lib/authoring/lint-core.js` re-measured the
same way the originals were: a 100-character fence rendered through the real pipeline
with fonts loaded, pane width over character advance. Wide is 1104px / 10.744px =
**102 columns** (was 122); square 58, tall 37, strip 36. The first attempt at this
measurement was wrong in a way worth recording — measuring in a bare Chromium page
with `dist/lattice.css` injected returns an 8px advance at *every* size, because the
`@font-face` files never load and every family falls back to the same metrics. The
numbers only became trustworthy when measured in the emulator's own output, where the
fonts are embedded. The repo's behavioral guard
(`test/unit/components/code-line-width.test.js`) independently re-measures these in a
real browser and agrees.

**Line count.** The manifest said "twenty lines is the wall" and shipped a 15-line
stress fence. Measured by rendering fences of increasing length and detecting the
actual clip: the pane held **16** before this change and holds **14** after. So the
documented wall was wrong by four in the generous direction — a number nothing had
ever measured.

**An earlier revision of this note claimed the old stress sample "had been clipping
its last line in the shipped docs." That was false, and it is worth recording why.**
The old fence is 15 lines and the old pane held 16: it fit, with a line to spare, and
the shipped golden on `main` renders all 15 with empty panel below. It began clipping
*because of this change* — the type step is what took the pane from 16 to 14. Framing
a self-inflicted break as a pre-existing one is precisely the substitution HARD RULE
#18 exists to forbid, and the note committed it while citing that rule. The sample is
still rewritten to 14 lines, but as a consequence of this change, not a repair of
someone else's.

Dividing pane height by line height gives 15 and is wrong — the pane's own padding
costs a line. Only detecting `scrollHeight > clientHeight` on a real render gives 14.

**And 14 is the bare-slide ceiling, not an authoring guarantee.** It is measured on an
`h2` + fence slide. Anything else that takes stage height — a below-note, an
annotation, a second eyebrow — costs lines off it: `palette-cascade-flip.md` clips at
a **13**-line fence because it carries a trailing note. The manifest's flat "fourteen"
is the upper bound, and the two decks in §6.1 are what it looks like when that is read
as a promise.

## 3. The universal blocks: a claim protecting a dead selector

`code` declared `coda: { claims: ["trailing-paragraph"] }`, which opts a layout out of
**below-note** — the block that promotes a trailing paragraph into the `.cell-coda`
band. Key Insight (a trailing blockquote) was never claimed and always worked.

What the claim protected was `section.code > .cell-stage > em` — a caption rule. **The
markdown path never produces that shape**: an italic-only line is always wrapped in a
paragraph, so it emits `.cell-stage > p > em`. Zero of the 18 shipped code-bucket
slides use either form.

*An earlier revision of this note said the selector "cannot match anything the engine
emits". That is too strong and a checker refuted it.* `lib/engine/index.js` sets
`html: true`, so a raw `<em>` block in the source reaches the stage unwrapped, and
`masthead-lift.js` folds every remaining direct child into `.cell-stage` — the
selector then matches. Nothing in the tree writes that idiom, and `stats.styles.css`
carries the same arm, so it was deliberate rather than a copy-paste. The honest claim
is "no shipped deck uses it and the markdown path never emits it," which is still
enough to delete the rule but is not the same sentence.

The claim is dropped and the dead rule deleted, so `code` now matches
`compare-code` and `content`: `authoring.blocks` reads `["key-insight","below-note"]`.

**The annotation needed a second, separate change — and the first revision of this
note wrongly claimed dropping the coda claim delivered it.** Below-note is *opt-out*:
a layout gets it unless it claims its trailing paragraph. The annotation is *opt-in*,
a union of sixteen layouts hand-written into `lib/base/base.modifiers.css`, and `code`
was in none of its three arms. So after the claim was dropped, an italic trailing
paragraph on a `code` slide docked in the coda band and rendered as an ordinary
below-note — body-size, accent hairline, no `✦`. `code` is now added to all three
unions and the register is verified on a real render (`--fs-meta`, secondary ink, the
`✦` mask drawn in accent, the hairline replaced by the dotted rule).
The claim lives in a GENERATED catalog (`lib/forms/cell/coda/coda-catalog.generated.js`,
built by `tools/build-stage-catalog.js`), so editing the manifest alone changes
nothing until that is rebuilt — worth knowing, because the render kept the old
behavior through a manifest edit that looked complete.

**This moves three shipped decks.** `drawn-not-typed.md`, `finish-override.md` and
`palette-cascade-flip.md` each end a code slide with a prose paragraph; that paragraph
now docks in the coda band under its hairline instead of sitting inside the stage.
Inspected as a render: it is the better result — the band is what that content is for.
Their goldens are re-blessed in this change.

## 4. What was rejected

| Move | Verdict | Reason |
|---|---|---|
| A new `--fs-code` token | ❌ | HARD RULE #4's system is closed; `checkTypographyTokens` fails the build. The role that fits already exists. |
| A component-local size (`--code-size: calc(…)`) | ❌ | Sidesteps the gate on a naming technicality — a t-shirt size wearing a different prefix. |
| Stepping `compare-code` too | ❌ | Measured: two shipped gallery slides would newly clip in its half-width panes. |
| Keeping the `em` caption and fixing its selector | ❌ | No shipped deck uses it, and it would keep costing `code` the below-note to serve a register nobody writes. The working caption idiom is the inline-code paragraph the galleries actually use. |

## 5. Verification (HARD RULE #23)

- **Rendered and inspected as images**, not asserted: the stepped code panel, the
  stress sample at the new ceiling (confirmed non-clipping by measuring
  `scrollHeight` vs `clientHeight`, not by eye alone), `finish-override.md`'s moved
  paragraph in its new band, and the annotation register on a `code` slide.
- **The real Playground, driven.** The docs dev server was started and a `code` deck
  typed into the editor: the preview frame resolves `pre > code` at 17.92px, renders
  bash with live highlight spans, and shows both a `BLOCKQUOTE` and a `DIV.below-note`
  in `.cell-coda` with the stage holding only the `<pre>`. This closes the gap the
  first revision of this note listed as unverified.
- **Column budgets** re-measured in the emulator's own output with fonts embedded,
  at **every canvas in every family**, and independently confirmed by the repo's
  behavioral guard (20/20).
- **Corpus overflow sweep**, `tools/check-overflow-corpus.js` over 284 decks at 2×:
  7 clipped slides across 4 decks, none above the committed baseline of 7.
- **Not verified from here:** the docs-site Studio route itself (the Playground was
  driven, the Studio was not), and dark-mode goldens were checked for clipping rather
  than inspected page by page.

## 6. What an independent checker found — three claims above were wrong

The change passed `npm test` (7536), lint, `build:check` and `lint:deck:all --strict`
before a checker agent read the diff. It returned four substantive findings, and this
section exists because three of them were **false statements in this very note**
rather than bugs in the code. That asymmetry is the lesson: every machine gate in the
repo was green while two shipped PDFs carried a visible "Content clipped" badge.

**6.1 Two shipped decks were re-blessed WITH a clipped slide.** `shell-highlighting.md`
p5 and `palette-cascade-flip.md` p3 both overflow at the new type size — on `main`
neither does. The emulator says so on stderr every render (`⚠ OVERFLOW — 1 slide …
CLIPPED`) and stamps a "Content clipped" badge into the PDF; nothing in CI reads
either. Both are trimmed to fit and re-blessed. `tools/check-overflow-corpus.js` — the
existing gate for exactly this, on-demand by design because it is 284 real renders —
now runs clean at baseline. **Run it after any change that moves a box.**

**6.2 `tall: 37` would have shipped clipped lines at `size: reel`.** See §2. The
budget is now 36 and the guard measures every canvas.

**6.3 The "already clipping" claim (§2) and the "cannot match" claim (§3) were both
false**, and the annotation was claimed as delivered when it had not been (§3).

**What survived unchanged:** the four budgets, the `code`/`compare-code` split, the
absence of any selector collision with `compare-code`, the catalog regeneration, and
the golden scope (19 PDFs, a 1:1 match with the decks carrying a `code` slide).
