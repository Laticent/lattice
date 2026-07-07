---
status: blocked
summary: The self-delivering presentation — a deck that DELIVERS ITS OWN ARGUMENT aloud (throughline, "so what", arc, turn, close) as a talk worth hearing, so a blind listener, a driver, and a presenter rehearsing all get the same thing. The AI DRAFTS the spoken narrative; a HUMAN CONFIRMS it (presenter as editor-in-chief) — the author-owned/AI-accelerated/human-confirmed model proven by the describe: channel, generalized to the whole talk. GATED (status: blocked) behind a prove-it-first study, because an adversarial trio found the bet rests on machinery that does not exist and a safety story that was mis-specified. The HONEST correction: trust is TWO-TIER, not one — FACTS are structure-first + checkable (the model phrases, never sources), but FRAMING/rhetoric (the so-what, the arc) is a human-owned CLAIM, not a fact, and must be named as such rather than borrowing the fact layer's credibility. Safety therefore needs PLAYBACK-TIME LEGIBILITY: the talk audibly marks its claims as claims ("the data shows X; the takeaway I'd draw is Y") so an eyes-free listener can separate fact from spin — which is also better rhetoric — plus a non-suppressible objective factual floor. Confirm is PER-CLAIM beside its source figures (a deck-wide rubber stamp launders hallucinated confidence; the AI's numbers being right makes a wrong framing harder to catch). Hard prerequisites, all unbuilt: a structured-facts contract (chart data-tables are deferred — today the AI would hallucinate chart facts), a draft/confirmed store (an open question even at one-field scale for describe:), and a deck-wide cost posture on the user's own key (the describe: work deferred exactly this generation on cost). Reuses the ONE AI kernel (architectModel + a pure prompt/coerce module + the budget gate) — not a fifth fork. CONSUMES the Cadenza engine (2026-07-07-cadenza-caption-timeline.md), never the reverse. The rhetoric DSL (throughline/bridge/turn/hold/close) lives on the authored+confirmed side only. Honest ceiling: not a replacement for a skilled human live to a room; a genuinely good talk when none is present. Design only; nothing built. GO/NO-GO on the study gates the whole bet.
companion:
  - ./2026-07-07-cadenza-caption-timeline.md
---

# The self-delivering presentation — AI-drafted, human-confirmed (2026-07-07)

> **Status: blocked (a prove-it-first bet).** The vision: a Lattice deck can **deliver its own argument
> aloud** — the throughline, the "so what," the arc, the turn, the close — as *a talk worth hearing*, so a
> blind listener, someone driving, and a presenter rehearsing all get the *same* thing. The AI **drafts**
> the narrative; a **human confirms** it. This is the ambitious bet on top of the **Cadenza** engine
> (`2026-07-07-cadenza-caption-timeline.md`, which ships on its own). It is **gated** — an adversarial trio
> found it rests on unbuilt machinery and a mis-specified safety story; the §5 study is the go/no-go.
> Design only; nothing built.

## 1. Why this, why now — and the bet

