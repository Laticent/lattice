---
marp: true
theme: indaco
paginate: true
header: "Lattice · speaker notes"
---

<!-- _class: title silent -->
<!-- Open cold. Hold for two seconds before the first word — let the room settle. This whole line is a speaker note: it lives in the PDF and the HTML, but it never shows on the slide. -->

Speaker notes

# Write the slide. Whisper to yourself.

A note is just an HTML comment. It rides along to the PDF and the HTML, and
stays off the slide — exactly the way Marp has always treated it.

---

<!-- _class: cards-grid -->
<!-- The mechanic: any comment that is not a directive and not a tooling pragma is the slide's note. Say this slowly — it is the whole feature. -->

`The rule`

## A bare comment is the note.

- Genuine note
  - `<!-- Pause here. Ask the room. -->` rides to the PDF and HTML.
- Directives
  - `<!-- _class: … -->` still configures the slide, never a note.
- Tooling pragmas
  - `<!-- markdownlint-disable -->` is ignored, exactly as Marp ignores it.

---

<!-- _class: cards-grid -->
<!-- Stress that nothing prints. The note you are reading right now proves it: this slide has a long note and the canvas is still clean. -->

`Where it goes`

## One note, three channels.

- PDF
  - A per-page annotation — hidden by default, `--notes-icon` to show it.
- HTML
  - A hidden `aside.lattice-notes`, ready for a presenter view.
- Sidecar
  - `--notes` writes a plaintext `.notes.txt`, one block per slide.

---

<!-- _class: divider light -->

## A slide with no note stays exactly as it was.

This slide carries no comment, so nothing is embedded for it — note slides and
plain slides sit side by side with no change to either.

---

<!-- _class: cards-grid -->
<!-- Closing beat: the degradation story is the point. Land it, then stop talking. -->

`Why it travels`

## It degrades to nothing, everywhere.

- On GitHub
  - A comment is invisible — the deck reads as clean Markdown.
- In Marp
  - A comment is the speaker note — identical semantics.
- In Lattice
  - The same comment, now embedded for the room. No new syntax to learn.

---

<!-- _class: quote -->
<!-- Thank the room. This is the last note — let the silence do the work. -->

> The slide is for them. The note is for you.

— The Lattice speaker-notes model
