---
status: in-progress
summary: One timing format for every Lattice surface that speaks, captions or moves — the Lattice Timing Track (LTT). Today the same word timeline exists in five shapes (Cadenza's CaptionTrack, the manifest's readAlong 1.1, the HTML player's compact payload, Vetrina's NarratedWord list and the .vtt sidecar), each with its own converter, and the tour narrator already times the same sentence differently from the deck. The LTT is a versioned JSON contract with a required core (the CaptionTrack, unchanged), optional layers owned by one library each (audio, actions), segments that let a deck and a tour share one shape, and a `seekable` property that holds when every segment's length is known. Two pure functions share the timing math: positionAt(segment, localMs) for any file, and timeline(ltt) for a seekable one; the player's transport stays an explicit, specified state machine. The .vtt becomes a derived view. Steps 1 and 2 are built: the package, the spec, the timing functions, and the HTML player playing from an embedded LTT. The owner settled the four forks on 2026-09-24: *.ltt.json, two encodings, embedded in the HTML export, and a shared @laticent/ltt package the libraries may import. The adversarial trio's findings are folded in (§12).
---

# The Lattice Timing Track (LTT) — one timing contract for decks, tours and video

> **Steps 1, 2 and 4 are built** (step 4 on 2026-09-25: Vetrina's gate admits `@laticent/ltt`,
> `Narrator.plan()` returns the core's `CaptionTrack`, the tour recorder writes a seekable LTT,
> and `isStale` lands with the recorder as its first caller; `engineering/ltt.md` §What is built).
> Step 3 is proposed in [`2026-09-25-video-export.md`](2026-09-25-video-export.md).
>
> **Steps 1 and 2** (2026-09-24). Step 1: `@laticent/ltt`, the spec at
> [`engineering/ltt.md`](../ltt.md), the generated schema, `validateLtt`, both
> encodings and the narrator drift fix. Step 2: `positionAt`, `timeline` and
> `makeCursor` in the package, the conformance fixtures, and the HTML player
> playing from an embedded LTT (see "Amendments in step 2" under §8). Steps 3–4
> are not. The legacy converter
> (§8 step 1) and the `legacy` basis were dropped: Lattice is not generally
> available, so no pre-LTT export needs converting (owner ruling, 2026-09-24).
>
> **Proposed.** Nothing else here is built. The owner settled all four forks on
> 2026-09-24 (§9). The adversarial trio (red team, inversion, checker) ran on
> the first full draft; §12 records what each found and what changed. §8 is the
> order of work.

## 1. The symptom

Lattice has four libraries and three playback surfaces that need to agree on
when a word is spoken, when its caption lights up, and when an action happens
on screen. They agree today because each one recomputes the timing from the
same Cadenza function, not because they share data. The data itself exists in
five shapes:

| Shape | Where | Carries |
|---|---|---|
| `CaptionTrack` | `docs/src/lib/cadenza/track.ts` | Everything: cues, words, `display` and `spoken`, times, `charOffset`, `weight`, `endsParagraph` |
| `readAlong` 1.1 | `lib/core/lattice-doc.js` (manifest) | The voice and the audio mode. **No timings and no text** — see `READ_ALONG_VERSION`'s comment. *(2.0 since step 2, pointing at the embedded LTT.)* |
| Compact per-slide payload | `lib/export/player-core.mjs` `narrationBlocks` | `{t, d, g, a, l, w: [[word, start, end]]}` per cue. Drops `spoken`, `charOffset` and `weight`, and rebases word times on the cue's first word. *(Retired in step 2: the player plays from the packed LTT.)* |
| `NarratedWord[]` | `docs/src/lib/vetrina/narrate.ts` | `{index, text, startMs, endMs}`, flattened — no cues, no emphasis, no spoken form |
| `.vtt` | `lib/core/read-along-vtt.js` via Cadenza `toVtt` | Display text and times only |

Each arrow between two shapes is a hand-written converter, and each converter
is a place where the shapes can drift apart. Two drifts are already real:

1. **The tour narrators time a sentence differently from the deck.** The deck
   producer calls `buildTrack(text, { pace, acronyms, emphasis, lang, lexicon })`
   (`lib/core/read-along-build.js:97`). Both of Vetrina's narrators call
   `buildTrack(text, { pace })`: `cadenzaNarrator` at
   `docs/src/lib/vetrina-narration/cadenza-narrator.ts:73` and `voicedNarrator`
   at `:255`. So in a tour, acronyms are not expanded, emphasized words get no
   hold, and a non-English line is timed as English.
2. **Vetrina keeps its own copy of Cadenza's reading rate.** `CAPTION_WPM` in
   `docs/src/lib/vetrina/pacing.ts` must equal Cadenza's `PACE_WPM`, and
   `pacing.test.ts` pins the pair. That pin covers `pacing: 'grounded'` only.
   The default, `'legacy'`, holds a caption at about 300 wpm, which is twice
   Cadenza's `moderate` rate.

Neither is visible on a surface today. The deck path passes every input, and
the tours that ship are plain English with no voice. They become visible the
moment a tour has a voice, an acronym or a second language.

## 2. Why it matters now: video, and decks that play anywhere

