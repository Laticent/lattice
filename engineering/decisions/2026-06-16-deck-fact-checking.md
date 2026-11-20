---
status: superseded
superseded-by: 2026-11-19-bundle-legibility-and-slimming.md
summary: Design model for an LLM deck fact-check that returns an honest trust map with quick parametric and deep-research tiers
version: 1
supersedes: none
last-status-update: 2026-11-20
---

# Deck fact-checking — a two-tier "trust map" for a deck's factual claims

> **Withdrawn 2026-11-20, and its code deleted.** The owner decided to delete
> `lib/authoring/fact-check-core.js` and its test (decision D2 in
> `2026-11-19-bundle-legibility-and-slimming.md` §4, PR #3313). Why: the file was the
> deterministic first half of this design (#389 design, #395 code, both 2026-06-16), and the
> second half never came. No model verdict layer was built, and its planned home, the
> Drawing Board panel, was removed when the Studio replaced it (`2026-07-03-studio-succession.md`).
> Five months on, nothing but its own test called it, and no issue or followup tracked it. To
> bring the feature back, start from this note and restore the file from git: `git show
> c6852a28:lib/authoring/fact-check-core.js` is the first version, and the last one is in the
> parent of the commit that deleted it. The rest of this note is kept as written.

**Date:** 2026-06-16 · **Status:** design-decision; **deterministic floor
shipped** (`lib/authoring/fact-check-core.js`) · **Owner:** Sharmarke

> **Shape settled; the deterministic floor has landed, no user surface yet.**
> This note fixes the *shape* of the capability. The **floor** — claim
> extraction, verifiability triage, the provisional-freshness prior, and the
> `needs_deeper` derivation — now ships as the pure module
> `lib/authoring/fact-check-core.js` (§6.1–6.2). The model-driven verdict layer
> (§3 model fields), the Drawing Board panel (§6.3), and the maker–checker pair
> (§5) are still design-only. When this note and a shipped surface disagree, the
> shipped surface wins.

Related: `docs/src/playground/drawing-board-architect.js` (the Architect — the
review panel this extends), `docs/src/playground/architect-model.js` (the
`ArchitectModel` OpenRouter adapter — the model ladder and budget/cache gating
the checker rides on), `docs/src/playground/architect-fix.js` (the per-finding
model request + edit protocol), `lib/authoring/lint-core.js` /
`lib/authoring/review-core.js` (the pure, browser-safe slide walk that locates
findings — the claim *extractor* mirrors it), `lib/authoring/notes-core.js`
(the comment-extraction pattern a sidecar/inline metadata channel mirrors), and
the platform `deep-research` skill (the Tier-2 verification harness).

---

## The question

Decks make factual claims — market sizes, growth rates, "first to ship X",
attributed quotes, competitor figures — and a wrong number on a boardroom slide
is a credibility grenade. The brief: give authors an **LLM fact-check for
decks**, in two depths. A **quick check** that works from what the model
already knows (fast, yields a verdict + sources + a confidence score + the
*age* of the claim + whether it's worth digging further), and a **deep check**
(the existing deep-research harness) the author can escalate to on zero, some,
or all claims. Crucially: the quick check must **not** pretend to verify claims
it *cannot possibly* know — a private company's revenue, the author's own
internal metrics — while it *can* check Microsoft's revenue. And there should
be an option for **maker–checker** review by two *different* models considered
peers-or-better, so disagreement between them becomes a signal.

## The reframe: the product is an honest trust map, not a verdict

An LLM "fact-checking from memory" is *confidently wrong* often enough that a
bare ✓/✗ verdict is worse than nothing — it launders a hallucination into an
authoritative-looking checkmark. So the deliverable is **not** "is this true?"
It is a **trust map**: *here is what to trust, what is probably stale, what I
cannot possibly know, and what is worth paying to verify.* Every choice below
serves that reframe. The quick tier is **advisory** and labelled "from model
memory, not live sources"; only the deep tier (and only on the claims you
escalate) speaks with live-cited authority.

This mirrors the Architect's founding rule — *"the model NEVER owns
correctness; callers compute the deterministic answer and the model only
improves the phrasing"* (`architect-model.js`). Here the deterministic floor is
**claim extraction + verifiability triage** (no model needed to *locate* a
claim or decide it's an insider figure); the model owns only the verdict, and
even that is hedged by confidence, freshness, and cross-model agreement.

---

## §1 Verifiability triage — the "insider claim" gate (deterministic-first)

Before spending a single token *verifying*, every extracted proposition is
sorted into a **verifiability class**. This is the gate the brief asked for —
it stops us from treating Microsoft and a private startup the same way — and it
is cheap, because most of the signal is structural (whose number is this?
public filer? the author's own deck subject? a forecast year in the future?).

| Class | Example | Treatment |
|---|---|---|
| **External-verifiable** | "Microsoft FY24 revenue was $245B"; "the EU AI Act entered into force in 2024" | Verify — a public record exists |
| **Insider / unverifiable** | a private company's revenue; "our NPS is 72"; forward guidance; unpublished pilot results | **Do not verify.** Flag 🔒 *insider — only you can confirm this; attach your source.* No verdict, no fake confidence |
| **Forward-looking** | "the market reaches $X by 2030" | The future is unverifiable; verify the *forecast's source & methodology* instead, not the outcome |
| **Opinion / puffery** | "best-in-class", "industry-leading", "seamless" | Not a factual claim — route to **editorial** (`review-core`), not fact-check |

The win: research budget only ever lands on **external-verifiable** claims.
Insider claims get a *different* affordance — a prompt to attach the author's
own citation — rather than a verdict the model has no basis for. (Distinguishing
"public filer" from "private" is itself a small model judgement when structure
is ambiguous, but it's a *classification*, not a *verification*, and it fails
safe toward "insider — can't verify".)

## §2 Two confidences, because they drive different actions

The brief asked for a confidence score *and* freshness/age. Keep them as two
axes — collapsing them hides the most important case:

- **Verdict confidence** — how sure the model is the claim is true/false.
- **Staleness risk** — how likely the fact has *moved* since the model's
  knowledge cutoff (a current CEO, "the market leader", a revenue figure,
  anything dated "latest"). Carries an explicit "as of `<year>`".

The dangerous case is **high verdict-confidence + high staleness** — "Company X's
CEO is Y" (true at cutoff, changed last month). A single blended score buries it;
two axes surface it. **`needs_deeper` is then *derived*, not a third guess:**

```
needs_deeper  =  verdict_conf == null         // not yet verified (pre-model default)
              OR verdict_conf < τ            // not sure
              OR staleness_risk == high       // probably moved
              OR high_stakes_figure(claim)    // headline number on a money slide
              OR class == forward-looking      // only the source is checkable
              // …EXCEPT class ∈ {insider, opinion} → never (deep research can't help)
```

That derived flag is the **prioritiser**: it ranks which claims actually justify
Tier-2 spend, so the author isn't deep-researching 200 bullets to find the 4
that matter. Two classes are deliberately *never* escalated — `opinion` (nothing
factual to check) and `insider` (no external record exists, so web research is
pointless; it gets the "attach your source" affordance instead). The shipped
`needsDeeper` encodes exactly this, including the `verdict_conf == null` default
so an unverified external claim ranks for Tier-2 until the model speaks.

## §3 The per-claim record (the Tier-1 schema)

```jsonc
{
  "claim":          "Microsoft FY24 revenue was $245B",  // normalised proposition
  "location":       { "slide": 7, "line": 142 },          // from the deterministic walk
  "class":          "external",   // external | insider | forward | opinion
  "verdict":        "supported",  // supported | contradicted | unsupported | mixed | unverifiable
  "verdict_conf":   0.82,
  "staleness_risk": "med",        // low | med | high
  "as_of":          "2024",
  "sources":        [ { "label": "MSFT FY24 10-K", "live": false } ],  // memory, NOT live
  "needs_deeper":   { "flag": true, "reason": "headline figure on a money slide" },
  "suggested_fix":  null          // populated only when verdict == contradicted
}
```

**Shipped-record note:** the floor flattens `location` to top-level `slide` +
`line`, where `line` is the **source line text** (not a line number) — the exact
`{ slide, line }` shape `lint-core`/`review-core` findings already use and the
Architect already renders, so the panel maps a fact-check record to an editor
position identically to a lint finding. It also adds deterministic `basis`,
`component`, `kind`, and `high_stakes` fields. `staleness_risk` is filled by a
date-arithmetic **prior** (`provisionalStaleness`) until the model overwrites it
with a knowledge-based judgement — a surface must label it provisional, not a
verified assessment.

`sources[].live: false` is load-bearing: Tier-1 "sources" are the model's
recollection of where a fact comes from, **explicitly not retrieved**. The UI
renders them as muted "likely source" hints, never as citations. Only Tier-2
flips `live: true` with a fetched URL.

## §4 Quick → Deep escalation

- **Tier 1 — Quick (parametric).** One pass over the whole deck, near-instant,
  cheap. Triage (§1) + verdict + two confidences (§2) + the derived
  `needs_deeper` ranking. Advisory; never asserts "this is wrong" with
  authority.
- **Tier 2 — Deep (the `deep-research` harness).** The author selects **0..N
  flagged claims, or "the whole deck"**, and each selected claim runs through
  fan-out web search → fetch → adversarial verification → a live-cited result
  that **supersedes** its Tier-1 record (`live: true`, real URLs, a written
  rationale). Tier-1's ranking is what makes this affordable; the author spends
  the research budget where the trust map says it's warranted.

The escalation is **explicit and user-driven** — no auto-fire, matching the
Architect's "user clicks Fix" gate. Deep results merge back into the same
records, so the panel shows a uniform list where some rows are now
live-verified.

## §5 Maker–checker — two peers via OpenRouter (design-only for now)

We do **not** need a second provider. The Drawing Board already speaks
OpenRouter (`architect-model.js`: a model picker over the full catalogue with
live pricing, budget caps, and prompt-cache honesty). The maker–checker pair is
just **two different model ids from that one catalogue** — a *curated pairing*
of peers-or-better.

Two patterns; we choose **(a)**:

- **(a) Independent + reconcile (chosen).** Maker and checker each evaluate the
  same claims **blind** to each other, then we **diff the verdicts**. Agreement
  → high trust (shown as a small "2/2" concord badge); disagreement → the row is
  flagged for the human, *both* verdicts shown. This avoids the anchoring that
  plagues a critic who has already seen the maker's answer — exactly the failure
  we're trying to catch.
- (b) Maker-then-critic. The checker adversarially reviews the maker's record.
  Matches this repo's *code* maker-checker, but anchors on the maker's framing;
  rejected for facts.

**Curated pairing** = a small config-driven list of vetted peer-or-better model
pairs (so it evolves as the catalogue does, without code changes), plus a
guardrail that the two ids must differ and ideally come from different model
*families* (two snapshots of one base model agreeing tells you little). Cost is
roughly 2× a single pass, so the pair is **opt-in** and itself gated by the
existing budget cap. **Design-only in this ADR** — the contract and the
reconcile UX are specified here; wiring waits for a build decision.

## §6 Where it lives — Drawing Board panel first, on a reusable floor

Layered, so the headless core is shared and the UI is the first *surface*:

1. **Deterministic extractor** — **SHIPPED** (`lib/authoring/fact-check-core.js`,
   pure, browser-safe). Mirrors `lint-core`'s slide walk: split on `/^---$/m`,
   index to human 1-based slide numbers, walk each line (skipping front matter,
   code fences, directives, images), and pull **signal-gated** claims —
   conservatively, like `review-core`: a line is a candidate only if it carries a
   checkable signal (a statistic, a date/year, a ranking/superlative, or an
   attribution), plus every blockquote (a quotation is inherently checkable).
   Each claim carries `{ slide, line, component, kind, signals }` — the same
   `{ slide, line, … }` shape the Architect already renders. Locating a claim
   needs **no model**. *(Known floor limitation: a KPI display fragment like
   `73%` is extracted without its nested label — stitching nested number+label
   pairs is a deferred refinement.)*
2. **Triage + schema** — **SHIPPED** (same module). §1 verifiability triage
   (`triageClaim` → external | insider | forward | opinion, with a `basis`),
   `highStakesFigure`, the provisional-freshness prior (`extractAsOf` +
   `provisionalStaleness`), the §3 record factory (`makeRecord`), and the §2/§4
   `needsDeeper` derivation — all pure and unit-tested
   (`test/unit/authoring/fact-check-core.test.js`). The record's model-owned
   fields (`verdict`, `verdict_conf`, `sources`) stay null until the verifier
   layer fills them; `makeRecord(..., { overrides })` is the seam it writes
   through.
3. **First surface — a Drawing Board fact-check panel** *(design-only)*
   (`docs/src/playground/drawing-board-fact-check.js`, new), a sibling to the
   Architect. Claims list with per-row badges — ✓ supported · ⚠ stale · ✗
   contradicted · 🔒 insider · ? needs-research — each row click-to-escalate to
   Tier-2 and, when the pair is on, a 2/2 / split concord badge. It reuses the
   Architect's findings rendering, the `ArchitectModel` ladder, budget gating,
   and the `architect-fix` edit protocol for applying a `suggested_fix`. Per the
   3-breakpoint rule, the panel ships verified on desktop / tablet / mobile
   (icon-only badges on the small end).

A CLI (`lattice fact-check <deck>` → sidecar report, mirroring
`tools/lint-deck.js`) and a baked-in **annotated-PDF overlay** are natural later
surfaces on the same core, but the panel is the chosen first surface.

## §7 Metadata — where verified facts live

When a claim is verified (especially an insider claim where the author supplies
the source), the result should be *attachable* so it survives edits and travels
with the deck. Mirror `notes-core`'s comment channel with a sidecar fallback:

- **Inline directive** `<!-- _fact: { "claim": "...", "source": "...",
  "verified": "2026-06-16" } -->` — non-rendering, lives next to the slide,
  extracted exactly like speaker notes.
- **Sidecar** `deck.factcheck.json` — the full run (all records, model pair,
  budget spent), decoupled from the source for versioning and CI.

The inline directive is the *author's durable annotation*; the sidecar is the
*run artifact*. Neither ever auto-rewrites a number in the deck.

## §8 Guardrails (the trust map's integrity)

- **Never auto-edit a figure.** `suggested_fix` is a proposal through the
  existing edit-protocol diff; the human applies it.
- **Tier-1 is always labelled memory-not-live.** No checkmark without that
  caveat; no fake citations.
- **Insider claims get an affordance, not a verdict.** The model never assigns
  confidence to a number it cannot reach.
- **Disagreement is surfaced, not resolved.** When the pair splits, show both —
  the human adjudicates.
- **Fail safe toward "can't verify".** Ambiguous public/private → insider.

---

## What this ADR fixes vs. defers

**Fixed:** the trust-map reframe; the verifiability triage and the insider gate;
two-confidence model with a *derived* `needs_deeper`; the per-claim record;
quick→deep escalation semantics; maker–checker as **independent+reconcile over
two OpenRouter models**; the layered architecture with the **Drawing Board panel
as first surface**; the metadata channels; the honesty guardrails.

**Shipped (the deterministic floor, §6.1–6.2):** `lib/authoring/fact-check-core.js`
— signal-gated claim extraction, the four-class verifiability triage with the
insider fail-safe, the provisional-freshness prior, the §3 record factory, and
the `needsDeeper` derivation, all unit-tested. Headless; no user surface yet.

**Deferred (genuine forks for a build phase):** the model **verifier layer** that
fills `verdict`/`verdict_conf`/`sources` (and the Tier-2 `deep-research`
escalation); the `needs_deeper` threshold τ (defaulted to 0.7 in the floor) and a
richer "high-stakes figure" test; the curated peer-pair list and the
different-family rule; whether opinion/puffery is in-scope here or folded into
the Architect's editorial findings; exact budget-cap UX for the 2× pair; nested
number+label stitching in the extractor; and the Drawing Board panel / CLI /
annotated-PDF surfaces.

## Why this shape

It refuses the one thing that would make an LLM fact-checker actively harmful —
**authoritative-looking verdicts the model has no basis for** — and instead
spends its cleverness on *triage and prioritisation*, which is where the model
is reliable and the author's time is scarce. It reuses the deterministic-floor /
optional-model-on-top architecture the Drawing Board already proved, rides the
OpenRouter catalogue we already have for the peer pair, and escalates to the
deep-research harness we already ship — net-new surface area is one pure
extractor module and one panel, not a new model stack.
