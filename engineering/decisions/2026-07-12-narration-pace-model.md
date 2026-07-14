---
status: in-progress
summary: A prosody-grounded replacement for read-aloud's crude timing estimate (flat 145 wpm × character length + fixed punctuation pauses). A deep-research pass into the speech-science literature grounds a deterministic model in published norms — ~200 ms/syllable word duration (not character length), a boundary-graded pause table (comma ~200 / clause ~350 / sentence ~550 / paragraph ~1000 ms), phrase-final lengthening (~+30 ms on the pre-boundary syllable), and an asymmetric audio↔highlight sync budget from broadcast lip-sync standards (highlight may lead the voice ~125 ms but should lag ≤45 ms, so bias it slightly ahead). Unifies the three ad-hoc timing sources (silent estimate, caption positions, audio breath) into one cadence.ts model; structured so a later thread can CALIBRATE it per-voice against the measured TTS onsets the diagnostics overlay already captures (the "genetic/ML" path). Implemented in #944; the adversarial-trio review then added an anti-click clip-fade envelope and fixed a contraction/initialism syllable miscount.
companion:
  - ./2026-07-11-manifest-speech-contract.md
  - ./2026-07-09-cadenza-narration-quality.md
  - ./2026-07-07-cadenza-caption-timeline.md
---

# A prosody-grounded narration pace & sync model

**Status:** ACCEPTED + implemented (research → grounded design → confirmed → built)
**Thread:** read-aloud narration quality (follows `2026-07-11-manifest-speech-contract.md`)
**Branch/PR:** `claude/read-aloud-skip-rush-regression-ha22xs` → #944

**Confirmed decisions (2026-07-12):** default rate **150 wpm** (tunable by the speed pref);
**bias the highlight ~+40 ms ahead** of the voice (asymmetric sync tolerance); ship the
**syllable heuristic** (not a pronunciation dictionary). All three implemented as below.

## Problem

Read-aloud timing rides ONE crude estimate — a flat **145 wpm × character-length weight**
per word plus a **fixed punctuation-pause table** (`cadence.ts`). That single estimate drives
three things at once: the silent read-along clock, the caption word positions before the audio
re-anchors them, and (now) the inter-sentence audio "breath." So when it's wrong, everything
feels wrong: narration reads too fast, the breath read too long, and word-highlight sync drifts.

The ask (from the reporter): *"a full understanding of human pace, synced with the caption."*
This doc grounds a replacement model in the speech-science literature (a deep-research pass),
then names the concrete `cadenza` changes. Decision on the ambitious layer was **heuristics now,
grounded by research** — a deterministic, testable model, not an ML/genetic optimizer (that
becomes possible later, once we calibrate against measured TTS onsets — see §Calibration).

## What the research says (grounded numbers)

Quantitative norms, US English, clear read-aloud / presentation register. Values are ranges;
sources flagged where contested or rate-dependent.

**1. Speech rate.** Oral reading averages **~183 wpm** (meta-analysis, 77 studies / 5,965
participants — Brysbaert 2019). Deliberate presentation is slower, **~100–150 wpm**; conversation
~120–150; audiobook narration ~150–160. English averages **~1.4–1.5 syllables/word**, so ~183 wpm
≈ **~4.5 syllables/sec ≈ ~215 ms/syllable**. → A clear-narration default of **~150 wpm** (deliberate)
to ~183 (natural) is right; **~200 ms per syllable** is the per-unit anchor.

**2. Word duration.** Duration scales with **syllable count**, not character count — a phoneme
averages **~100 ms** (range 80–120), a syllable **~200–300 ms**. The Klatt (1979) rule model
(per-phoneme inherent + minimum duration, then % shortening) is still the standard reference. →
Replace the char-length weight with a **syllable-count model** (~200 ms/syllable, scaled by the
rate pref), which is both more accurate and cheap to estimate from text.

**3. Pauses, graded by boundary depth.** Read speech uses **short** pauses: **130–250 ms** is the
typical *read-speech* pause range; comma ≈ a "short pause," period ≈ a "longer pause"; sentence
boundaries in spontaneous speech exceed 750 ms 65% of the time but are **shorter in read speech**.
TTS convention inserts a **roughly-doubling ladder** (0.15 / 0.3 / 0.6 / 1.2 s) by punctuation
strength. Synthesizing to a graded table for *read/presentation*:
  - comma / minor intra-sentence: **~180–250 ms**
  - clause / semicolon / colon: **~300–400 ms**
  - sentence (`. ? !`): **~500–700 ms**
  - paragraph / topic shift: **~900–1200 ms**

**4. Phrase-final lengthening.** The syllable before a boundary lengthens — Klatt: phrase-final
vowels are **~40 ms longer** on average; stronger boundary → more lengthening (roughly **+20–40%**
on the final syllable). This matters because the last word of a cue *ends later* than a flat
estimate says, which is exactly where a highlight tends to run ahead.