Two goals the owner set on 2026-09-24 turn this from tidying into a prerequisite:

- **Export a deck to video.** A video renderer asks "what is on screen at
  0:42.300?" once per frame, in any order, faster or slower than real time. The
  HTML player cannot answer that. It plays narration as a chain of events: a
  clip's `onended` fires, a `setTimeout` waits out the breath, the next clip
  starts (`player-core.mjs` `nextCue` / `endSlide`). The only way to learn the
  state at 0:42 is to play the deck from the start in real time.
- **A Lattice deck is portable and playable anywhere.** That needs a timing
  contract someone can implement without reading our code, and fallbacks to
  formats players already understand.

Both need the same thing: a timeline you can index by time, written down once,
that every surface reads.

**The strongest case against, and why this note proceeds anyway.** The inversion
pass (§12) put it well: both drifts in §1 are one-line fixes, and video alone
could be served by a seekable function over the player's existing payload, with
no new format and no new package. That is true for video. It does not serve the
second goal: the payload is lossy (§1), private to the HTML player, and
unreadable by Vetrina, Present or anyone outside Lattice. The owner's goal is a
shared contract, so the note proceeds, and takes from that critique the rule
that every new piece ships with a production caller (§8, guardrail G2).

## 3. The decision

**Adopt one timing contract, the Lattice Timing Track, and make every other
shape a view of it.**

- The LTT is **derived, never authored.** The deck's Markdown and a tour's
  storyboard stay the source. The one exception is measured data that cannot be
  rebuilt from source — a clip's measured length, a recorded tour wait — which
  the file carries and a reader must never throw away (§4.5).
- It is **JSON.** Every reader is code, the manifest beside it is JSON, and a
  `CaptionTrack` already serializes to JSON exactly. A human who wants to read
  it opens the `.vtt` generated from it.
- Its **core is Cadenza's `CaptionTrack`, unchanged.** The LTT wraps the word
  model that exists; it does not extend it. Everything the LTT adds (`basis`,
  hashes, audio, actions) lives on the segment, beside the track, never inside it.

## 4. The shape

### 4.1 An example — one stretch of a tour, and one slide of a deck

```jsonc
{
  "format": "ltt",
  "version": "1.0",

  // What this file was built from, as a whole.
  "source": { "kind": "tour", "id": "board-demo" },

  // Every input that changes timing, file-wide.
  "inputs": {
    "engine": "sha256:4c1e…",      // content hash of the timing engine build, NOT its package version (§4.5)
    "pace": "moderate",            // Cadenza's reading rate: slow | moderate | fast
    "deckPace": "natural",         // the deck's `pace:` register (resolve-pace.mjs): the hold on a new slide
    "lang": "en",
    "lexicon": "sha256:1ab0…",
    "acronyms": "sha256:77e3…",
    // tours only: what a recorded run's timing depended on (§4.6)
    "viewport": { "w": 1440, "h": 900 },
    "motion": "full",              // Vetrina's resolved motion tier: full | legible | still
    "stagePace": 1
  },

  "seekable": false,               // true when every segment's length is known (§4.4)

  "segments": [
    {
      "id": "s3",
      "kind": "stretch",           // "slide" | "hold" | "stretch" (§4.3)
      "at": { "beats": [3, 5] },   // a deck writes { "slide": 3 }
      "after": "awaitUser",        // what a player waits on before this segment; never a time
      "hash": "sha256:e09a…",      // narration text + storyboard steps + the file's inputs (§4.5)
      "basis": "estimate",         // "estimate" | "measured" | "legacy" — how far to trust the track

      // CORE (Cadenza). Required on "slide" and "stretch". Exactly a CaptionTrack.
      // Times are ms from the start of this segment.
      "track": {
        "durationMs": 3120,
        "cues": [{
          "display": "Now click Publish to send it to the board.",
          "startMs": 0, "endMs": 3120, "charOffset": 0,
          "words": [
            { "display": "Now",     "spoken": "Now",     "startMs": 0,   "endMs": 240,  "charOffset": 0 },
            { "display": "click",   "spoken": "click",   "startMs": 240, "endMs": 520,  "charOffset": 4 },
            { "display": "Publish", "spoken": "Publish", "startMs": 520, "endMs": 1010, "charOffset": 10, "weight": 1.3 }
            // … six more words, the last ending at 3120
          ]
        }]
      },

      // AUDIO (Suono). Optional.
      "audio": {
        "src": "audio/s3.mp3",
        "clip": "sha256:b71d…",    // content hash of the clip bytes
        "voice": { "model": "hexgrad/kokoro-82m", "voice": "af_heart", "speed": 1.0 },
        "measuredMs": 3340,
        "leadMs": 46
      },

      // ACTIONS (Vetrina). Optional. Anchored to a word, never to a time.
      "actions": [
        { "cue": 0, "word": 2, "match": "publish", "verb": "click", "target": "#publish", "arrive": "on-word" }
      ]
    },

    // In a deck, every slide after the first waits one hold when it ARRIVES (§4.3).
    // A narrated slide carries its hold before its track; a slide with no
    // narration is a "hold" segment: the arrival hold and nothing else.
    { "id": "d7", "kind": "hold", "at": { "slide": 7 }, "holdMs": 1400 }
  ]
}
```

