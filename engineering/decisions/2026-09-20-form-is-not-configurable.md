---
status: shipped
summary: >-
  Form is the composition model and cannot be disabled, configured or selected. The `form:`
  front-matter key, the per-slide `form` / `no-form` tokens, `readFormMode`, `FORM_MODES`, the
  mode argument threaded through all three render paths, the Studio's "Deck chrome" toggle and
  the Playground's "Form" select are all removed. Sovereignty stops being spelled as an ABSENT
  class: every slide now carries `data-form="2d"` and `data-frame="<id>"`, so a reader asks which
  FRAME a slide composes under and gets a name instead of inferring it from a missing class. The
  `form` CLASS stays what it always was — the chrome-hosting Frame's CSS hook. Three levels replace the toggle — Form (unconditional) over Medium (`2d` today, a
  renderer's choice) over Frame (the component's choice). The ATTRIBUTES move nothing; the one
  deliberate repaint in the same work is the `list bullet` fix below, and the branch's deck-golden
  drift list is a strict subset of `origin/main`'s. Two conformance findings fall out: `list bullet` lost its clip cell to a
  variant/component name collision (fixed — exactly one component x variant answer changes), and
  `video` cannot reach conformance by flag alone (recorded, not forced; closed 2026-09-24 by
  keeping its title in-card — see § Two conformance findings).
builds-on: 2026-06-16-form-manifest-medium-independent-contract.md, 2026-07-08-runtime-form-default.md, 2026-07-15-model-driven-frame-render.md
---

# Form is not configurable

**Date** 2026-09-20

## The ruling

> "form is our defacto model and should never be disabled… to me there is 2d form and that is
> the default and no way to change it unless it is to 3d form or VR form which we may never
> support."
>
> "everything is a form 2d/standard. they are sovereign but have no business not using form.
> every component must honor form semantics."
>
> "medium is the right lever. form is always on and the default medium is 2d. future is unknown
> but the engine has the necessary interface to support future forms."
>
> — owner, 2026-09-20

## Why a toggle was the wrong shape

Form shipped as a deck-wide feature flag that graduated to default-on (2026-06-26). The flag
outlived its purpose: it existed to stage a migration, and the migration finished. What it left
behind was worse than dead weight, because **the same absent class meant two different things**.
A slide with no `form` class was either a deck that had opted out, or a sovereign Frame that
never takes chrome. Nothing in the DOM distinguished them, so "which Frame composes this slide"
was permanently readable as "is this Form at all" — and the documentation read it that way. The
docs-site craft pages said sovereign layouts "take neither cell"; a sovereign Frame's manifest
says `cells: ["stage"]`.

## The three levels

| Level | The question | Who can express it | Today |
|---|---|---|---|
| **Form** | is this slide composed? | nobody — it is unconditional | always on; no key, class or flag selects it |
| **Medium** *(rendering medium)* | what does it compose *into*? | the renderer, never the deck | `2d` (CSS) |
| **Frame** | which Frame carves this slide into Cells? | the **component**, via its `_class` token | 12 Frames: 2 chrome-hosting + 10 sovereign |

**"Medium" is overloaded and this is not the coupling rung.**
`2026-06-16-form-manifest-medium-independent-contract.md` uses *Medium/Heavy* for how tightly the
manifest drives the CSS; Lattice sits on the *light* rung and that is unchanged. The rendering
medium above is what a Frame renders INTO. That same ADR is what fixed this direction: 2D CSS as
the first renderer, a spatial renderer as the thought experiment that shaped the manifest and was
explicitly not scheduled — "Not building VR."

So the answer to "what about 3D and VR" is: the interface is the Frame manifest, it is already
medium-independent by construction, and a second medium would be a RENDERER, never a deck
setting. Nothing is scheduled and nothing is reserved — a front-matter key nobody can use is the
confusion this record removes, not a hedge against it.

## What sovereignty is now

Every slide carries `data-form="2d"` — it composes as Form, in the 2D medium — and
`data-frame="<id>"`, naming the Frame that carves it: `standard`, or one of the ten sovereign
ids (`title`, `divider`, `closing`, `image`, `premise`, `scene`, `split-panel`, `split-compare`,
`compare-code`, `topic`). That is the statement that replaced the absent class.

Two kernel predicates NAME the question — `isSovereignFrame` and `hostsChromeCells` — and an
earlier draft of this paragraph said they are "what the chrome injectors ask". They are not:
the masthead band, the footer Cell, the progress rail and the watermark all still gate on the
`form` CLASS, exactly as they did before, and `hostsChromeCells` has no production caller at all.
Rewiring the four injectors to ask it is a separate change with its own risk, and claiming it
here because it sounded tidier is the same defect this record exists to stop.
`FORM_TOGGLE_SKIP` is `SOVEREIGN_FRAMES`, because it is no longer a toggle's skip-list — it is
the chrome-exempt half of the Frame catalog.

