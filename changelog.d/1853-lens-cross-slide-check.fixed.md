- **Fixed: the cross-slide check refused a third of real decks, and missed the leak it was built for.**
  It compared each kept slide against its render in the FULL deck, which differs on every correct
  projection — a shorter deck renumbers its pages, shortens its divider dot rail, restarts its
  section-number ghost, shifts the categorical accent and renames its SVG defs ids. Measured over the
  147 example decks this repo ships, that refused 52 of them: a guard that is an outage. The
  comparison now goes through a middle term — the deck at its ORIGINAL length with the withheld
  bodies emptied — so deck length is held fixed and the only thing that can differ is what a withheld
  slide was contributing. A second hop compares that stand-in against what actually SHIPS, so the
  check is a statement about the artifact rather than about a proxy for it. Over the same corpus it
  now refuses exactly one deck, `examples/slide-class-forms.md`, which carries a live
  `<!-- class: diagram dark -->` global that a later slide inherits — a true find the corpus test
  pins by name.
- **Fixed: a `<style>` block on a withheld slide is now seen.** A `<style>` is document CSS wherever
  it is written, so `section[data-authored-slide="0"] p:nth-of-type(2) { display: none }` on slide 1
  hides a paragraph on slide 0. Dropping the slide that carried the rule UNHID the paragraph in the
  file that was sent, while the sender previewed it hidden. A section-by-section comparison cannot
  see this — the kept slide's markup is byte-identical on both sides, and only the stylesheet moved —
  so the check gained a second channel over the document's `<style>` text.
- **Fixed: an author's own `</section>` no longer truncates the comparison.** The walk was
  `/<section[\s\S]*?<\/section>/`, which stops at the first `</section>` in the markup. A
  `<section class="aside">` written inside a slide ended the match there, and everything after it on
  that slide went unchecked. The walk is now `splitSections`, the repo's depth-aware splitter.
- **Fixed: `--lens-source full` said "4 of 8 slides ship" while shipping all 8.** That flag puts the
  whole deck's markdown back into the embedded envelope, so the line described the artifact the
  sender expected instead of the one they sent. It now names both numbers.
