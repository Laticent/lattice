---
status: shipped
summary: SHIPPED (see the amendment). A shared deck cannot speak. Everything built for "the deck presents itself" — the persistent clip store, adaptive prefetch, the presentation beat, the readiness rail — stops at the Studio boundary, so the rail's stated audience cannot exist on any shipped surface. This answers the five open questions (format, size, staleness, whose voice, pace) and specifies the build. Built on top of this, with §3 reversed (an incomplete set is refused and the export synthesizes to complete it), §2's one checkbox split into separate caption/audio switches, and the voice chosen at export.
companion:
  - ./2026-08-03-present-instant-audio-pacing-guide.md
  - ./2026-07-08-read-along-export-manifest.md
---

# Giving a shared deck a voice

**Status:** SHIPPED. Issue #1393. See the amendment at the end for the four places the
build changed what is proposed below — including a straight REVERSAL of §3 — and why.

**Originally NOT IMPLEMENTED, deliberately.** Two reasons, both gates rather than preferences:

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

---

## Amendment — what the build changed (2026-08-09)

Built on `claude/prioritize-stack-issues-qw8mjr`. Two of the five answers shipped as
recommended (format's *shape*, and whose voice). Three changed, and one of them is a
straight reversal of the recommendation above.

The body of this note is left as it was WRITTEN — a proposal, in the present tense, with its
recommendations intact — so this section reads as a record of what review and use changed,
rather than as a design that was always right.

### 1. §3 is REVERSED: an incomplete set is refused, and the export synthesizes to complete it

§3 rejected both alternatives and recommended *"ship what is there, and say what is
missing,"* on the reasoning that partial audio is the same graceful floor the live reader has
when a synth times out, and that refusing would make the feature unreachable for the decks
people actually edit.

The first half of that reasoning does not hold. **It is not the same floor.** The live
reader's gap is a second inside a delivery the author is watching, on a deck they can re-run.
A baked artifact is opened once, by someone else, with no way to fix it and no idea anything
is wrong — the failure mode is a presenter who stops mid-argument in front of a board.
"42 of 47 sentences have audio" is a number the author reads and dismisses; the missing five
are what the audience gets. Partial coverage is not a graceful floor here, it is a defect
that only shows up where nobody can do anything about it.

The second half — that refusing makes the feature unreachable — was true of a bake that could
only read a cache. It stops being true once the export can also **write** to it. So the two
rejected options are combined rather than chosen between:

- The device answers first. Every sentence rehearsed in Present is already stored under a
  content-complete key and costs nothing.
- Whatever is missing is **synthesized at export**, in the chosen voice, three at a time with
  three attempts and exponential backoff — and **banked in the persistent store as it lands**,
  so a cancelled or refused run is never wasted money, and the next rehearsal finds it too.
- If any sentence is still missing when that finishes, the export **refuses** and names the
  sentences and the reason. Nothing is written.

§3's objection to re-synthesizing — *"turns a download into a billed, minutes-long job"* — is
answered by §2's own mechanism rather than by accepting a worse artifact: the cost is
**quoted before the run**, not discovered during it. The panel states how many sentences are
already prepared, how many will be billed, roughly what that costs at the model's published
per-character rate, roughly how long, and what the file will gain. A model the catalog has no
price for quotes *nothing* rather than zero.

**The known sharp edge, stated plainly.** Clips are keyed on rung, model, voice, speed and
text, so an author who rehearsed on the on-device Kokoro rung — or in any voice other than the
one they pick at export — has **zero** cache hits and is billed for the whole deck. That is a
real and legitimate thing to want (a board deck may deserve a different reader than an
author's working voice), so the panel prices it instead of blocking it, says explicitly why
nothing is cached, and points at the two cheaper routes: rehearse first, or pick the voice you
rehearsed in. The default narrator is the workspace's own cloud voice, so the common path
costs nothing.

### 2. §2's single checkbox is two switches — captions and audio are separate options

§2 specified one opt-in ("Include narration"). In use that conflates two things with wildly
different costs. The caption TRACK is the timing spine either way — each sentence, its
estimated span, its breath, and the word timeline — so there are four honest states, and the
player supports all four:

| | ships | costs |
|---|---|---|
| neither | the player as it was, byte-for-byte | nothing |
| captions | a teleprompter read-along on the player's own wall clock | kilobytes |
| audio | the deck speaks and turns its own pages, no band | megabytes + synthesis |
| both | the rehearsed delivery | megabytes + synthesis |

The assembler **derives** which state a file is in from the payload — captions ship iff a cue
carries words, audio iff a cue carries a clip — rather than taking a second input. So the
band, its stylesheet, the inlined cursor kernel, the CSP's `media-src` grant and the shipped
bytes cannot disagree with each other. A captions-only export is no longer granted permission
to load media it does not contain; an audio-only export carries neither the band nor the
~2 KB Cadenza cursor.

### 3. §4 stands, but the voice is now CHOSEN at export rather than read off the workspace

§4's answer — the author's own voice, baked, recorded in `readAlong.voice` — is what shipped.
What it did not anticipate is that "the author's voice" is a *workspace* setting, and the
narrator of one board deck is not a decision to re-record every future rehearsal. So the
export panel picks a model and a voice, defaulted to the workspace's own, through the
Workspace's OWN pickers (`VoicePicker` moved out of `TtsSettings.tsx` into its own module
rather than being copied — HARD RULE #15). The pick never writes back to the prefs.

That required an explicit-identity seam in the voice model: `synthFor` and `clipKeyFor`, the
general form of the "play sample" audition that already took an identity rather than reading
the ladder. `clipKeyFor` is load-bearing rather than convenient — the clip key is a
content-complete JSON array, so a key rebuilt by hand matches nothing, reads as "nothing
prepared", and would re-bill a deck that was already paid for.

### 4. The audio does not ride inside the manifest — §1 was right about the shape, wrong about the container

The recommendation was inline `data:` URIs on `readAlong.slides[].audio[]`. Inline data URIs
are correct and shipped. The manifest is not the right place to put them, for two reasons the
proposal did not weigh:

- **Double encoding.** `lattice-doc.js` base64s the WHOLE manifest, deliberately, so no deck
  content can terminate the script element (§Security). Audio nested inside it is therefore
  base64'd twice: 1.33× on the clip, then 1.33× again on the manifest — **1.78× over raw
  instead of 1.33×**. On the ~10 MB deck §2 uses as its example that is ~4.5 MB of pure
  encoding overhead, on the one number the author is being asked to consent to.
- **Eager parse.** Audio in the envelope can only be reached by decoding and `JSON.parse`ing
  the entire manifest — megabytes of main-thread work to play one sentence, on a viewer's
  phone, at the moment they press Play.

So the audio rides in **one inert `<script type="application/lattice+audio">` block per
narrated slide**, a sibling of the envelope. Every property §1 actually argued for is
preserved: one file, inline `data:` URIs, `default-src 'none'`, no network origin, nothing to
keep next to the deck. What changes is that the player parses one slide at a time, and a
viewer who never presses Play parses nothing. The manifest keeps `readAlong` — the voice
identity — because that is what makes the artifact self-describing.

**The breakout guard had to be bought a different way.** The envelope's whole-payload base64
is what makes a deck titled `</script><script>…` harmless. This payload carries caption TEXT,
so it is not all base64. Every `<` is emitted as the JSON escape `\u003c` (a literal
backslash-u sequence): the HTML parser
never sees one (so neither `</script` nor the `<!--` that flips it into script-data-escaped
state can appear), and `JSON.parse` returns the original character. **HTML-entity escaping
would be the wrong tool and is deliberately not used** — a `<script>` element's content is raw
text, so `&amp;` would survive into the parsed JSON and corrupt every caption containing an
ampersand. Pinned by a test that goes red when the escape is removed.

### 5. §5's "pace already travels" was half the story, and the missing half was not where it said

§5 correctly separated carrier from consumer, and correctly said the consumer was missing. But
it prescribed the wrong fix: *"read the baked front matter the player already parses."* The
player does not parse it and cannot. `assemblePlayer` strips every `<script>` that is not the
manifest envelope, so the `application/lattice-front-matter` block **does not survive into the
player at all**. There was nothing to read.

The beat is therefore resolved by the ASSEMBLER, off the verbatim source, and baked in as a
number. That forced a second change the proposal did not anticipate: the millisecond presets
live in `docs/src/lib/cadenza/cadence.ts`, TypeScript inside the `@slidewright/cadenza`
workspace package, which `lib/core` cannot import — and which cannot import `lib/core` back
without a relative path escaping its own package boundary. So `lib/core/resolve-pace.mjs`
gains `PACE_BEATS` + `paceBeatMs`, and `pace-names.test.js` pins the two copies against each
other exactly as it already pins the names. Drift there would mean the deck the author
rehearsed and the deck their board receives play at different rhythms — the failure `pace:`
exists to prevent.

Resolution collapses the documented four rungs to three in an artifact: override → the deck's
own `pace:` → `natural`. The workspace preset is a property of a Studio the recipient is not
running.

### 6. One thing the design did not raise at all: the privacy interaction

`--strip-notes` and narration cannot both be on — and the veto covers CAPTIONS too, not only
audio. For most decks the narration the author rehearsed **is** their speaker notes, so
shipping either the audio or the caption band of a deck they asked to strip hands the
recipient the private text back. The panel locks both switches off while notes are stripped.

### Checked against §"What would make this wrong"

- *"If #757's envelope lands first, inline data URIs are the wrong shape."* It has not landed.
  The per-slide block is a smaller, better-contained thing to migrate into a real container
  than a field buried in a doubly-encoded manifest would have been.
- *"If a typical real deck bakes to 30 MB rather than 10."* Still unmeasured against a real
  prepared deck (see UNVERIFIED below), so §2's ~10 MB remains an estimate. The mitigation §2
  asked for is in place regardless, and is now stronger than §2 specified: the cached bytes
  are read exactly from the clip store's index and the synthesized bytes are estimated from
  characters, both shown before the run.
- *"If the player's audio path cannot hold sync with the caption highlight as well as Suono
  does."* This is the one the earlier build sidestepped by showing one caption per sentence.
  It is now solved rather than avoided: the player runs the SAME `makeCursor` the Studio's
  teleprompter runs, inlined verbatim, and re-anchors each cue to its clip's real decoded
  duration on `loadedmetadata` — so the estimate ships and the truth arrives with the audio.
  A cue with no clip crawls on the wall clock instead, which is also what makes the
  captions-only export a working read-along rather than a frozen one.

### 7. What the adversarial trio changed after the build (2026-08-09)

The trio (HARD RULE #25) found defects the diff did not show, and two of them were load-bearing.

- **The pre-flight's size line was wrong by ~30×.** It used a flat 16 bytes of mp3 per input
  character — not the rate of any codec that exists — and called itself "measured". This
  repository's own committed samples (`docs/public/voice-samples/`, generated against the live
  API from one fixed 35-character sentence) put the real rate at 279–1246 B/char depending on
  the engine, so a single constant was wrong for the whole roster regardless. The estimate now
  reads from a per-engine table derived from those files, goes through `shippedBytes` like the
  exact half does, and a test recomputes the table from the samples on disk so it cannot rot
  back into a guess. This mattered because the §3 reversal is defended by the quote: an
  author told "about 0.8 MB" who receives 23 MB has not consented to anything.
- **The quote and the bake resolved DIFFERENT sentences on any `glossary: auto` deck.** The
  panel trimmed the render-appended glossary slide out of the projection; the exporter did
  not. A length mismatch stands the whole projection down, so the two halves of one export
  narrated through different rungs, keyed different clips, and quoted a bill that had nothing
  to do with the charge. The fix is *not* to trim in both places: **Present applies the same
  equality guard**, so such a deck is rehearsed through the markdown flatten and every clip on
  the device is keyed on it. Trimming would have matched none of them and re-billed a fully
  prepared deck. The bake now resolves exactly as Present does, including where Present gives
  something up, and `trimAppendedSlides` was deleted so nobody re-introduces the divergence.
- **A worker that threw took the export down while its siblings kept spending.** `Promise.all`
  rejected on the first failure and left two workers synthesizing a deck nobody would receive.
  Now `allSettled` with a shared controller: one worker's death stops the run.
- **A timeout aborted a controller nobody was listening to.** `synthFor` used the caller's
  signal *instead of* its own, so its 45 s timeout never cancelled the request — the abandoned
  call ran to completion and was billed while the retry fired a second one. Three attempts
  could mean three charges for one clip. The two signals are chained now.
- **A terminal error retried the whole deck.** A revoked key failed every sentence three times
  with full backoff — five minutes of spinning on a 300-sentence deck to learn what the first
  sentence knew. Non-retryable classes now stop the run and say so once.
- **The export ignored "keep narration on this device."** Every other consumer gates on that
  pref; the bake wrote to IndexedDB anyway.
- **A deck could forge the player's own chrome.** The body of an exported player IS deck
  content, and the engine renders authored HTML, so a slide containing `id="lp-caption"` was
  found by the transport's bare `getElementById`. On an audio-only export — where the cursor
  kernel is deliberately not inlined — that threw inside a click handler outside the init
  try/catch: the button read "Pause" and the deck never spoke. Both chrome lookups are now
  scoped to a direct child of the player's own shell, which a slide can never be.
- **Two smaller ones**: a repeated sentence was billed once per occurrence rather than once,
  and a cancel the author asked for was reported as "Webpage failed: Bake cancelled".

Three findings were argued rather than fixed, and are recorded here as decisions:

- **"Complete or nothing" now has an override.** The inversion lens made the strongest case
  against the reversal: a sentence a model deterministically refuses would make narration
  permanently unreachable for that deck, and the graceful floor the refusal avoids is a state
  the player is already verified in. So the refusal stays the default and gains one escape —
  offered only *after* it has named the sentences, never before. The author is standing there,
  informed, and chooses.
- **The on-device rung is now a bake source.** The first build hard-coded the cloud rung, which
  locked out the author who rehearsed the whole deck on-device and has no key — 100% of the
  bytes on their own disk, 0% of the feature, on the rung that exists so no key is needed. It
  is admitted READ-ONLY: `synthBakeClip` refuses to synthesize for it, so such a bake either
  finds every clip or refuses. It cannot spend.
- **The panel still has no rendering test.** Flagged and not closed — see UNVERIFIED below.

### Verified, and UNVERIFIED (HARD RULE #23)

**Verified** on the real surface: `tools/verify-narrated-player.mjs` builds real exported
files, opens them from disk over `file://` in a real offline Chromium, and drives all three
narrated states — 29 checks. It asserts that the CSP hash is accepted, that an `<audio>`
element actually advances on an inline `data:` URI, that the word highlight advances through a
sentence, that the deck advances itself and holds the *deeper section beat* the deck's
`pace: brisk` declares, that an audio-only file still drives itself with no crawl, that a
captions-only file's highlight advances on the wall clock with no audio element ever created,
and that no request is attempted at any point. Sign-off PNGs in both modes are written
alongside.

**Verified after the post-trio checker** (2026-08-09): `tools/verify-catalog-states.mjs` drives
the served production build in a real Chromium and controls only the catalog request, because
the defect it chases is a network state rather than a code state. Eight checks, all passing,
across the three states that used to be two: **offline** (the request aborts, so `fetch`
rejects) now names the catalog rather than the model and says the cost is unknown rather than
absent; a **live catalog that lists nothing** is not explained away as a network problem; and a
**slow-but-working catalog** (answering at 7 s, past the export panel's 6 s bound) still
populates the Workspace's own voice roster — the regression the bound introduced on a surface
this change had no business touching.

**UNVERIFIED**, and not claimed:

- ~~**A real end-to-end bake against a live OpenRouter key.**~~ **NOW VERIFIED** (2026-08-09).
  A key was made available, so the live path was driven on-demand at the scale HARD RULE #24
  sanctions — four real sentences, the default narrator (`hexgrad/kokoro-82m` / `af_heart`),
  cost printed. Three separate claims closed at once:

  | | result |
  |---|---|
  | real mp3 returned, `audio/mpeg` | 4/4 sentences, 13–53 KB each |
  | `ENGINE_BYTES_PER_CHAR.kokoro = 477` vs reality | **473 B/char aggregate — 1% high** |
  | per-sentence spread (28 → 112 chars) | 467 / 473 / 476 / 471 B/char — 0–2% high |
  | exported player, real speech, network OFF | plays, advances, **no request attempted** |
  | re-anchoring on real audio | shipped estimate 2000 ms → decoded 1925 ms, cursor re-anchored |

  The table's one known weakness — that it was derived from a single 35-character sample and
  should therefore over-quote longer sentences — is now **measured** rather than argued: it
  over-quotes by 0–2% across a 4× length range, always in the safe direction. The trio's
  finding that a flat 16 B/char was ~30× wrong is settled; the replacement holds.

- **The cost quote against a NON-ZERO invoice.** Still open, and a smaller gap than it was.
  309 characters were predicted at `$0.000192` and billed at **`$0.00`** — the account's usage
  counter did not move at all. So the quote demonstrably does not UNDER-state, which is the
  direction that matters next to a spend button; what remains unconfirmed is the published
  per-character rate itself, because a sample this cheap cannot exercise it. A deck large
  enough to move the counter would confirm it, and was not worth the spend to prove arithmetic
  that is one multiplication.
- **Real iOS Safari.** Not reachable from here — this sandbox has a Chromium build only, and
  no WebKit. The player's media path is a plain `<audio>`
  element with `playsinline`, which is the conservative shape, but that is an argument rather
  than evidence.
- **The per-engine bytes-per-character table** is derived from committed samples of ONE
  35-character sentence, so it carries that clip's fixed container overhead and slightly
  over-quotes a long sentence. Over-quoting is the safe direction — the file arrives smaller
  than promised — but the figure is an estimate and is worded as one. Cached bytes are exact.
- **The export panel HAS now been driven** — the checker was right that it had not been, and
  driving it found two more defects no test would have. A script starts the real docs dev
  server, opens the real Studio, walks Share → Webpage, and photographs the panel at 1440 /
  820 / 390 in three states (at rest, captions on, notes stripped), asserting each time that
  the strip-notes veto actually locks both switches, that the sheet never scrolls sideways,
  and that no page or console error fires. What it caught: `listTtsModels` — a network fetch
  to OpenRouter's public catalog — was joined into the same `Promise.all` as the local
  availability check, so on a blocked connection `cloudReady` stayed null and **the audio
  switch rendered ENABLED with no key behind it**; and a captions-only export left an empty
  box under a divider, because the whole pre-flight was gated on `audio`. Both fixed; the
  screenshots are the record.
- **What is still NOT verified on that surface: the paths that need a key.** The voice
  pickers, the cost table, the progress line, the refusal list and its override, and Cancel
  are all behind the audio switch, which correctly refuses to enable without a cloud voice.
  Nobody has seen them in a browser. They are unit-tested with the store and the synth mocked
  — which HARD RULE #23 names explicitly as not verification.
- **A large bake's memory profile.** A 300-sentence deck holds every clip as a base64 string
  in the cue tree, then again in the per-slide JSON, then again in the assembled document —
  plausibly 120–180 MB of live strings before the Blob. Measured at ~46 MB for the URIs alone
  in Node; never measured in a real mobile tab, and there is no cap and no warning.
