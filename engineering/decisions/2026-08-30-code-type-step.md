---
status: shipped
summary: >
  `code` set its block at `--fs-meta`, the deck's SMALLEST role — the size labels,
  eyebrows and pills use — so the one layout whose whole purpose is that the code IS
  the slide read at chrome size. It now reads at `--fs-body-compact`, one canonical
  role up (1.40cqi vs 1.17 at landscape, ~20% larger). No new token: HARD RULE #4's
  12-token system is closed and `checkTypographyTokens` rejects a `--fs-code`, and
  `compare-code-block` already used this role. `compare-code` itself is deliberately
  NOT moved — measured, two shipped gallery slides would start clipping. Two numbers
  fell out of it and are now MEASURED rather than asserted: the line-width budgets
  (122→102 columns at wide) and the vertical wall, which was documented as 20 lines,
  actually held 16 before this change and holds 14 after — so the component's own
  stress sample had been clipping its last line all along. Separately, `code` gained
  the below-note and annotation blocks by dropping a coda claim that protected a dead
  CSS selector.
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

**Line count, and a pre-existing defect.** The manifest said "twenty lines is the
wall" and shipped a 22-line stress sample. Measured by rendering fences of increasing
length and detecting the actual clip: the pane held **16** before this change and holds
**14** after. So the documented wall was wrong by four, and the component's own
canonical "at the ceiling" example had been clipping its last line in the shipped
docs. That is a pre-existing defect on the exact path of this change, so it is fixed
here rather than logged: `whenToUse`, `commonMistakes`, the stress summary and the
stress sample all carry 14, and the sample was rewritten to fit and verified not to
clip.

Dividing pane height by line height gives 15 and is wrong — the pane's own padding
costs a line. Only detecting `scrollHeight > clientHeight` on a real render gives 14.

## 3. The universal blocks: a claim protecting a dead selector

`code` declared `coda: { claims: ["trailing-paragraph"] }`, which opts a layout out of
**below-note** and the **italic-paragraph annotation** — both of which promote a
trailing paragraph into the `.cell-coda` band. Key Insight (a trailing blockquote) was
never claimed and always worked.

What the claim protected was `section.code > .cell-stage > em` — a caption rule. **That
selector cannot match anything the engine emits**: markdown wraps an italic-only line
in a paragraph, so the shape is always `.cell-stage > p > em`. Verified across all 18
shipped code-bucket slides: zero use either shape, and no transform anywhere produces a
bare `<em>` as a cell child. The claim cost two universal blocks and bought nothing;
a trailing paragraph on a `code` slide rendered as unstyled body text crammed inside
the code stage.

The claim is dropped and the dead rule deleted, so `code` now matches
`compare-code` and `content`: `authoring.blocks` reads `["key-insight","below-note"]`.
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
| Keeping the `em` caption and fixing its selector | ❌ | Nothing uses it in 18 shipped slides, and it would keep costing `code` two universal blocks to serve a register nobody writes. The working caption idiom is the inline-code paragraph the galleries actually use. |

## 5. Verification (HARD RULE #23)

- **Rendered and inspected as images**, not asserted: the stepped code panel, the
  stress sample at the new ceiling (confirmed non-clipping by measuring
  `scrollHeight` vs `clientHeight`, not by eye alone), and `finish-override.md`'s
  moved paragraph in its new band.
- **Column budgets** re-measured in the emulator's own output with fonts embedded,
  and independently confirmed by the repo's behavioral guard (19/19).
- **Corpus scan** across every shipped deck at its own `size:` family: zero `code`
  lines exceed the new budgets.
- **Not verified from here:** the real Studio. As with the shell grammar, the browser
  preview is asserted from the shared stylesheet plus the built bundle rather than
  from driving the app.
