# Editorial

The prose rules for writing the words on the slides. These are about
style and rhythm, not layout. The layouts in [skill.md](skill.md) tell
you where to put text. This file tells you how it should sound.

## Headers are complete sentences

Every H2 (`## ...`) is a complete declarative sentence. Not a noun phrase,
not a fragment, not a question.

```md
## The scoring policy is signed by the calibration loop.  ← yes
## Scoring-policy signing                                  ← no
## How does the scoring policy get signed?                ← no
```

The reason: a deck is read at speed. A reader scans the H2 to know what
the slide is *about*. A noun phrase makes them work. A complete sentence
delivers the slide's claim.

A complete sentence in the H2 also forces the writer to figure out what
the slide is actually saying. "Scoring-policy signing" doesn't commit
to anything. "The scoring policy is signed by the calibration loop" makes
a claim, and now the body has to support it.

## Speak-first writing

Every line of body prose should be readable aloud without stumbling. Read
each sentence as if presenting it. If you trip over a possessive cluster
or a polysyllabic pileup, rewrite.

Specifically avoid:

**Possessive stacking.** "The system's policy's enforcement mechanism's
configuration" is unreadable aloud. Restructure: "The system enforces
policy through a configurable mechanism." One possessive at a time.

**Polysyllabic pileups.** "Operationalizing implementation methodology"
is three abstractions deep with no concrete noun in sight. Find a
concrete noun. "Putting the implementation into practice" or "Day-to-day
use" — pick one.

**Nominalizations of verbs.** "Provide the validation" → "validate."
"Make the determination" → "decide." Strong verbs carry meaning faster
than verbs-of-existence-with-a-noun-after-them.

## Cadence variation between slides

A deck where every slide opens "We need to..." or every H2 is "How
[verb]ing X [verbs] Y" reads as monotone. Vary sentence length, varying
opening, vary verb choice deliberately across slides.

A useful pattern is **claim and deliver**. The H2 makes the claim. The
body delivers the support. Don't restate the claim in the body opening.

```md
## The Decision Log lives outside any single team's control.

Every scoring change and logged decision is appended to the Decision Log
itself, in a stream no team can rewrite. A team that scored the wrong
thing cannot quietly un-score it.
```

The body doesn't open with "The audit log is external because..." —
that would just paraphrase the H2. It opens by *delivering* on the
claim with the specific mechanism.

## Concrete nouns over abstract ones

When you have a choice, prefer the concrete noun.

- "The Decision Log" beats "the governance infrastructure"
- "Twelve weeks" beats "a meaningful timeline"
- "The calibration loop signs the scoring policy" beats "Authorization
  happens at the policy layer"

Concrete nouns are faster to read, easier to remember, and harder to
fake. Abstract nouns let the writer hide behind ambiguity. A deck that
trades abstract nouns for concrete ones tightens by 20-30% on average.

## Active voice, named actors

Most slide prose should be active voice with the actor named:

- "The SDK verifies the signature" beats "The signature is verified"
- "Procurement files the request" beats "A request is filed"

The exception is when the actor is genuinely irrelevant (passive: "The
scoring policy is signed before issuance" — fine if the next sentence
names who) or when the verb is the focus (passive: "The weights are
recalibrated on cadence" — emphasizes the recalibration, not the
recalibrator).

Named actors also make role-based prose work. "The signal owner manages
intake quality. The framework operator manages scoring policy. The
product team holds time-bound scoring profiles." Three sentences, three
actors, clear boundaries — the structure delivers the access-control
story without any extra explanation.

## Numbered lists, ordered or not

If the order of items matters (steps, phases, ranked priorities), use a
numbered list. If it doesn't, use bullets. Don't use numbers for visual
emphasis — readers read "1, 2, 3" as sequence.

Within a list, every item should be parallel in structure. If item 1 is
a verb phrase, item 2 should be a verb phrase. If item 1 is a noun
followed by a colon, every item follows the same pattern.

## Card titles

When using cards-grid, compare-prose, or similar layouts where
each card has a short title, the titles should be **noun phrases of
similar weight**. Not sentences (the H2 is the sentence). Not a mix of
noun phrases and verb phrases.

Good card title sets:

- "Layer 1 · Decision Log audit" / "Layer 2 · Calibration audit" / "Layer 3 · SDK local audit"
- "Strategic Bets" / "Quick Wins" / "Defer" / "Time Sinks"
- "What works" / "What requires tuning"

Bad card title sets:

- "Layer 1 · Decision Log audit" / "Validate the application" / "Bonus: SDK"

Parallel structure helps the reader scan the cards as a set.

## Eyebrows over preambles

Mono-uppercase eyebrows (`` `Context · Why this matters` `` as an inline-code
paragraph above the heading) carry positioning information without using a
sentence to do it. Use an eyebrow to say where the slide sits in the
argument. Don't open the body with "In this section we'll discuss..." —
the eyebrow already told the reader.

## Closing slide style

The closing slide gets one sentence. The H2 carries the action. The
body, if any, is a single italic line stating the next step or a
calling-back of the deck's central claim. Resist the temptation to
list bullet-point next steps; that's what a follow-up email is for.

## Specimen voice — per-component gallery copy

The generated per-component galleries speak the **specimen voice** (2026-07-05
Specimen Book decision): each slide demonstrates the component *by describing
it*, the way a type-specimen book shows a typeface by talking about itself.
The six long-running curated decks keep their narrative fiction — they
demonstrate real-deck usage, a different job. These rules bind `manifest.json`
`sample` / `variantDocs` / `stressDoc` content:

- **Elements demonstrate; captions teach.** Slide copy stays inside the
  component's `density` budget and *shows* the layout; the one-sentence
  didactic explanation lives in the caption channel (`variantDocs.caption`,
  `stressDoc.caption` — surfaced as the caption footer and the Explore
  caption). Never inflate element copy to teach — if the lesson doesn't fit
  the caption sentence, it belongs in `<name>.docs.md`.
- **The default sample's H2 states the component's job** as a complete
  declarative sentence. A variant sample's copy names what the variant
  changes. A stress sample's caption names the limit shown.
- **Axis defaults document the axis, not a re-render.** When a variant is a
  `variantAxes` entry's `default` (e.g. `map world`), its slide documents the
  axis and the toggle — explicit spelling, when to write it — never a copy of
  the Default slide.
- **Silent slides narrate in their copy.** `title`/`closing` (and other
  `silent` layouts) suppress footer chrome, so their caption footer never
  renders; their sample copy must self-identify, and the Explore caption
  carries the narration.
- **Interim rule for unmigrated components:** a `variantDocs` entry added to a
  component still carrying `voice` debt is short, honest, and budget-clean —
  the migration PR revoices it. Placeholder-shaped content (TBD/TODO/lorem)
  never passes the gallery-contract test.
- **Density integrity (blocked pattern):** `density` values come from
  `tools/calibrate-density.js` output only, calibration artifact committed
  alongside. Raising `density` in the same PR that adds the prose it excuses
  is barred — shorten the copy or move the component to `VOICE_EXEMPT` with a
  reason.

The mechanical gates live in `test/unit/components/gallery-contract.test.js`
(the named `VOICE_DEBT` / `VOICE_EXEMPT` ledger) and `validate()` (total
`variantDocs` coverage of `variants[]`).
