---
status: shipped
summary: The authoring slide splitter is now fence-aware. The deterministic authoring cores (lint-core, review-core, scorecard, fact-check-core) and the Studio edit engine (architect-edits.js) split a deck on `---` lines with a naive `split(/^---$/m)` that mis-read a `---` INSIDE a ```/~~~ code fence as a slide boundary — desyncing every downstream slide number and making the Coach's per-finding AI fix target the wrong slide. A shared `splitTopLevel` (lib/authoring/slide-split.js) heals this while staying BYTE-IDENTICAL to the old split for any deck with no fenced `---` (it starts from the naive split and only re-merges chunks whose boundary `---` fell inside an open fence, re-inserting the exact `---` removed). Lands the migration doc's logged follow-up; lifts the Coach's K3 "AI fix paused on a fenced `---`" guard; and adds an apply-time guard so a model replace body that smuggles a top-level `---` is refused rather than corrupting the deck. Kernel change verified with maker-checker + fence fixtures; byte-faithfulness confirmed by the full unit suite (no fence-free regression).
---

# Fence-aware slide splitter (2026-07-19)

> Status: **shipped.** Closes the `2026-07-19-coach-chat-studio-migration.md`
> logged follow-up ("make the engine slide splitter fence-aware so the K3 guard
> can be lifted") and the adversarial trio's LOW finding (a model-authored `---`
> in a replace body could inject a slide).

## Problem

Marp splits a deck into slides on a top-level `---` line. The authoring kernel
(`lib/authoring/{lint-core,review-core,scorecard,fact-check-core}.js`) and the
Studio edit engine (`docs/src/playground/architect-edits.js`) each did this with
a naive `source.split(/^---$/m)`. That regex is **fence-blind**: a `---` inside a
` ``` ` / `~~~` code block — routine in decks that demonstrate Markdown, diff, or
YAML samples — was counted as a slide boundary. Every slide number *after* the
sample drifted, so:

- lint / review / scorecard findings were attributed to the wrong slide;
- the Coach's per-finding **AI fix targeted the wrong slide** (K4-adjacent), so
  the migration slice **disabled the fix entirely** whenever a fenced `---` was
  present (the K3 guard `hasFencedSeparator`) — a real, user-visible limitation.

The render path already had a fence-aware splitter (`lib/core/split-slides.js`),
but the authoring cores and the edit engine did not share it (different contract:
the authoring cores need the raw-chunk model — front-matter chunks kept, empties
kept, index math intact — whereas the render splitter pre-strips front matter,
trims, and drops empties).

## Fix

A new shared primitive `splitTopLevel(source)` in `lib/authoring/slide-split.js`,
mirrored locally in `architect-edits.js` (which is deliberately dependency-free
and headless-verifiable, so it keeps its own copy rather than importing across
the lib ↔ docs boundary).

**The key property is byte-faithfulness.** `splitTopLevel` starts from the exact
naive `split(/^---$/m)` output and only **re-merges** the chunks whose boundary
`---` fell inside an open fence — re-inserting the exact `---` the split removed
(`cur + '---' + naive[k]`), which reconstructs the original bytes. So for any
deck with **no fenced `---`** the output is identical to before, and only the
mis-split decks change. That is what made a broad kernel change safe: the full
unit suite (3889 tests) passed unchanged, and the only behavior delta is the
intended fix. Fence tracking (opener char + run length, ≤3 leading spaces) mirrors
`lib/core/split-slides.js`.

Wired into all six naive-split sites (four authoring cores + the four consumers in
`architect-edits.js`: `numberSlides`, `slideCount`, `slideRanges`, the insert
path). The authoring bundle (`authoring-core.generated.js`) and the emulator
(`dist/lattice-emulator*.js`, which embeds the cores) were regenerated.

**Two downstream effects:**
- The Coach's **K3 guard is removed** — `hasFencedSeparator` and its "AI fix
  paused" note are deleted; the fix is offered on decks with a fenced `---` and
  targets correctly.
- `applyEdit` gains a guard: a `replace` body that itself contains a top-level
  `---` (outside a fence) would inject a spurious slide separator, so it is
  **refused** (returns the source unchanged) rather than corrupting the deck —
  closing the trio's model-output finding at the engine level, for every apply
  path (Coach fix, chat, `runArchitect`).

## Verification

- New unit tests: `test/unit/authoring/slide-split.test.js` (byte-faithfulness +
  fence-healing + `~~~`/length-matched closers) and fence cases added to
  `test/unit/playground/architect-edits.test.js` (numbering, slice, apply target
  past a fenced `---`, and the replace-body guard).
- Full unit suite (3889) + docs Studio vitest (801) green; typecheck, lint,
  `build:check` green.
- **Maker-checker** (shared-kernel blast radius) on the diff.
- **Real surface** (HARD RULE #23): drove the actual Studio on a deck whose slide
  2 shows a ` ```md ` sample containing `---`; the finding on slide 3 is labeled
  Slide 3 (not desynced), the Fix pill is offered (no K3 pause), and applying it
  edits slide 3 while the code sample on slide 2 stays byte-intact.

## Maker-checker

An independent checker verified byte-faithfulness empirically and caught a real
FIX-FIRST regression that was folded in before commit: `lint-core`'s deterministic
`applyFix` (the engine behind "Fix all" / CLI `--fix`) still counted chunks with a
raw `lines[i] === '---'` walk, so once `finding.slide` became fence-aware they
DISAGREED — a fenced `---` before an autofixable finding mis-scoped the fix, which
returned null and *halted the whole `applyAllFixes` pass*. Fixed by routing that
walk through the shared `separatorLines`, which is also **CRLF-tolerant** (`/^---$/m`
splits a `---\r\n` line, so a line walk must too) — closing the checker's CRLF nit
in the same stroke (and the local `separatorLines` in `architect-edits.js` was made
CRLF-tolerant to match). New autofix-through-a-fence test added.

## Not in scope / logged (HARD RULE #18, off-path)

- The render/emulator splitter (`lib/core/split-slides.js`) already handled fences;
  this change aligns the *authoring* splitters with it rather than merging the two
  (their chunk contracts differ). Unifying them is a possible future cleanup.
- `coach-core.ts` `countSlides` (the pacing "~Xs per slide" estimate) and the FROZEN
  `docs/src/playground/coach-actions.js` still split fence-blind. Both are SYNC and
  off the finding→apply targeting path; `countSlides`'s only effect is a slightly-off
  pacing estimate on a deck with a fenced `---`. Not worth a third copy of the fence
  logic (they can't import the async authoring bundle synchronously); logged rather
  than fixed. (`hasContent`'s naive split is harmless — it only needs `>1` non-empty
  chunk, which every real deck has.)
