---
status: proposed
summary: >
  A measured audit of every narration surface, run through the real export. Three
  findings. (1) Narration quality splits on ONE fact — where a component keeps its
  substance. HTML substance narrates almost completely (0.80-1.07 of source characters);
  SVG substance narrates the heading and stops (0.09-0.28), because the speech walker
  skips the picture and only six chart narrators exist to replace it. Measured across all
  70 components. (2) Cadenza's token layer is strong, and one already-written function is
  on the wrong side of it: `edgeTrim` peels wrapping punctuation for the LINT but not the
  RUNTIME, so `($4.2M)`, `"ARR"`, `[CEO]` and `(12)` skip every rule the library has while
  the lint reports the deck clean. (3) The reported English-then-another-language symptom
  reproduces twice from OUR code against the real shipped voice module, and nothing in the
  tree pins a language at all. Also: zero of 70 manifests carry a narration hint and the
  schema has no field for one; four of six chart narrators never fire on their own
  component's canonical sample.
companion:
  - ./2026-07-11-manifest-speech-contract.md
  - ./2026-07-09-cadenza-narration-quality.md
  - ./2026-09-06-narration-emphasis-weight.md
---

# What narration actually says — a measured audit (2026-09-20)

**The short version.** The engine narrates prose beautifully and charts barely at all,
and the dividing line is not the bucket a component sits in — it is whether the
component keeps its numbers in HTML or in an `<svg>`. Everything the speech walker can
reach, it reads well: tables become "A label — Holds: one cell per column", checklists
become "Keep each line under ten words: done", a matrix reads row by row with its
column names attached. Everything inside a picture is silent. A bar chart says
*"Revenue · FY26. Growth is concentrated in two regions."* and stops — the four regions
and their four values never reach the voice.

This is not a claim about how it sounds. It is a claim about the bytes, measured by
running the shipped CLI.

## How this was measured

One deck holding all 70 components' own canonical `sample` slides, rendered through
`node dist/lattice-emulator.js <deck>.md --captions`, then each per-slide `.vtt`
stripped of cue timings and compared against the source slide's character count. The
ratio is crude on purpose — it is not a quality score, it is a *coverage* signal, and
it separates the two populations cleanly with nothing in between.

Artifacts: 70 `.vtt` sidecars, the gallery deck's 116, and a direct probe of
`slideToSpeech`, `narrateChart` and `buildTrack`. Every number below is reproducible
from a clean checkout.

