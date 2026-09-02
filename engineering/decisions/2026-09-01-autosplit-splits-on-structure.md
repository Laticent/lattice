---
status: shipped
summary: Auto-split fires on STRUCTURE, not on measured fit, and a split page carries ONE structural element. Reverses the trigger set on 2026-07-29 and the packing policy that read `capacity.perPage ?? sweet ?? soft ?? hard`. Also records why the owner's own structural ruling stopped being what the engine did — the 2026-07-22 note that specified it was retro-edited on 2026-07-28 to defer to the fit trigger, inside its own document, so every later note built on a clause its author had not written. Every run now opens on a cover, gives each element a page, ends on a CLOSING page carrying the below-note and key insight together, and carries a forward pointer on every page (four of sixty-one components got one before). Two components that could never split are enrolled — `content` and `list-criteria`. Four more were enrolled and backed out the same day, `journey` on a render that showed it emitting duplicate pages.
builds-on: 2026-07-22-structure-derived-split-patterns.md, 2026-07-29-autosplit-is-not-a-toggle.md, 2026-06-22-the-fit-spine.md
supersedes: the trigger clause of 2026-07-29-autosplit-is-not-a-toggle.md; the pacing policy of 2026-07-22-structure-derived-split-patterns.md §0b; the 2026-07-26 "note rides the last body page" review
---

# Auto-split splits on structure

**Date:** 2026-09-01 · **Status:** Shipped · **Decision owner:** Sharmarke

## The rule

A slide holding more than one structural element becomes one slide per element:

**COVER → BODY (one element each) → CLOSING**

The cover hoists the masthead. Each body page holds exactly one member and points at the
next. The closing page carries the section's below-note, key insight and annotation,
together, at full size, with nothing else on it.

Nothing is measured to decide any of that.

## What this reverses, and why it had to be reversed

Four requirements were given repeatedly and none of them was what the engine did.

| asked for | what shipped before this |
|---|---|
| split on **structure** | split on **measured overflow only** |
| a **single** element per page, never packed | 9 of 61 components atomized; 8 packed 2–8 to a page; 11 packed by ratio; **33 could not split at all** |
| an opening **and a closing** page carrying note / insight / annotation | cover, yes; insight only if a trailing blockquote existed; the **below-note was explicitly moved off its own page** onto the last body page |
| a carousel pointing at the next slide | `(cont.)` appended to a heading; a real forward pointer on **4 of 61** components |

### The trigger

From 2026-07-29 the only trigger was fit: a slide split if — and only if — a real Chromium
render found it clipping, and by however much it clipped. That was defended on the ground
that "whether a slide fits is a fact about glyphs in a box, not about how many bullets
someone typed", which is true and is not an argument for making it the trigger.

Three things follow from a measured trigger that were not weighed at the time.

**The page count became a property of the renderer.** Fonts, a Chromium version, a font that
loaded late — each moves the ratio, so the same markdown produced different decks. A deck is
supposed to be authored once and presented many ways; the fit trigger made it authored once
and *cut* many ways.

**A run's membership was not known until it converged.** The loop ran up to five passes and
could re-cut a page it had already cut. That is why the k-of-N rail and the relationship
signal had to be deferred to a post-convergence pass — a 5-tier `authority-chain` cut 3/2 on
pass 1 and 2/1 on pass 2 emitted a signal naming a tier that was no longer its neighbor. The
deferral was the right fix for the loop; the loop was the thing to remove.

**Only a browser could answer the question.** `lint:deck`, the authoring surface, the agent
kit and the Studio could not say what a deck would become, because the answer required a
render they do not do. Structure is in the markup, so all of them agree now.

Fit has not stopped being measured — it has stopped being a *trigger*. The overflow probe
runs after the split, and a page that still does not fit at one element rings. That is the
honest terminal: there is no smaller cut left to make.

### The packing

`splitTargetOf` read `capacity.perPage ?? sweet ?? soft ?? hard`. A component declaring
`perPage` atomized; every other one packed to its authoring comfort. So `glossary` put eight
records on a page, `premise` four points, `authority-chain` four tiers — and a bulleted
`content` slide packed by whatever the measured ratio implied.