The canonical form carries every `CaptionTrack` field as `buildTrack` produced
it, `spoken` included. Omitting fields is a packed-form concern only (§7).

### 4.2 The layers, and who owns each

| Layer | Owner | Required | What a reader that does not know it does |
|---|---|---|---|
| `source`, `inputs` | the producer | yes | — |
| segment `id`, `kind`, `at` | the producer | yes, on every segment | — |
| segment `hash`, `basis` | the producer | yes on `slide` and `stretch`; absent on `hold`, whose length depends only on `inputs.deckPace` | — |
| segment `holdMs` | the producer | yes on deck segments (0 on the first slide); absent on tour stretches | — |
| `segments[].track` | Cadenza | yes, on `slide` and `stretch` | — (a reader that cannot read the core cannot play the file) |
| `segments[].audio` | Suono | no | plays silently on the estimate, exactly as the HTML player does for a cue with no clip |
| `segments[].actions` | Vetrina | no | skips it; captions and audio still play |
| any later layer | its library | no | skips it |

"Libraries ignore what they don't need" applies to the optional layers only.
The core is a contract every reader honors. A new **required** field is a new
major version. **What may become a layer** is governed by guardrail G4 (§8): a
layer must change what `positionAt` returns, it needs its own decision record,
and the spec's owner signs off.

### 4.3 Segments, and why there are three kinds

Times restart at zero in each segment, and `after` names the wait before it
without giving that wait a length. This is what lets one format describe a deck
and a tour without claiming a time for a wait nobody can predict.

How a deck spends a hold, from the player's source: Play speaks the current
slide at once, with no hold (`toggleNarration` → `speakSlide`). When a slide's
narration ends, `endSlide` **advances first, then holds on the slide that
arrived, then speaks it** — and the hold is a section hold or a slide hold
according to the ARRIVING slide. So every slide after the first waits one hold
on arrival, narrated or not, and a deck segment's length is its `holdMs` plus
its narration.

- **`slide`** — a narrated deck slide: `holdMs` (0 on the first slide), then its
  track.
- **`hold`** — a slide with no narration: its arrival hold and nothing else. An
  empty cue list goes straight to `endSlide` (`player-core.mjs`), so the slide
  is on screen for exactly that hold. The first draft had no such kind, and its
  first revision placed the hold on the wrong side of the slide (§12).
- **`stretch`** — in a tour, the run between two waits (`until`, `awaitUser`, an
  async `act`).

### 4.4 `seekable` replaces "planned vs resolved"

The first draft had two states, planned and resolved, and said `stateAt` took
only a resolved file. The red team showed two holes: the surfaces listed as
callers work from planned files, and a captions-only export has no clips, so it
can never be "resolved" at all (§12). So the states are replaced by one property:

- **`seekable: true`** — every segment has a known length, so the segments lay
  end to end on one absolute timeline. A deck is always seekable: every
  segment's length is its `holdMs` plus its narration, and the narration's length
  is the track's estimate or, once measured, the clips' lengths plus the breaths
  between them. The conformance fixtures (§8) pin that arithmetic against the
  player, including the breath the player holds after a slide's last sentence. A tour is seekable only once a run has been recorded,
  because a recording fills in how long each wait took.
- **`seekable: false`** — some wait's length is unknown. A tour before a run.