### Why the class did not become universal

The first cut made the `form` CLASS universal and marked sovereignty with a second class,
`frame-sovereign`. It expresses the same fact and it was reverted, because the class is not a
label — it is load-bearing for ~245 engine CSS rules and for the split envelope, and making it
universal moved real decks three separate times:

| Deck | What moved | Cause |
|---|---|---|
| `examples/social-grid` | masthead band went full-bleed; the "Option 1 of 2" pill overprinted the rail | a split page inherits the marker, and the guards then strip geometry the envelope's chrome needs |
| `themes/palette-audit` | three pages gained a stage inset they never had | `:not(.frame-sovereign)` is specificity (0,2,1) where bare `section.form` is (0,1,1), so the guarded rule won contests it used to lose |
| `examples/split-horizontal`, `examples/autosplit-coverage` | content lost its horizontal inset | `premise` split pages carry no `form` on main, so universalizing it handed them chrome geometry |

Each was found by a golden, and each needed its own guard or escape. A design that needs a new
escape hatch per discovery is not one to ship. The attributes say exactly the same thing about
the model, are queryable by name rather than by absence, and move nothing: no golden changes
because of them. (Read that as scoped to the attributes, which is all it claims. The PR as a
whole DOES repaint `list.gallery.{dark,light}.pdf` — the `list bullet` fix, deliberate and
visible. An earlier draft said "every deck golden and every component gallery is byte-identical"
without that scope, which read as a claim about what ships, and was false.)

The lesson generalizes past this change. **A CSS class that a decade of rules select on is an
interface, not a description.** Restating the model is worth doing; restating it by redefining
that interface is not.

## What it cost to verify

| Claim | Evidence |
|---|---|
| The corpus barely used it | one file repo-wide carried `form: off`; one slide carried `no-form`; ten decks carried a redundant `form: standard` |
| Sovereign Frames must stay chrome-free | rendered a `divider` wearing `form` before the gating landed: it picked up a hairline, a progress rail and an accent bar it is designed to refuse |
| The ATTRIBUTES move no pixels | 84 component galleries × 2 moods; one drift (`logo`), reproduced on `origin/main` with `dist/` rebuilt. The `list` gallery's two moods repaint deliberately — that is the `list bullet` fix, not this |
| No deck golden regressed | the branch's drift list is a strict SUBSET of `origin/main`'s, by running the full deck scope on each tree and diffing the names. Measured by checking out `origin/main` and rebuilding `dist/` — an earlier attempt used `git stash`, which removes only UNCOMMITTED work, so every commit on the branch was still in the tree and it never compared against main at all |

## Two conformance findings

**`list bullet` had lost its clip cell.** The stage-wrap decision let ANY token in a class list
veto. The layout-name and variant-modifier namespaces are shared, so a variant token can also
name a component — five such collisions exist (`journey heatmap`, `radar quadrant`,
`compare-prose decision`, `list bullet`, `math stats`). `bullet` is the bullet CHART, classified
`canvas`, so a `list bullet` slide silently lost the bounded box the overflow probe walls. Fixed
by resolving THE layout token (first match, mirroring `layoutTokenFor`). Measured over all 273
declared component × variant combinations: exactly one answer changes.

**`video` is a known gap and was not forced.** It is the one non-sovereign component composing as
Form with no Cell. Flipping `conformance: "strict"` is a no-op — video rebuilds its section and
sat below `mastheadLift`, so the cell the flag builds is discarded. Moving it above `mastheadLift`
(the documented fix, the one `contact` and `wifi` use) does build the cell and REGRESSES the
layout: the lift pulls the h2 and lead out of the `.video-lead` pair, collapsing the `companion`
composition from side-by-side to stacked and clipping the caption. Both attempts were rendered,
reviewed and reverted. Closing it means teaching video's transform to keep its title in-card the
way wifi does with `.qr-head > h2` — its own change, with its own evidence.

**CLOSED 2026-09-24, the way the paragraph above said it would have to be.** `video` is now
`conformance: "strict"` and runs above `mastheadLift`, beside `contact` and `wifi`. The card
made the hoist safe, not the order. The transform rebuilds every composition into one
`.video-card` root and keeps the title, and an eyebrow authored above it, NESTED in that card
(`.video-lead` for `companion`, `.video-head` otherwise). The lift is depth-aware for a strict
component, so it leaves a nested `<h2>` where it is, and the band has no top-level title to
claim. The composition CSS moved from the section onto the card, because the section's direct
children are now the frame's cells. Four defects on `main` went with it:

- `companion` rebuilt its section from the h2 and the lead alone, so it dropped the deck's
  running `header:`, the slide's `_footer:` and any eyebrow.
