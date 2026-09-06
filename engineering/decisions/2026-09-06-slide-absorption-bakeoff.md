---
status: in-progress
summary: Narration prices time by STRUCTURE only — syllables, punctuation glyphs, blank lines, and two flat slide constants — so nothing on a slide can buy itself room, and a diagram gets the shortest narration in the deck with the most to look at. This record separates the two quantities the complaint folds together (ABSORPTION, how long the eye needs, which is counting; EMPHASIS, which words matter, which is salience), builds a measured bake-off of five competing absorption cost models over 142 real slides, and picks E (hybrid) on the numbers. Two modeling errors were found BY the bake-off and corrected in it: a blanket sqrt curve priced a five-node flowchart at 0.7s, below the existing 1.4s floor, so the one model that could see a diagram gave every diagram nothing; and pricing chart labels as prose gave a 51-label quadrant 13.8s of silence, worse than the flat beat it replaced. No LLM, no embedding model, and no new dependency — the weight comes from the manifests, the rendered DOM, and rehearsal.js's existing ROLE_MULT. Ships the kernel + the bake-off tool only; nothing is wired to the player yet.
companion:
  - ./2026-07-12-narration-pace-model.md
  - ./2026-07-11-manifest-speech-contract.md
  - ./2026-07-09-cadenza-narration-quality.md
  - ./2026-07-07-cadenza-caption-timeline.md
---

# Slide absorption — giving content weight to the narration clock (2026-09-06)

> **Symptom.** "Narration of slides and diagrams doesn't place any weight based on the content
> and therefore doesn't let slides and important information breathe."
>
> **Root cause.** Every rung of the pause ladder keys on a glyph or a boundary. A word costs its
> syllables, a pause is a punctuation character, a paragraph is a blank line, and the two deepest
> rungs — `SLIDE_PAUSE_MS` and `SECTION_PAUSE_MS` — are flat constants keyed on boundary depth
> alone. Nothing on the slide can buy itself room.
>
> **Decision (this doc).** Split the complaint into two quantities, fix the one that is countable,
> and prove the cost function on real decks rather than asserting it.

## 1. Two quantities, not one

The request names "weight" once but asks for two different things, and they need different
instruments:

| Quantity | The question | How it is measured | What it drives |
|---|---|---|---|
| **Absorption** | how long does the eye need? | counting the rendered slide | the arrival beat + a new exit hold |
| **Emphasis** | which words matter? | salience over the text | micro-pause and rate within a clip |

**Absorption needs no semantics.** It is a quantity question — how much is on the slide — answered
by counting nodes. That is the half this record addresses, and it is the half the complaint leads
with ("slides and diagrams… don't breathe").

Emphasis is where a salience model earns its place, and it is deliberately out of scope here. It
also has a hard ceiling worth stating now: **neither TTS rung supports SSML**
(`2026-07-09-cadenza-narration-quality.md` §8), so the in-clip levers are injected punctuation and
the per-clip `speed` parameter — not `<emphasis>` tags.

## 2. What was already in the tree, unwired

Three separate dwell models exist, none connected to the narration clock:

| Model | Where | Scales on |
|---|---|---|
| `readMs` | `docs/src/lib/cadenza/cadence.ts` | spoken word count, clamped 1–6 s |
| `readMs` | `docs/src/lib/vetrina/storyboard.ts` (the Teaching Beat) | caption words, clamped 1.2–4.5 s |
| `ROLE_MULT × (0.6 + words/45)` | `docs/src/components/studio/present/rehearsal.js:47` | component role + density |

Plus two catalogs of authored content weight nobody times anything from:

- **All 61 manifests carry `adapt.priority`** — a ranked slot salience (`["number","caption","eyebrow"]`).
- **29 carry `density: {axis, soft, hard}`**, generated into `lib/runtime/axis-dom-catalog.generated.js` —
  a per-component crowding budget with a DOM selector, already bundled to the runtime.

`rehearsal.js`'s `ROLE_MULT` is the repo's existing content-weight model. It coaches a human
("Let the number land — stop talking for a beat") and never reaches the clock. This work lifts it
onto the clock rather than deriving a second one; `slide-absorption.test.js` pins the two equal.

## 3. Where the signal dies

`projectDeckToSpeech(sections)` (`lib/transformers/prose-projection.mjs:797`) renders the
**component-aware** DOM, reads `data-class`, knows which slot every phrase came from — and returns
**one flat string per slide**. Cadenza then re-segments it blind. The entire channel from "this is
the headline metric" to "hold longer here" is punctuation and blank lines.