"Read the slides aloud" is the wrong target — **"slides are not the show" (Reynolds)**; the meaning of a
good deck lives in the speaker's mouth, so **the sparser (better) the deck, the worse it reads aloud.** The
bet is not "narrate the contents" but **"deliver the argument"** — the throughline (Anderson's spine,
Knaflic's Big Idea, Minto's answer-first), the "so what," the WIIFY / Point B (Weissman), the tension→
resolution turn (Duarte), the memorable close (the Heaths' S.T.A.R.). Nobody *asks* for "my deck should
present itself as a great talk" — like the self-driving storyboard (Vetrina), we build what people will
need. **But** (the trio's discipline) an Apple-grade bet ships something that *works*; this one is gated on
proof, not shipped on faith.

## 2. The unlock — draft the narrative, don't derive it

Derivation is structurally incapable of the arc: per-slide/per-element derivation is *local and
audience-blind*; the throughline and the "so what" are *global and adaptive*. The old design treated that
as a ceiling. The answer here: **don't derive the narrative — AI-draft it, human-confirm it.** The model
*proposes* the spoken argument; the author *edits and confirms* it. This is the model already proven in the
`describe:` channel — **author-owned, AI-accelerated, human-confirmed** — lifted from one alt-text field to
the whole talk. That lift is exactly where the trio found the danger; §3–§5 are the price of doing it right.

## 3. The trust architecture — TWO tiers, named honestly (the trio's central correction)

The first draft claimed one uniform "structure-first, nothing unconfirmed" guarantee. The trio proved that
was a mis-specification hiding the product's core move: **an interpretation ("we've cracked growth") is not
a fact on the slide — it is a claim.** A rule that says "the model phrases facts, never sources them"
simply does not govern the rhetoric the product exists to generate. So we stop pretending it is one trust
model and name **two**:

| Tier | What | Guarantee | Owner |
|---|---|---|---|
| **Facts** | numbers, quantities, claims-of-fact on the slide | **structure-first** — traced to the data that drew the slide; the model may *phrase* a fact, never *source* one | the engine/data (checkable) |
| **Framing** | the so-what, throughline, turn, close | **a human-owned CLAIM** — AI-drafted, human-confirmed; explicitly the presenter's view, *not* a fact | the author (opinion) |

The framing tier is not "unsafe" — a presentation *is* human framing over checkable facts. It is only
unsafe when **spoken as if it were a fact to a listener who can't see the slide.** Hence two hard
mechanisms:

- **Playback-time legibility.** The talk must **audibly mark its claims as claims** ("the data shows
  $4.2M; the takeaway I'd draw is that the flywheel is turning"). An eyes-free listener must be able to
  separate the checkable figure from the presenter's spin *at playback*, not rely on an author's earlier
  click. This is simultaneously the safety mechanism and *better rhetoric* — an honest talk signposts its
  claims (attribution + earned emphasis; assertiveness degrades when the underlying fact is uncertain).
- **A non-suppressible objective floor.** The structure-first facts (and the objective `describe:` channel)
  remain available to the eyes-free listener regardless of confirmation. The persuasive talk rides **on top
  of** a checkable factual floor, never instead of it. "Human-confirmed" is not a license to drop the
  objective layer — that was the exact reopening of the trio's no-merge finding the review caught.

## 4. Confirmation — per-claim, beside its source, never a deck-wide stamp

The `describe:` model is safe *because* each unit is one **objective, slide-local, single-source-checkable**
field. Lifting it to a **deck-wide, subjective, persuasive** talk breaks all three, and the AI's numbers
being *right* is what makes a wrong *framing* harder to catch. So:

- **Confirmation is per-claim, against the visible source data** — the drafted interpretation renders
  beside the figures it leans on; an interpretation the author can't trace to on-slide data cannot be
  confirmed or spoken. No "confirm all," no deck-wide pre-approval (the `describe:` ADR's own named
  "40 slides pre-approved guarantees wrong text at scale," here at 10× stakes).
- **Edit invalidates confirmation.** A confirmed narrative is bound to a content-hash of the slide's facts;
  any edit to that data re-opens confirmation. Stale confirmed narrative is treated as unconfirmed and does
  not play (the gap the review flagged: "nothing speaks unconfirmed" didn't cover an already-confirmed line
  going stale).
- **Nothing speaks or exports unconfirmed** — requiring a real draft/confirmed store (§6, unbuilt).

## 5. The gate — a prove-it-first study (go/no-go on the whole bet)

Before any narrative-engine surface is built, a **measured study on real decks** must clear three
thresholds. This is the *first* step, not step-three-of-six:

1. **Quality:** a confirmed AI throughline/close is *worth hearing*, not boardroom pablum (a draft that
   names no slide-specific noun and no structure-first number is auto-rejected before a human sees it).
2. **Burden:** confirming a drafted talk is **materially faster** than writing it (median edit-distance
   below a threshold) — else "reduce the presenter's burden" is *inverted*.
3. **Safety-in-practice:** confirmers reliably **reject** plausible-but-wrong framings rather than
   rubber-stamping fluent ones.

If any fails, the modest version wins: Cadenza's read-along + captions ship (they already do, on their
own), and this bet is refuted on its own terms. The metric is **edit-distance-to-good on confirmed
slides**, never coverage (a fully-narrated deck of forgettable lines is a failure).

## 6. Hard prerequisites — all currently unbuilt (checker-verified)

The bet inherits three dependencies the review confirmed do not exist:

- **A structured-facts contract.** Charts emit generic `<title>Pie chart</title>`; engine-derived
  chart data-tables are **deferred** (`2026-07-04-accessible-descriptions.md`). Values live as scraped
  `data-*` attributes + source markdown, so grounding is **prompt-level only** today — meaning **the AI
  would currently hallucinate chart facts.** A machine-checkable facts object is a prerequisite for the
  highest-value (chart/data) slides.
- **A draft/confirmed store.** For `describe:`, "confirmed" = the string is in the deck source; an
  unconfirmed draft simply isn't. A deck-wide *drafted talk* needs a real unconfirmed-draft store with a
  confirmed flag per unit so playback/export can refuse it — an **open question even at one-field scale**
  in the `describe:` ADR.
- **A deck-wide cost posture.** "Draft the whole talk" is precisely the deck-wide generation the `describe:`
  work **deferred on cost** (~N× deck-size tokens on the *user's own* key — HARD RULE #24). Every draft
  action shows its estimated cost and respects the existing budget gate *before* spending; no auto-draft on
  load, no background regeneration.

**One AI kernel, not a fifth.** Five AI generators already exist (architect/component, theme, finish,
rehearsal-merge, `describe:`), all sharing `architectModel()` + a pure prompt/coerce module + the
`cloudBudgetBlock` gate. The narrative drafter is a **new pure module + prompt + one action** on that same
kernel — it must not fork a new one (HARD RULE #15).

## 7. The rhetoric DSL (authored + confirmed side only)

How the confirmed narrative is expressed/refined — a **sparse authoring surface over the AI draft**, built
to carry the **rhetorical moves** the canon prizes (not just element disposition): **throughline** (the
deck spine), **bridge** (Minto's inter-slide transition), **turn** (tension→resolution), **hold** (a
*rhetorical* silence — meaningful eyes-free, unlike the retired sighted `eye` beat), **close** (the
S.T.A.R./ask). Disposition verbs (READ/EXPLAIN/GLOSS/ANNOUNCE/SKIP) decide what to voice — **SKIP-biased
opt-in**; READ refuses verbatim bullet lists; ANNOUNCE must carry real orientation or degrade to SKIP.

The four-lens DSL rules hold (they make the trust *structural*): `register`/`confirmed` are **derived, not
author-written** (the fact/framing tiers come from which `notes-core` extractor produced the text + the
gate — the forbidden fusion is unrepresentable); rhetoric verbs never emit onto the objective `describe:`
alt channel AT consumes as fact; `spoken` is derived (Cadenza's `normalize.js`); `cadence` is typed/
relative, never authored raw ms; a `narrate:` override is a **consumed comment** cloned from `describe:`
(a raw comment is spoken aloud) — **no invisible postfix marker** (collides with the QR grammar + is the
per-element hand-authoring the narrative-step ADR §8.1 bans); anchoring reuses the narrative-step derived
structural identity (no per-element handle exists today). `NarrationPlan` is **compile output** the drafter
emits and Cadenza consumes — never hand-written, never persisted (the deck + confirmed narrative are the
source).

## 8. Honest ceilings — what this is not

- **Not a replacement for a skilled human delivering live to a specific room** — authentic voice, reading
  the audience, and Q&A stay human. This is a genuinely good talk *when no such human is present* (async,
  accessibility, driving, rehearsal reference).
- **Audio can't be lossless for every form** — GLOSS/SKIP concede it (a 2×2 *means* position; audio is
  serial-no-backtrack). The narrative names what it summarizes, never pretends completeness.
- **Facts are never invented; nothing speaks unconfirmed; framing is marked as claim, not fact** (§3–§4).
- **A live caption is a rehearsal mirror, not a teleprompter crutch** (fades as mastered).
- **Deskilling guard:** the confirmed narrative is authored *by* the human (editor-in-chief); the default
  flow builds delivery skill, it does not substitute for owning the argument.

## 9. Relationships

- **Consumes** `2026-07-07-cadenza-caption-timeline.md` — the timing/caption/delivery engine (Cadenza is a
  dependency of this bet, never the reverse; the import-boundary gate enforces it).
- **Generalizes** `2026-07-04-accessible-descriptions.md` — the author-owned/AI-accelerated/human-confirmed
  model, and reads its objective `describe:` channel as the non-suppressible factual floor (§3).
- **Reuses** the one AI kernel (`architect.ts` + `lib/layout/ai.js` / `lib/theme/ai.js` pattern + the
  budget gate) and the rehearsal planner's two-tier discipline (`drawing-board-rehearsal.js`) — as prior
  art, not foundation.

## 10. Adversarial review ledger

The vision was hardened across four rounds. Earliest rounds (a first critic, the full trio, a four-lens
DSL/expert pass) shaped Cadenza + the DSL and are recorded in the companion (`cadenza-caption-timeline.md`
§10) and above (§7). The **north-star trio** (red team + Munger inversion + independent checker on *this*
framing) produced the structure of this doc:

1. **The "so what" paradox** — the product's value (AI drafts the interpretation) is exactly what a single
   "structure-first, never source a claim" rule forbids; "human-confirmed" swapped a strong trust model for
   a weak one mid-argument. **Fixed:** two-tier trust named honestly (§3), with playback-time legibility +
   a non-suppressible factual floor so the eyes-free listener can tell fact from framing.
2. **Confirm-at-deck-scale is a rubber stamp** — the `describe:` model is safe only per-slide/objective/
   single-source; the AI's numbers being right hides a wrong framing. **Fixed:** per-claim confirm beside
   source figures; edit invalidates confirmation; no deck-wide pre-approval (§4).
3. **"A talk worth hearing" is unproven** — the expert lens's own predicted ceiling is "competent but
   forgettable." **Fixed:** the §5 study is a go/no-go GATE run first; `status: blocked` until it clears.
4. **Unbuilt machinery** — structured-facts contract (deferred → would hallucinate chart facts today),
   draft/confirmed store (open even at one-field scale), deck-wide cost (the `describe:` work deferred it).
   **Fixed:** named as hard prerequisites (§6).
5. **Scope explosion** — a clean caption library was buried under an AI ghostwriter. **Fixed:** the split —
   Cadenza ships alone (companion doc); this bet consumes it and is gated (§9).

Verdict: the vision survives; it is **de-risked, not diluted** — the clean engine ships now, the bet is
proven before it's built, and the safety story is honest about what a machine may claim to someone who
can't see the slide.