`sweet`, `soft` and `hard` are an **authoring budget with one consumer, `lint:deck`**. The
2026-07-29 note says so itself, in the sentence that removed the count trigger: "`capacity` is
an AUTHORING advisory and `lint:deck` is where it speaks." It then left the splitter reading
those same numbers to decide the cut. Every `perPage` in the catalog is now `1`, and the cut
reads no budget at all.

### The closing page

A 2026-07-26 review moved the below-note off its own page and onto the last body page, one
size down, on the reasoning that a note is "a footnote of the content immediately above it,
not a takeaway that earns its own beat". The premise is right and the conclusion does not
follow: a note, a key insight and an annotation are the three ways a section says something
*about* its content rather than more *of* it, and they belong together at the end of the run.
Pinning one of them to a page already full of list items — shrunk, so as not to compete with
the content it was pinned to — is the packing this rule exists to forbid, applied to the one
element that had already earned a page.

`closingPage` is simpler than the `insightPage` it replaces for a structural reason worth
keeping: `insightPage` had to surgically drop a co-resident note out of a shared coda cell,
which is where its half-span hazards came from. Keeping both kinds means no shared range is
ever rewritten.

### The carousel

The "→ next / ↻ back to / governs ↓ / Option N of M" signal required a component to declare
`capacity.relationship`. Four do. On the other fifty-seven a split run's pages ended with
nothing joining them — and §0b had already said that atomizing members *without* the
adornment is what makes atomization unreadable. It simply never applied that to the
components with no declaration.

`sequence` is now the default, because it is the relationship a split run *has*: the pages
were one slide, so page k+1 is literally what follows page k. A declared relationship still
chooses the phrasing. The last body page points at the closing page and names what it holds.

## How the requirement got lost — the part worth keeping

This is not a case of a requirement never being written down. It was written down, by its
owner, in `2026-07-22-structure-derived-split-patterns.md`.

On 2026-07-28 that note was **edited in place** — under a "★ Read this with its sibling"
heading added a week after it was authored — to say:

> It fires on measured FIT, never on a slide's authored count against `capacity.hard`.

The structural trigger was overwritten inside the document that specified it. Nothing marked
the clause as later or as contested; it reads as part of the original ruling. Every note
written afterward built on it, and there are many: **335 of 501 decision notes mention
splitting** (re-derived 2026-09-02; it was 334 of 501 when this note was written, and the
denominator printed here was wrong). Four of the heaviest — the ones a reader
actually has to reconcile to answer "what is auto-split" — run to about 26,000 words together:
`2026-07-22-structure-derived-split-patterns.md`, `2026-07-29-autosplit-is-not-a-toggle.md`,
`2026-06-23-read-across-carousel.md` and `2026-06-25-runtime-autosplit-eventual-consistency.md`.
(Two corrections, 2026-09-02: the fourth was cited as `2026-08-06-…`, which is not a file that
exists — the note is dated 2026-06-25, so a reader following the pointer found nothing. And these
are not the four LONGEST notes mentioning splitting; the longest is
`2026-07-03-semantic-html-accessibility.md` at 20,882 words, and `read-across-carousel` is only
2,029. The 26,000 total is right; the superlative was not.) A reader assembling "what is
auto-split" from that corpus arrives at the fit trigger with no indication that it displaced
something.

Two practices come out of this, and they are the durable part of this note:

1. **An edit that reverses a note's ruling does not go inside the note.** It gets its own
   dated record and a `supersedes:` line, and the original gets a pointer — which is what has
   been done to both predecessors here.
2. **A doc that contradicts the code is worse than no doc.** `examples/auto-split.md`, the
   deck that exists to demonstrate this feature, still instructed authors to set
   `autosplit: on` — a directive deleted on 2026-07-29 — a month after it stopped existing.
   It is corrected here.

## Enrollment: what splits, what rings

30 of 61 components split. The other 31 are single structural elements already — an anchor, a
viewBox graphic, a bitmap asset, one atomic text unit or shared-geometry grid — or a component
whose seam the splitter cannot reach; all of them ring on overflow. Each has its treatment and
its reason in `lib/core/split-facts.js`.

