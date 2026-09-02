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
- **Changed: two components can split that never could.** `content` — the commonest slide in any
  deck — and `list-criteria` declared no split axis, so a long one could only clip. 30 of 61
  components now split; the other 31 either are single structural elements already (an anchor, a
  graphic, an asset, one atomic text unit) or rewrite their authored list into a custom DOM the
  splitter cannot reach. All of them ring on overflow, each with its reason recorded in
  `lib/core/split-facts.js`.
- **Fixed: `journey` was enrolled and produced a run of duplicate pages.** It authors a real
  top-level `<ul>` of independent stages, so the seam looked reachable — but its transform
  rewrites that list into a `.journey-board`, and the split envelope is built from the member
  COUNT, which is read from markup the transform has already discarded. The result was a
  six-page run in which every body page carried the whole five-stage board, identical, with the
  section band labels colliding with the rows. It keeps whole and rings, alongside `progress` and
  `timeline-list`, which fail the same way. What these three need is a carousel strategy that
  reads their POST-TRANSFORM shape — measured, each keeps its members as clean repeated blocks in
  the rendered DOM — which is what `kanban-lanes` and `roadmap-horizons` already do for theirs. Its `verified` attestation in the split oracle — which
  claimed the deck had been rendered and read page by page — is removed: it had not been.
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
- **Fixed: a run's numbering continues across its pages instead of restarting at 01.** Eight
  components draw a per-member ordinal from a private CSS counter, and a fresh `<ol>`/`<ul>` on
  every page resets it — so a three-item `list-criteria` read `01 · 01 · 01`, telling the reader
  there were three first criteria. The kernel already did its half (`--lat-split-offset` on every
  body page, `start="N"` on a split `<ol>`); three components read it and the rest never did,
  which stayed invisible while a page held several members and their numbering was at least
  sequential within it. `list-criteria`, `list`, `agenda`, `inventory`, `cards-grid`,
  `cards-stack`, `regulatory-update` and `list-steps.timeline` now seed from the offset, and
  `test/unit/css/split-ordinal-continuity.test.js` fails a splittable component that adds an
  unseeded counter.
- **Fixed: a lone BARE bullet is set as the page's statement, not as a list item.** One element
  per page makes the commonest split page a single bullet, and it kept its marker (a separator
  from siblings it no longer has) at body size in a page-tall box. It now drops the marker,
  reclaims the indent and steps to `--fs-emphasis`. Scoped to a bare member: a card carrying a
  title and a body clause already fills its page and is left alone.
- **Fixed: `agenda` and `inventory` centered their lone row.** The shared lone-member rule centers
  with `align-content`, which only moves wrapped lines — inert on `agenda`'s `nowrap` row, which
  held its ordinal and title at the top of a 948px box. `inventory`'s ordinal is absolutely
  positioned at the row's top to stay out of its flow, so centering the prose left the numeral
  ~370px above it. Each now centers on the axis that is live for it, only when the member is
  alone on its page.
- **Fixed: a selector that Chromium rejected was silently dropping its rule.** `:has()` may not
  nest inside `:has()`, and a stylesheet parser drops an invalid selector without raising — the
  lone-bare-member rule was written as `:has(> li:only-child:not(:has(…)))` and never applied,
  which took a real render and a computed-style probe to see. `build:check`'s css-tree pass
  accepts the nesting and re-serializes it unchanged, so `test/unit/css/selector-validity.test.js`
  asks the browser instead: every selector in the built bundle is put through `querySelector`,
  which uses the same grammar the stylesheet parser does.
- **Fixed: two `manifest.schema.json` descriptions taught the model this change deleted.**
  `capacity.perPage` said the split "packs to `sweet` (falling back soft → hard)" and that the cut
  is "BALANCED, never greedy — 14 items at a target of 6 emit 5/5/4"; `capacity.relationship` said
  to "omit for INDEPENDENT members — a signal there would claim a relationship the content doesn't
  have", which is the reverse of what now ships. Both are the specification an author or an agent
  reads, and both compile into the Studio bundle, so they were teaching the deleted behavior from
  inside the change that deleted it.
- **Fixed: `lint:deck` told authors to trim to a number that does not keep the slide whole.**
  `capacity-autosplit`'s fix line read "To keep it on ONE slide, trim to {hard} or fewer" — but the
  trigger is structure, so two members split exactly as twenty do. The advisory now names the real
  threshold instead of sending the author to do work that changes nothing.
- **Fixed: 19 of 21 committed example-deck PDFs were stale.** Every non-`wide` example deck is
  regenerated. The page counts roughly 1.7× across the family — `adaptive-sweep` 34 → 64,
  `split-envelope` 26 → 52, `adaptive-sizing` 8 → 25 — which is the change working, and worth
  seeing rather than inferring.
- **Fixed: a split run deleted an author's own `<header>` / `<footer>`.** `stripDeckChrome`
  removed them by TAG from every page of a run — but an author may write a literal `<footer>` in
  markdown, and the engine hoists it into the very same `.cell-footer` as the deck's own, where
  the two are siblings indistinguishable by tag, depth or position. So authored content vanished
  from every page of a run while surviving on an unsplit slide. The deck's chrome is now
  identified by its `header:` / `footer:` directive text, compared on visible text so a directive
  holding markdown still matches.
- **Fixed: `<!-- stress-slide -->` — the only per-slide opt-out — had never worked.** It is not a
  Marp directive, so Marp consumes it as a SPEAKER NOTE and the comment never reaches the DOM; the
  pattern tested the section's inner HTML for a comment that was never there. A 4-item `checklist`
  marked as a specimen still split into a cover plus four pages. Dormant while the trigger was
  measured (a specimen that fit was not split anyway), live the moment it became structural — and
  53 files under `lib/components` mark a capacity-ceiling specimen this way, each one existing
  precisely to show N members on ONE slide. Both the note form and the comment form now match.
- **Fixed: the lone-bare-member treatment applied by halves.** Its two rules excluded nested
  content with different combinators — a CHILD test on the list, a DESCENDANT test on the item —
  so the ordinary linked-image idiom `[![icon](x)](url)`, which puts the `<img>` at depth two, lost
  its marker without gaining its type step. The comment above them asserted the two tested the same
  thing. They now do, and `test/unit/css/lone-member-selector-parity.test.js` fails if they drift.