`basis` on each segment says how far to trust its numbers: `estimate`
(Cadenza's text-only calculation), `measured` (re-timed to a real clip), or
`legacy` (converted from a deck exported before the LTT, §8 step 1).

### 4.5 Staleness, and the data a reader must never throw away

The first draft had one whole-source hash and said a reader "rebuilds" on a
mismatch. The red team showed three ways that goes wrong: Cadenza's package
version (`0.1.0`) has never moved, so it cannot detect an engine change; a
re-voiced clip changed nothing the hash covered; and a typo on slide 30
invalidated every measured clip and every recorded wait — data that cannot be
rebuilt. The rules now:

- **Hash per segment**, over that segment's narration text plus the file's
  `inputs`, and for a tour stretch also the storyboard steps it spans (actions,
  targets, `after` waits). A typo invalidates one segment, and so does moving
  an action's target, which changes how long the recorded waits took.
- **`inputs.engine` is a content hash of the timing engine's build**, not its
  package version.
- **`audio.clip` is a content hash of the clip bytes**, and `audio.voice`
  records what spoke it.
- **On a mismatch, mark stale; never auto-rebuild measured data.** An
  estimated segment may be rebuilt freely. A measured segment or a recorded wait
  is flagged stale and kept until a producer re-measures it.
- **One named function, `isStale(ltt, source)`, with callers from day one**:
  the export pipeline and the Studio (guardrail G3, §8).

### 4.6 Tours: what a recording depends on

How long a tour takes depends on the screen and the theme, not only the text.
The cursor leaves early by `stage.leadMs`, which returns `(register + travel) *
pace` (`docs/src/lib/vetrina/stage.ts`): travel scales with the distance the hand
crosses (Fitts's law), and in a reduced motion tier it is a flat 160 ms, still
multiplied by `pace`. The motion tier comes from `theme.motion` (`full`,
`legible` or `still`), with a reduced-motion device landing on `legible`, and
`pace` from `theme.pace`. The storyboard delays a whole line when the hand is
behind (`storyboard.ts`). A run recorded at 1440 px therefore plays wrong at
390 px. So a recorded tour carries `inputs.viewport`, `inputs.motion` and
`inputs.stagePace`, and a player that differs from any of them treats the
recording as a guide, not a timeline: it recomputes the hand's lead per run.

### 4.7 Actions keep the word the author named

`{cue, word}` alone loses what the author wrote. An author writes `at: 'Publish'`,
and Vetrina resolves it by first match (`findCueWord`, `narrate.ts:94`). A text
edit earlier in the stretch, or a segmenter change, shifts the indices, and
nothing could tell. So each action also carries `match`, the normalized word
the author named, and `validateLtt` fails when the word at `{cue, word}` no
longer matches it. (A lexicon edit alone does not shift indices: words are
display tokens, so `$4.2M` stays one word. The red team checked this against
`buildTrack`.)

## 5. The timing functions, and the transport they do not replace

The first draft proposed one function, `stateAt(ltt, t)`, and claimed the HTML
player and the video "cannot disagree" because both would call it. The red team
showed the claim was false for the player as it exists (§12):

- **There is no deck-wide clock in the player.** The audio element's
  `currentTime` restarts on every cue (`a.src=c.a` per cue); silent cues run on
  `Date.now()`; breaths and slide holds are bare `setTimeout`s.
- **Some truth only arrives at run time.** The player re-times each cue to the
  browser's decoded clip length (`cursor.align`), and advances on `onended`, not
  on a computed time. A variable-bitrate MP3 without a Xing header decodes to
  different lengths in different browsers.
- **The player holds state no function of time can see:** pause stops and
  restarts the slide rather than resuming mid-word; manual navigation speaks with
  no hold; autoplay refusal and decode failure are events; `isSection` reads the
  live DOM.

So the design splits the job in two.

**`positionAt(segment, localMs)`** — a pure function that works on any segment
of any LTT, seekable or not. Given a time inside the segment, it returns the
cue, the word, the caption line and the actions due. This is the math the
player's crawl, Present's highlight, Vetrina's word cue and the video renderer
all need, and today each re-implements it or reaches for `makeCursor`.

**`timeline(ltt)`** — for a seekable file only, lays the segments end to end
and returns each one's absolute start. With it, `timeline` plus `positionAt`
answers "what is on screen at 0:42.300", which is what video export needs.

**The transport stays a state machine, and the spec specifies it.** Advance,
hold, speak; pause restarts the slide; manual navigation re-anchors with no
hold; **advance on clip end is normative**, not advance on a computed time;
decode failure falls back to the estimate. These are rules today only because
`player-core.mjs` happens to implement them. The spec writes them down so a
second player can implement the same behavior, and so the video renderer's
simulated transport follows the same rules as the live one.

Every surface then uses the same timing math with its own clock:

| Surface | Clock | Uses |
|---|---|---|
| HTML player | the clip's `currentTime` within a segment | the transport, `positionAt` |
| Present (Studio) | Suono's clock within a segment | the transport, `positionAt` |
| Video export | frame number × frame length | a simulated transport, `timeline`, `positionAt` |
| A test | any number it likes | any |

The honest version of the jank claim: the surfaces cannot disagree about **which
word is lit at a given point inside a segment**, because they share
`positionAt`. They can still disagree about **segment lengths** where one
measured a clip and another did not; that is exactly what `basis` records.

**Inlining.** The HTML player is CSP-hashed and cannot import. It inlines
Cadenza's `makeCursor` by serializing the function's source (`capKernel`).
`positionAt` and `timeline` must be inlinable the same way, and two rules keep
them so: they go under `test/unit/export/inlinable-kernels.test.js`, **run
against the minified production output too** (the docs bundle has broken an
inlined kernel through minifier renames before, `player-core.mjs` `playerJs`);
and the word lookup is **one** implementation. `makeCursor` keeps its lookup
inside the function on purpose, because an inlined copy can reach no module
scope (`cursor.ts`), so the lookup cannot move out of it on its own. Instead
`makeCursor` moves **whole and unchanged** into `ltt` in step 2, the step that
changes export bytes anyway; `positionAt` calls it, the player inlines both, and
Cadenza re-exports it. There are never two lookups to drift.

## 6. Where the code lives

Five libraries are boundary-gated in `tools/check-ownership.js`, and each gate
allows different things:

| Library | Gate | Allows beyond in-folder imports |
|---|---|---|
| Cadenza | `checkCadenzaBoundary` | `node:` built-ins; static `from` imports only are matched |
| Vetrina | `checkVetrinaBoundary` | `node:` built-ins; `react` / `react-dom` in `react.ts` only; static `from` imports only are matched |
| Suono | `checkSuonoBoundary` | also catches side-effect, dynamic `import()` and `require()` imports |
| Lente | `checkLenteBoundary` | same pattern set as Suono |
| Anima | `checkAnimaBoundary` | intra-library `../` imports; sanctioned engine dependencies (`zdog`, `animejs`, `animejs/svg`) per backend file |

Fork B settled the home (§9.1): the format gets its own package,
`@laticent/ltt`, and the libraries may import it. The owner's ruling is that a
shared library we own, carrying a contract this critical, is a sanctioned
dependency rather than a breach of the spin-off promise. Each library stays free
of every OTHER outside dependency, and `ltt` itself imports nothing.

| Piece | Home | Why |
|---|---|---|
| The LTT types (core, envelope, layers), `validateLtt`, `isStale`, `positionAt`, `timeline`, and (from step 2) `makeCursor` | **`@laticent/ltt`**, at `docs/src/lib/ltt/`, gated to in-folder imports with the **Suono pattern set** (the strictest) | A format someone else adopts needs a reference implementation that is only the format. Every type is defined once, here. |
| `Word`, `Cue`, `CaptionTrack` | **moved into `ltt`**; Cadenza's `index.ts` re-exports them | So every existing importer keeps working unchanged: `PresentCaption.tsx`, `read-aloud.ts`, `cadenza-narrator.ts`, and Cadenza's own `builder.ts`, `cursor.ts`, `reader.ts`, `vtt.ts`. |
| `buildTrack`, `BuildOptions`, `EmphasisSpan` | **stay in Cadenza** | They are the engine, not the format. |
| `validateTrack` | **becomes the core check inside `validateLtt`**; Cadenza re-exports it | One structural validator, not two. |
| Producers: deck → LTT, player payload ↔ LTT, legacy → LTT | **`lib/core/`** | Beside `read-along-build.js` and `read-along-vtt.js`, which already consume the built packages from Node. |
| The actions layer | **defined in `ltt`, used by Vetrina** | No mirror and no parity test. |
| Tour recorder (writes a seekable LTT) | **`docs/src/lib/vetrina-narration/`** | It sits above the libraries, where `cadenzaNarrator` already lives. |

**A gate opens only in the step that adds its first import.** Cadenza's opens in
step 1 (it imports the moved types). Vetrina's opens in step 4 (the actions
layer). Suono imports nothing from `ltt` today (0 references to `CaptionTrack`),
so its gate stays closed until a step needs it. No new CI step: these are rule
changes inside `build:check`.

**Publishing.** Cadenza's `package.json` publishes `types: ./index.ts`, so once
it imports `ltt`, Cadenza's npm consumers need `@laticent/ltt` too, and the two
publish in lockstep. Cadenza's description ("Zero-dependency") changes to "no
dependency except `@laticent/ltt`". *(Step 2: no workflow publishes the workspace libraries yet, so "lockstep"
is a requirement on the publish path when it is built, not something that
happens today — `followups.d/2360-p3-publish-workspace-libraries.md`.)*