Two that could not split now do: `content` and `list-criteria`.
`content` is the notable one — the commonest slide in any deck could
not split at all, so a long one could only clip. Its axis is declared in `adapt.capacity`
rather than top-level, following `inventory/list`: the canonical sample is prose, and a
top-level contract against a prose sample is inert, which the manifest validator correctly
rejects. The split axis is derived from the rendered DOM anyway, so a paragraph-only content
slide resolves no collection and is left whole.

**The rule is the SEAM, not the bucket (owner ruling, 2026-09-02), and the seam has to be
REACHABLE.** A chart that cannot be split stays whole; a chart that can, splits. The bucket is
the wrong discriminator either way: `kanban` (per lane) and `roadmap` (per horizon card) are
chart-bucket components that have always split.

`journey` is where that distinction got its teeth. It was enrolled under this rule — it authors a
real top-level `<ul>` of independent stages, so the seam looked present — then backed out on a
bucket reading, then RE-ENROLLED when the bucket reading was corrected. It was never re-rendered
across any of those moves. On the render it did not merely decline to split: it produced a
multi-page run in which every body page carried the whole five-stage board, identical. (An
earlier draft of this paragraph said SIX pages and blamed the band-label collision on the run.
Both are corrected: the page count depends on the deck, and the collision is `journey`'s own —
rendered against `origin/main` the single unsplit page collides identically. See the separate
entry for it below.) Its transform rewrites the authored list into a
`.journey-board`, so the members the splitter reaches at count time are gone by the time the page
is assembled — and the envelope (page count, rail, "next:" pointer) is built from the count. An
unreachable seam is therefore not a no-op; it is a run of duplicates that passes every gate.
`journey` keeps whole, with `progress` and `timeline-list`, for one shared reason.

**But "unreachable" was too strong, and the correction matters for what happens next.** The seam
is unreachable *from the authored markup*, which is all `capacity.axis` can see. It is plainly
reachable in the RENDERED DOM: measured, each of these keeps its members as clean repeated blocks
— `.progress-row`, `.timeline-item`, `.journey-vtask` inside `.journey-vstage`, and
`split-compare`'s 2 × `.option`. Reading a post-transform shape and re-authoring it into pages is
what `kanban-lanes` and `roadmap-horizons` already do. So enrolling these is one READER per shape
plus a recipe, not a new mechanism — a tractable follow-on, not a blocked one. What is genuinely
not splittable is a component that renders as ONE figure over a shared axis (`matrix-grid`,
`gantt`): cutting those leaves rows with nothing to read them against, and no reader fixes it.

§0c already encoded the no-seam half and is the authority: `graphic`, `asset`, `anchor` and
`atomic` are the treatments that mean "no seam". A viewBox figure has nothing to cut between; a
shared-geometry grid loses its whole read if you cut it. That is a fact about the artifact, and no
bucket name is needed to see it. What §0c does NOT encode is reachability — a treatment describes
the artifact, not whether the transform left the splitter anything to hold.

**Four more were enrolled and backed out the same day.** `pricing` came out on a gate: the
`band` conformance rule requires a component's stress doc to sit inside the capacity band it
declares, and `pricing`'s stress doc holds THREE tiers while its own gallery ships a supported
`.four` variant with four. No band satisfies both, so the component's tier ceiling is genuinely
undecided — and its stress doc stresses the FEATURE ROWS inside a tier, not the tier axis at all.
That is `pricing`'s own decision (which axis it declares, and a stress doc that stresses it), and
resolving it inside this change would have meant editing a shipped exhibit to fit a contract
written an hour earlier. It keeps whole and rings, as before.

`timeline-list`, `progress` and `journey` came out on the render. They declare a list and RENDER a diagram — their transforms replace the authored `<ul>`
with a `.chart-body` / `.timeline-spine`, so `deriveAxis` resolves no collection on the page and
the declared axis could never fire. An inert contract is worse than none, because it reads as
coverage. Splitting either needs a carousel strategy that re-authors the transformed shape, the
way `roadmap-horizons` does. This is §8 rule 1's authoring/render mismatch seen from the other
side: `glossary` authors a list and renders a table, and the rule exists because those two can
disagree — here they disagree in the direction that removes the seam rather than moving it.

