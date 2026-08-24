- **Breaking: a speaker note is no longer a caption.** The narration ladder put the
  authored note *above* the slide's own content, so any slide carrying a note narrated
  the note — in Present's caption crawl, in the exported `.vtt` sidecars, and in the
  audio baked into a shared webpage deck. A private remark written for the presenter
  traveled to whoever opened the file. `design/skills/speaker-notes.md` had required
  the opposite in its first paragraph ("each in its own register, none bleeding into
  the others"; "a caption must never carry a private remark") and then documented the
  note becoming the caption two sections later; the CLI carried the consequence in its
  own `--strip-captions` help, which had to warn that stripping the *public* channel
  would hand you the *private* one.
  **A caption is now generated from the slide's content**, and an author override —
  inline `<!-- caption: … -->` or the front-matter `captions:` map — *replaces* it
  entirely. **A speaker note is never narrated**: nothing reads it aloud and nothing
  captions it, on any surface.
  *To be precise about what this does and does not change:* a note is still DELIVERED
  with the deck, by design — a hidden PDF annotation, a hidden HTML `aside`, the PPTX
  presenter-notes field, the `--notes` sidecar, and the exported player's own notes
  sheet. This closes the three NARRATION channels (the caption crawl, the `.vtt`
  sidecars, baked narration audio); it does not make a note private. `--strip-notes`
  remains the control for that, and it now composes cleanly with captions.
  *What changes for you:* a deck whose slides carry notes now narrates the slides. If
  you relied on the note as the spoken line, move that text into a `caption:` — it is
  the channel that always meant "the words this slide says". Narration audio you have
  already prepared for note-bearing slides is keyed to the old text and will need
  re-preparing.
- **Fixed: `--strip-notes` no longer empties the caption track.** Suppressing the whole
  projection was the only way to stop that flag leaking the notes it had just scrubbed.
  With captions generated from slide content there is nothing private left in them, so
  a notes-stripped deck keeps the caption track a recipient needs for accessibility.
- **Fixed: `--strip-captions` falls back to the generated caption**, not to the speaker
  note. The two strips are genuinely orthogonal now — neither can leak the other's channel.
- **Fixed: a multi-line speaker note is no longer spoken.** Both narration flatteners
  recognized a comment by testing whether a *line began* with `<!--`, which sees only the
  line a comment opens on — so every continuation line of a note was read as slide prose.
  Because the Studio's own note editor writes multi-line notes, this was the common shape,
  and it survived the ladder fix above by coming in through a different door: a note reached
  the exported `.vtt` with **default flags** on a chart-family slide, and reached it even
  under **`--strip-notes`**, the flag whose whole job is to remove it. The same line-prefix
  test also let a multi-line `<!-- caption: … -->` survive `--strip-captions`. Comments are
  now blanked as whole blocks before either flattener sees them.
