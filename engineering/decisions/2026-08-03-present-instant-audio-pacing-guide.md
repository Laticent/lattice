---
status: in-progress
summary: Present's narrated playback feels slow, stalls mid-slide, and races between slides. This traces each symptom to a specific mechanism in the code we ship today — no prefetch before the first Play, one slide of lookahead at concurrency 1, a memory-only audio cache that dies on reload, a 20-second silent produce timeout the reader's clock runs straight through, and a between-slide pause that is literally zero milliseconds — then proposes the design that makes playback feel instantaneous, gives the deck a deliberate presentation rhythm under workspace control, and adds a third delivery rung (Guide) where the Vetrina cursor points at the slide part being spoken while the real mouse pointer gets out of the way.
companion:
  - ./2026-07-12-narration-pace-model.md
  - ./2026-07-09-cadenza-narration-quality.md
  - ./2026-07-05-vetrina-walkthrough-library.md
  - ./2026-07-12-suono-audio-library.md
---

# Present: instant audio, a real presentation pace, and a Guide rung

**Status:** Parts 2 and 3 ACCEPTED + IMPLEMENTED (2026-08-03/04); Part 4 PROPOSED.
Confirmed with the maintainer in one round: **both** adaptive prefetch and a full-deck
Prepare; persist narration **on device** with a Data-tab governor; Guide targets derived
from the **speech projection** with an author override; **three PRs, Part 2 first.**
**Branch:** `claude/present-mode-audio-pacing-lgju0t`
**Reporter's symptoms:** "press play … takes a long time and sometimes audio hangs";
"pacing between slides is way too fast"; "vetrina mouse and regular mouse are both present."