`logo-wall` moved `list-light` → `atomic`. Its members are not independent — the claim is the
wall — so one logo per slide says something the author did not write, and any packing is what
the single-element rule forbids. It keeps whole and rings, which is what it already did by
declaring no axis; this records the reason so the next sweep does not "fix" the omission.

## A split run numbers ITSELF — 2 · 2.2 · 2.3

An owner ruling, and the record carried it nowhere until 2026-09-02: it was in the code, in the
tests and in the PR body, but not in this note. That is the same failure this note is about — a
requirement that lives only in the owner's head and the implementation is one a later session
"simplifies" without knowing it was load-bearing.

**The rule.** A slide that splits into three becomes `2`, `2.2`, `2.3`. The first page keeps the
authored number. Every slide AFTER the run keeps the number it already had — the next authored
slide is still `3`, not `5`. The per-deck TOTAL is never rewritten either, so "3 of 12" stays true
on a page numbered `2.3`.

**Why, in the owner's words: "think index in a library."** A library index does not renumber every
book when one is split into volumes; it addresses the volumes inside the shelf mark it already has.
The three properties that buys are the reason it is a requirement and not a preference:

- **Performance.** Nothing downstream re-renders. Sections after a split come out BYTE-IDENTICAL to
  their unsplit form — asserted on the bytes in `test/unit/core/auto-split.test.js`, not on the
  numbers, because a number can match while the markup around it moved.
- **Determinism.** A slide's address is a function of what the author wrote, not of how many pages
  some earlier slide happened to produce. Two decks that differ only in slide 2 still agree on
  every address after it.
- **Stability.** A citation, a bookmark, a printed note or a review comment that names slide 7
  still finds slide 7 after slide 2 grows by four pages.

**Where it lives.** `repaginate` (`lib/core/auto-split.js`) touches only sections carrying
`data-split-run`; page k≥2 of a run takes a `.k` suffix on `data-lattice-slide`,
`data-lattice-pagination` and the rendered `.lat-pagination` span. Totals are not rewritten.

**The cost, recorded because it is real.** The page number is no longer an integer. Anything
downstream that parses it as one sees a change — and one such consumer is ours: the player's chrome
counts positionally, so a split page can show "5 / 33" in the chrome while its own footer band reads
`2.3`. That is logged under "What is not resolved" rather than fixed here.

## The chrome a split page carries

**The page number and the k-of-N pill rail. Nothing else.** No deck header, no running
`footer:` string, no section rail.

This reverses §0a — *"Footer, pagination, and the progress rail ride every slide in the
envelope (cover and closing included)"* — and the reversal is about what a split RUN is. The
deck frame is what a reader meets on an authored slide. A split run is not a sequence of
authored slides; it is one slide unfolded, so the run's own chrome is what orients the reader
inside it. Repeating the deck frame fourteen times says only that the deck is still the deck.

§0a was written when a split was two or three pages. At that length the frame reads as
continuity. At one structural element per page it reads as repetition, and it costs the thing
the band is for: the footer text, the section rail, the k-of-N rail and the page number were
four marks sharing one width budget, which is why a long run pushed a deck's own footer into an
ellipsis on 21 pages of a demo deck. Removing three of the four is the fix §0a could not reach.

It is one pass over the emitted document (`stripDeckChrome`), keyed on `data-split-role`, not a
change inside each builder — ten carousel strategies plus the plain envelope assemble their own
pages and three of them splice the deck's chrome back in by construction. Keying on the role
also means it cannot touch a slide the split did not emit, which is the whole distinction.

**The pill rail follows from it.** `RAIL_DOT_MAX` was 4 across two commits, set while the band still
carried the footer; with three marks gone the constraint that set it is gone, and the threshold
is now a readability call — twelve, about the limit for a row the eye reads as a shape rather
than counts.

## The marks are drawn, not typed

Every arrow in a split run — the cover's lead-in and the four relationship marks — was an HTML
ENTITY written into the rendered DOM. HARD RULE #29 forbids exactly that, and its gate never saw
them: `checkTypedGlyphs` matches literal characters, and `&rarr;` is not one until the parser has
run. So the rule's own failure mode shipped in the feature whose whole job is wayfinding — the
deck's face carries no arrow, so each fell back per machine.

