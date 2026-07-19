---
status: shipped
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

- **Two separate panels** (`StudioShell.tsx`): the Coach (deterministic assessment)
  and the Chat (AI conversation) are independent panels — each with its own
  activity-bar icon (a Coach gauge, a Chat spark), its own resizable desktop column,
  and its own mobile slide-in drawer — sharing the one mutually-exclusive assistant
  slot. They are NOT tabs inside one "Architect" panel: they have nothing to do with
  each other, so a shared tab only added cognitive load. (The competition briefs
  assumed the pre-existing tabbed panel; the tab was removed on review.)
- **Coach** (`coach/coach-core.ts`, `coach/FindingCard.tsx`, `StudioShell.tsx`): real
  scorecard, quick-read chips, severity-ranked findings, hardened per-finding fix, honest
  framing, an AI-fix cost cue; `density` plumbed through `studio.astro`. Toy `scoreDeck`
  and the standalone "Rewrite lead" chip removed.
- **Coach finding cards, redesigned (2026-07-19 follow-up).** After review, the findings
  render as full-width cards (Lenses rhythm), not a bulleted list: a 3-row card (meta —
  glyph · slide · rule, truncated; message; action) that minimizes wrapping. The AI fix
  is a **single pill that cycles its progress IN place** (no toast) and then **splits into
  Apply / Discard**, with the diff below for review. Fix state moved from a single
  `fixProposal` to a **per-finding map keyed by finding identity** (`findingKey`) so an
  open/in-flight fix **survives a re-lint** (the old `setFixProposal(null)` on `[findings]`
  dropped it) — a stale entry is pruned only when its finding disappears. **Fix all** (batch
  DRAFT against one source snapshot) and **Apply all** (apply every proposal slide-descending,
  one checkpoint, each still K4 stale-guarded, mismatches skipped with a notice) land the
  deferred "Fix top N" follow-up below. New `coach/FindingCard.tsx`.
- **Chat** (`chat-markdown.ts`, `chat-highlight.ts`, `ChatCodeBlock.tsx`,
  `ArchitectChat.tsx`, `architect.ts`): streaming, Markdown + `~~~` code + Copy +
  highlight, per-slide re-appliable diff, DOMPurify, cost strip, ephemeral notices.

## The finding-card redesign's own adversarial-trio pass (2026-07-19)

The redesign above (per HARD RULE #25, high-blast-radius UI touching a deck-mutating
batch path) got its own red-team + Munger-inversion + independent-checker pass on the
*shipped* diff. Confirmed clean: XSS (React-text-only), no timer leaks, K4 source-pinning
sound. Fixed before this landed:

- **Phantom proposal (red-team, MAJOR).** `draftFix`'s success branch wrote the `proposed`
  entry unconditionally; if a re-lint pruned the finding mid-request, it resurrected a ghost
  proposal (inflating Apply-all, risking a wrong-slide apply). → the write is now guarded
  `key in m` like the failure paths, so a pruned fix stays gone.
- **Key-collision regression (red-team, MAJOR).** The content key `slide:rule:message` can
  collide (e.g. `_class: foo foo` → two identical `unknown-class` findings), merging two
  cards onto one React key + one fix state. → keys are disambiguated with an occurrence
  ordinal (`findingKeys` map, finding-object → key), still stable across a re-lint.
- **Dishonest cost cue (Munger, the headline).** The hard-coded `$0.02` under-reported: the
  real per-fix cost scales with the connected model's price AND the deck size (each fix
  re-sends the whole deck), and "Fix all" multiplied the understatement. → derived from
  `estimateUsd(source, ai.price, …)` like the sibling Chat strip; a qualitative cue ("Fix ·
  on your key", "Draft all (N)") when the price isn't known, never a fake number.
- **Silent Apply-all skips (Munger + red-team).** A skipped proposal (slide changed under it,
  or a sibling batch-fix already rewrote that slide) used to vanish behind a transient toast.
  → it now flips to a visible **`stale`** card ("Slide changed — re-draft") so the panel keeps
  showing what it couldn't apply; the toast wording distinguishes self-supersede from a user edit.
- **"Fix all" → "Draft all" (Munger).** Renamed so draft→review→apply reads off the labels,
  not from the user knowing "Fix" secretly means "draft."
- **Position stability (Munger).** The card order is frozen while any fix is active, so an
  unrelated re-rank can't move the card you're reviewing out from under you.
- **Count/target drift + impure reducer (red-team, minor).** `batchFixable` and `fixAll` now
  share one draftable predicate; the prune effect's timer-clears are hoisted out of the reducer.

New unit coverage: Draft-all → Apply-all, the working→proposed pill transition, survive-re-lint,
and the same-slide stale-supersede path (`studio.findings-fix.test.tsx`).

## Logged follow-ups (HARD RULE #18, off-path)

- ~~Make the engine slide splitter fence-aware~~ — **landed** (`2026-07-19-fence-aware-slide-splitter.md`):
  a shared byte-faithful `splitTopLevel` across the authoring cores + `architect-edits.js`; the K3
  `hasFencedSeparator` guard is removed, and `applyEdit` now refuses a model replace body that smuggles a
  top-level `---` (the red-team's LOW finding), so the fix covers every apply path, not one call site.
- ~~Exact aborted-turn cost via an OpenRouter `/generation` fetch~~ — **landed**: on Stop, the
  streamed turn's generation id is captured (`onGenerationId`) and, after the immediate estimate,
  the authoritative `total_cost` is fetched in the background (`openRouterGenerationCost`, retried
  since OpenRouter computes cost async) and the gauge self-corrects by the delta. Best-effort — the
  estimate stands if the fetch fails.
- ~~A chat "tone/clarity only — change no numbers or facts" constraint mode + fact provenance~~ —
  **landed**: a "Facts locked" composer toggle threads `constrainFacts` into `chatComplete` (a
  system constraint: improve wording, change no number/date/name/claim — explain instead of editing),
  and every proposed edit shows numeric **provenance** (`figureChange` → "Changes a figure — verify:
  X → Y") regardless of the toggle, so an altered figure is never silent.
- ~~Multi-fix "Fix top N" batch queue in the Coach~~ — **landed** in the 2026-07-19
  finding-card follow-up above (Fix all drafts every fixable finding against one
  snapshot; Apply all applies the reviewed proposals slide-descending under one
  checkpoint, each stale-guarded).
