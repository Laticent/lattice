- **`--lens` exports only the slides a reader view shows.** `lattice deck.md --lens brief out.pdf`
  renders the `brief` view — its members, in author order — instead of the whole deck. Views are the
  deck's front-matter `lenses:` block, and each one still has to have been approved by a human: an
  unavailable view (`unknown` / `hidden` / `unapproved` / `empty` / `drifted`) exits non-zero naming
  the reason and writes nothing, rather than quietly falling back to the full deck. Until now a view
  existed only as a live view inside the Studio, and producing a file meant `pdfseparate` page
  surgery against absolute page numbers — the coupling reader views exist to remove.
- **`--lens-source` decides what a projected export hands back.** A player's embedded envelope
  carries the deck source for lossless re-import, which makes it the fourth channel a withheld slide
  escapes through, and the only one designed to round-trip. With `--lens`, the envelope now carries
  only the slides that shipped; `--lens-source full` restores the whole deck for authors who want the
  lossless round trip and accept that a recipient can recover every slide no view showed them.
- **A `.html` player can carry several reader views behind a switcher.** `--lens brief,evidence`
  with `--player` exports one file holding the union of those views, with a control in the top bar
  that switches between them — across all three existing views (Present, Read·Slides, Read·Article),
  since a reader view picks *which* slides and those pick *how* they are shown. The file carries a
  baked view→slides map rather than the projection library: eligibility was settled at export time
  and frozen bytes cannot drift. Switching **hides** — every slide in the file is in the file — but
  the export itself **withholds** everything outside the union of the views it carries. Several views
  need `--player`; a PDF, PPTX or image set is one linear sequence and refuses rather than shipping
  the union with nothing to tell the reader which slide belongs to which view.
