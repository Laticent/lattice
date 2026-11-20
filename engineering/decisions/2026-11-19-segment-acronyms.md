---
status: shipped
summary: >
  The built-in pronunciation dictionary was tuned to one audience, the SaaS boardroom, and read about half
  of the acronyms the five exemplar segments write as raw letters. It now takes every acronym those segments
  write that has ONE meaning across all five, and never one with two. An ambiguous acronym is never guessed:
  `lint:deck` names its known meanings and the deck's `terms:` entry says which one it means. No segment key,
  no inference.
---

# Segment acronyms: one meaning or none (2026-11-19)

The owner's ask: support the common acronyms and initials of the user segments the exemplars stand for, and
**be deterministic; avoid ambiguity.**

## 1. What the census found

Every acronym, plural and code the 46 exemplar decks (`exemplars/<segment>/*.md`) narrate, checked against
`toSpoken` with the deck's own `terms:`. "Raw" means no rule matched and the voice guesses.

| Segment | Distinct tokens | Built-in covered (before → after) | Raw (before → after) |
|---|---|---|---|
| academic | 36 | 0 → 3 | 36 → 33 |
| corporate | 57 | 18 → 22 | 38 → 34 |
| general-team | 44 | 16 → 20 | 28 → 24 |
| government-public | 27 | 10 → 15 | 17 → 12 |
| nonprofit | 31 | 5 → 6 | 26 → 25 |

The table includes about 100 words a dotted-abbreviation pattern caught at a sentence end ("it."). Counting
only real acronyms, plurals and codes: **46 of 94 read raw before, 32 of 94 after.** Of the 32, 17 are
ambiguous (§3), about 10 read correctly as letters or as a word (AI, AWS, EU, QA, SQL, US, ZIP, iOS, GCP), and
the rest are names (GreenRoots, HEARTBEAT) or units. Only 1 of the 46 decks declares any `terms:`.

## 2. Decision: no segment key

A segment key (`segment: academic`) would load a pack so an ambiguous acronym gets its segment's meaning.
Measured, that settles about ten tokens, and it costs a new front-matter key and a second "what kind of deck
is this" system beside `profile:`. `profile:` cannot do the job: it sets the Coach's style bar (three values,
`lib/authoring/deck-profiles.js`), three of the five segments share its `general`, and tying speech to it would
make a style choice change how words are spoken. Inferring the segment from the deck is out too: profile
inference was tried and removed after it made 40 of the 46 decks it fired on worse.

## 3. The rule

- **One meaning across all five segments → always on**, exact case, in `lexicon.ts` `BASE_CASED`: GPA, AUC,
  CRM, QBR, VP, RFP, OIG, GIS, WCAG.
- **Two or more meanings in any segment → never expanded.** `lib/authoring/ambiguous-terms.js` lists each (beside the linter, so it never ships to the browser) with the
  readings we know (ERP: enterprise resource planning or event-related potential; CFR: Code of Federal
  Regulations or case fatality rate; EDI, MTTR, JV, CNA, BMI, BI, CI, CS, AP, AF, AA, TA, PO, CAC, LTV, and the
  older CRO, CMO, IP, AR, PM, US, IT). `lint:deck` reports one it finds unregistered as
  `narration-acronym-ambiguous`, naming the readings, and the deck's `terms:` entry decides.
- **One meaning but no one spoken form → treated as ambiguous.** `FTE` is used as its own plural after
  a number ("250 FTE"), so "full-time equivalent" reads wrong there; the deck says which form it wants.
- **A plural that adding `s` gets wrong is stated, not derived**: `lexicon.ts` `HOUSE_PLURALS` (RFPs →
  "requests for proposal").

Adding an acronym is a data edit: check it against all five segments, then put it in one list or the other.

## 4. What else shipped with it

The same change fixed the ways the dictionary was applied (`2026-11-16-terms-registry.md` §6, "2026-11-19"):
built-in terms take plurals, possessives and compounds; an abbreviation's period is not spoken as a stop;
the one-meaning dotted abbreviations (e.g., i.e., etc., vs., approx., a.m., p.m., Ph.D.) and capitals joined by
periods (U.S.) read; a deck's dotted phrase term is never cut into two cues.

**The letter A is never handed to the voice as a lone word.** The owner heard "10 a.m." read "ten uh em"
on the export. Kokoro phonemizes the text between each pair of punctuation marks on its own (its chunking
regex in `kokoro-js`), and its phonemizer (espeak, the npm `phonemizer` package) reads a spaced `A` before
another word as the article: `A M` → `ɐ ˈɛm`, `U A E` → `jˈuː ɐ ˈiː`, `B A now` → `bˈiː ɐ nˈaʊ`. Measured
through that same chunking:

| Form | Mid-sentence | Before a word | Alone between commas |
|---|---|---|---|
| spaced `U A E`, `B A` | `ɐ` (wrong) | `ɐ` (wrong) | `ˈeɪ` |
| joined `UAE`, `BA` | `ˌeɪˈiː` | `bˌiːˈeɪ` | `jˈuːiː`, `bˈɑː` (wrong: "bah") |
| hyphen after it, `U A- E`, `B A-` | `ˈeɪ ˈiː` | `bˈiː ˈeɪ` | `ˈeɪ ˈiː`, `bˈiː ˈeɪ` |

So `normalize.ts` (`spellLetters`) writes each spelled `A` as `A-` and keeps the letters spaced, which also
keeps one syllable per letter for caption timing (`syllableCount`; a joined `UAE` counted as one). The clock
reads `A-M` / `P-M` (`ˈeɪˈɛm` in every position): the dotted forms are lexicon keys, and an undotted `am` /
`pm` reads as the clock only right after an hour, which may open a bracket or end a range (`(10 AM)`,
`9–10 AM`; `afterNumber`). Bare `AM` is not used: espeak reads "ten AM" in a short chunk as the verb `æm`.
A first version joined runs with an A; an independent check found it read "bah, mah" in a list and broke
caption timing, and this replaced it. Other voices (Gemini, the browser's speech) are not measured on
these forms. Pinned by `docs/src/lib/cadenza/letter-names.test.ts`.
