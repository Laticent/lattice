---
status: in-progress
summary: The Studio teaches through search — type "pdf" and get the action AND a short lesson that points at each control, waits for your click, and does it for you if you wait. Replaces the five watch-only tours (first-look stays).
---

# Studio lessons — search is the help, and every answer is a lesson (2026-10-05)

**Branch:** `claude/lattice-walkthrough-training-pehuqc` · **Builds on:**
`2026-07-07-studio-show-me-tours.md`, `2026-07-05-vetrina-walkthrough-library.md`,
`2026-06-14-read-aloud-kokoro.md`.

## The ask

Feedback: Lattice is too complicated and hard to learn. The owner agrees, and points out that nobody
starts out knowing PowerPoint either — a whole training industry exists for it. The Studio should do
that training itself: narrated walkthroughs that teach, and that **do common actions for the user**
to cut the hassle. Today's walkthroughs feel out of date, don't teach, can't be found from search,
don't use Vetrina's newer abilities or a voice, and have jank.

## What is wrong today (measured 2026-10-05)

- **Five tours, all "watch me".** `first-look` (10 steps), `walkthrough` (24), `board-deck` (16),
  `just-markdown` (12), `quiet` (13). Not one step asks the viewer to do anything: Vetrina's
  cooperative step, `awaitUser`, is unused. A 24-step show is a demo, not a lesson.
- **Not findable.** The Studio palette has one entry, "Watch demo", and it plays only the default
  tour. The site search's "Start walkthrough" opens the Playground's Explore walk, which is a
  different feature.
- **Half of Vetrina is unused.** No narrator, no word cues, no `awaitUser`, no recorder, and one
  gesture out of twelve.
- **No voice.** The voice ladder (`playground/voice-model.js`), Suono playback and Vetrina's
  `Narrator` port all exist; nothing connects them to a tour.
- **Jank.** On a phone the "change theme" step points at nothing (the theme sheet is portalled
  outside the Studio root, `tour-kit.ts` `SEL.theme`). The Share step's caption says "export a PDF"
  and only opens and closes the sheet. Present opens for two seconds.
- **No shared action list.** The palette's props, `StudioActions` (13 setters) and
  `StudioDemoBindings` each list Studio verbs separately. "Export PDF" is in none of them.

## The axes

1. **Unit of teaching** — a long tour vs. a short lesson that answers one question.
2. **Who acts** — the Studio (watch), the user (guided), or either.
3. **Where help is found** — a menu, search, or contextual prompts.
4. **When it loads** — bundled with the Studio vs. fetched on first use.
5. **Voice** — live synthesis vs. clips recorded ahead of time vs. browser speech.

## Decision

**Owner rulings, 2026-10-05** (one round, all on the recommendation):

| Question | Ruling |
|---|---|
| Voice source | **Pre-recorded clips.** Generate each lesson's lines offline with Kokoro and ship them with the lesson. One voice on every device, no key, no 80 MB model download. The `speechSynthesis` ban (2026-06-14) stands. |
| The five tours | **Keep `first-look` as the showcase; fold the other four into lessons.** |
| Where lessons are searchable | **The Studio palette first.** The site search deep-links (`?lesson=id`) in a later slice. |
| First slice | **The action list, the lesson kit and six Basics lessons, without voice.** |
| Modes (second round) | **Two rows, one adaptive lesson** — not three explicit modes per row. |

### Two rows, one adaptive lesson

Typing `pdf` in the palette shows two rows:

- **Actions → Export as PDF…** does the thing now. This is "do it for me" for someone who already
  knows what they want.
- **Learn → How do I export a PDF?** starts a lesson.

A lesson is three to six beats. A beat that needs the user's move points at the real control, says
what to do, and **waits seven seconds, counted from when the cursor arrives, for the user's click**. If the user clicks it, the real
control does its real job and the lesson moves on. If the user waits, the lesson says so, clicks it
for them through the same action, and moves on. So "show me" and "walk me through" are one lesson,
not two modes to choose between, and every palette row is plain Enter.

