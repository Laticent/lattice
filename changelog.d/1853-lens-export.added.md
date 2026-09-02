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
- **A reader-view label can no longer break out of the player's script.** The carrier bakes its
  view map as JSON inside the player's single CSP-hashed `<script>`, and a script's content is
  HTML RAWTEXT — it ends at the first `</script`, whatever JSON thinks. `JSON.stringify` does not
  escape `/`, so a deck whose view label carried `</script>…` ended the element early: the player
  never booted and the remainder of the label was parsed as markup. The escape now runs through one
  named helper shared with the narration blocks (`scriptJson`).
- **A split page keeps its slide's number, so nothing after it renumbers.** The engine renders one
  authored slide as several sections when `split: headings` divides it at a second heading, or when
  a slide overflows its box — and every consumer that numbered the sections afterwards counted those
  extra pages as new slides, shifting everything below. Each section now carries
  `data-authored-slide`: both pages of slide 2 are slide 2, and slide 3 is still slide 3. Reader-view
  exports read that number instead of reconstructing it, which is what makes a view name the same
  slides however the deck happens to paginate. Export-to-Marp still materializes those breaks as real
  separators — a baked deck genuinely has more slides — and a view carried into one refuses as
  `drifted` rather than guessing.
- **A projected export carries only the views it exports** — with one documented gap: a slide that
  quotes the `_lens` syntax in INLINE code has that example read as its tag, so the slide's real tag
  is not pruned. Fenced examples are handled; inline ones need a shared inline-context reader across
  every consumer, which is a slice of its own. `design/skills/lens.md` says so where authors read.
  Otherwise: `--lens brief` withheld every non-member
  slide and then, in the envelope's own front matter, named `evidence` and `ask`, printed their human
  labels, published their approval digests, and marked on every kept slide whether it belonged to
  them. The `lenses:` block and the per-slide `_lens` tags are now pruned to the exported views.
  `--lens full` on its own is exempt — it is the identity, because a full-deck recipient was denied
  nothing — and `--lens-source full` is unchanged, that flag being the author asking for the whole
  deck by name.
- **A projected export never writes an approval digest, and refuses a deck it cannot re-split.** The
  views in a projection ship without `approved:`, so re-importing reads them as `unapproved` — a
  machine reduced the deck, and the human's approval described it before the reduction. Re-deriving
  the digest instead made the projection self-certifying: the prune rewrites the author's slide text,
  so a hash taken afterwards blessed whatever that rewrite produced. Separately, the export now
  re-splits the body it emitted and writes nothing if the slide count disagrees with the projection —
  the baked view map is indexed by position, so one lost slide shifts every view after it.
- **`--lens-default <id>` picks the view a carrier opens on.** Without it the deck's own
  `lens-default:` decides; the first id you named is only the last resort, because argv order already
  decides what the switcher lists and should not quietly also override a landing view the author
  wrote down. Naming a view the export does not carry exits non-zero naming the id, rather than
  falling back and shipping a correct-looking file that opens on the wrong view.
- **The carrier's view switcher is a dropdown.** A view's name is the author's own noun and no icon
  can stand for one, so a button per view sized the whole top bar to how many views a deck declares
  and how long each name is — a button per view sizes the bar to how many views a deck
  declares and how long each is named, and the width caps that kept it inside a phone screen
  truncated the names to "B… E… T…". One `<select>` costs one control however many views ship, keeps the full names in the
  platform's own picker, and flexes with the bar instead of budgeting it.