**5. Audio↔highlight sync tolerance (the key sync finding).** Broadcast lip-sync standards give a
hard, **asymmetric** budget (ITU-R BT.1359; EBU R37): errors are imperceptible when **audio leads
video by ≤ ~45 ms** or **lags by ≤ ~125 ms**; acceptable to **+90 / −185 ms**; careful viewers
notice from **~20–40 ms**. Mapping to read-along (highlight = "video/visual", voice = "audio"):
a **highlight slightly AHEAD of the voice is far more forgivable** (up to ~125 ms) **than a
highlight LAGGING** the voice (only ~45 ms). → Design target: keep the highlight within **≈ −40 ms
to +80 ms** of the heard word, and **bias slightly ahead** when in doubt; a lagging highlight is
the error to avoid. (This also retro-justifies the existing "hold at 0 until the first onset"
and the anti-race work — a lagging highlight was never the risk; a racing/ahead one was, but a
*little* ahead is fine.)

## The model (one source of truth)

Make `cadence.ts` the single pace model that feeds all three consumers:

- **`estimateWordMs(spoken)`** → `SYLLABLE_MS(pace) × syllableCount(spoken)` (pure per-syllable, no
  per-word constant — a word's floor of one syllable already covers the shortest words), where
  `SYLLABLE_MS ≈ 200 ms` at the default pace and steps by the speed pref; `syllableCount` is a
  lightweight vowel-group heuristic (count vowel runs, −1 for common silent-e, floor 1) with two
  extra rules: (a) a **vowelless ALL-CAPS token is an initialism the voice spells out** ("PDF" → 3,
  "HTML" → 4), while a lowercase vowelless token ("hmm", "nth") stays one beat — case is the signal;
  (b) **apostrophes are folded before splitting** so a contraction stays one token ("I'll" → 1), not
  a vowelless remnant the initialism rule would over-count. Drop the character-length weight.
- **`PAUSE_MS` → a graded boundary table** keyed by boundary *type*, not raw glyph: comma 200,
  semicolon/colon 350, sentence 550, ellipsis 650, paragraph 1000 (from §3). Punctuation maps to a
  boundary type; a colon in a `label: value` is a clause boundary (its spoken form is already a
  comma from the #940 fix, so it lands as ~comma/clause).
- **Phrase-final lengthening**: any word that sits *before a boundary* (it carries trailing
  punctuation → a non-zero pause) gets **+FINAL_LENGTHEN_MS (~30 ms)** (§4). Lengthening happens at
  every prosodic boundary — comma, clause, sentence — not only the cue's last word, which is what
  §4 actually describes (stronger boundary → more lengthening); we apply a flat bump rather than
  grading it by boundary strength, a deliberate simplification calibration can refine later. The
  effect: the pre-boundary word ends a beat later, so the highlight holds instead of running past it.
- **The audio "breath"** (`voice-model.js` `SENTENCE_PAUSE_MS`) mirrors the same graded shape at a
  **0.3 discount** — the fraction left after the TTS clip's own trailing silence — so it stays
  smaller than the estimate gap (race-safe, per the #940 analysis). It is a **deliberate second
  copy, not one shared table**: `voice-model.js` is node-loadable with no TS import (its header), so
  it structurally cannot import `cadence.ts`'s `PAUSE_MS`; the two are kept in step by hand. A
  cross-file test (`cadence.test.ts`) now pins `SENTENCE_PAUSE_MS[k] ≤ pauseAfter(k)` for every key
  so the copies can't silently drift. This replaces the earlier interim hand-tuned values.
- **Sync bias** (`read-aloud.ts` tick / `cursor.align`): apply an intentional small **lead bias**
  (~30–50 ms, within the tolerance budget) so the highlight sits on-or-slightly-ahead of the voice
  rather than lagging (§5). The measured-onset re-anchoring stays; this just tunes the offset sign.

## Calibration hook (makes the "genetic/ML" path real later)

We already measure **real onset + duration per sentence** from the clocked voices (`onSentenceTiming`,
surfaced in the new diagnostics overlay). That's a fitness signal. A later thread can fit
`SYLL_MS` / the pause table **per voice** by regressing the model against measured onsets, or flag
"hard to say" captions where TTS diverges wildly from the model (feeding the Layer-2 rewriter).
Not in this slice — but the model is structured so calibration is a coefficient swap, not a rewrite.

## Files this touches

- `docs/src/lib/cadenza/cadence.ts` — syllable-based `estimateWordMs`, graded `PAUSE_MS` by
  boundary type, phrase-final lengthening, a `syllableCount` helper. (+ unit tests)
- `docs/src/lib/cadenza/track.ts` — apply final lengthening at cue ends; map punctuation → boundary.
- `docs/src/playground/voice-model.js` — the breath table (`SENTENCE_PAUSE_MS`, graded × 0.3, now
  module-scoped + exported so a test can pin the race-safety ratio); a **short head/tail gain-ramp
  fade** on each clip so a hard buffer edge can't click at a sentence boundary.
- `docs/src/components/studio/read-aloud.ts` — the small sync lead-bias in the tick clock.
- Regenerate `@slidewright/cadenza` + `read-along-core` bundles. Audio-path + silent-estimate change;
  **`.vtt` display bytes unchanged** (timings shift, but the `.vtt` word timestamps are derived from
  this estimate — so `.vtt` *timestamps* DO change; caption TEXT does not). Flag for export sign-off.

## Decisions (confirmed 2026-07-12)

1. **Default rate:** **150 wpm** (deliberate/boardroom), tunable by the existing speed pref.
2. **Sync bias:** highlight biased **~+40 ms ahead** of the voice, per the asymmetric tolerance.
3. **Heuristic, not a dictionary:** the syllable heuristic is ~85% accurate (English is irregular) —
   acceptable for timing (an off-by-one syllable is tens of ms); calibration later tightens it.

## What actually reaches a CLOCKED voice (honest scope)

The reporter uses cloud Kokoro (`hexgrad/kokoro-82m`, the `openrouter-tts` *clocked* rung). For a
clocked voice, `cursor.align()` re-anchors every cue to the **measured** onset + clip duration and
rescales the cue's words to fit — so the model's **absolute** per-syllable pace and its
**sentence-boundary** `PAUSE_MS` are largely washed out (the measured audio governs those). What
this PR actually changes for that voice is: (a) **relative word distribution *within* a sentence**
(the syllable model spaces the highlight across a cue far better than char-length did — this is the
real fix for "the highlight skips/rushes mid-sentence"); (b) the **inter-sentence breath**
(`SENTENCE_PAUSE_MS`, shorter now); (c) the **+40 ms highlight lead**; and (d) the **anti-click
clip-fade**. The full syllable + graded-pause model still governs the **silent** read-along (no
audio to re-anchor against). This scoping is why the win is real but narrower than "we rebuilt the
pace model" implies — and it's the same reason per-voice calibration (below) is the bigger lever.

## Known limitations (logged, not fixed here)

- **Non-English digit runs over-count — WON'T FIX (2026-07-14).** For `lang≠en`, `toSpoken` leaves
  numbers un-expanded (the `#919` "don't anglicize a non-English deck" guard, since our expander is
  US-English only), so `syllableCount`'s digit-run branch counts ~1 syllable/digit ("100" → 3, vs
  German "hundert" → 2). Only affects the silent estimate + `.vtt` timings on a non-English deck (the
  clocked voice re-anchors regardless). **We are not building a per-language number syllabifier.** The
  `lang≠en` path guards a workflow we don't have — English decks are authored and read in English,
  where numbers expand correctly. The right home for reading numbers in another language is a future
  **language lens** (translate the deck → a native TTS voice reads it): there the numbers are already
  target-language words / numerals the native voice expands itself, so our English estimator was never
  the layer estimating them. Teaching it to count German syllables now would be building the wrong
  layer and throwaway once a lens exists. The `#919` guard stays (it's a correct, harmless default);
  the over-count is an accepted, inert side effect. Position confirmed with the maintainer.
- **The +40 ms lead releases the last word ~40 ms early.** At a cue's final word the biased clock
  reaches the word's end slightly before the audio does, so the highlight lets go a hair early. It's
  the deliberate asymmetric-tolerance trade (a lagging highlight is worse); revisit if on-device
  review finds it distracting.

## Sources

- Brysbaert, *How many words do we read per minute? A meta-analysis of reading rate* — https://www.sciencedirect.com/science/article/abs/pii/S0749596X19300786
- Average speaking rate (presentation/conversation WPM) — https://virtualspeech.com/blog/average-speaking-rate-words-per-minute
- Klatt phoneme duration model (params) — https://informatica.vu.lt/journal/INFORMATICA/article/814/file/pdf
- Prosodic planning: phrasal length/complexity on pause duration — https://pmc.ncbi.nlm.nih.gov/articles/PMC2131696/
- Virtual & real pauses at clause vs sentence boundaries (Volskaya, ICPhS 2003) — https://www.internationalphoneticassociation.org/icphs-proceedings/ICPhS2003/papers/p15_0499.pdf
- Paragraph-based prosodic cues for speech synthesis (CSTR, Farrús 2016) — https://www.cstr.ed.ac.uk/downloads/publications/2016/farrus2016para.pdf
- Phrase-final lengthening (multi-target, American English) — https://sciencedirect.com/science/article/abs/pii/S0095447006000659
- TTS punctuation pause ladder (0.15/0.3/0.6/1.2 s) — https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.778018/xml
- Audio-to-video sync tolerance (ITU-R BT.1359 / EBU R37) — https://en.wikipedia.org/wiki/Audio-to-video_synchronization