Part 1 is **read off the code as it stood before this branch**, with file:line pointers — the
diagnosis. **Parts 2 and 3 are now built** (see "What Part 2 actually changed" and "Part 3,
measured", below), so their file:line references describe the code they replaced. **Part 4
(the Guide rung) remains a proposal.**

---

## Part 1 — What we actually do today

### 1.1 The playback path, start to finish

Press Play in Present and this is the whole chain:

| # | Step | Where |
|---|---|---|
| 1 | Present opens **muted by default** and prefetches **nothing** | `PresentOverlay.tsx:101` |
| 2 | On mount, the voice model module is dynamic-imported (module load only — no audio) | `read-aloud.ts:406-417` |
| 3 | Play → `getVoice()` resolves → the rung is picked (`openrouter-tts` / `kokoro` / silent) | `read-aloud.ts:763-784` |
| 4 | A Suono sequence starts over the slide's sentences; **sentence 1 is synthesized cold** | `read-aloud.ts:584-640` |
| 5 | Each sentence is one `POST /api/v1/audio/speech`, returning a **complete mp3** — no streaming | `voice-model.js:295-330` |
| 6 | Nothing is heard until those bytes land *and* `decodeAudioData` finishes | `sequence.ts:206-253` |

So **time-to-first-audio on the first slide is a full cold network round trip plus a decode**,
every single time you press Play. There is no speculative work before the tap.

### 1.2 Prefetch: one slide, one sentence at a time, autoplay only

We do have a warm-ahead. It is much narrower than it sounds:

- It warms **exactly one slide ahead** — `set[clamped + 1]`, hardcoded (`PresentOverlay.tsx:387-400`).
- It fires **only while autoplaying and unmuted** (`if (!autoplay || muted) return;`). Arrow-key
  navigation warms nothing at all.
- Inside `voice-model.js`, `WARM_CONCURRENCY = 1` (`voice-model.js:209`) — the next slide's sentences
  are fetched strictly **one at a time**, on a queue shared by the whole voice-model instance.

The consequence is easy to state: a 2-sentence slide (~8 seconds of speech) followed by an 8-sentence
slide gets maybe three sentences warmed. The other five are cold, and you hear the gap.

Within a slide we do better — `DEFAULT_CONCURRENCY = 3` (`sequence.ts:24`), so three sentences are
produced ahead of the playhead. That is why *mid-slide* usually flows and *slide boundaries* stall.

### 1.3 Caching: real, but memory-only and it dies on reload

There are two caches, and neither survives a page refresh:

| Cache | What it holds | Limit | Lifetime |
|---|---|---|---|
| `audioCache` (`voice-model.js:503`) | synthesized mp3/wav bytes | 200 entries FIFO | the page session |
| Suono's `bytesCache` + decoded-clip cache (`sequence.ts:22`, `stage.ts`) | decoded `AudioBuffer`s | 200 entries | the page session |

Both are plain `Map`s. **Nothing is written to IndexedDB or Cache Storage.** The one `caches.open`
call in the file (`voice-model.js:142`) probes for *Kokoro model weights*, not audio.

So: rehearse a deck, refresh the tab, present it — and you re-buy and re-wait for every sentence.
The cache keys are content-complete and correct (`rung | model·voice | speed | sentence`,
`read-aloud.ts:578`), which is the hard part. Persisting them is the easy part we never did.

### 1.4 The hang: a 20-second timeout the caption crawl runs straight through

This is the defect behind "sometimes audio hangs", and it is two mechanisms stacked:

**(a) A slow sentence stalls for up to 20 seconds, silently.** `synthOne` races the request against
a 20 s timer (`voice-model.js:598-604`); Suono independently applies `DEFAULT_PRODUCE_TIMEOUT_MS =
20000` (`sequence.ts:23`). On timeout the sentence resolves to `null` and is **skipped with no
retry** — a transient 429 or 5xx silently deletes a sentence from the narration.

**(b) The reader's clock does not wait for it.** In audio mode the highlight clock is
`stage.clockMs() − audioBase` (`read-aloud.ts:498`) — the WebAudio clock, which **keeps advancing in
real time whether or not a clip is playing**. So during that 20-second stall the captions keep
crawling over total silence, then the next clip lands and the highlight snaps.

That is precisely the reported experience: audio hangs, text keeps going. The "fall back to the
silent estimate" safety net (`read-aloud.ts:630-637`) only arms when **no** onset ever landed — a
stall *after* sentence 1 succeeded is not covered by it at all.

### 1.5 Pacing between slides: zero, by construction

There is no between-slide pause. `onFinish` fires the moment a slide's last word ends and advances
immediately (`PresentOverlay.tsx:322-331`); an effect keyed on the new track plays it at once
(`PresentOverlay.tsx:351-355`).

So the gap you perceive between slides today is **not a designed beat — it is whatever the network
happened to cost**. That is why the same feature reads as both "way too fast" and "it hangs": the
deliberate pause is 0 ms and the accidental pause is 0–20 s, and neither is the presentation rhythm
you asked for.

Worth noting what *is* already grounded: `cadenza/cadence.ts` has a research-backed boundary ladder
(comma 200 / clause 350 / sentence 550 / ellipsis 650 / **paragraph 750 ms**), from
`2026-07-12-narration-pace-model.md`. **The ladder simply stops at the paragraph.** A slide boundary
— the deepest boundary in a deck — is the missing top rung.

The paragraph tier is worth reading before setting the one above it: 750 is the FLOOR of the
research range, tuned down from ~1000 after on-device review, because a deep pause at every
block seam read as the highlight *lagging*. That was a sync artifact rather than a verdict on
silence — and it is now fixed twice over (the highlight holds through a paragraph beat, and
through a starved clip) — but it is real evidence from this engine that long pauses feel worse
here than the literature predicts, and it is why §3.2 starts the slide tier near the
conservative end of what the craft prescribes.

### 1.6 The SLA question, answered honestly

**There is no published latency SLA for any of these models, and we have never measured one.**

- OpenRouter's `/api/v1/audio/speech` is a router over upstream providers. Its terms cover
  availability and billing, not per-request latency. Per-model latency moves with upstream load,
  input length, and which provider the router picks that minute.
- We ship no instrumentation for it. The diagnostics overlay records audio *onsets*
  (`ReadAloudDebugEvent`, `read-aloud.ts:49-72`) — the first `timing` event's `sincePlayMs` is
  effectively a time-to-first-audio reading, but nothing aggregates it and nothing acts on it.
- What we *do* know is **price**, from the live catalog (`ai/tts-catalog.js:22-44`): Kokoro-82M
  ~$0.62/M chars, Gemini Flash TTS ~$1/M, the Zonos/Orpheus/CSM cluster ~$7/M, Grok/MAI $15–22/M.
  Price is not latency.

Two things follow. First, **I will not quote you an SLA number I cannot stand behind** — the honest
answer is "unmeasured", and Part 2 makes measuring it a deliverable. Second, and more usefully: for
a live boardroom present, the way to stop caring about the SLA is to **not be on the network during
delivery** — either the on-device Kokoro rung (desktop; zero network latency once the ~80 MB model
is loaded, `voice-model.js:548-552`) or a pre-generated deck (§2.2).

### 1.7 Vetrina today

Vetrina is a complete, framework-free walkthrough engine (`docs/src/lib/vetrina/`) that drives the
Studio demo tour. Two facts decide the design in Part 4:

- **Its stage explicitly sits over the live app, "never inside a preview iframe"** (`stage.ts:7`),
  and string targets resolve via `root.querySelector` (`stage.ts:59,75`). The Present slide *is* a
  same-origin iframe (`PresentOverlay.tsx:719-722` → `DeckPreview` → `iframe.live`). **Vetrina cannot
  point at anything inside a slide today.**
- **We already solved that exact problem once.** `docs/src/playground/chart-interact.js` reaches into
  `getFrame().contentDocument` (line 127), finds elements, and maps inner rects to outer page
  coordinates through `frameGeom()` (lines 131-160, 242, 283-296). That is the coordinate bridge
  Vetrina needs, already written, already shipping in Present via `ChartDetailLayer`.

And on the two cursors: nothing anywhere in `docs/src` sets `cursor: none`. The real pointer is never
hidden, so during a tour you see both. That is a genuine gap, not a misconfiguration.

---

## Part 2 — Making it feel instantaneous

The target is simple to state: **from the tap on Play to the first spoken word should be under
~200 ms, and no slide boundary should ever be audibly cold.** Seven moves, cheapest first.

> **Implemented below.** §§2.1–2.6 shipped in this branch; §2.7 is guidance, not code.
> `narration-store.js` (device cache), `narration-latency.js` (measurement),
> `narration-prefs.js` (the workspace knobs), one shared `fetchClip` body in
> `voice-model.js`, `onStarve` in Suono, the buffering hold in `read-aloud.ts`, and the
> lookahead window + Prepare button in `PresentOverlay.tsx`.

### 2.1 Prefetch before the tap, not after it

The single biggest win, and the smallest change: warm slide 1's sentences when **Present opens**, and
again on hover/focus of the Play button. A presenter opens Present seconds before they speak; that
idle time is free synthesis budget we currently throw away.

Guard it on a connected clocked voice so we never spend on a deck that will read silently.

### 2.2 Lookahead that actually looks ahead

- Warm **N slides ahead**, default **2**, on *every* navigation — including manual arrow keys — not
  only during autoplay. Also warm one slide *back*, since presenters step backwards constantly.
- Raise `WARM_CONCURRENCY` from **1 → 3** (the ceiling `MAX_WARM_CONCURRENCY = 4` already bounds the
  burst, `sequence.ts:33`). At 1, a 2-slide lookahead cannot finish in time to matter.
- Make the depth **adaptive**: once §2.6 is measuring time-to-first-audio, size the lookahead from
  observed p95 latency rather than a fixed guess — a slow link warms deeper.

### 2.3 Persist the audio cache to the device

Move the synthesized bytes into IndexedDB under the **existing content-complete key**
(`rung | model·voice | speed | sentence` — no key redesign needed, `read-aloud.ts:578`), with an LRU
budget (~100 MB) and a clear entry in the Workspace **Data** tab beside the other storage governors.

This is the change that makes the *second* run of a deck instant and free. It also directly cuts
OpenRouter spend on rehearsal, which is the dominant cost pattern for this feature.

It does mean deck narration audio lands on disk. That is a real decision, not a detail — it is one of
the questions I am putting to you rather than defaulting.

### 2.4 "Prepare narration" — the boardroom answer

A button that synthesizes the **entire deck** in one pass with a progress bar, then hands you a
presentation with zero network dependency during delivery. This is what a live boardroom actually
wants: you do not want a $20M meeting depending on a router's p99.

Pairs naturally with §2.3 (prepared audio persists) and makes the cost visible and one-time instead
of dribbled out mid-sentence.

### 2.5 Make a stall honest instead of invisible

Three linked fixes to §1.4:

1. ~~**Cut the produce timeout** from 20 s to ~6 s, with **one retry** (jittered) before giving up.~~
   **PROPOSED, TRIED, REVERTED (commit `1f2246a`).** Shipping it broke audio outright: on any link
   slower than 6 s every sentence was dropped *and* nothing reached the cache, so the path could
   never self-heal. What shipped instead separates the player's patience from the request's
   lifetime — see the *as built* table below. A number reasoned about but never measured.
2. **Hold the reader clock while audio is starved.** Generalize the existing "hold at 0 until the
   first onset lands" trick (`read-aloud.ts:498`, `audioHoldMsRef`): if the next clip has not started
   within ~250 ms of the previous one ending, freeze the highlight at that cue boundary instead of
   free-running the WebAudio clock over silence. Captions stop lying.
3. **Show a buffering state** — a small, quiet indicator in the dock. A visible half-second beat is
   a presentation pause; an invisible one is a bug.

### 2.6 Measure, so "SLA" stops being a guess

Record per-request synth wall-clock alongside the pace calibration we already persist
(`readaloud-calibration`), aggregate p50/p95 **per model · voice**, surface it in the diagnostics
overlay, and feed it into §2.2's adaptive depth. Then the answer to "what is the SLA for each model"
becomes a number from your own deck on your own network, which is the only number that matters.

### 2.7 Recommend the on-device rung for live delivery

On desktop, on-device Kokoro has **no network in the loop at all** after the model loads. For a live
present that is categorically better than any cloud p95. Worth surfacing as guidance in the Voice
control, not just as a settings option.

---

## Part 3 — A presentation pace, prescribed and configurable

> **Implemented.** `SLIDE_PAUSE_MS` / `SECTION_PAUSE_MS` / `PACE_PRESETS` / `slideBeatMs` in
> `cadenza/cadence.ts` (the pace kernel keeps one source of truth), the pace prefs in
> `narration-prefs.js`, the advance→hold→speak sequencing in `PresentOverlay.tsx`, and the
> Pace control in the Workspace. **Measured on the real surface** — see below.

### 3.1 What the practitioners actually prescribe

The craft literature is unanimous on the shape, if not the millisecond:

- **Nancy Duarte** (*Resonate*, *slide:ology*) — a talk is a series of contrasting beats; the pause
  after a point is what lets it land. Silence is structure, not dead air.
- **Garr Reynolds** (*Presentation Zen*) — *ma*, negative space: the emptiness between elements is
  what gives the elements meaning. Applied in time, that is the pause between slides.
- **Patrick Winston** (*How to Speak*) — the deliberate stop; audiences need a beat to re-anchor when
  the visual changes.
- **Broadcast and audiobook convention** — a chapter or section boundary gets roughly 1.5–2× a
  paragraph pause; our own ladder already ends at 750 ms for a paragraph.

They converge on one rule that matters more than any number: **change the slide, let them read it,
then speak.** Not the reverse. The audience's eyes arrive before their ears are ready.

### 3.2 The model — extend the ladder we already have

Add the missing top rung to `cadence.ts`'s graded boundary table, graded by how deep the boundary is:

| Boundary | Beat | Why |
|---|---|---|
| Sentence (existing) | 550 ms | shipped |
| Paragraph (existing) | 750 ms | shipped |
| **Next slide, same section** | **~1400 ms** | a beat to read the new slide |
| **New section (a `divider` slide)** | **~2600 ms** | a chapter break — the audience re-orients |
| **Final slide** | **hold, no auto-advance** | never walk off the end mid-breath |

And critically, the beat is spent **on the new slide, already rendered** — advance, hold, *then*
speak. Today we advance and speak in the same tick.

The deck's own section structure is already computed (`sectionsFromSlides`,
`PresentOverlay.tsx:143`), so "is this a section boundary" costs nothing to ask.

