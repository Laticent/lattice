---
status: implemented
summary: The Studio's Coach and Chat are redesigned and deepened, closing the Drawing Board → Studio coaching/conversation gap (succession doc P2a + P2b). Two independent design competitions (5 tracks × 5 internal iterations each, judged) picked a finalist per surface; the adversarial trio (red team + Munger inversion + independent checker) hardened each winner before implementation. Coach: the toy `lint.ts scoreDeck` is replaced by the engine's real `scorecard.scoreDeck` (grade + per-dimension read over lint + review findings), deterministic quick-read chips (topFixes/weakestSlide/theAsk/pacing/structureCheck) ported behind React, severity-ranked findings, and per-finding AI fix hardened against stale-slide clobber (K4) and fence-blind slide splitting (K3), with an empty-deck grade guard (K1). Chat: streaming replies (onToken through chatComplete), on-brand Markdown with `~~~` fenced code (Copy button + lezer highlighting), a per-slide reviewable diff re-applied against the CURRENT deck at Apply-time (K1 stale-snapshot fix), DOMPurify defense-in-depth, ephemeral (never replayed) offline/blocked notices, and a calm per-turn/session cost strip. XSS-safe by construction; cost/budget cues visible; the Coach-vs-Converse honesty contract preserved.
---

# Coach + Chat: Studio migration, redesign, and hardening (2026-07-19)

> Status: **implemented** (Studio surface; docs-site UI). Executes the depth work
> of `2026-07-03-studio-succession.md` §2 — P2a (deterministic coaching depth)
> and P2b (conversational depth) — with a genuine UI/UX redesign rather than a
> vanilla port. The ownership flip (P1) and the frozen-surface removal (P4/P5)
> are separate slices and are NOT part of this change.

## How the design was chosen

The brief asked for a *designed* result, not a replicated one, so each surface
went through an independent **design competition** (`.claude/workflows/design-competition.js`):
5 tracks, each iterating internally 5 times, one fresh critic + fold per track,
one shared fact-checker, and a comparative judge. Then — per HARD RULE #25 — the
**adversarial trio** (red team, Munger inversion, independent checker) ran on the
*winner only*, against what would actually ship, before implementation.

**Coach winner — "Verdict-first" (judge 9/10).** Grade + per-dimension read as the
headline, findings ranked, per-finding fix, a sticky spend footer. The Munger
inversion corrected the *frame*: a big gameable grade with a "raise the grade"
button optimizes for detector-satisfaction, and a "grade-impact" fix ranking would
fork the engine's private scoring weights and mislead on floored categories. Folded
in: keep a prominent deck-level scorecard (the user explicitly wanted robust
deck-level assessment) but frame it honestly (scope caption), rank fixes by
**severity** (not a forked grade-impact model), no "raise the grade" CTA, no
blind apply-all.

**Chat winner — "guardrail-first" (judge 9/10).** It caught a real inherited bug
(blocked/offline notices were persisted as assistant turns and replayed into the
model history) and the cost-honesty trap (a draft-only estimate under-reports). The
red team then found five more killers (below). Grafted from the runners-up: a
full-width borderless reading block (the 300px answer), a per-turn cost badge, and
diff context-collapse.

## The adversarial trio's killers, and how each is resolved

**Chat (red team + checker):**
- **K1 — stale whole-deck Apply.** `chatComplete` returned a full-deck snapshot;
  Apply overwrote the whole deck, clobbering edits made to other slides while
  reviewing. → `proposed` now carries the parsed edit blocks; Apply **re-applies
  them against the CURRENT deck** (`applyProposedEdits`), and a slide changed under
  a proposal is flagged before Apply.
- **K2 — unmount semantics.** Resolved to *keep completing + persist to the
  originating deck; only an explicit Stop aborts* (preserving the survival contract);
  the paint is guarded by a mounted ref so it never writes to a detached node.
- **K3 — Copy button vs sanitizer.** A `<button>` inside sanitized HTML is stripped
  by DOMPurify. → code blocks render as a **React `ChatCodeBlock`** (real button
  outside any sanitized string).
- **K4 — highlight XSS.** Highlighting after sanitize is an unsanitized DOM write. →
  tokens render as **escaped React text children** (`<span>{text}</span>`), no
  post-sanitize innerHTML path.
- **K5 — aborted spend blindness.** On Stop the usage chunk never arrives, so the
  cap went blind. → an **estimated** spend is recorded on abort (exact cost via a
  `/generation` fetch is a logged follow-up).
- Plus: `~~~` fences (marker-aware, so ` ``` ` stays literal inside); the per-turn
  estimate computed over the deck (not per keystroke); offline/blocked/error are
  ephemeral, never replayed; `highlightTree` imported from `@lezer/highlight`.

**Coach (red team + checker):**
- **K1 — empty deck scored "A 94".** The engine `scoreDeck` measures *absence* of
  problems, so a blank deck scores high. → a `hasContent` gate shows a prompt (and a
  loading skeleton), never a fabricated grade.
- **K2 — silent signature collision.** The toy `scoreDeck(source, known)` and the
  engine `scoreDeck({source, lintFindings, reviewFindings})` share a name; a
  name-match swap would have silently scored the empty object. → every call site
  converted to the object API and the toy **deleted** (its tests removed, not
  repointed by name).
- **K3 — `---` inside a code fence corrupts on Apply.** The engine slide splitter is
  fence-blind. → AI fix is **disabled with an honest note** when a fenced `---` is
  present (guard `hasFencedSeparator`). *Follow-up: make the engine splitter
  fence-aware.*
- **K4 — stale-body clobber.** The React `applyFix` had no guard. → it now compares
  the target slide's content at proposal time to the current content and refuses if
  it changed.
- Slide-0 deck-level findings (not slide-fixable) are marked and excluded from AI
  fixes; the Coach XSS path is React-text-only (verified clean).

## What shipped

- **Coach** (`coach/coach-core.ts`, `StudioShell.tsx`): real scorecard, quick-read
  chips, severity-ranked findings, hardened per-finding fix, honest framing, an
  AI-fix cost cue; `density` plumbed through `studio.astro`. Toy `scoreDeck` and the
  standalone "Rewrite lead" chip removed.
- **Chat** (`chat-markdown.ts`, `chat-highlight.ts`, `ChatCodeBlock.tsx`,
  `ArchitectChat.tsx`, `architect.ts`): streaming, Markdown + `~~~` code + Copy +
  highlight, per-slide re-appliable diff, DOMPurify, cost strip, ephemeral notices.

## Logged follow-ups (HARD RULE #18, off-path)

- Make the engine slide splitter (`architect-edits.js` / `review-core.js`)
  fence-aware so a `---` inside a code fence no longer desyncs slide numbers.
- Exact aborted-turn cost via an OpenRouter `/generation` fetch (currently an
  estimate).
- A chat "tone/clarity only — change no numbers or facts" constraint mode + fact
  provenance on edits that touch numbers (Munger inversion's content-truth point).
- Multi-fix "Fix top N" batch queue in the Coach (per-finding, serialized against
  live source, one checkpoint) — designed and hardened, deferred from this slice.