They are `data-mark` attributes now, painted from the mask tokens that already existed. A
comparison signal deliberately gets no mark: "Option 2 of 4" is a count, and an arrow on it would
claim a direction the relationship does not have.

**The gate's blind spot is worth recording**: it is a text matcher over literal characters, so
entity-encoded and JS-escaped forms are both invisible to it. Nothing here closes that; the arrows
are simply no longer typed.

## The cover introduces, it does not merely title

§0a's argument for a cover is that a split should "introduce rather than merely title", and the
mechanism was a per-layout `split.intro`. Twelve components declare one. The other forty-nine
carried a title and nothing else — the cover doing half the job its own rationale asks for.

The lead-in is now DERIVED where none is declared, from the run's first member, using the same
`labelOf` the body pages use for "next:". One rule for the whole run: the cover points at page
one exactly as page one points at page two, and it cannot go stale because it is read from the
content rather than authored beside it.

It declines rather than clips. `labelOf` refuses a member with no name — a bare sentence — because
clipping one produced "→ next: A page carries one structural elem…", which reads as a rendering
bug rather than wayfinding. A prose-bulleted `content` slide therefore still gets a title-only
cover. **Whether that case should instead fall back to a count ("Five points →") is open**, and is
the one piece of the opening slide this note does not settle.

## Scope: the size gate is unchanged

Splitting still runs at `square`, `tall` and `strip`, never at `wide`. That gate is about
*where* auto-split applies, not about what triggers it, and the argument for it is untouched:
16:9 is the box the deck was authored in, and its author already judged the fit there. A
change to the gate is a separate decision and is not made here.

## What is not resolved

- **Backing a component out of splitting also takes away its CROWDING guidance, and the schema
  gives no way to keep one without the other.** `capacity.axis` is required whenever `capacity`
  is present, so removing the axis means removing `sweet`/`soft`/`hard` too — and with them the
  `lint:deck` warning an author gets for an over-full slide. `journey` loses its "~4 items (over
  5 overflows)" line, as `progress`, `timeline-list` and `glossary` already had. Splitting an
  authoring band from a split contract is a manifest-schema change with its own consumers, and it
  is not made here.
- **A bold lead that is a STATISTIC, not a name — RESOLVED 2026-09-02, see below.** Left here
  because the reasoning for the option REJECTED is worth keeping.
  The problem: `labelOf` takes a member's leading `<strong>` as its label, which is the card
  contract — so a member reading `- **31** keep whole and ring on overflow` signalled "next: 31".
  **The option rejected was banning numeric labels outright.** "next: 2026" on a roadmap and
  "next: Q3" on a plan are both good wayfinding, and nothing in the label itself distinguishes
  them from "31" — a ban would have taken those down with it. That dead end is worth keeping,
  because it is what forced the right question: not *is the label numeric*, but *does the member
  carry a name the figure can yield to*. See § "A figure is not a name" below for the rule that
  answers it. (This bullet said for a day that the contract therefore stood and the demo deck
  said so too. Both were corrected on 2026-09-02, a day after the rule that superseded them
  shipped — the same lag this note is about, inside this note.)

- **The example decks export with different page counts, and the increase is large.** That is
  the change, not a defect — but the size of it is worth writing down rather than implying.
  Measured across every non-`wide` example deck, 19 of 21 committed PDFs were stale (this
  record previously claimed all of them had been regenerated; two had). All 21 are regenerated
  now. The biggest moves: `adaptive-sweep` 34 → 64 pages, `split-envelope` 26 → 52,
  `adaptive-sizing` 8 → 25, `portrait-roadmap` 5 → 13, `cover-paginate` 30 → 43. Roughly a 1.7×
  page count across the family, and every one wants an eye on it.