### 3.3 The control

A **Pace** preset in Present's dock and in the Workspace, three named settings rather than a raw
number as the primary control:

| Preset | Slide beat | Section beat | For |
|---|---|---|---|
| Brisk | 800 ms | 1600 ms | a demo, a familiar audience |
| **Natural** (default) | **1400 ms** | **2600 ms** | boardroom delivery |
| Deliberate | 2200 ms | 4000 ms | a technical or non-native audience |

With exact millisecond overrides behind an "Advanced" disclosure for people who want them. Named
presets first because "how many milliseconds should a slide pause be" is not a question a presenter
should have to answer to get a good result.

### 3.4 The workspace configuration surface

You asked whether prefetch depth belongs in workspace configuration. Yes — and it should sit with
everything else about how Present behaves. A new **Present** section in `WorkspaceSheet`:

- **Pace** — the preset above, plus advanced ms overrides
- **Lookahead** — slides to prefetch (default 2, `Auto` option that uses §2.6's measurements)
- **Cache narration on this device** — on/off, with its Data-tab governor. *(As built: the on/off
  switch shipped; the budget stays at the 100 MB default with no UI. `setBudgetBytes` exists and is
  unexposed.)*
- **Guide** — the Part 4 rung's defaults

One recommendation on the lookahead knob: ship **`Auto` as the default** and expose the number for
people who want to pin it. A presenter on hotel wifi and one on a fiber desk want different values
and neither wants to think about it — but a fixed hidden constant is exactly what we have now, and it
is wrong for both.

---

## Part 4 — The Guide rung (Vetrina in Present)

### 4.1 The shape

A third button beside **CC** and **Voice** in the Present dock — call it **Guide** — that turns on a
Vetrina cursor which points at the part of the slide currently being narrated. CC shows the words,
Voice speaks them, Guide **shows you where to look**. Three independent toggles over one narration.

### 4.2 The hard problem is not the cursor — it is knowing what to point at

Three ways to source "the relevant part of the slide", in order of how much they ask of the author:

**(a) Derive it from the speech projection — the recommendation.**
`projectDeckSpeech` (`narration-projection.ts`) already walks the *rendered DOM* to produce each
slide's narration, which means at projection time it knows **which DOM node each sentence came from**
and throws that away. Make it emit `{ text, selector }` pairs instead of bare text, and the mapping
from "cue index N is being spoken" to "highlight this element" becomes a lookup.

This is the strong option: it works on **every existing deck with zero authoring**, it reuses the
shared kernel rather than adding a parallel one (HARD RULE #1), and it is exactly "the mouse points
at relevant slide parts as they are being presented" with no one having to write a tour.

**(b) Author-declared beats** — `<!-- point: .kpi-2 -->` in the slide source. Precise, and the right
escape hatch when the automatic mapping picks the wrong node. Worth having as an override, not as the
spine.

**(c) Heuristics** — point at whatever is animating, or the current bullet. Cheap, and wrong often
enough to be distracting. Not recommended.

### 4.3 The engine work: two named constraints

**Cross-frame targeting.** Vetrina's stage is documented as living over the live app and *never*
inside a preview iframe (`stage.ts:7`), and resolves targets with `root.querySelector`. The slide is
an iframe. The fix is a **pluggable target resolver** on the Vetrina stage that can return a rect
provider rather than an `HTMLElement` — fed by the frame-geometry mapping `chart-interact.js` already
implements and already runs in Present. Reuse, not a second implementation (HARD RULE #15).

**One conductor, not two.** Vetrina's `storyboard` paces itself with its own `readMs` dwell
(`storyboard.ts:54-56, 95`). If a Guide run pauses on its own clock while read-aloud speaks on the
audio clock, the two drift apart within a slide and the cursor points at the wrong thing. So the
Guide run must be a **raw `Walkthrough` driven externally** — read-aloud stays the conductor, and
the cursor moves when `reader.active.cueIndex` changes. This is an explicit architectural choice, not
an implementation detail, and getting it wrong is the most likely way this feature ships feeling
broken.

### 4.4 Hiding the real pointer

Yes — and the safety rules matter more than the effect:

- `cursor: none` applies **only to the slide card and backdrop**, never the dock or chrome. You must
  always be able to find and click Pause.
- It applies **only while a Guide run is live**, and is removed on `pointermove` **immediately** —
  before take-over even completes. Nobody is ever left hunting an invisible cursor.
- Re-hide after ~3 s of pointer stillness, so a presenter who bumps the mouse does not lose the
  effect permanently.
- Vetrina's existing take-over invariant is untouched: the first real input still aborts the run and
  hands over the wheel.

### 4.5 What this is not

Guide **narrates and points**. It does not click, type, or drive the deck — Vetrina's trust
invariant is that nothing happens the host's own setters did not do, and in Present the only setter
is "go to the next slide", which autoplay already owns.

---

## Slicing

These are three independent changes — each builds and tests against `main` alone, so under
HARD RULE #17 each is its own branch and PR rather than one stacked chain:

1. **Instant audio** (Part 2) — prefetch-on-open, deeper lookahead, persistent cache, the stall fix,
   the latency instrumentation. Highest impact, unblocks the measurements Part 3 tunes against.
2. **Pace** (Part 3) — the slide/section beat, the presets, the Workspace section.
3. **Guide** (Part 4) — the projection selector mapping, Vetrina cross-frame targeting, the rung.

Ordered by what each unblocks: Part 2 first, because a designed 1400 ms pause is unmeasurable and
unfeelable while a random 0–20 s pause is sitting on top of it.

## What Part 2 actually changed (as built)

| Before | After |
|---|---|
| Nothing prefetched until Play; first sentence always cold | Warms the current slide + a window whenever Voice is on — so opening Present or unmuting warms before the tap |
| Exactly 1 slide of lookahead, autoplay only | A window (default `auto`, sized from measured p95), on **every** navigation including arrow keys |
| `WARM_CONCURRENCY = 1` | `3` (under Suono's existing ceiling of 4) |
| Audio cache in memory only, dead on reload | IndexedDB, ~100 MB LRU, same content-complete key; Data-tab governor; switchable off |
| 20 s flat timeout, no retry, sentence silently dropped | The player's **patience** (20 s) is separated from the **request's own lifetime** (45 s): the player moves on, the request finishes and still writes to cache, so a slow link warms itself instead of dropping every sentence |
| Highlight rides the clock through a stall — captions over silence | `onStarve` → the highlight and the rail's progress edge **hold**; no label changes (see the 2026-08-04 amendment) |
| No latency measurement anywhere | p50/p95 per model·voice, feeding the adaptive window |
| No way to remove the network from delivery | **Fetch ahead: the whole deck** — a *value* of the lookahead setting, not a button in Present. No progress display and no cancel; both were properties of the Prepare button that the 2026-08-04 amendment removed, and neither survived into the setting. Recorded as a gap, not a feature. |

Two defects surfaced while building it, both fixed here rather than filed:
- The device cache's LRU stamped `Date.now()`, and warm-ahead writes several clips inside one
  millisecond — so ties broke *alphabetically by sentence text* and eviction removed the wrong
  entry. Stamps are now strictly monotonic.
- Suono cleared its starvation watch only in the run's `finally`, but `produceBytes` doesn't race
  the abort signal — so a `stop()` during a hung produce left the consumer frozen on an unbalanced
  `true` for up to the produce timeout. The clear now rides `stop()` too.

## Part 3, measured (HARD RULE #23)

Unlike Part 2's audio behavior, the beat IS verifiable without a key: autoplay chains on the
silent cadence, so the hold is observable in a real browser. Driven on the real Present
surface at 1440×900, sampling the transport state every 25 ms:

| Pace | Target | Measured holds | Mean |
|---|---|---|---|
| Brisk | 800 ms | 847 / 837 / 830 / 846 | **840 ms** |
| Natural | 1400 ms | 1423 / 1433 / 1419 | **1425 ms** |
| Deliberate | 2200 ms | 2234 / 2239 / 2245 | **2239 ms** |

The consistent ~30–40 ms overhead is the 25 ms sampling granularity plus a React commit —
expected, and well inside the perceptual noise floor for a pause of this length.

The caption band was also traced across a transition: it holds at 76 px for the whole beat
rather than collapsing and re-growing (one 25 ms sample reads 0 during the track swap — a
single frame of re-render, not a fold). That reservation is why the beat doesn't introduce a
slide that resizes twice per transition.

**Not measured live:** the SECTION beat. The default deck carries no `divider` slide, so the
2.6 s tier is covered by unit tests over `slideBeatMs` plus the pre-existing, already-tested
`isSectionBoundary` — not by a stopwatch on a running deck. Flagged rather than implied.

## Verification note (HARD RULE #23)

**What is verified:** the logic, by test — 17 device-cache cases against `fake-indexeddb` (a real
IDB, not a stub), 9 starvation-contract cases, the synth-discipline cases, and the full suites green
(2407 docs / 5202 root / `build:check`). Counts are as of the 2026-08-04 amendments; they are a
floor, not a headline — re-derive them rather than citing this line.

**What is NOT verified, and is marked UNVERIFIED:** every claim about how this *feels*. Nothing here
has been driven on the real Present surface in a real browser with a real key. Time-to-first-audio,
the size of a real slide boundary, whether the buffering hold reads as a beat rather than a hitch,
and whether a Prepare pass on a real deck costs what we think — all of that needs the real surface,
and a test suite is not evidence for any of it. Live OpenRouter timings cannot be captured from this
sandbox (no key, and HARD RULE #24 keeps ours off the per-PR path), so those numbers are yours to
run, or mine against a key you supply.

Part 4 (Guide) remains unbuilt. Part 3 shipped with the live measurements above.

## Amendment (2026-08-04): the readiness signal, and why Prepare stopped being a button

Reviewing the shipped surface with the maintainer moved three things. Recorded here because
two of them are reversals of what §2.4 and §2.5 originally proposed.

### Prepare is not a control — it is a value of the lookahead setting

§2.4 proposed a **Prepare** button in the Present dock. That was wrong, for a reason worth
stating: **Present is a delivery surface.** A presenter standing in it who realizes they
should have prepared is already in front of the room — the moment to decide has passed. A
setup action belongs before delivery, not inside it.

The deeper error: Prepare was never a separate feature. It is an **unbounded lookahead**. The
window already warms on Present-open, on unmute, and on every navigation; Prepare only said
"all of it instead of N slides." Shipping one concept as two is exactly why one of them
needed a button. It is now a value — **Fetch ahead: Automatic / 1–4 slides / The whole deck**
— and `resolveLookahead` returns `Infinity` for it, which the existing prefetch loop already
clamps to the deck length. No new code path, one fewer concept, and the dock loses a control.

### The label must never change with transport state

The starvation state swapped the Voice label to "Catching up…". Reverted. A label that
mutates mid-delivery is jarring, and for a screen reader it reads as the control *becoming a
different control* — the accessible name is the control's identity, not a status field.

### Readiness belongs on the rail — as two fills, separated by HEIGHT not color

The signal that matters is not "how full is my buffer" — no presenter can act on that. It is
**"is this still working?"**, and its audience is the *viewer of a self-presenting deck*, who
cannot tell a buffering silence from a crashed page. The rail is already documented as "the
ONE progress element" and is one segment per slide, so it is where that belongs.

**The shipped design: two fills.** A lighter **prefetch** fill leads, advancing as each
slide's audio lands; a darker **progress** fill follows as playback reaches it. When
narration stalls the progress edge freezes while the prefetch edge keeps moving — motion
continuing while playback is stopped is the only honest way to say "still working". When the
two edges MEET, the audio has run dry, and that is visible with no word and no color change.

Three findings reshaped this, each killing a design I had already built:

**1. Per-slide booleans read as patchwork.** Readiness was a `boolean[]`, so a half-fetched
slide flipped from empty to full, and a slide cached out of order lit up *behind a gap* — the
reporter's iPad screenshot showed slide 6 lit while slide 5 was dark. Readiness is now a
**fraction per slide**, collapsed into one **contiguous front** (`prefetchFrontOf`): whole
slides while complete, plus the partial fraction of the first incomplete one, then STOP. A
slide cached behind a gap is unreachable — you stall at the gap first — so counting it would
draw runway that does not exist. The front is also floored at the progress edge, since LRU
eviction of already-played audio would otherwise render the buffer *behind* the playhead.

**2. Tone cannot carry this — measured across ALL 36 palette/mode combinations.** Every tier
was a mix of `--accent` and `--border`. That relationship is not guaranteed:

| Check | Result |
|---|---|
| accent:border below **9:1** (cannot fit three tiers) | **34 of 36** |
| accent:border below **3:1** (cannot fit even two) | **11 of 36** |
| `onyx dark` | `--accent` and `--border` are BOTH `#FFFFFF` |

Tuning on `cuoio` and generalizing was the error. "Layouts are palette-blind" is not only
about routing color through tokens — it means not depending on a luminance relationship the
palettes never promised.

**3. So the channel is HEIGHT.** Track **2px** · prefetch **3px** · progress **5px**.
Thickness is palette-blind by construction. Verified on the real surface in `onyx dark`,
where all three tiers are the same white and remain legible purely by weight. Color still
reinforces (prefetch is `accent 55%`) but carries nothing, so its exact value is now a free
aesthetic choice rather than an accessibility constraint.

Earlier attempts, recorded so they are not retried: a half-height band inside the original
3px bar (1.5px — imperceptible); three tonal tiers (needs ~9:1, have 4.5:1); a neutral
prefetch tier against a gold progress (same luminance, differs only in hue → fails 1.4.1).

**A measurement caveat worth keeping:** the first contrast run reported 14.8:1 and was
garbage — `color-mix()` resolves to `color(srgb …)` with 0–1 floats and the probe read them
as 0–255 — and it silently measured light twice because `data-mode` was never toggled. Both
errors would have shipped a failing design behind a passing claim.

### Logged, NOT fixed here: the rail's own contrast predates this work

The same 36-palette sweep shows the rail's **existing** progress-vs-track contrast is below
3:1 in **11 of 36** combos, and in `onyx dark` the played fill and the track are the same
color — so the progress bar is invisible there today, independent of anything in this branch.
That is a pre-existing defect this work merely surfaced. Per HARD RULE #18 it is logged rather
than pulled into this diff, which is scoped to narration. The stepped-height treatment
incidentally rescues it wherever prefetch data exists, but not for a deck with no narration.

### The rail idiom is meant to reach the shipped player

Confirmed with the maintainer: **Present is where the deck is PLAYED; Settings is where the
presenter configures caching and prefetch.** That split is what this amendment implements —
the delivery surface carries no configuration, only the state of the thing being delivered.

The readiness band is deliberately the **video-scrubber** idiom rather than anything invented
here, because the same treatment is intended to reach the **shipped player** — the exported,
self-presenting deck a board member opens. A viewer arrives with a video player's mental
model already loaded; a bar whose played edge is position and whose ready edge is runway
needs no explanation in either surface.

That has a consequence worth stating before the Guide work: the readiness band currently
lives in the Studio's React `PresentRail`, while the vanilla export player rides the shared
transport kernel (`lib/core/present-transport.mjs`). When narration ships with a deck (below),
the band should land in a form both surfaces can use rather than being reimplemented — the
same HARD RULE #1 pressure that put swipe geometry in the kernel. Not built here; noted so
the second implementation is a deliberate choice rather than an accident.

### Still open, and bigger than this PR

`share-export.ts` writes **captions only — "No audio, no TTS key"** — and the voice ladder
reads the *viewer's* own key. So a shared deck opened by someone with no key floors to
`silent`: **the self-presenting shared deck has no voice today.** Everything in Part 2
optimizes the path where the author rehearses with their own key. Making a shared deck speak
means baking prepared audio into the artifact, which is a separate feature with export-format
consequences and needs its own design pass.

---

## Amendment (2026-08-04): the readiness band's render cost, and who pays it

Reported after the first working build: *"playing sound is janky / we don't get playback
progress in the rail anymore."* Both symptoms, one cause.

`useReadAloud`'s `tick` called `setProgress` on **every animation frame**. That was survivable
when the transport bar's only progress element was a single thin fill. It stopped being
survivable the moment the rail became the readiness display: three absolutely-positioned
spans per slide, two of them with fresh inline `style` objects and a `width` transition, times
the slide count. A ~60 Hz React render of the whole Present tree now sat on the same main
thread as `decodeAudioData` and the scheduler's own callbacks. The thread saturated, so the
audio chopped **and** the rAF loop was starved — which made the bar look frozen. The feature
built to prove "still working" was itself the thing making playback look broken.

Three changes, all narrowing what rides the audio clock rather than making the rail cheaper:

1. **Quantize the state update.** `progress` reaches React only when it moves ≥0.4%, plus
   exactly at 0 and 1 so start and finish stay precise. The reader's internal clock still
   advances every frame; only the React state does not. The rail is 5px tall — sub-half-percent
   motion was never visible.
2. **Memoize `PresentRail`.** Its props are primitives plus a memoized `sections` and the
   stable `setIdx`, so the shallow compare is cheap and actually hits. Unrelated overlay state
   (the 2s readiness poll, hint dismissal, caption text) no longer redraws 150 nodes
   mid-sentence.
3. **Floor the prefetch front at the slide index, not `slide + frac`.** Mixing the within-slide
   fraction into that memo made an O(slides) scan run per frame for nothing: the floor exists
   only to stop the buffer edge drawing *behind* the playhead, and slide granularity settles
   that.

**A separate defect found while tracing it.** Suono arms its starvation watch at the top of
every item and clears it from the clip's real onset. An item that produces no bytes — or whose
decode fails or times out — never reaches an onset, so its arm survived into the deliberate
inter-item gap that follows (the next iteration's `armStarve` is a no-op while one is pending).
The consumer then froze its highlight through a pause the scheduler had *chosen*, and if the
skipped item was the last, until the run's `finally`. The loop now balances its own watch after
each item. Pinned by `sequence.test.ts` — "does not report the deliberate gap after a skipped
item as a stall", which fails without the fix.

**The general lesson, worth carrying to the shipped player:** a progress indicator driven by
the audio clock is on the *audio* budget. Anything that makes it heavier has to be paid for by
making the update *rarer*, not by hoping the frame budget absorbs it. The vanilla export player
will hit exactly this when the readiness band lands there.