The first proposal had three explicit modes per row ("Do it / Walk me through / Show me"). It was
dropped on the second round: it needed trailing buttons inside palette rows plus `⌘↵`/`⇧↵`
bindings across all three palette layouts, and it asked a learner to pick a mode before they had
learned anything.

A control that is not on screen (a hidden pane, a width where it lives in a menu) gets no turn.
The lesson does the step only when the beat says what it is doing instead; otherwise it skips the
step. "Write a slide" with the editor hidden says how to bring the editor back and stops, rather than
adding a slide nobody asked for.

### Why this shape is honest

Vetrina's rule is that the cursor is theater and every real effect comes from an `act` the host
supplies. A lesson keeps that rule. Its "do it for you" path calls a command from the shared action
list, or `press(target)`, which calls the real control's `click()`. A programmatic `click()` sends
no `pointerdown`, so Vetrina's take-over guard does not mistake it for the user. Any other real
input still ends the lesson at once, exactly as it ends a tour.

A lesson **never resets the Studio**. A tour clears the shell and builds "My First Deck"; a lesson
runs on the deck the user has open, because the point is to learn on your own work.

### The action list

`studio-commands.ts` defines a `StudioCommand` (`id`, `label`, `keywords`, `icon`, `run`). The
Studio builds the list once; the palette's Actions group renders from it, and lessons call
`run(id)` from it. This replaces the palette's eleven one-callback-per-action props. `StudioActions`
stays for now, because `first-look` still drives it. It retires with the tours (below).

### Loading on demand

The Studio bundle carries only the catalog (`lessons/catalog.ts`): each lesson's id, question,
track and search keywords — the part search needs. Lesson scripts load through `import()` on first
use. Vetrina's engine is still in the Studio chunk, because `first-look` imports it statically;
making the engine itself lazy is a later slice (see below), measured then.

## Voice (slice 2)

Lessons speak. Every line is a clip recorded ahead of time with Kokoro, the Studio's own voice, and
shipped under `docs/public/lesson-voice/<lesson-id>/`. The caption still shows every line, for anyone
with sound off.