- **`list`'s card runs its title into its body when the title is a bare text node.** A member
  authored as HARD RULE #5's card shape — `- Sequence` / `  - Each page names the step that
  follows it.` — renders as "SequenceEach page names…", the two abutting with no gutter and
  misaligned baselines, because the card is a flex ROW and the title is a bare text node rather
  than the `<strong>`-lifted slot the row's sizing assumes. PRE-EXISTING and OFF-PATH: rendered
  unsplit at `wide` the collision is identical, so this change neither caused it nor worsened it —
  it only makes it more visible, since a lone card on a page-tall box draws the eye. Fixing it is
  inside `list`'s own card CSS, which nothing here touches. Logged per HARD RULE #18's off-path
  arm; found by rasterizing `examples/split-relationship.pdf` and reading it.
- **`journey`'s section band labels collide with its rows at `portrait`, and that is its own
  defect, not the split's.** On the demo deck's "Reading a split run" slide the "Close" band label
  is sheared by the row beneath it and a red band strikes through "Learn what the run is about".
  Rendered against `origin/main` in a separate worktree the collision is pixel-identical, so this
  change neither caused it nor worsened it — but it is squarely on the path (the deck is a new
  deliverable of this change and that slide was authored for it), so it is recorded here rather
  than walked past. Not fixed: the fix is inside `journey`'s vertical board layout, which nothing
  else in this change touches, and pulling it in would widen the diff past what HARD RULE #17 and
  #8 allow. Found by the HARD RULE #25 independent checker.
- **FIVE CAROUSEL STRATEGIES STILL USE THE RETIRED 2026-07-26 PLACEMENT, so the closing page is
  not yet universal.** This note's own front matter says every run "ends on a CLOSING page carrying
  the below-note and key insight together". That is true of the plain envelope and `cover-cards`.
  It is NOT true of `feature-cover` (`split-panel`), `cover-sides` (`compare-prose`),
  `cover-decision` (`decision`), `cover-code` (`compare-code`) or `cover-rows` (`list-tabular`) —
  five of the thirty enrolled components. `lib/core/carousel.js` is untouched by this change on
  that path: it still injects the note into the LAST BODY page and gives the insight a separate
  `insight`-role page. Measured on a real render of `compare-prose` carrying both:
  `cover · body · body · body(+note) · insight`. The two beats are split apart, which is the exact
  shape the 2026-07-26 review was superseded for.
  **A fix was attempted on 2026-09-02 and reverted.** Routing those strategies through a
  `closingPageFrom` builder produced the right page for `compare-prose` — verified on a render,
  note consumed into the verdict page, insight closing the run — and then failed the CONSERVATION
  gate on 14 tests ("every source text leaf survives somewhere"). The old path conserves content
  and the new one did not, so it was reverted rather than shipped: a misplaced note is a worse
  page, a dropped note is a lost sentence. The gate was right and is why this is recorded instead
  of merged.
  Anyone taking it up should start from the reason the naive fix loses text: these strategies
  RE-AUTHOR their body from parsed parts, so the trailing region has to be carried forward
  explicitly, and `closingPage`'s "splice out the lede and the collection, keep everything else"
  shortcut has no collection span to splice against.
- **`feature-cover` LOSES a trailing note and key insight outright when it splits — pre-existing,
  and worse than the misplacement above.** Measured: the same `split-panel` slide renders both at
  `wide` (unsplit) and neither at `portrait` (split), on this branch AND on `origin/main` at
  13020f8, so this change neither caused it nor worsened it. The cause is that `split-panel`
  renders with no `.cell-stage` and no `.cell-coda` — a non-Form layout with its own DOM — so
  `trailingMaterialOf` and `trailingSlotMaterialOf` both find nothing to hoist, and the
  dispatcher's containment guard cannot report a shortfall for material it never located. Logged
  per HARD RULE #18's off-path arm; the fix belongs with whoever owns `split-panel`'s DOM.
- **The trigger is UNCONDITIONAL, and nothing bounds a run's length.** A slide splits at two
  members, whether or not it fit: there is no threshold, no cap, and no author opt-out — the
  `autosplit:` directive was retired on 2026-07-29 and `--no-split` is instrumentation, not
  authoring. So a 40-row `glossary` at portrait is a 42-page run, and the only signal is a rail
  that has given up on pills and prints `37/42`. This is the owner's ruling ("structure drives
  splitting, one row / list item per slide"), recorded here as a consequence rather than
  defended as an accident. The cheapest containment, if it is ever wanted, is one line in
  `splitTargetOf`'s caller: split when the collection exceeds `capacity.hard`, then split one
  per page with the same envelope. That keeps determinism, the absence of a render loop, the
  single-element rule and the universal carousel, and it makes `lint:deck` agree with the export
  exactly — the advisory already fires at `n > cap.hard` while the export splits at `n >= 2`, so
  today the two diverge across most of a deck.
- **The single-element rule reached the plain envelope before it reached the carousel
  strategies.** `cover-cards` and `roadmap-horizons` assemble their own pages and were still
  packing — caught by a census of the split kernels rather than by any gate. There is no gate
  that would catch the next one: `perPage` is a manifest field, and a strategy that groups in
  code is invisible to it.
- **A one-element page can be sparse — the BROKEN cases are fixed; a THIN one remains, and the
  difference is worth stating.** A single bullet set at body size in a page-tall box read as an
  accident; it now drops the marker, reclaims the indent and steps to `--fs-emphasis` (§ The lone
  member). `agenda` and `inventory` centered on the wrong axis, and `glossary`'s lone row sat
  against the masthead with two-thirds of the page blank — all three fixed and each measured.
  What a deck sweep of ~140 changed slides did NOT find is a fourth broken case: `list-steps`,
  `statute-stack`, `cards-stack` and `stats` all center their lone member acceptably. `stats` is
  the thin one — a single KPI name and two pills, correctly centered but small for a page-tall
  box. That is a question about the component's own type scale rather than a split defect, and
  raising it would be a `stats` decision, so it is named here and left alone.
- **`progress` shears its own status badges at `portrait`** — a "Content clipped" tag on an
  UNSPLIT page. Pre-existing and off the path of this change — though not for the reason first
  given here, which was that every CSS rule added is scoped to a split class. That is not true:
  eight component stylesheets gained `counter-reset: <name> var(--lat-split-offset, 0)` on
  UNSCOPED selectors (`section.agenda ol` and the like), which match every slide of those
  components. The conclusion survives on the narrower fact that `progress.styles.css` is untouched
  and those declarations are inert while the custom property is unset. `progress` neither split
  before this change nor splits after it. Logged rather than fixed (HARD RULE #18's off-path
  arm); the demo deck uses `content` for that slide instead.
- **`timeline-list`, `progress` and `pricing` still ring**, for the two different reasons above —
  an unreachable seam for the first two, an undecided capacity contract for the third. Nothing
  regressed for any of them; the gaps are now recorded rather than latent.
- **The lone-member WIDTH fill has no enrolled consumer in the tree today.** It was measured on
  `pricing` (a one-tier page rendered at a third of the measure and sheared its copy) before that
  enrollment was deferred, and every component that atomizes today is a tiling one that answers
  width by another route. It is kept because the defect is real for the next component with an
  arithmetic track width, and pinned by unit test rather than by a committed render.

## A figure is not a name

`stats` and `kpi` lead a member with the VALUE and nest the metric name beneath it —
`<strong>119%</strong>` over "Net revenue retention". `labelOf` took the leading `<strong>`, so an
entire run pointed at its own numbers: measured on `examples/adaptive-sizing.pdf`, every page read
"next: $0.9M" and the cover lead-in was "$48.2M". The reader was told which figure came next and
never which metric.

**The rule.** When the lead is a bare VALUE TOKEN — carries a digit, holds no space, which is what
a figure looks like and what a name does not — the member's own following text is preferred if it
yields a name: its nested list's first item, else whatever runs on after the `</strong>`.

Three cases, and the second and third are why this is not the blanket ban on numeric labels that
was considered and rejected when the limitation was first recorded:

| authored | pointer |
|---|---|
| `**119%**` over "Net revenue retention" | `next: Net revenue retention` |
| `**2026**` with nothing after it | `next: 2026` — the numeral IS the name there |
| `**31** keep whole and ring on overflow…` | the follow if it is a name; `continues` if it is a sentence |

A blanket ban would have taken the roadmap case down with the rest. What distinguishes them is not
whether the label is numeric — it is whether the member carries a name the figure can yield to.

## The lone member, and the three things that were wrong with it

One structural element per page makes the commonest split page hold a SINGLE bullet. Four
defects showed up there, and they are worth separating because only one of them was a design
question — the other three were the kind that pass every machine gate.

### The type (a design question)

A bullet alone on a page keeps a marker whose whole job is to separate it from siblings it no
longer has, at a size chosen for one item among many that are not there. So it reads as a
fragment torn out of a list. The fix is to stop treating it as a list item: drop the marker,
reclaim its indent, set it at `--fs-emphasis` — the rung the insight page already uses for the
same reason, that a page holding ONE thing sets that thing up.

Scoped to a BARE member. A heavy member — a card carrying a title and a body clause (HARD RULE
#5's nested `- Title` / `  - body`) — already fills its page and carries its own internal type;
stepping it up would blow out a `cards-grid` card. `strong` is deliberately absent from the
exclusion list: a bare bullet routinely carries inline emphasis, and testing for it would misread
every emphasized bullet as a card.

### The selector that was never applied

The first draft of that rule wrote the `ul` test as `:has(> li:only-child:not(:has(…)))`.
**`:has()` may not nest inside `:has()`**, so Chromium rejected the selector — and a stylesheet
parser drops an invalid selector with no error anywhere. The neighbouring `li` rule put its
`:has()` inside a top-level `:not()`, which is legal, so exactly HALF the fix applied: the type
stepped up and the marker stayed. It took a portrait render plus a computed-style probe
(`list-style-type: disc`, `padding-inline-start: 52.65px`, `font-size` already at 68.04px against
a 46.98px body) to see why.

Neither existing tier could have caught it. `build:check` runs the bundle through css-tree, which
accepts the nesting and re-serializes it unchanged (measured). And a render proves nothing — a
dropped rule renders fine, it just renders without the rule. So the gate asks the parser that
actually ships: `test/unit/css/selector-validity.test.js` puts every selector in the built bundle
through `querySelector`, which uses the same grammar the stylesheet parser does and throws on
exactly what that parser would reject. Run against the pre-fix bundle it named one selector out
of the 3,244 in a 1.7MB bundle — the right one.

### The numbering that restarted on every page

Eight components draw a per-member ordinal from a private CSS counter, and a fresh `<ol>`/`<ul>`
resets it. A three-item `list-criteria` therefore read **`01 · 01 · 01`**, which tells a reader
there are three first criteria.

The kernel already did its half, twice over: `auto-split.js` writes `--lat-split-offset` on every
body page (the count of members on prior pages), and `collections.js` sets `start="N"` on a split
`<ol>`. Three components read the offset (`list-steps`, `q-and-a`, `authority-chain`) and one
rides the built-in `list-item` counter that `start` seeds for free (`premise`). The rest read
neither. That stayed invisible while a page held several members — numbering was at least
sequential within a page — and `perPage: 1` is what made it read as an error on every page.

`list-criteria`, `list`, `agenda`, `inventory`, `cards-grid`, `cards-stack` and
`regulatory-update` now seed from the offset, the pattern the three already used (HARD RULE #15).
Writing the gate turned up an eighth: `list-steps.timeline` added its own counter later and did
not inherit the note, in the very file that carries the explanation. That is the failure mode the
gate exists for, and it is why the check enumerates counters rather than components:
`test/unit/css/split-ordinal-continuity.test.js` fails any component that declares a split axis
and resets an ordinal counter without the offset. The exemption map is EMPTY, and
stays that way until a component that actually splits needs an entry: it briefly held `journey`'s
`mood`/`volume` counters, and when `journey` was backed out that entry became dead weight the
staleness check still certified. An entry now has to name a counter that exists AND a component
that is still enrolled.

### Two components centered their lone row on the wrong axis

The shared lone-member rule centers with `align-content`, which only moves WRAPPED lines.
`agenda`'s row is `flex-wrap: nowrap`, so it was inert: measured, a 948px row held its ordinal and
title at the very top. `inventory`'s ordinal is absolutely positioned at the row's top — it has to
stay out of a flow that stacks a block title over body prose — so centering the prose left the
numeral ~370px above it, two unrelated marks.

There is no single property that fixes both: `align-items` is the live axis on a nowrap row, but
on a COLUMN flex member (`cards-stack`) it is the horizontal axis and would center that card's
text. So each is a component-local rule, scoped to a member alone on its page. This is the one
place in this change where the general rule genuinely did not generalize, and saying so is better
than a blanket declaration that silently mis-centers a third component.
