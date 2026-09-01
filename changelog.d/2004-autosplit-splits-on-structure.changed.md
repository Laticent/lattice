- **Breaking: auto-split now fires on STRUCTURE, not on measured fit.** A slide whose collection
  holds more than one member becomes one slide per member, decided from the markup. The measured
  trigger is gone: the export no longer renders, measures the overflow ratio, cuts by it and
  re-measures in a loop of up to five passes. Because the trigger was a rendered measurement, the
  same deck could paginate differently on a machine with different fonts, and a run could be
  re-cut on a later pass — so a run's own membership was not known until it converged. Structure
  is knowable without rendering anything, so `lint:deck`, the authoring surface and the export
  now agree on what a deck becomes. **Decks will export with different page counts.**
- **Breaking: a split page carries a SINGLE structural element — nothing packs.** The pacing
  policy took `capacity.perPage ?? sweet ?? soft ?? hard`, so a component with no `perPage` packed
  its members to its authoring comfort: eight glossary rows to a page, four `premise` points, four
  `authority-chain` tiers. Those three numbers are an authoring budget with one consumer,
  `lint:deck`, and were never a statement about how a run should be cut. Every `perPage` in the
  catalog is now `1`.
- **Changed: every split run ends on a CLOSING page carrying the section's below-note, key insight
  and annotation together.** The below-note used to ride the last body page one size down
  (`lat-split-note`) while the key insight got a page of its own — a footnote pinned to a page
  already full of content. Both now close the run, at full size, with nothing else on the page. A
  run whose section has no trailing material ends on its last body page rather than on an empty one.
- **Changed: the carousel signal is on every split run, not four components.** The
  "→ next: …" / "↻ back to …" / "governs ↓ …" / "Option N of M" adornment required a component to
  declare `capacity.relationship`, which four of sixty-one did — so an ordinary bulleted slide
  split into pages with nothing joining them. Every run now carries a forward pointer; a declared
  relationship still chooses the phrasing. The last body page points at the closing page and names
  what it holds.
- **Changed: three components can split that never could.** `content` — the commonest slide in any
  deck — plus `list-criteria` and `journey` declared no split axis, so a long one could only clip.
  31 of 61 components now split; the other 30 are single structural elements already
  (an anchor, a graphic, an asset, one atomic text unit) and ring on overflow, each with its
  reason recorded in `lib/core/split-facts.js`.
- **Fixed: a member alone on its page takes the whole measure.** A component that states its track
  width arithmetically kept that width with one member on the page — `pricing` sets
  `width: calc(100% / 3 - …)` on every tier, so a lone tier rendered at a third of the measure and
  sheared its own copy. The lone-member rule in `base.modifiers.css` claimed width needed no rule
  because `cards-grid` promotes its last odd card to `width: 100%`; that was true of `cards-grid`
  and of nothing else, and was invisible while every component that atomized was a tiling one.
- **Changed: `logo-wall` is placed `atomic`, not `list-light`.** Its members are not independent —
  the component's claim is the wall — so one logo per slide would say something the author did not
  write, and packing is what the single-element rule forbids. It keeps whole and rings, which is
  what it already did by declaring no axis; this records the reason.
- **Fixed: fit is still measured, and now only for the ring.** The overflow probe runs after the
  split rather than driving it, so a page that does not fit at one element per page still warns
  and still carries the overflow marker. There is no smaller cut left to make.
- **Breaking: a split page carries no deck header, footer or section rail.** Its wayfinding is
  its own: the page number and the k-of-N pill rail. The deck frame is what a reader meets on an
  authored slide, and a split run is not a sequence of authored slides — it is one slide
  unfolded. This reverses §0a's "footer, pagination and the progress rail ride every slide", a
  rule written when a split was two or three pages, where the frame reads as continuity rather
  than repetition. It also fixes what that rule could not reach: four marks shared one width
  budget, which is why a long run pushed a deck's own `footer:` into an ellipsis.
- **Changed: the k-of-N rail is pills again, up to twelve pages.** With the deck chrome gone the
  threshold is a readability call rather than a width one — past about a dozen a reader counts
  rather than reads, and the numeral does counting better. The count form is set explicitly in
  the band's meta register; it inherited the slide's body size once the footer beside it was
  gone, and rendered larger than the page number.
- **Fixed: `cover-cards` and `roadmap-horizons` were still packing.** The single-element rule
  reached the plain envelope but not two carousel strategies that assemble their own pages:
  `compare-table`'s transposed cards kept the retired "note on the last card page" placement, and
  `roadmap` grouped six phases into 2+2+1+1 to stay under a four-page budget. `coverWindow`'s
  fallback for a recipe that declares no `perPage` was 3, so a new recipe would have packed
  silently; it is 1.
- **Fixed: the split run's arrows are drawn, not typed.** The cover lead-in and the four
  relationship marks were HTML entities — `&rarr;`, `&#8635;`, `&darr;`, `&uarr;` — written into
  the rendered DOM. HARD RULE #29 exists because the deck's own type family carries almost none
  of those characters, so each fell back to whatever face the rendering machine had. The #29 gate
  never saw them: `checkTypedGlyphs` matches literal characters, and an entity is not one until
  the parser has run. They are now `data-mark` attributes painted from the existing
  `--shape-arrow-*` / `--shape-refresh` mask tokens; `--shape-arrow-down` is added as the mirror
  of `-up`, and both down-arrow rows in `lib/core/shape-glyphs.js` now name it.
- **Changed: a split cover introduces what is next even when its layout declares no `intro`.**
  Twelve components declare `split.intro` ("Side by side", "Entry by entry"); the other
  forty-nine carried a title and nothing else, which is §0a's cover doing half the job it argues
  for. The lead-in is now derived from the run's first member — the same `labelOf` the body
  pages' "next:" uses, so the cover points at page one exactly as page one points at page two.
  It declines rather than clips: a member with no name (a bare sentence) leaves the cover
  title-only instead of printing a truncated fragment.