Two narrower losses on the same path:

- `lib/core/slide-speech.js:135` strips `**bold**` — the author's own emphasis marking, deleted
  before timing.
- `MEDIA_COMPONENTS` (`prose-projection.mjs:79`) makes a chart/diagram/image narrate its heading
  and caption only, skipping the visual **by design**. So the slides with the most to look at get
  the least narration, and then advance the instant the voice stops. That is not a bug in the
  projection — a screen reader should not narrate an SVG's internals — but it means **the voice
  never buys a media slide any absorption time**, which the spend rule below has to model
  explicitly.

## 4. The spend rule — shared, so only the cost function competes

Every model answers one question — how many milliseconds of looking does this slide owe? — and one
shared `spend()` turns that into two beats:

- **arrive** — a beat on the new slide, already rendered, *before* the voice starts.
- **exit** — the **residual** after narration ends: what the eye still owes, minus what the voice
  already bought.

**The residual is the whole idea.** An additive pause would drag every talkative slide and still
starve every silent diagram — today's failure with the sign flipped. Treating absorption as a
*budget the narration draws down* makes a wordy slide cost nothing extra and a wordless diagram
cost nearly all of it. A media slide's narration is credited at 25%, because (per §3) it never
described the visual.

Two safety properties, both pinned by test:

- **The arrive beat never drops below the caller's floor**, and the floor is today's flat
  `SLIDE_PAUSE_MS`. This model can only *add* room, so it is safe to land behind the existing pace
  presets.
- **A beat is either zero or perceptible.** A sub-`MIN_BEAT_MS` residual is dropped, not rounded
  up — a 90 ms pause reads as a stutter, not a breath.

## 5. The five candidates

| | Model | Cost function |
|---|---|---|
| A | text time | silent reading time of the slide's prose |
| B | density fill | rendered items against the component's calibrated `soft` budget |
| C | role-weighted | `rehearsal.js`'s ROLE_MULT lifted onto the clock, unchanged |
| D | visual cost | what is painted: marks, diagram nodes, diagram edges, images |
| E | hybrid | `max(read, look) × role` |

`max` and not a sum in E: reading and looking are not sequential — a viewer scanning a chart's
labels does both at once, and summing double-charges every slide with words *and* marks.

## 6. The measured result

`node tools/absorption-bakeoff.js` over 4 decks / 142 slides / 34 media slides. Today every slide
gets a flat 1.4 s arrival beat and a 0 s exit hold.

```
model              arrive avg  spread  exit avg  prose exit  MEDIA EXIT  media w/ beat
A · text time      3.4s        6.4x    0.2s      0.0s        0.8s        9/34
B · density fill   2.1s        6.4x    0.2s      0.0s        0.8s        9/34
C · role-weighted  1.4s        2.9x    0.1s      0.0s        0.4s        7/34
D · visual cost    1.6s        3.6x    0.4s      0.0s        1.6s        19/34
E · hybrid         3.6s        6.4x    0.7s      0.0s        3.1s        33/34
```

**Read the media column, not the average.** Any model can be scaled to any mean; what separates
them is whether a chart or diagram — the slide the complaint is about — gets a beat at all.

- **A and B are blind to visuals by construction** and reach 9 of 34 media slides. B degrades to A
  for the 32 components declaring no density block, which is most of them.
- **C barely differentiates** (2.9× spread, 7 of 34). Word density is a poor proxy for looking time,
  which is unsurprising: `rehearsal.js` built it to weight a *human's* talk time, not a viewer's.
- **D reaches 19 of 34** and is the only model that sees a diagram, but it prices a text-carrying
  slide at nothing.
- **E reaches 33 of 34** with a 3.1 s mean media exit and **0.0 s prose exit** — no padding on
  slides the voice already covered. It is the pick.

Per-slide behavior under E, from `--slides`, showing it differentiates rather than inflating:

| slide | marks | narration | E arrive + exit |
|---|---|---|---|
| `quadrant` (51 labels) | 19 | 1.9 s | 2.8 s + 4.8 s |
| `journey` | 56 | 22.5 s | 2.5 s + **0 s** |
| `diagram` (largest) | 9 nodes/edges | 4.1 s | 3.1 s + 4.7 s |
| prose body | 0 | 18.1 s | 3.3 s + **0 s** |

The `journey` row is the one to check: 56 marks, the busiest visual in the set, and it correctly
owes **nothing** at the exit because its own narration ran 22.5 s.

## 7. Two modeling errors the bake-off found

Both were introduced by me, both survived reading, and both were caught only by running the
numbers over real decks. They are recorded because each is a plausible-sounding choice.