**Where the clips come from.** `tools/record-lesson-voice.mjs` reads every line from
`lessons/lines.ts` and records the missing ones. It reuses `lib/export/narrate-kokoro.mjs`, the
Kokoro loader `lattice video` already runs in Node (same model, voice and q8 weights as the Studio
without a GPU), and the bake's encoder, `compressClip`, at 48 kbps. The handoff for this slice
proposed driving the Studio's browser rung in headless Chromium; the Node path already existed, so
the tool uses it (HARD RULE #15). Each folder's `voice.json` maps a line's text to its clip, its
measured speech length and its word track: the Cadenza estimate scaled to the clip, so a word cue
lands on the clip rather than on the estimate.

**Why lines live in one table.** A clip has to exist before anyone runs the lesson, so the set of
lines must be knowable without running it: a branch the recorder never took would be a line with
no clip. Lessons say only what `lines.ts` holds, and `lesson-voice.test.ts` fails when a track
writes a line inline, when a line has no clip, when a clip was recorded for other words or another
voice (its key hashes both), or when a clip is left over.

**Never stale, never stuck.** The narrator (`lessons/lesson-voice.ts`, a `Narrator` on Vetrina's
port) finds a clip by the line's exact text. A reworded line has no entry and plays as the silent
caption, with the word clock still running; a clip that fails to fetch or decode does the same
inside `voicedNarrator`. Either way the storyboard holds the caption for its reading time.

**One narrator per page, and the iOS unlock.** The narrator is built once and disposed on
`pagehide`. It opens its own `AudioContext`, and iOS plays only from a context unlocked inside a
user gesture. An `import()` resolves after the gesture is gone, so the Studio fetches the voice
module when search opens; by the time the user picks a lesson row the module is ready, and the
narrator is built inside that click or Enter. If the module is not ready yet, the narrator is built
after the import and unlocks on the user's next press. The clips load with the lesson: its folder's
`voice.json` and clips are fetched when it starts, and the lesson waits at most 1.5 s for the list
before starting on captions.

**Its own context, not read-aloud's.** Read-aloud keeps a page-wide Suono stage that it never
disposes, because closing it would leave a page restored from the back/forward cache without sound.
The lesson narrator owns a separate stage so it can be disposed on `pagehide` as the Vetrina
contract asks. A page that uses both has two contexts, well under Chromium's per-document cap.

## The curriculum

| Track | Lessons |
|---|---|
| **Basics** (slice 1) | Start a new deck · Write a slide · Add a slide · Change the theme · Present · Export a PDF |
| **Building** (slice 3) | Charts · Tables · Comparisons · Images · Speaker notes |
| **Polish** (slice 3) | Coach · Fix all · Reshape · Light and dark |
| **Sharing** | The HTML player · PowerPoint |

## Building, Polish, and the end of the long tours (slice 3)

**Nine lessons, two tracks.** `lessons/building.ts` and `lessons/polish.ts` load on demand like
Basics, and every line is recorded (§Voice). The four "add a …" lessons share one shape: open the
gallery, type the kind into its search box, pick the card. The lesson types the search itself
(the `type` action) rather than asking the user to, because a keystroke the lesson did not ask for
reads as "the user took over" and ends it.

**A lesson checks before it points.** These lessons run on whatever deck is open, so each first
asks whether its control can act: Fix all with nothing to fix, Reshape on a slide with one layout,
and Reshape on a phone (the control is in the desktop edit bar) each say so and stop, rather than
pointing at a disabled button. Fix all also has no "I'll do it for you" fallback when its button is
off screen: it is the largest edit any lesson can make, so it happens only after the lesson has
pointed at the button. And the Coach lesson skips its "click Coach" turn when Coach is already
open, because that button is a toggle.

**Four new commands.** Coach, Fix all, light/dark and slide settings each had a button and no
palette row, so a learner who searched "check", "fix", "dark" or "notes" found nothing, and their
lessons had no verb for "I'll do it for you". They are now in the action list (`coach`, `fix-all`,
`toggle-mode`, `slide-settings`). Fix all is listed only while there is something to fix, the same
rule the bar button follows by disabling.

**The long tours are gone.** `walkthrough`, `board-deck`, `just-markdown` and `quiet` are deleted;
`first-look` is the default and only tour. Their beats that nothing else used (`reskin`, `coach`,
`present`, `share`) and nine of the thirteen `StudioActions` setters went with them. The four
setters left (`openDeckMenu`, `createFirstDeck`, `gotoSlide`, `setMobilePane`) are `first-look`'s
staging verbs, not things a user asks for, so they stay out of the action list.

**Vetrina loads on first use.** `useLazyWalkthrough` (Vetrina's React adapter) fetches the engine on
the first `start()`, and the tour scripts moved behind `tours/build.ts`. Measured against `main` at
78eaf0d with `measure-route-base.sh`, the Studio's eager JS is **18,500 B gzip smaller**, with this
whole PR (voice wiring, fifteen catalog rows, four commands) included. The voice still unlocks inside
the user's gesture, because the narrator is built before `start()` awaits anything.

**The e2e fixtures moved.** `demo.spec.ts` and `demo-mobile.spec.ts` run `first-look` (three slides,
not four). The reskin regression test left with the beat it tested. `vetrina-geometry.spec.ts` drove
`quiet`'s reskin beat to reflow a pane under a live spotlight ring; no lesson closes a panel that
way, so the spec now runs the light/dark lesson and presses Collapse editor from inside the page the
frame the ring appears. With the ring's tracking patched out of the built engine, the spec fails
(ring 571/609 against a pane at 99/1081), so it still measures the defect it was written for.

## Slices

1. **This PR.** The action list, the lesson kit, the Learn group in the palette, six Basics lessons,
   the Share sheet opening straight to its PDF step, the "Export as PDF…" action.
2. **Voice.** Shipped: see §Voice above.
3. **Retire the long tours.** Shipped: see §Building, Polish, and the end of the long tours.
4. **Reach.** Site search deep-links lessons, progress is remembered and the next lesson suggested,
   and a panel offers its lesson the first time it opens.

Slices 2–4 are recorded in `followups.d/` so they survive this session.

## Open questions

- None blocking slice 1.