## 7. Size, measured

A 141-word sample (three repeats of a five-sentence board paragraph with a
percentage, a currency figure and an acronym) run through the real
`buildTrack` at `pace: 'moderate'`:

| Encoding | Lossless? | Bytes | Per word | Gzipped |
|---|---|---|---|---|
| Canonical: `CaptionTrack`, named keys, every field | yes | 13,718 | 97 | 2,391 |
| Canonical minus `spoken` when equal to `display`, minus `endMs` when it equals the next `startMs` | yes | 9,815 | 70 | 1,887 |
| **Packed, lossless**: cues and words as tuples, times relative to the cue, `spoken` and `weight` only when present | yes | 4,400 | 31 | 856 |
| Today's player payload (`[word, start, end]` triples) | **no** — drops `spoken`, `charOffset`, `weight` | 3,646 | 26 | 579 |
| `.vtt` | no | 3,025 | 21 | 978 |

The first draft compared against today's player payload and called the packed
form lossless. It was not: that payload drops three fields (§12, red team 6).
The lossless packed row above was measured for this revision. It costs 21% more
than today's payload raw, and it is 2.8x smaller than the canonical form gzipped.

So the spec defines **one data model with two encodings**: canonical (named
keys, what tools read and write) and packed (the lossless tuples above, what
the HTML export embeds). Conversion is lossless both ways. The round-trip test
runs over **every field the schema defines**, generated from the schema rather
than listed by hand, so a field added to one encoding and not the other fails
the test (guardrail G1).

Reproduce: run `require('@laticent/cadenza').buildTrack(text, { pace: 'moderate' })`
where `text` is this paragraph repeated three times, then measure each encoding
with `JSON.stringify(...).length` and `zlib.gzipSync(...).length`:

> Revenue grew 18% to $4.2M this quarter, led by enterprise renewals. ARR crossed
> the ten million mark in August. Churn fell for the third straight quarter. We are
> raising guidance for the full year. The board is asked to approve the hiring plan
> on the next slide.

Each repeat ends with a space. The full script is in PR #2339's description, and
step 1 commits it as a fixture.

## 8. Order of work, and the guardrails that ride with it

