---
marp: true
theme: indaco
paginate: true
pace: natural
header: "Lattice · the timing track, step 2"
---

<!-- _class: title -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

<!-- caption: A shared deck now carries its own timing track. Every word, every breath and every hold is written down once, in one file. -->

# One timing track for every player.

`Feature demo · LTT step 2`

The exported deck plays from the same timing file that video export will read.

---

<!-- _class: big-number -->

<!-- caption: Slide one speaks at once. Every later slide waits one hold when it arrives. The deck carries that hold now, so the player no longer reads it off the page. -->

`Holds read off the page`

- 0
  - down from one per slide: the timing file carries every hold now.

---

<!-- _class: list-steps -->

<!-- caption: Here is the whole sequence. Hold. Speak each sentence. Breathe. Then advance. Yes. -->

## How a narrated slide plays.

1. Hold — the arriving slide waits its beat.
2. Speak — each sentence plays its own clip.
3. Breathe — a pause after every sentence.
4. Advance — the next slide takes its hold.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

<!-- caption: A section break earns the deeper hold. The timing file says so, and the player obeys it. -->

`Section 02`

## When a clip fails

---

<!-- _class: big-number -->

<!-- caption: A clip that will not decode no longer stops the deck. It shows its caption, holds for its estimate and moves on, exactly like a sentence with no clip. -->

`Clips that stop narration`

- 0
  - down from one: a clip that will not decode plays as its caption.

---

<!-- _class: list-steps -->

<!-- caption: Three copies of the timing code check each other. The source, the copy the player carries, and that copy after a production minifier. They agree on every probe. -->

## Where the timing is checked.

1. Source — the conformance fixtures run against the library itself.
2. Inlined — the same fixtures run against the text the player ships.
3. Minified — and against that text after the production minifier.

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

<!-- caption: We recommend signing off this export, so video export can build on the same file. -->

## Sign off the export; video builds on it next.

`LTT step 3`
