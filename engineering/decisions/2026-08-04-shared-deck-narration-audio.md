---
status: proposed
summary: A shared deck cannot speak. Everything built for "the deck presents itself" — the persistent clip store, adaptive prefetch, the presentation beat, the readiness rail — stops at the Studio boundary, so the rail's stated audience cannot exist on any shipped surface. This answers the five open questions (format, size, staleness, whose voice, pace) and specifies the build. It is NOT built: it changes the bytes of an exported artifact, which is a maintainer sign-off gate, and it is an export-format fork that bears on #757.
companion:
  - ./2026-08-03-present-instant-audio-pacing-guide.md
  - ./2026-07-08-read-along-export-manifest.md
---

# Giving a shared deck a voice

**Status:** PROPOSED — design only. Issue #1393.
**NOT IMPLEMENTED, deliberately.** Two reasons, both gates rather than preferences:

1. It changes the **bytes of an exported artifact** (the HTML player's CSP and its inline
   script). CLAUDE.md makes that a hard stop: render a representative deck in both modes and
   get maintainer sign-off before it ships.
2. It is an **export-format fork**. The five questions the ticket lists are not implementation
   details — they decide what a `.lattice` artifact IS, and they bear directly on #757 (the
   self-contained player + asset envelope). Answering them in code without answering them out
   loud is how a format decision gets made by accident.

Everything below is the design, with a recommendation on each open question, so the decision is
one round rather than a discovery.

## The gap, stated once

| Surface | Narration today |
|---|---|
| Author rehearsing in Studio Present with their own key | everything |
| A deck shared as a link or file | **none** |
| An exported deck a board member opens | **none** |

`share-export.ts` says so in as many words — *"No audio, no TTS key — captions only"* — and
`lib/export/player-core.mjs` contains zero references to voice, TTS, audio or speech. The voice
ladder reads the **viewer's** key, so a recipient without one floors to `silent`.

Which means the readiness rail — justified explicitly by *"the audience of a self-presenting
deck, who cannot tell a buffering silence from a crashed page"* — is today seen only by the
deck's author, on their own machine, about their own laptop's buffer. That is the inversion
lens's charge and it lands.

## What is already in place

More than it looks:

- **The bytes exist and are addressable.** The on-device clip store (#1352) holds synthesized
  audio under a content-complete key (`rung | model·voice | speed | sentence`). Baking is
  reading a cache, not synthesizing.
- **The manifest already has the slot.** `lib/core/lattice-doc.js` documents
  `readAlong.slides[].audio`, carries it verbatim, and `lattice-doc.test.js` pins that it
  round-trips byte-exact. Nothing populates it.
- **The deck already carries its rhythm.** Front-matter `pace:` shipped (#1399), and survives
  both export carriers.
- **The player already has a transport.** `present-transport.mjs` is shared with the Studio.

What is missing is a producer, a consumer, and one CSP line.

## The five questions, answered

### 1. Format — inline data URIs, not a sidecar

The exported player's whole contract is that it is ONE file: `default-src 'none'`, fonts and
images already inlined, no network origin permitted at all. A sidecar bundle would be the first
thing in it that can arrive broken, and "the deck plus a folder you must keep next to it" is a
different product. Inline as `data:audio/mpeg;base64,…` on `readAlong.slides[].audio[]`.

The cost is honest and should be stated in the UI rather than hidden: base64 inflates by ~33%.

**This is the question most worth a second opinion**, because it is the one that constrains
#757. If the asset envelope there is going to be a real container (zip-in-HTML, or a `.lattice`
bundle), audio belongs in it and this becomes a temporary shape.

### 2. Size — opt-in, with the number shown before the write

A spoken sentence is ~10–40 KB of mp3; base64 makes that ~13–53 KB. A 60-slide deck at ~5
sentences a slide is ~300 clips — **4–16 MB**, call it ~10 MB typical. That is a large email
attachment and a perfectly ordinary download.

So: a checkbox in the Share sheet, **off by default**, that names the cost *before* the write
("Include narration — 47 clips, ≈6.2 MB"). Never a silent 10 MB.

### 3. Staleness — bake what exists, report the coverage, never refuse

Clips are keyed on sentence text, so any edit orphans the clip for that sentence. The three
candidate behaviors:

- *Re-synthesize on export* — turns a download into a billed, minutes-long job. No.
- *Refuse until complete* — makes the feature unreachable for exactly the decks people edit. No.
- **Ship what is there, and say what is missing.** A sentence with no clip is simply silent; its
  caption still shows, and the deck still advances on the reader's clock. Export reports "42 of
  47 sentences have audio" so the author can Prepare and re-export if they care.

Partial audio is not a degraded state to be ashamed of — it is the same graceful floor the live
reader already has when a synth times out.

### 4. Whose voice — the author's, baked at export

The author's chosen model/voice/speed, from their own cache. This is a real relocation: the
voice stops being a property of the viewer's settings and becomes a property of the artifact.
That is right for a presentation — the deck is a performance, and the presenter chose the
narrator — and it is the only answer that works at all, since the recipient has no key.

Record the voice identity in `readAlong.voice` (the manifest field already exists) so the
artifact can say what it was narrated with.

### 5. Pace — the deck already carries it; the player does not yet read it

Half done, and worth being precise about which half. What ships today is the **carrier**:
front-matter `pace:` (#1399) survives both export paths — the `.lattice` envelope byte-exact and
the baked `application/lattice-front-matter` block — and `test/unit/core/pace-export-roundtrip.test.js`
pins that at both boundaries.

What does **not** exist is a **consumer**. `lib/export/player-core.mjs` contains no reference to
`pace` at all; the exported player advances on its own timing and would ignore a declared pace
today. So this is not "nothing more to do" — it is one small addition on the player side, which
belongs with the audio transport in step 3 of the build below rather than as a separate change:
read the baked front matter the player already parses, resolve **millisecond override → deck
`pace:` → default** (the player has no workspace preset, so the middle rung of Present's order
collapses out), and hold that beat at the slide boundary.

The reason it is cheap is that the hard part — getting the author's choice out of `localStorage`
and into the artifact — is the part that shipped.

## The build

1. **Producer** — `share-export.ts`: for each slide's projected sentences, look up
   `voice.clipKey(sentence)` in the clip store, base64 the bytes, and emit
   `readAlong.slides[].audio[]` aligned to the caption track already built there. Coverage is
   counted and surfaced. Nothing synthesizes.
2. **Carrier** — none. `buildEnvelope` already carries `readAlong` verbatim.
3. **Consumer** — `playerJs` in `lib/export/player-core.mjs`: on Play, walk the current slide's
   clips through one `Audio` element, advance the caption highlight off `timeupdate`, hold
   `slideBeatMs` at the boundary, then advance. **`slideBeatMs` is where §5's missing consumer
   lands** — resolve it from the baked `pace:` rather than a constant, and the deck's declared
   rhythm finally reaches a viewer. Two constraints the file already imposes: the
   script is **pure ASCII** (WebKit's hashing), and anything lifted from a shared kernel is
   inlined by `.toString()` so it may not reference module-scope bindings.
4. **CSP** — add `media-src data:`. One line, and the reason this needs sign-off.
5. **The rail** — out of scope here, but named: the readiness band lives in the React
   `PresentRail` while the player rides the vanilla transport. When narration ships with a deck
   the band should land somewhere both surfaces read (HARD RULE #1), not be reimplemented. That
   is the follow-up this work makes worth doing, and it is also the thing that finally gives the
   rail the audience it was built for.

## What would make this wrong

Stated in advance, so review has something to aim at:

- If #757's envelope lands first, inline data URIs are the wrong shape and this should wait.
- If a typical real deck bakes to 30 MB rather than 10, "opt-in with the number shown" is not
  enough and the format question reopens.
- If the player's audio path cannot hold sync with the caption highlight as well as Suono does,
  a viewer gets a worse experience than the captions-only export they have now — which would be
  a regression dressed as a feature.

## Verification this will need (HARD RULE #23)

Not test suites. A real exported file, opened from disk, in a real browser, with the network
off — because "no network in the loop" is the entire claim. Both light and dark. Plus the
export sign-off artifacts CLAUDE.md requires for any change to exported bytes.