**Guardrails.** The inversion pass (§12) found the note repeating the repo's two
known failures: a spec that drifts from what ships (`readAlong` 1.0 was
specified, 1.1 shipped differently — `lattice-doc.js` `READ_ALONG_VERSION`), and
a kernel that ships with no caller (`validateTrack` "shipped … and then had no
caller, which is how a diagnostic rots" — `read-along-vtt.js`). Each guardrail
lands in the step named.

- **G1 — one source for the schema** (step 1). The JSON Schema is generated from
  the `ltt` TypeScript types, and a `build:check` arm fails when they differ.
  The round-trip test is generated from the schema.
- **G2 — no function ships without a production caller** (step 2). `positionAt`
  and `timeline` land in the same step as the HTML player calling them.
- **G3 — staleness has a named function and callers** (~~step 2~~ **step 4**,
  amended 2026-09-24; see "Amendments in step 2" below).
  *Originally: step 2, with the first production producer.* `isStale` is called by the export pipeline and the
  Studio from the day it lands, with a test that edits the source and asserts
  the stale segment is flagged and the measured data is kept. It cannot land in
  step 1: nothing in production writes an LTT until step 2.
- **G4 — a rule for what may become a layer, with an owner** (step 1).
  `engineering/ltt.md` names the spec's owner; a new layer must change what
  `positionAt` returns and needs its own decision record.
- **G5 — scope is stated, not implied** (step 1). The spec says what video
  export guarantees: narration, captions, slide and hold timing, and tour
  actions from a seekable recording. It says what it does **not** guarantee in
  1.0: Anima motion (`animaJs`, which the player receives separately) and the
  cursor's position mid-travel (an `on-word` action records where the cursor
  lands, not where it is at every frame). Either may become a layer under G4.

**Steps.** Each ships on its own. Step 1 changes no export bytes; step 2 is the
first that does, and it stops for the owner's sign-off.

1. **The package, the spec, and the fixes.**
   - Wiring: `docs/src/lib/ltt/` as a workspace in the root `package.json`;
     `tools/build-ltt-lib.js` with `ltt-lib:build` and `ltt-lib:check` scripts;
     a step in `tools/build.js` ordered before the Cadenza build; rows in
     `tools/build-capabilities.js` (HARD RULE #15); `@laticent/ltt` in Cadenza's
     `package.json` dependencies; the `ltt` boundary gate; Cadenza's gate widened
     to admit `@laticent/ltt` and nothing else.
   - Move the TYPES `Word`, `Cue` and `CaptionTrack` into `ltt`; Cadenza
     re-exports them (§6). Types only: `makeCursor` stays put until step 2, so
     the function the export inlines is untouched and no export byte moves.
   - `engineering/ltt.md` (the spec, with its owner and the transport rules of
     §5), the generated JSON Schema, `validateLtt`, and G1, G4 and G5.
   - Converters: `CaptionTrack` ↔ canonical ↔ packed, and **legacy → LTT from the
     packed blocks already in exported decks**, marked `basis: "legacy"`. Not
     re-derived from source: `readAlong` 1.1 carries no text, no track and no
     pace, and re-running today's Cadenza could produce cue boundaries that no
     longer match the clips baked into those decks. The packed blocks drop
     `spoken`, `charOffset` and `weight`, and the core requires the first two, so
     the converter FILLS them: `spoken` is set to `display`, `charOffset` comes
     from a forward scan of each word through its cue's text (the same
     best-effort scan `buildTrack` uses), and `weight` stays absent, which the
     core already means as "ordinary". A legacy segment is therefore a valid
     core; `basis: "legacy"` is what tells a reader the spoken form and offsets
     were reconstructed rather than computed.
   - The drift fix: both Vetrina narrators take `acronyms`, `lexicon`, `lang` and
     `emphasis` as options, passed in by the host that builds the tour (a
     storyboard has no deck front matter, so the host supplies them), plus a
     parity test that pushes one sentence through the deck producer and both
     narrators and asserts identical timings.
2. **The timing functions and the HTML player, together** (G2, G3).
   `positionAt` and `timeline` with **conformance fixtures**: sample `.ltt.json`
   files and the expected result at chosen times, written against the HTML
   player's current behavior (no hold on the first slide, one arrival hold on
   every later slide, `hold` segments, breaths including the one after a slide's
   last sentence, silent-cue holds, lead trim). `makeCursor` moves whole and
   unchanged into `ltt`. The HTML player reads the packed LTT and drives its crawl
   from `positionAt`, with the transport following the specified rules; the
   fixtures run against the **inlined, minified** copy. `isStale` lands with its
   callers. **This changes export bytes, so it stops for the owner's sign-off**
   on a demo deck rendered in dark and light mode (CLAUDE.md §Quality Bar).
   Decks already exported keep playing: each carries its own player.
3. **Video export.** A simulated transport over `timeline` and `positionAt`,
   headless Chromium stepping frame by frame, the measured audio on the same
   timeline, and a `.vtt` from the same LTT. Its own decision note, because it
   brings a muxer: [`2026-09-25-video-export.md`](2026-09-25-video-export.md)
   (proposed, with a measured spike).
4. **Vetrina.** Its gate opens; the actions layer; `Narrator.plan()` returns the
   core's cue and word shape instead of a flat list; the tour recorder writes a
   seekable LTT with `viewport`, `motion` and `stagePace`.