**7.1 A blanket `sqrt` curve underprices exactly the range most slides live in.** The first draft
charged `sqrt(marks) × 120 ms × 2` to avoid a tuning constant. A five-node, four-edge flowchart
priced at **0.7 s** — under the existing 1.4 s floor — so model D gave every diagram in the tree a
beat of zero, at spread 1.0×. The marks were counted right; they were *valued* wrong. Fixed by
charging per element **kind** (a traced edge is not a scanned bar), linear below a 4 s knee and
logarithmic above it.

**7.2 A chart's labels are not prose.** Reading time was charged on every visible word, so a
quadrant with 51 scattered axis labels priced at 12.2 s of "reading" and model E gave it
**13.8 s of silence** — worse than the flat beat it replaced. Fixed by splitting `proseWords` from
`labelWords` at measurement time: text under a prose block is read, everything else is scanned.

**7.3 (mechanical, same class.)** `textContent` concatenates adjacent elements with no separator,
so `<p>…three</p><text>alpha</text>` counted as one word. The measurement now walks text nodes.
Real rendered markup has newlines and mostly got away with it; a fixture does not.

## 8. A constraint the export path imposes

**On the CLI/export path a Mermaid diagram has no marks.** Mermaid renders in a browser, so in
Node/jsdom the slide holds `<pre><code class="language-mermaid">` and its DSL text. A DOM-only
visual model therefore scores every diagram in the tree at zero — §7.1's symptom had two causes,
and this was the second.

So `diagramMarksOf` estimates from the **source** when no SVG is present: an edge is an arrow
operator, a node is a bracketed declaration or an identifier adjacent to an arrow. Deliberately
shallow — it does not parse Mermaid and does not need to, because the cost runs through a knee
curve where being out by a node moves the beat by tens of milliseconds. Matching the *arrow* keeps
it grammar-agnostic, which matters: the bracket-only rule scored a `classDiagram` at zero nodes.

## 9. Why no NLP library, and where one would go

The question that prompted this work was whether a library capturing semantic meaning could
supply the weight without an LLM. For **absorption**, no library is needed or useful — the
quantity is countable, and the manifests already carry the calibrated budgets.

The ladder, recorded for the emphasis half rather than discarded:

| Tier | What | Cost |
|---|---|---|
| 0 | manifest role, `adapt.priority`, restored `**bold**`, element counts | zero deps — **what this work uses** |
| 1 | deck-relative TF-IDF / surprisal | ~100 lines, zero deps |
| 2 | `wink-nlp` (POS + BM25) or `compromise` | a runtime dependency |
| 3 | MiniLM sentence embeddings via `@huggingface/transformers` | ~23 MB ONNX model |

**One hard architectural constraint either way:** Cadenza is zero-dependency and gated —
`checkCadenzaBoundary` (`tools/check-ownership.js:7127`) fails the build on any non-relative
import. **No NLP library can live in Cadenza.** Weight is computed upstream and handed down as
numbers, which keeps Cadenza's stated contract intact: not a decider of what to say, and now not a
decider of what matters either.

## 10. What this ships, and what it does not

**Ships:** `lib/core/slide-absorption.mjs` (the measure, the five models, the spend rule),
`tools/absorption-bakeoff.js` (the diagnostic), and 18 unit tests including two cross-module pins
(`MEDIA_COMPONENTS` equal to the projection's, `ROLE_MULT` equal to `rehearsal.js`'s).

**Does not ship:** any change to what a deck renders, exports, or narrates. Nothing calls the
kernel yet. The arrive beat is still `slideBeatMs`'s flat constant and the exit hold does not
exist on any surface.

**UNVERIFIED, and named as such (HARD RULE #23):** every number here is a *computed beat*, not an
observed delivery. Nobody has watched a deck present itself under model E. The claim this record
makes is that E differentiates correctly on 142 real slides — not that it feels right in a room.
Wiring it to the player, and watching the result, is the next step and the point at which the
human sign-off is owed.

## 11. Next

1. Widen the projection contract from `string[]` to a weighted script carrying the measure
   (agreed in the session that opened this record) — the string is the lossy channel.
2. Wire `arrive` to `slideBeatMs` and add the `exit` hold to `read-aloud.ts` and `player-core.mjs`.
3. Watch a narrated deck under E and tune `arriveShare` / `mediaNarrationCredit` against what a
   room actually feels — the tuning that cannot be done from a table.
4. Then the emphasis half, on its own branch (HARD RULE #17), starting at Tier 0.