- On `gallery` the injection anchored on the first `</h2>`, which by then sat inside the
  masthead band, so the whole figure rendered inside the band, above its hairline.
- The `<figure>` carried the browser's default `1em 40px` margin. The engine never reset it, so
  that space was invisible to every height measurement (HARD RULE #20).
- On `companion qr` the poster sat against the top edge.

The stage is shorter than the section (524px of a 720px slide), so two columns were rebudgeted
to fit, measured in the real export. `companion qr` went from 576px to 519px: poster cap 40cqi
to 36cqi, channel `--sp-xl` to `--sp-lg`. `gallery qr` went from 539px to 504px: card gap 5cqh
to 3cqh, poster height cap 52cqh to 48cqh. At `portrait` the stacked column carries the
header, footer and eyebrow `main` used to drop, so the tall layouts take the `--sp-sm` step
(`companion qr` ran 1221px in a 1172px stage), and the aside loses its `13rem` side-column cap
once it runs under the poster. The demo deck renders with no overflow at hd, standard, square,
portrait and story. The pins are in `test/unit/transformers/video.test.js`,
and the demo deck is `examples/video-title-in-card.md`.

## Migration

`lint:deck` warns and never blocks (HARD RULE #29's posture). `retired-form-key` flags any
`form:` value and, for `off` alone, names what will change about the render. `retired-form-token`
flags a `form` / `no-form` slide token and points at a sovereign component as the real way to get
a slide with no chrome. **The RENDER path warns too, as of 2026-09-21** — for the three shapes that actually moved a
deck (`form: off`, a deck-wide `class: no-form`, a slide's `no-form`), and only those. The
linter is the right place for the inert ones, but the person whose deck changed shape is
rendering it, not linting it, and the change otherwise lands with a successful exit code and
no other sign. The CLI reads the linter's own findings through a `shapeChange` flag rather
than re-deciding which values matter (HARD RULE #7), so the two surfaces cannot drift.

`form` also left `UNIVERSAL_GROUPS.chrome`, so neither editor offers it,
and joined `STRUCTURAL_ROOT_CLASSES` in the ownership gate beside `chart-frame` — engine
scaffolding an author can neither select nor refuse.

## What was deliberately left alone

- The **manifest `form` field** (`bookend` / `canvas` / `grid` / `ledger` / …) — the composition
  AXIS, a different thing wearing the same word. Four of its twelve values are realized by any
  Frame at all, which is why `design/forms.md` §8 used to call the Frame catalog "the twelve Form
  values" and was wrong three ways. The field, its enum and Fabricate's editor for it are
  untouched.
- **`lib/forms/frame/minimal/`** — a live Frame reached by `class: no-progress`, not the retired
  `form: minimal` mode that shares its name.
- **`section.form > footer`'s 52cqi budget.** Its comment claimed it served "the un-migrated /
  sovereign frames"; it could never match one, because those slides had no `form` class. Letting
  it through wrapped the running footer onto a second line on three gallery pages where nothing
  was overprinting. Guarded, with the stale claim about its own reach corrected in place. Giving
  sovereign Frames a footer budget may well be right — they do carry a page number to collide
  with — but that is a layout decision owed its own evidence.

## Known gaps — found by this work, not caused by it

**Both are now CLOSED** (2026-09-21, the follow-up branch). They are left described below as
they were found, because the reasoning that logged them rather than pulling them into the
original diff is the part worth keeping. What changed: `lib/core/split-sections.js` no longer
scans for the literal string `<section` — it walks `scanTags` from `lib/core/top-level-h2.js`,
the tokenizer whose docblock already said inert spans are yielded "because the depth walk must
not count them". That makes a comment, a `<style>` block and a quoted attribute text, exactly as
the DOM twin reads them, so the two paths agree by construction rather than by coincidence; and
the single-quote gap is closed on BOTH sides, the walker's read and `applyFormToHtml`'s write,
since fixing only one would have left the duplicate-attribute defect in place.

**The first cut of that change traded one whole-deck no-op for three others, and a checker
caught it.** Routing the walk through `scanTags` inherited two defects in that tokenizer: it
treated every quote inside a tag as a value delimiter, so an apostrophe in an UNQUOTED
attribute (`<div data-tip=it's>`) opened a value that ran to end of file; and it read an
unclosed rawtext element as text to EOF, so one sentence of prose naming a `<style>` tag did
the same. Both were reachable from ordinary authored markdown and both stamped 0 of 3 slides
on a real render — the identical symptom, through a different door. A third came from widening
the class regex to accept single quotes, which then matched ` class='…'` sitting inside
ANOTHER attribute's value. All three are fixed at the root (a quote opens a value only
directly after `=`; rawtext is skipped only when it closes; the class is found by walking
attribute positions), and the tokenizer fixes reach `findTopLevelH2` too, so the masthead band
had been going missing on those decks as well. The lesson is narrow and worth keeping:
**reusing a kernel inherits its bugs along with its correctness**, and the argument "this is
the repo's tokenizer, so it must be right" is not evidence. The gates were all green for every
one of those three. The fix was
NOT the "first real slide" guard this section's first bullet implies: that guard anchors on
`data-lattice-slide`, which the owned engine never writes at the stage `applyFormToHtml` runs —
the same trap `plugins.js`'s `applyDeckLogoToHtml` docblock records, where a function anchored on
that attribute was silently dead code on the canonical path.

Both are pre-existing on `main` and verified there, so HARD RULE #18 says log them rather than
pull them into this diff. They are recorded because each is a live counterexample to something
this record states, and a claim with a known exception should carry it.

- **`splitSections` has no "first real slide" guard, so a deck body that MENTIONS a `<section>`
  tag derails the whole HTML-stage pass.** One HTML comment quoting `<section class="title">` and
  nothing gets stamped at all — no `data-form`, no `data-frame`, and no `form` class either, which
  is the part that predates this change. `lib/core/auto-split.js` has such a guard and
  `applyFormToHtml` does not. The DOM twin is unaffected: it walks a real DOM where a comment is a
  comment node, so it stamps both sections correctly — meaning the same deck gets two different
  answers depending on the path. So read "every slide carries `data-form="2d"`" as true of every
  slide the HTML pass can SEE; a deck that derails the walker loses Form entirely, exactly as it
  did before this change.
- **`applyFormToHtml` recognizes only a double-quoted `class="…"`.** A single-quoted attribute
  yields a duplicate `class` attribute on the open tag. The engine only ever emits double quotes,
  so nothing in the corpus reaches it.

**The same defect lived in FOUR more walkers, and one of them was the export (CLOSED
2026-09-24).** Fixing `splitSections` fixed the kernel, and four callers never used it. Each
scanned for the literal string `<section`, so a `<section` quoted in an HTML comment or in
`<style>` text opened a phantom section on all of them:

- `lattice-emulator.js` split the engine's document with its own regex,
  `splitTopLevelSections`. The walk returned ZERO slides, and the export shipped a one-page
  PDF with exit code 0 and no warning. Measured on a three-slide deck with one quoting
  comment: 1 page before, 3 after.
- `mapSections` (`lib/core/section-walk.js`), which sits under the masthead lift, the coda,
  split panels, chart-family and about a dozen other kernels, stopped at the quoting slide
  and passed every later slide through untouched. The same deck built 0 masthead bands where
  it builds 2 without the comment. A page count cannot see this, which is why the evidence
  for this record is a rasterized page and not a number.
- qr-card's `walkSections` (wifi, contact, video) and svg-a11y-names' `sectionSpans` carried
  the same scan.

All four now walk `splitSections` (HARD RULE #1). Rendering every `examples/*.md` to HTML on
both trees, each built from its own source, moved no deck: 195 of 197 are byte-identical and
the other two differ run to run on the same code (Mermaid's random gitGraph ids and a
timestamp).

**An independent checker found two faults in the first cut, and both were ours.**

- **An unterminated `<!--` dropped every later slide from the export.** A deck with one
  `<div><!-- oops</div>` in a raw HTML block exported as one page. The tokenizer read an
  unterminated comment as inert to end of file, which is what a browser does, and the old
  regex had never looked at comments at all. It is now read as text, the rule `scanTags`
  already applied to an unclosed `<style>`, for the same reason. That is not a fix for the
  author: Chromium still reads the comment to end of file when it prints, so the PDF stops
  there, exactly as it did before this change (2 pages of 4 on the checker's deck, both
  trees). What changed is that the export no longer deletes the rest of the deck from the
  file itself. The string walk and the DOM parse now disagree on this one shape on purpose,
  and `test/unit/core/split-sections.test.js` says so.
- **A full-deck render was about 40% slower.** Tokenizing a 339 KB document costs a few
  milliseconds, and `mapSections` runs about a dozen times per render. `splitSections` now
  jumps from literal section tag to literal section tag, and it runs the tokenizer only on a
  stretch that one regex cannot prove clean: no `<!`, no `<?`, no `<script`/`<style`/
  `<textarea`, no quoted value holding `<` or `>`, and no `<` inside a tag. A seeded fuzz test
  of 20,000 documents pins the result to the tokenizer-only walk, and deleting any one of those
  five alternatives turns it red. Measured on the gallery deck, same machine, median of 30
  renders: HEAD 72-75 ms, this change 75-77 ms, against about 100 ms for the first cut.

The regression arms are `test/integration/export/raw-section-quoted.test.js`, which covers the
page count and the masthead bands through the real CLI, and
`test/unit/core/split-sections-fast-path.test.js`.