What each step does **not** do: none of them changes what a viewer sees on the
deck path today. That path already passes every input and already looks right.

**Amendments in step 2 (2026-09-24).** The first two are owner rulings. The rest are calls and measurements made while building step 2, recorded here for review.

- **The audio layer is one clip per cue**, not per segment: `audio = { voice,
  clips[] }`, each clip `{ cue, src, clip, measuredMs?, leadMs? }`. Revised inside
  1.0 because no file had carried the layer. The per-segment layer would have
  meant joining clips with the breaths recorded as silence: on a 13-slide,
  87-sentence deck, 14.2 s of encoded silence (~113 KB at 64 kbps), 4 s of encoder
  lead at the joins, and a transport that could no longer advance or re-time per
  sentence (transport rules 3 and 7). `engineering/ltt.md` §Layers.
- **`isStale` moves to step 4.** Step 2's only producer builds the LTT fresh from
  source at the moment of export, so a caller in the export pipeline or the
  Studio could never see a stale segment: a kernel with no real caller, which is
  what G2 and G3 exist to prevent. It lands with the tour recorder, the first
  producer that keeps an LTT and holds measured waits that cannot be rebuilt.
- **`inputs.engine` hashes the engine's source, not its bundle**
  (`tools/lib/timing-engine-hash.js`): `buildTrack`'s own file and its import
  closure, because the Studio runs Cadenza from source and never sees the
  bundle, and because an edit to the validator should not mark measured data
  stale. It is regenerated by its own script, not by `npm run build`, so CI
  sees a stale commit instead of repairing it first.
- **G2 is met for `positionAt`, and not yet for `timeline`.** The exported
  player calls `positionAt` for every hold, silent cue, breath and crawl frame.
  `timeline` has no production caller until video export (step 3); in step 2 it
  is called by tests and the real-browser verifier only.
- **Measured: the HTML player runs late of `timeline()` by ~100 ms per clip.**
  Chromium fires `ended` 90–110 ms after the audio stops, and rule 3 advances on
  `ended`. The HTML export also records no `measuredMs`, so its `timeline()` is
  an estimate for voiced cues. Both belong to step 3's decision note.
- **Fork D is built:** the manifest's `readAlong` moves to 2.0 and carries
  `timing`, naming the LTT block by its MIME type.

## 9. Forks for the owner

The owner settled all four on 2026-09-24.

- **A. Name and extension — settled: `*.ltt.json`.** "Lattice Timing Track".
  Editors, `JSON.parse` and schema validators work with no setup. A bare `.ltt`
  was declined because every tool would need to be told it is JSON.
- **B. Where the code lives — settled: a shared `@laticent/ltt` package the
  libraries may import.** §9.1 records the options and the ruling.
- **C. One encoding or two — settled: two (§7).** Canonical for tools, lossless
  packed for the HTML export.
- **D. Embed or reference in the HTML export — settled: embed.** The packed form
  rides inline, because the export's contract is one self-contained file with no
  network access. The manifest's `readAlong` points at the embedded block and
  moves to version 2.0.

### 9.1 Fork B, the options and the ruling

The HTML player cannot import at all; it copies a function's source into itself
(`capKernel`), so the timing functions must be self-contained (§5). For scale,
Cadenza's built bundle is 44,582 bytes (15,116 gzipped), most of it text
normalization, segmentation and the lexicon. `makeCursor`, the function the
player copies today, is 2,326 bytes of source.

| | 1. Inside Cadenza | 2. A format-only `ltt` package the libraries import | 3. A format-only `ltt` package nothing imports |
|---|---|---|---|
| Gate changes | none | each importing library's gate admits `@laticent/ltt` | none; the new package gets its own gate |
| Copies of each type | one | one | two, pinned equal by tests |
| What a third-party player must take | all of Cadenza | only the format | only the format |
| Libraries stay zero-dependency | yes | no; "no dependency except `ltt`" | yes |

**The ruling (2026-09-24): option 2.** The owner chose a format-only package and
ruled that the libraries may import it: a library we own, carrying a contract
this critical, is a sanctioned dependency, so there is no reason to keep a
second copy of each type. (The owner's words picked "option 3"; the checker
pointed out that a format-only package the libraries import is option 2 in this
table, and the note records it by its content.) A third-party player still takes
only `ltt`. What changes is the spin-off promise: each importing library becomes
"no outside dependency except `@laticent/ltt`", enforced by its gate admitting
exactly that one import.

## 10. What "playable anywhere" does and does not mean

Being a standard means someone can implement the LTT without reading our code:
a spec document versioned apart from the implementation, a published JSON
Schema, conformance fixtures every player must pass (ours included), and a
reference player.

What that reference player covers, stated plainly: the HTML export plays
**decks** — the packed encoding, slides and holds, audio and captions. It
ignores `actions` and `after`, so it is **not** a reference player for tours,
and it reads the packed form only, so a tool writing canonical `.ltt.json`
converts first. A reference tour player is future work.

