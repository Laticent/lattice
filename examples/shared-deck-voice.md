---
marp: true
theme: indaco
paginate: true
pace: deliberate
header: "Lattice · a shared deck finds its voice"
---

<!-- _class: title silent -->

`Feature demo · narration that travels`

# A shared deck can speak now.

Everything built for “the deck presents itself” stopped at the Studio boundary. The author heard the narration; the board received a silent file.

---

<!-- _class: quote -->

<!-- caption: A persistent clip store, prefetch windows, adaptive lookahead, a presentation beat, a readiness rail. On every shipped surface, the deck was silent. -->

> The product claim is a deck that presents itself to a board member. That deck is silent. Its most carefully engineered component is a progress bar nobody sees.

— The Munger-inversion lens, three reviews running

---

<!-- _class: compare-prose transition -->

## What actually reaches a recipient.

- Before
  - A self-contained webpage with three views, captions, and no sound. The voice ladder read the *viewer's* key, so anyone without one floored to silent.
- After
  - The same single file, carrying the author's own voice inline. It plays with no key, no account, and no network.

Both files are self-contained. The difference is whether the recipient can hear the presentation the author actually rehearsed.

---

<!-- _class: list-criteria -->

`The contract`

## Every sentence, or none of them.

- The device answers first
  - Each sentence rehearsed in Present is already stored, and costs nothing to ship.
- The rest is recorded at export
  - Whatever is missing is synthesized before the file is written, and kept for next time.
- An incomplete set is refused
  - A deck that goes quiet halfway through is worse than one that never spoke.

---

<!-- _class: content -->

`Why refusing is kinder`

## A silence you can fix beats one your audience discovers.

<!-- caption: A live delivery that stumbles is a second-long gap the author can hear and re-run. A baked file is opened once, by someone else, with no way to fix it and no idea anything is wrong. -->

“Forty-two of forty-seven sentences have audio” is a number the author reads and dismisses. The missing five are what their board hears. So the failure moves back to the machine where it can still be repaired.

---

<!-- _class: list-criteria -->

`Two switches, four files`

## Captions and audio are separate choices.

- Captions alone
  - A teleprompter read-along on the player's own clock.
- Audio alone
  - The deck speaks and turns its own pages, unwatched.
- Both
  - The voice, and the line it is reading, in step.

---

<!-- _class: content -->

`Whose voice, whose rhythm`

## The performance becomes a property of the artifact.

<!-- caption: The recipient has no key to resolve a voice with, so the author's choice of narrator has to be baked in. The same is true of the pace. -->

The narrator defaults to the voice the deck was rehearsed in, and can be changed for one export. This deck asks for a deliberate pace, and the file holds that same beat between slides — the directorial choice travels rather than being re-decided by whichever browser opens it.

---

<!-- _class: list-criteria -->

`Where the audio rides`

## Inline, in its own blocks — not inside the manifest.

- Still one file
  - Inline `data:` URIs. No sidecar, no network origin.
- Not in the envelope
  - It base64s itself whole, so audio there would encode twice.
- Parsed one slide at a time
  - You pay for the slide in front of you, not the deck.

---

<!-- _class: content -->

`The privacy interaction`

## Stripping speaker notes turns narration off.

For most decks the narration an author rehearsed *is* their speaker notes. Shipping that audio — or the captions, which are the same words on screen — would hand that private text to whoever opens the file. The options are mutually exclusive, in the panel and again in the exporter.

---

<!-- _class: closing -->

`Still open`

## The rail should follow the voice.

The readiness band lives only in the React overlay, while a shared file rides the vanilla transport. It now belongs somewhere both can read — which is, finally, where its audience is.