**Not verified:** how any of it SOUNDS. There is no TTS in the sandbox, so every claim
here is about the spoken STRING, never the audio (HARD RULE #23). The one claim that
needs a human ear — whether the segmentation gaps below are audible — is marked
UNVERIFIED and stays that way until someone listens.

## Finding 1 — the narration cliff

Spoken characters as a fraction of source characters, all 70 components, real export:

| tier | ratio | components |
|---|---|---|
| **silent substance** | 0.09–0.28 | line · gantt · scene · quadrant · map · radar · timeline-list · slope · code · word-cloud · piechart · stacked-bar · progress · heatmap · waterfall · contact · kanban · bullet · bar |
| middle | 0.32–0.79 | compare-code · scatter · state-chart · logo-wall · wifi · stats · video · divider · closing · team-profile · kpi · journey · quote · big-number |
| **full substance** | 0.80–1.07 | list-criteria · list-tabular · list-steps · q-and-a · image · cards-stack · title · cards-grid · compare-table · statute-stack · regulatory-update · verdict-grid · inventory · policy-recommendation · actors · redline · compare-prose · split-panel · agenda · authority-chain · cycle · decision · diagram · content · list · premise · math · citation-card · checklist · roadmap · pricing · glossary · obligation-matrix · matrix-grid |
| computes more than it reads | 1.81 | **funnel** |

The bottom tier is almost exactly the set of components that draw an SVG. Their data
is in the picture, `SPEECH_SKIP_SELECTOR` and the media branch skip the picture, and
nothing replaces it.

**The proof that this is fixable, not inherent** — two components from the same bucket
with the same data shape, one with a narrator and one without:

```
funnel  (narrator at chart-narration.js:337)
  "The funnel narrows; the width is the story. Visitors: twelve thousand.
   Signups: four thousand eight hundred, forty percent of the prior stage.
   Activated: two thousand one hundred sixty, forty-five percent of the prior stage…"

bar     (no narrator)
  "Revenue · FY26. Growth is concentrated in two regions."
```

The funnel narrator does not merely read the numbers — it computes the stage-over-stage
conversion the slide draws but never states. That is the 10/10 bar, it already exists,
and it is wired to exactly one chart.

## Finding 2 — the manifests carry no narration hints, and the hints that exist are hardcoded

Zero of 70 manifests carry a narration, speech, spoken, or read-aloud field, and
`manifest.schema.json` (45 properties, `additionalProperties: false`) has nowhere to put
one. The five `caption` hits in manifests are SLOT names for rendered on-slide text, not
narration.

Component-specific narration knowledge does exist. It lives in two places, as hardcoded
name lists:

- `lib/transformers/prose-projection.mjs:1245-1257` — five name branches (`kpi`, `stats`,
  `big-number`, `quote`, `team-profile`), plus a `MEDIA_COMPONENTS` branch whose body is
  byte-identical to the `else` beside it, so it documents an intention it does not
  implement.
- `lib/transformers/prose-projection.mjs:902-907` — `WORD_MAPS`, the state-marker
  vocabulary, for four components (`checklist`, `verdict-grid`, `pricing`,
  `obligation-matrix`). This is the best narration work in the tree: it knows that
  `[ ]` means "to do" on a checklist and "exempt" on an obligation matrix, a near-antonym.
- `lib/core/chart-narration.js:2659` — six narrators, gated on the `_class:` token.

So narration knows about roughly 15 component names out of 70, spread across two files,
none of it declared by the component itself. A new component gets nothing, is told
nothing, and no gate notices. Four of 71 component `.docs.md` files mention narration at
all.

**This does not automatically mean "add a `speech` field to 70 manifests."**
`2026-07-11-manifest-speech-contract.md` considered exactly that and killed it, after two
adversarial rounds, on a good argument: a per-component speech block copies each
transform's grammar into JSON across the CJS/ESM wall and re-opens a drift class 56 times
over. That argument still holds for *grammar*. It does not obviously hold for the small
declarative facts `WORD_MAPS` already encodes, which are data, do not restate a grammar,
and are today hardcoded rather than absent. The fork is live; §Recommendations frames it.

## Finding 3 — Cadenza: the token layer is strong, and one already-written function is on the wrong side

Measured on a hostile boardroom corpus through the shipped `dist/index.cjs`. All 187
Cadenza unit tests pass and `cadenza-lib:check` confirms `dist/` is current, so **none of
what follows is caught by the existing suite.**

What works, and works well — `$4.2M` → "four point two million dollars", `+9%` → "up nine
percent", `−18d` (U+2212) → "down eighteen days", `4.2×` → "four point two times",
`§1798.140(o)` → "section one thousand seven hundred ninety-eight point one four zero,
subsection o", `Q3'26`, `FY26`, `H1`, `R&D`, `P&L`, `€1.2M`, `£800k`, `1,234,567`, `≥5`,
`≈`, `±3%`. Emoji are silenced. `yearWords` gets the leading-zero trap right (`05` → "oh
five"). `calibrate.ts` is the best-defended module in the library. Decks override any of
it with front-matter `lexicon:` and `acronyms:`. This part is good and I would not touch it.

### The one that matters most: wrapping punctuation disables the whole normalizer

`toSpoken` peels a TRAILING `[.,!?;:…]` and nothing else. A leading glyph is never peeled,
so any wrapped token skips every rule the library has:

```
$4.2M  → four point two million dollars     ($4.2M)  → ($4.2M)
ARR    → annual recurring revenue           "ARR"    → "ARR"
CEO    → chief executive officer            [CEO]    → [CEO]
§5     → section five                       (§5)     → (§5)
12     → twelve                             (12)     → (12)
+9%    → up nine percent                    (+9%)    → (+9%)
```

**The fix is already in the file.** `edgeTrim` (`normalize.ts:431-437`) does exactly this
peel — and it is called only by `unmatchedAcronyms`, the LINT's discovery signal. So the
lint trims the token, finds it resolvable, and reports nothing; the runtime does not trim
it and hands the glyphs to the voice. The author is told the deck is clean about precisely
the tokens that will break. `tools/lint-deck.js:96-102` strips only front matter and code
fences, so parentheses and quotes reach the lint intact and the skew is live.

That single root cause explains the accounting-negative case too: `(12)` is not a missing
rule, it is this bug — and it still means a deck says "twelve" where the slide shows a
negative twelve.

### "up +18%" narrates as "up up eighteen percent"

`normalize.ts:322-331` reads a leading sign as a direction word, with no left context. The
most common phrasing in a commercial deck already carries the direction:

```
"We are up +18% YoY."           → "We are up up eighteen percent year over year."
"Churn is down -9% this quarter." → "Churn is down down nine percent this quarter."
```

### Values the voice never gets, or gets wrong

| class | measured |
|---|---|
| ranges | `$1.2–1.4B`, `50-60%`, `2-3x`, `Q1-Q3` → raw. `$4.2M` alone works, so the range breaks an otherwise-correct match |
| dates / times | `2026-09-20`, `9/20`, `12:30`, `Sept. 20` → raw |
| magnitudes | `bn`, `MM`, `pp`, `p95`, `240ms`, `k` → raw. `MAGNITUDE` carries only single letters `k/m/b/t`, so `$4.2bn` — the standard finance spelling — is unhandled |
| ordinals, decades | `1st`, `2nd`, `1990s`, `#1`, `3.5/5` → raw |
| identifiers | `v2.1`, `ID-4471`, `A/B`, `P/E`, `24/7` → raw |
| latin abbreviations | `e.g.`, `i.e.`, `vs.`, `Inc.`, `No.`, `etc.` → raw |
| **singular money** | `$1` → "one **dollars**"; `£1` → "one pounds". `unitWords` gets agreement right for `1pp`, `1d`, `1bps` — money is the one value path that skips it |
| **very large integers** | `1000000000000000` → "**oneundefined**". `SCALES` has five entries and `SCALES[5]` is string-concatenated |
| **very small numbers** | `0.0000001` → `""`. "Rate is 0.0000001 today." narrates as "Rate is  today." — the caption shows the number and the voice silently omits it |
| glyph inconsistency | `✓` raw · `✔` silenced · `☑` silenced · `☒` raw — visually interchangeable, three different reads, because the split follows Unicode's `Extended_Pictographic` rather than a decision |
| `1x` vs `1×` | "one time" vs "one times". `resolveSymbols` rewrites `×` before the multiplier rule sees it, so that rule's `×` arm is dead code |
| units | `40°C` → "forty degrees C" |

### Timing, not just words

A raw passthrough is also a **timing** error, because `track.ts:176` prices the word from
its spoken string. `Inc.` and `(API)` are under-timed by 80%, `$4.2bn` by 71%, `>50%` by
67%; `12:30` is over-timed by 33%. The hybrid re-anchor does not rescue it —
`cursor.align` scales words proportionally, so a correct cue onset still distributes them
by the wrong internal ratios. The silent read-along, a shipped accessibility surface, has
no re-anchor at all, so the error is uncorrected end to end.

### Three ways to break the timeline through the public API

`cursor.align()` has no ordering and no finiteness precondition, while `calibrate.observe`
guards the same value from the same callback:

- **Out of order** — anchoring cue 1 before cue 0 breaks the sort `cursor.at()`
  binary-searches, and `at()` then returns `null` at *every* probe. The highlight goes
  permanently dark, with no exception and no recovery. Reachable in-app is PLAUSIBLE, not
  confirmed: `read-aloud.ts:797` preserves order today, so the safety lives entirely in
  the consumer.
- **`NaN` duration** — `Math.max(0, NaN)` is `NaN`. The highlight dies, `onEnd` never
  fires (`x >= NaN` is always false, so the read hangs), and `toVtt` emits
  `00:00:00.000 --> NaN:NaN:NaN.NaN` — **a structurally invalid caption file shipped to a
  viewer.**
- **Zero duration** — reachable: `suono/stage.ts:291` computes
  `(buffer.duration || 0) * 1000`, so a failed decode yields 0. The cue collapses to a
  point and drags every later cue backwards.

### Sentence segmentation splits on abbreviation periods

Not a lexicon gap — `segment.ts:10-11` documents it as a deliberate tradeoff
("over-splitting an abbreviation costs a tiny extra gap, never a correctness bug").
**That justification is now false**, because `read-aloud.ts:684` synthesizes one TTS clip
per cue. Measured:

```
"Dr. Chen approved it."  → ["Dr.", "Chen approved it."]
   clip 0 spoken="Dr." span=[0,620], 165ms gap, clip 1 "Chen approved it."
"The U.S. market is flat. Europe grew."
                         → ["The U.S.", "market is flat.", "Europe grew."]
"Cal. Civ. Code §1798.140(o) is the definition."
                         → ["Cal.", "Civ.", "Code §1798.140(o) is the definition."]
```

So the voice says "Doctor." — full stop, dead air — then "Chen approved it." A cue is a
caption LINE, the re-anchor unit, and one clip, so an over-split costs a caption line, a
synthesis round-trip and an inserted silence each time. It is in shipped bytes:
`gallery.vtt` carries `Cal.` and `Civ.` as standalone cues. Whether the silences are
audibly wrong is UNVERIFIED. The mirror defect under-splits: a terminator followed by a
closing quote never breaks, so quoted dialogue becomes one run-on clip.

### What the library cannot express at all

Per-cue language (it is deck-level and binary English/not-English, so one French client
name either anglicizes or disables the normalizer for the deck); say-as disambiguation
(spell `IPO` vs say `NASA` — encoded today by spacing letters inside a data string);
number reading modes (year vs quantity vs id vs version vs ordinal — designed in
`2026-07-11-manifest-speech-contract.md:224`, never built); phoneme pronunciation (the
`lexicon` takes a respelling, while Kokoro's `misaki` front end accepts inline IPA, which
is a real in-reach win); prosody in the output (emphasis resolves to a scalar spent as
trailing silence — a bolded phrase buys a pause and zero vocal stress); speaker switching;
an author-placed beat; and a `validateTrack()` that would have caught every timeline
defect above before it reached a viewer.

**On prosody generally**: neither rung supports SSML, which
`2026-07-09-cadenza-narration-quality.md` §8 already establishes. Every pause *inside* a
sentence is therefore fiction — the TTS renders the whole sentence as one clip and the
comma pause is whatever the model does. Only the cue SEAMS carry real silence, and that
half is well built. The one buildable lever §8 identified — splicing generated silence
between clips — is still not built, and it is what would make emphasis and the slide
beats real rather than estimate-only.

## Finding 4 — the language switch is probably ours

The report was "a slide read in English and then in another language", with a guess that
it is the model. Two mechanisms in our own code produce that symptom, both reproduced
against the real shipped `voice-model.js` under Node:

1. **The rung flips mid-deck and takes the language with it.** `pickRung()` runs inside
   `synthOne` — once per sentence. While the ~80 MB on-device Kokoro model downloads,
   sentences speak through the cloud rung with `lattice-studio-voice-or`; when it becomes
   ready, every later sentence speaks through the on-device rung with
   `lattice-studio-voice-kokoro` — a *different* preference key, freely a different
   language. Measured: sentences 1–2 `af_heart` (US English), sentences 3–4 `if_sara`
   (Italian), no user action. A key expiring, an OAuth rewrite, or a second Studio tab
   changing the pref does the same thing, since `localStorage` is origin-shared.
2. **A clip is cached under the wrong voice and persisted.** `synthOne` computes the cache
   key from one read of the voice pref (`:1044`) and the request re-reads it (`:407`),
   with an IndexedDB await and a retry backoff in between. Measured: the wire carried
   `if_sara`, the key said `af_heart`, and the Italian bytes were written to IndexedDB
   under the English key and replayed from cache on the next visit. That one is durable —
   it survives a reload and no user could connect it to a cause.

Underneath both: **nothing in the tree pins a language.** `grep -c language` over
`voice-model.js` and `kokoro-worker.js` returns 0 and 0. The cloud request body is
`{model, input, voice, response_format, speed}`. The Web Speech path constructs
`new SpeechSynthesisUtterance(text)` with no `.lang` and no `.voice`. A deck's
front-matter `lang:` reaches `buildTrack` and stops there — it never reaches voice
selection or either synthesis call, so a Spanish deck is read by the workspace's English
default with `§` and `→` unnormalized (the English say-as pass is bypassed for a
non-English `lang`).

Both bugs share one root cause and one fix: `read-aloud.ts:709` calls
`voice.synthOne({ text: s, signal })` **without a voice**, so every sentence re-resolves
it from storage. `warm()` already does this correctly — `voice-model.js:1177` passes
`voice: item.effVoice` explicitly. Resolving `{rung, model, voice, speed}` once per read
and threading it down closes both, and makes `read-aloud.ts:695`'s already-frozen
`keyPrefix` correct rather than accidentally stale.

A genuine model-side code-switch is still possible, and we make it likelier: CJK,
Cyrillic, Greek and `¿` survive normalization and reach the wire, which is the classic
code-switch trigger for an LLM-backed voice with no language pinned.

## Finding 5 — defects found while measuring

- **`slideToSpeech` deletes whole-integer chart values.** It appends a synthetic `.` to a
  structural line (`slide-speech.js:186`), and the ordered-list-marker strip
  (`:199`, `/(^|\s)\d+\.\s+/`) then eats the result. Measured:
  `- First \`120\` / - Second \`95\` / - Third \`31\`` narrates as
  *"First Second Third 31."* — only the last value survives, because it has no trailing
  space to match. Decimals, percents and signed values are unaffected. This is the
  live-Present fallback path, not the export.
- **A math slide narrates the rendered equation AND its raw TeX.** In shipped bytes:
  `β^=(X⊤X)−1X⊤y\hat\beta = (X^\top X)^{-1} X^\top y.`, and every inline `$X$` doubles
  to `XX`, `yy`, `nn`. Already filed as #2121; this is its reproduction in real export
  output.
- **Adjacent inline elements concatenate with no separator**, because `speechText` uses
  `textContent`. Measured on roadmap: `Foundation Q2 2026: ShippedSignal taxonomy` — a
  status pill welded to the item title, nine times on one slide. `contact` yields
  `AdaSlide`. `kpi` and `pricing` show the softer space-joined form ("the ceiling On
  plan", "Growth $49 / mo Most popular").
- **Four of six chart narrators never fire on their own component's canonical sample.**
  `narrateChart` returns `null` for the shipped `radar`, `quadrant`, `state-chart` and
  `journey` samples. `journey` is deliberate (the gate needs both `journey` AND
  `weighted`); the other three match their class gate and then bail in the parse — their
  samples nest three levels deep and the narrators appear to expect two. So the narrators
  we have are dormant on the very shapes the docs teach.
- **`progress` narrates none of its five bars**, `timeline-list` none of its four
  milestones, `kanban` none of its cards.
- **Stale prose**: `share-export.ts:918-921` documents a narration chain with a speaker-note
  rung that was deleted on 2026-08-24; `share-export.ts:574-579` cites a `getSlideNote`
  function that does not exist anywhere in the tree;
  `2026-07-11-manifest-speech-contract.md:85` and `:511` still say the export is
  notes-only, which it has not been for a month.
- **`stage-window.js:321` and `:610` build a preview document with no `<html lang>`**,
  unlike their two sibling builders. Not a TTS cause; a WCAG 3.1.1 gap and a
  doc-honesty gap against `studio-language.ts`'s own header.

## What is already right, and should be said plainly

The pipeline is in better shape than the older records describe. The two producers were
unified: live Present, the CLI `.vtt`, the Studio `.vtt` and the audio bake all resolve
through one five-rung ladder, share one DOM speech projection, share `narrateChart`, and
share the emphasis model. The speaker-note rung is gone and `mergeNarration` *throws* if
you pass it notes, so a private note cannot leak into a caption. A note-less slide is no
longer silent — measured, all 116 gallery slides narrate while only 4 carry notes. The
author escape hatch works: an inline `<!-- caption: -->` overrides everything, verified
end to end. And the emphasis tier, the per-deck `lexicon:`/`acronyms:` overrides, and the
state-marker word maps are all real, tested, boardroom-grade work.

The gap is not craftsmanship. It is coverage, and it has a shape.

## Recommendations, in the order I would do them

Ranked by (symptom severity x cheapness), not by theme. The first five are narrow,
measured, and independent of the architectural fork at the end.

1. **Pin the voice for the duration of a read** (`read-aloud.ts:709`). Closes both
   language-switch reproductions and the stale decoded-cache key at once. `warm()` already
   does it correctly one file over; the playback caller is the only one that does not.
   Smallest diff, worst symptom, and it is the one the user has already heard.
2. **Call `edgeTrim` in `toSpoken`, not only in the lint.** One function, already written
   and tested, applied on the wrong side. It fixes `($4.2M)`, `"ARR"`, `[CEO]`, `(§5)` and
   `(12)` together, and it closes the lint/runtime skew that tells authors a deck is clean
   when it is not.
3. **Guard `cursor.align`** — `Number.isFinite` on both arguments, a positive-duration
   floor, and an ordering check. Copy `calibrate.observe`, which already guards the same
   value from the same callback. This is what stops a structurally invalid `.vtt` reaching
   a viewer. A `validateTrack()` would be the durable version.
4. **Send a language.** A `language` on the cloud body, a `language` to `tts.generate`,
   `utterance.lang` on the Web Speech path, all fed from the deck's `lang:` — which is
   parsed today and then dropped before it reaches voice selection.
5. **Fix the named token defects**: `up +18%` doubling the direction word, `$1` → "one
   dollars", `oneundefined` at 10^15, the silently-dropped tiny number, and the
   `✓`/`✔`/`☑`/`☒` inconsistency. Then extend the lexicon for ranges, dates, `bn`/`MM`,
   ordinals and identifiers — data edits in the layer that is already good.
6. **Fix the two flatten defects** — `slideToSpeech`'s deleted integers and `speechText`'s
   `textContent` concatenation. Narrow, named root cause each, both measured.
7. **Wake the four dormant narrators** so `radar`, `quadrant`, `state-chart` and plain
   `journey` narrate their own canonical samples.
8. **Then the real decision: how do the remaining SVG charts get a voice?** This is the
   fork that needs a human, because one branch of it reverses a documented decision:
   - *More hand-written narrators*, the funnel model, one per chart. Highest quality,
     proven, roughly a dozen of them.
   - *A generic data-series narrator* fed from the transform's already-parsed series, so
     every chart gets "label: value" for free and a hand-written narrator becomes an
     upgrade rather than the only option. Cheapest route to a floor across all 70.
   - *A declarative hint in the manifest* — narrow and data-only, in the spirit of
     `WORD_MAPS`, not the grammar-in-JSON block that `2026-07-11-manifest-speech-contract.md`
     rightly killed. Do not take this branch without re-reading that record's §11.

Items 1-7 are cheap, measured, and none depends on how 8 resolves.

## What is NOT verified

No audio was synthesized. There is no TTS, no browser and no `AudioContext` in this
sandbox, so every claim above is about the spoken STRING, the emitted `.vtt` bytes, or a
value computed inside Cadenza — never about how any of it sounds (HARD RULE #23).
Specifically unverified: whether Kokoro's own front-end normalizer rescues any of the raw
passthroughs (`99th`, `12:30` and `1st` are plausible wins; `$1.2-1.4B`, `ID-4471` and
`(API)` are not); whether the segmentation gaps are audible; and whether the out-of-order
`align()` defect is reachable from the live Studio, which today preserves ordering at
`read-aloud.ts:797`. The timing errors in Finding 3 are confirmed regardless of the TTS,
because they are computed entirely inside Cadenza.