It does **not** mean other tools read `.ltt.json` on day one. Nobody outside
Lattice will at first. Portability starts with every Lattice export carrying its
own player and degrading to formats that already play everywhere: MP4 plus
`.vtt` for video, `.vtt` for screen readers and generic players, PDF for print.
Those fallbacks need absolute times, so they exist only for a **seekable** file:
any deck, and a tour once a run is recorded. A tour with unrecorded waits has no
MP4 or `.vtt` form. Adoption by other tools is what makes the LTT a standard, and
that is earned, not declared.

## 11. What this note does not decide

- The video export's encoder, muxer and frame rate (step 3's own note,
  [`2026-09-25-video-export.md`](2026-09-25-video-export.md)).
- Whether Vetrina's default pacing flips to `'grounded'`. That is still the open
  follow-up in `2026-09-13-vetrina-cursor-caption-narration.md`; the LTT neither
  requires nor blocks it.
- Finer-than-hybrid word timing (`2026-07-08-word-level-sync.md`). A finer track
  carries finer numbers in the same schema. The inversion pass notes the cost of
  fork B here: a change to Cadenza's word model is now a format version bump.
- Whether the CSP hash stays stable once the timing functions are inlined, and
  rounding drift over many cues in the player's `expandTrack`. The red team did
  not attack either; step 2 measures both.

## 12. What the adversarial trio found

The trio ran on the first full draft (branch head `725ff70`), after an earlier
fact-check of the note's claims about the current code.

**Red team — eight findings, all taken.**
1. *Critical:* a single `stateAt(ltt, t)` cannot replace the player's
   event-driven transport — no deck-wide clock, run-time truth, invisible state.
   → §5 splits the job into `positionAt` / `timeline` and a specified transport;
   `hold` segments added (§4.3).
2. *High:* the planned/resolved split contradicted the surface table, and a
   captions-only export fit neither. → `seekable` replaces it (§4.4).
3. *High:* staleness undetectable three ways. → per-segment hashes, an engine
   content hash, a clip hash, mark-stale-never-rebuild (§4.5).
4. *High:* tour timing depends on viewport and reduced motion. → recorded in
   `inputs` (§4.6).
5. *Medium-high:* `{cue, word}` loses the authored anchor. → `match` plus a
   validator check (§4.7).
6. *Medium:* the packed form was not lossless, and 1.1 migration cannot be
   re-derived. → lossless packed form measured (§7); legacy converted from the
   packed blocks with `basis: "legacy"` (§8 step 1).
7. *Medium:* inlining from a separate package. → minified-output test, one
   lookup implementation, lockstep publishing (§5, §6).
8. *Medium:* §10 overclaimed. → rewritten.

**Inversion — five guardrails, all taken** as G1–G5 (§8). Its strongest case
against the whole design is answered in §2.

**Checker — six findings, all taken.** `basis` moved out of the core so the
`CaptionTrack` really is unchanged, and the example shows `spoken` (§4.1); a
stale §5 sentence removed; the gate table corrected to five libraries with their
real allowances (§6); the fork B ruling named as option 2 (§9.1); gates open
only with their first importer (§6); and step 1 now lists the wiring a junior
engineer would otherwise have to ask for (§8).

**Second checker pass — nine findings, all taken.** A fresh checker read the
revision above (branch head `a9df155`) and found three contradictions and six
smaller gaps:
1. The hold was on the wrong side of the slide: the player advances first and
   then holds on the slide that arrived, so every slide after the first waits
   one arrival hold. → `holdMs` on deck segments, and a `hold` segment is an
   empty slide's arrival hold (§4.1, §4.3, §4.4).
2. Moving the word lookup out of `makeCursor` in step 1 would have broken the
   inlined player or changed export bytes early. → step 1 moves types only;
   `makeCursor` moves whole in step 2 (§5, §8).
3. Legacy segments would have failed the required core. → the converter fills
   `spoken` and `charOffset` (§8 step 1).
4. Step 2 could not "ship on its own" and also "merge only with step 3", and G3
   had no producer to call it in step 1. → the old steps 2 and 3 are one step,
   and G3 lands there (§8).
5. Tour timing also depends on the motion tier and `theme.pace`. → `inputs.motion`
   and `inputs.stagePace` (§4.6).
6. The `hold` example broke the required-field table. → the table now says
   which fields each segment kind carries (§4.2).
7. Segment hashes missed storyboard edits. → a stretch's hash covers its steps
   (§4.5).
8. The gate table missed Vetrina's `node:` allowance and Anima's `../` and
   `animejs/svg`. → corrected (§6).
9. The example track showed three words of nine without saying so. → marked.

## Related

- `2026-07-07-cadenza-caption-timeline.md` — the `CaptionTrack` model this wraps.
- `2026-07-08-read-along-export-manifest.md` — specified the full track inside the
  manifest (`readAlong` 1.0); what shipped as 1.1 moved it out. The LTT puts the
  pieces back together.
- `2026-07-12-suono-audio-library.md` — the audio layer's owner.
- `2026-09-13-vetrina-cursor-caption-narration.md` — the `Narrator` port and the
  word cue.
- `2026-09-23-portable-packages.md` — the same portability goal for themes,
  components, finishes and motion.
