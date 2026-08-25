---
marp: true
size: 16:9
theme: onyx
paginate: true
header: "Lattice · Executive Briefing"
lens-default: full
lenses:
  brief:    { label: "Bottom line",   base: none }
  investor: { label: "For investors", base: none }
  buyer:    { label: "For buyers",    base: none }
  board:    { label: "For the board", base: all }
acronyms:
  WCAG: wuh-cag
  AA: double A
  CVD: C V D
  AGPL: A G P L
  PDF: P D F
  PPTX: P P T X
  API: A P I
  CSS: C S S
  CI: C I
  SVG: S V G
  TTS: T T S
  OKLCH: oak-l-c-h
---

<!-- _class: title spectrum -->
<!-- _header: '' -->
<!-- _paginate: false -->
<!-- _lens: brief investor buyer -->

# Not Another Presentation App

`Executive Briefing · 2026-08-24`

What is actually here, ranked by what it is worth — and what it is not.

---

<!-- _class: compare-prose transition -->
<!-- _lens: brief investor buyer -->

## The category error is thinking this is about slides.

`Ten seconds of looking versus ten minutes of reading`

- **What it looks like**
  - Markdown goes in, a slide comes out. Another take on a thirty-year-old idea, with fewer buttons than the incumbent and no drag handles.
- **What it is**
  - A compiler with a typed component contract, a color system that repairs its own contrast, and seventy-two machine gates standing between an author and a broken artifact.

The slides are the output format. They are not the product.

---

<!-- _class: stats -->
<!-- _lens: brief investor buyer -->

`Counted from the repository, not recalled`

## What is behind the thing that looks simple.

1. 286
   - shipped decisions
2. 72
   - machine gates
3. 61
   - components
4. 7,058
   - tests, none failing

---

<!-- _class: premise -->
<!-- _lens: investor buyer -->

## This briefing has two tiers, graded differently.

Visibility decides the treatment, not importance — the second tier is where the defensibility lives.

1. The marquee
   - Ten things you can see and demonstrate.
   - Checkable against a competitor in an afternoon.
2. The substrate
   - The engineering nobody sees and everything rests on.
   - Compressed, because its value is cumulative.

---

<!-- _class: content -->
<!-- _lens: investor buyer -->

`Read this slide twice`

## This deck is a demonstration of itself.

One source file. Four reader views. You are reading the full one.

The same file carries a **bottom line** view, an **investor** view, and a **buyer** view — different slides, same document, no copies. Membership is bound to a content hash, so editing a slide silently de-approves every view until a human re-approves it. No other presentation tool ships this.

---

<!-- _class: agenda -->
<!-- _lens: investor buyer -->

## What this covers.

1. The marquee — ten things you can see
2. The substrate — the engineering underneath
3. What it cannot do, named plainly
4. The ask

---

<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->
<!-- _lens: investor buyer -->

`Tier One`

## The Marquee

---

<!-- _class: split-panel metric -->
<!-- _lens: brief investor buyer -->

`Marquee 01 · Reader lenses`

## 4

One deck carries four audience views, and the reader picks. No duplicate files, no divergent copies.

- Membership is a diff
  - A slide is tagged only where it differs from its view's base, so the source stays clean.
- Approval is a content hash
  - Not a boolean. Edit any slide and every view de-approves itself until re-approved.
- It fails closed
  - An unapproved or drifted view shows nothing. A redaction view can never leak.

---

<!-- _class: code -->
<!-- _lens: investor buyer -board -->

`Verification`

## The fail-closed property, run against the shipped library.

`node -e "lensEligibility(slides, reg, id)" — this deck's own front matter`

```text
full       {"status":"ok","pairs":[]}
investor   {"status":"unavailable","reason":"unapproved"}
buyer      {"status":"unavailable","reason":"unapproved"}
board      {"status":"unavailable","reason":"unapproved"}
brief      {"status":"unavailable","reason":"unapproved"}
nope       {"status":"unavailable","reason":"unknown"}
```

— Five distinct refusal reasons, none of which is "show the full deck instead." The identity view is the only one available by default, and it is safe because it is everything.

---

<!-- _class: content -->
<!-- _lens: investor buyer -->

`Why this is hard to copy`

## The interesting part is what it refuses to do.

Anyone can filter slides. The engineering is in refusing to guess.

The suggester proposes membership from a transparent rule table and **writes nothing**. The reader path never imports the suggester. The only bridge between them is a human pressing Approve, which stamps the hash. A hand-typed hash will not match, so a forged approval fails exactly like no approval — the deck you are reading has four unapproved views for precisely this reason.

---

<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->
<!-- _lens: buyer -->

`Marquee 02`

## Accessibility Is Not A Checkbox Here

---

<!-- _class: big-number -->
<!-- _lens: investor buyer -->

`Palettes shipped for color vision deficiency`

- 5
  - Protanopia, deuteranopia, tritanopia, achromatopsia, and a neutral base. Achromatopsia is total color blindness — roughly one in thirty thousand people, and almost universally ignored by design systems. Lattice ships a palette for it and a gate that keeps it honest.

---

<!-- _class: cards-grid three -->
<!-- _lens: buyer -->

## Color is never the only thing carrying meaning.

- Texture as a channel
  - Every categorical slot owns a pattern as well as a hue, so a chart survives being printed in grayscale or read by someone who sees none of it.
- Redundant encoding
  - Status is a glyph and a position and a label, not only a color. The check, the dash and the cross differ in shape before they differ in ink.
- Contrast repaired, not checked
  - The engine derives every pair in perceptual color space and repairs it to the standard, in both light and dark, rather than warning you afterward.

---

<!-- _class: compare-prose transition -->
<!-- _lens: buyer investor -->

## Most tools check the stylesheet. This one measures the pixels.

`Why that distinction decides whether the claim is true`

- **Checking the CSS**
  - Reads the declared colors and compares them. It cannot see a translucent overlay, a gradient, a composited card on a tinted band, or a value that a later rule overrode.
- **Measuring the render**
  - Drives a real browser, reads the painted result, and computes contrast from what a human would actually see. Composition defects only exist on this tier.

The second one found defects the first had certified as passing for months.

---

<!-- _class: content -->
<!-- _lens: buyer -->

`The part that makes it stick`

## An accessibility property nobody enforces decays in a quarter.

Nine of the seventy-two gates exist to keep this true.

They check that every palette declares its status trio, that categorical ink is declared and has a fallback, that muted tiers clear their floors, that syntax highlighting stays legible, and that a theme cannot register without the tokens the contract requires. A palette that regresses does not ship — the gate fails the build, not a code review.

---

<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->
<!-- _lens: investor -->

`Marquee 03`

## The Only One That Admits It Clipped

---

<!-- _class: content -->
<!-- _lens: brief investor buyer -->

`The failure every tool has and only one reports`

## Overflowing content does not warn you. It just disappears.

Put twelve items on a slide sized for six and every tool renders something. Four of the five we tested drop the surplus and exit successfully. The deck looks finished. The missing risk item is discovered in the room.

Lattice measures the rendered box against its container, and when content will not fit it says so — a visible marker on the slide and a named page on standard error.

---

<!-- _class: compare-table -->
<!-- _lens: investor buyer -->

`Same brief, same twelve items, five tools, measured 2026-08-23`

## What each tool does when the content does not fit.

| Tool | Items reaching the page | How you find out |
|---|---|---|
| **Lattice** | **5 of 6 retained** | **Marker on the slide, named page on stderr** |
| Beamer | 0 of 6 | One warning line, if you read the log |
| Marp | 2 of 6 | Nothing |
| Slidev | 2 of 6 | Nothing |
| Quarto | not comparable | Nothing |

— Silent truncation is the industry default. Being loud about your own failure is the differentiator.

---

<!-- _class: content -->
<!-- _lens: investor -->

`The honest version of this claim`

## The mechanism is narrower than the marketing would like.

Automatic re-pagination is deliberately off at widescreen.

At 16:9 an overstuffed deck clips and reports; at other sizes the engine splits the slide and adds pages. That was a design decision about what a presenter expects, not a gap — but it means the headline is "it tells you," not "it fixes it." An earlier draft of this claim said the wrong thing and measurement corrected it.

---

<!-- _class: split-panel metric mirror -->
<!-- _lens: investor buyer -->

`Marquee 04 · Narration`

## 0

Words a presenter must record for a deck to narrate itself, aloud, in sync.

- Word-level synchronization
  - The highlight tracks the spoken word, not the slide, so a reader can follow along or skim ahead.
- Diagrams narrate too
  - A flowchart is described in reading order rather than skipped as an image.
- The timing is estimated, not guessed
  - Trailing silence and spoken number length are modeled, because "twenty twenty-six" is not two syllables.

---

<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->
<!-- _lens: investor -->

`Marquee 05`

## The Model Proposes. The Kernel Disposes.

---

<!-- _class: content -->
<!-- _lens: brief investor -->

`The architectural bet`

## A language model is never allowed to author the artifact.

It authors a proposal. Deterministic code turns the proposal into output.

Ask for a theme and the model returns ten colors — not a stylesheet. The engine derives the rest and repairs every pair to standard. Ask for a component and it returns a manifest and CSS that must clear the same gates a first-party component clears, or it does not render. The failure mode of a confident wrong answer becomes a rejected proposal instead of a broken deck.

---

<!-- _class: cards-grid -->
<!-- _lens: investor -->

## Four faculties, one discipline.

- Themes
  - Ten colors in, a full audited palette out, repaired in both canvases.
- Components
  - A draft that must clear the token, scope, margin and manifest gates before it renders once.
- Finishes
  - A closed vocabulary of four layers. Out-of-vocabulary values clamp rather than leak.
- Motion
  - The model emits data describing a scene, never code that runs.

---

<!-- _class: content -->
<!-- _lens: investor -->

`Where this is genuinely unproven`

## We test the disposer. We have never tested the proposer.

Every one of those four faculties is unit-tested against a reply we wrote by hand.

That proves the kernel survives a well-formed proposal. It does not prove any real model produces one. Exactly one faculty has a live-model evaluation, against a single pinned model that is now out of date. This gap is filed, scoped and unstarted — and it is the honest boundary of the claim on the previous slide.

---

<!-- _class: split-panel metric -->
<!-- _lens: investor buyer -->

`Marquee 06 · The catalog`

## 61

Contracted components across thirteen buckets. Not a blank canvas with a template gallery bolted on.

- Every component declares its capacity
  - How many items it holds before it crowds, and the count past which it overflows. The author is told before the rework, not after.
- Every component declares its shape
  - Which form it is, what substance it carries, and which component to escalate to when the count blows the budget.
- The catalog is the contract
  - A component that does not satisfy its manifest cannot register, so the catalog cannot drift from what ships.

---

<!-- _class: list-tabular def -->
<!-- _lens: buyer investor -->

`Sourced from Reynolds, Duarte, Minto and Knaflic — not invented`

## The engine has an opinion about how much you may write.

1. Slide title
   - 10 words, hard stop at 14
2. Subtitle
   - 12 words, hard stop at 18
3. Key insight
   - 18 words, hard stop at 28
4. Whole slide
   - 70 words and 6 bullets, whichever comes first

---

<!-- _class: content -->
<!-- _lens: buyer -->

`Why a budget and not a warning`

## Verbosity renders perfectly. That is exactly the problem.

A wall of text is not a rendering failure, so no renderer has ever caught it.

These budgets are routed to the review tier rather than the error tier — deliberately. Overrunning them is a communication defect, not a broken build, and the tool says so in that voice. It is the only presentation engine that ships an opinion about prose length at all, and the opinion is cited rather than asserted.

---

<!-- _class: split-panel metric mirror -->
<!-- _lens: investor -->

`Marquee 07 · Theme derivation`

## 10 → 107

Ten chosen colors become a hundred-and-seven-token contract, repaired to standard in both light and dark.

- The author picks ten
  - Canvas, ink, accent, and the status trio. Nothing else.
- The engine derives the rest
  - In perceptual color space, so a lightness step means the same thing at every hue.
- Twelve categorical slots
  - Each a fill and a mark that flip together between canvases, so a chart stays legible in either mode without a second palette.

---

<!-- _class: cards-grid -->
<!-- _lens: investor -->

`Marquee 08 · Motion and guided tours`

## Two libraries most decks never need, and some decks cannot live without.

- Scenes, not animations
  - A motion scene is authored as data in a closed vocabulary and validated before it plays. There is no scripting surface to get wrong.
- Self-driving walkthroughs
  - A product tour that drives the real interface, so the demo cannot drift from the thing it demonstrates.
- Diagrams that draw themselves
  - A process flow renders as vector and reveals in reading order rather than appearing all at once.
- Charts reveal, then settle
  - Motion carries the sequence of an argument instead of decorating it.

---

<!-- _class: inventory cards -->
<!-- _lens: buyer -->

`Marquee 09 · Export`

## One source, five destinations, none of them lossy by accident.

- **Vector PDF.** Real text, selectable and searchable, with fonts embedded so it renders identically on a machine that has none of them.
- **PPTX.** For the room that will not accept anything else, generated rather than hand-rebuilt.
- **Standalone HTML.** A single file with no network dependency — it opens on a laptop with the wifi off.
- **A player.** The deck as a self-contained interactive artifact, pruned to only the styles it actually uses.

---

<!-- _class: content -->
<!-- _lens: buyer -->

`The property that matters to a compliance reader`

## The same input produces the same bytes.

Render this deck twice and the two files are identical.

Timestamps are the usual reason a document cannot be diffed, so they are rewritten in place. That makes a rendered deck reviewable the way source is reviewable — you can prove which bytes changed between two versions, and a build that was supposed to change nothing can be shown to have changed nothing.

---

<!-- _class: split-panel -->
<!-- _lens: investor buyer -->

`Marquee 10 · The Studio`

## The authoring surface is a browser tab, and it runs the real engine.

- Not a preview
  - The same kernel that renders the export renders the editor, so what you approve is what ships.
- The model is bring-your-own-key
  - AI assistance runs on the reader's own credentials. No server-side key, no per-seat inference cost.
- It works offline
  - The engine, the catalog and the themes are a static bundle. The network is for saving, not for rendering.

---

<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->
<!-- _lens: investor -->

`Tier Two`

## The Substrate

---

<!-- _class: big-number -->
<!-- _lens: brief investor buyer -->

`Named checks standing between an author and a broken artifact`

- 72
  - One ten-thousand-line file, run on every commit. Not one of them is a style preference: each exists because something broke, was root-caused, and the cause became a thing the machine now refuses.

---

<!-- _class: list-tabular register -->
<!-- _lens: investor buyer -->

## What the gates actually defend, grouped.

1. Color and contrast
   - Eight checks: every pair declared, every fallback present, every floor cleared
   - `9 gates`
2. Untrusted content
   - Five checks across markup, stylesheets, re-wraps, runtime injection and snapshots
   - `5 gates`
3. Library boundaries
   - Five in-tree libraries that cannot reach into the engine or each other
   - `5 gates`
4. Layout invariants
   - Margins, depth planes, container anchoring, cascade layering, stage insets
   - `6 gates`
5. Everything else
   - Naming, ownership, freshness, budgets, model pinning, changelog, prose density
   - `47 gates`

---

<!-- _class: content -->
<!-- _lens: investor -->

`The security architecture, in one paragraph`

## Untrusted markdown reaches a live frame through five different doors.

Closing four of them is the mistake that gets made.

A preview builder sanitizes markup — and then embeds theme stylesheets two lines below, which a browser parses as raw text where a stray closing tag ends the element and everything after it becomes live markup. A separate arm covers that. A third covers modules that take stylesheets back out of a document and re-wrap them, because the serializer re-normalizes the escape. A fourth covers markup injected inside the frame after sanitizing. Each door was found the hard way and each is now a gate.

---

<!-- _class: checklist -->
<!-- _lens: investor buyer -->

## Determinism, and why it is not a nice-to-have.

- [x] Rendered bytes are reproducible — timestamps rewritten, output diffable `shipped`
- [x] Font metrics pinned, so text does not reflow between machines `shipped`
- [x] Committed artifacts gated for freshness against their source `shipped`
- [x] Line endings and byte-order marks normalized at every ingest boundary `shipped`
- [x] Null bytes refused at the gate rather than corrupting a render `shipped`
- [-] Timing benchmarks split into two signals — workload gates, wall-clock reports `by design`
- [ ] Wall-clock timing comparable across machines `not possible`

— The last row is honest: the same code has read 93.9ms and 43.1ms on one runner. The benchmark refuses to gate on a number it cannot trust, which is why the row above it exists.

---

<!-- _class: list-tabular -->
<!-- _lens: investor -->

`The measurement tier — where claims go to die`

## Five things the project measures that most projects assert.

1. Rendered contrast
   - A real browser paints the slide; contrast is computed from the pixels
   - _finds composition defects a stylesheet audit cannot see_
2. Overflow
   - Every slide's content box measured against its container
   - _the basis of the honest-clipping claim_
3. Cross-renderer equivalence
   - The same deck through two paths, compared
   - _catches a transform that only one path applies_
4. Committed goldens
   - 359 reference PDFs, 148 MB, diffed on demand
   - _no cadence — an acknowledged gap_
5. Engine throughput
   - Head against base on one runner, nightly
   - _the only timing signal that is gated_

---

<!-- _class: content -->
<!-- _lens: investor -->

`The part built for machines rather than people`

## The catalog is designed against a token budget.

An agent choosing a component should not have to load the catalog to choose one.

So the catalog publishes a pick surface: one line per component, the whole set in a few thousand tokens, enough to choose and nothing more. The full machine record is a separate artifact that tools read and authors never load. This is an economics decision about the cost of every future authoring session, and it is the kind of thing that only shows up in a bill.

---

<!-- _class: list-tabular register -->
<!-- _lens: investor -->

## Engineering process, enforced rather than encouraged.

1. Decision records
   - 451 dated notes, 286 shipped, each one a root cause with an index that refuses to drift
   - `enforced`
2. Changelog fragments
   - One file per change, folded in at release — a shared region that ejected seven merges in one evening
   - `enforced`
3. Rebase before push
   - Folded into the push rather than a background watcher that thrashed the merge train
   - `discipline`
4. One feature, one branch
   - Stacked chains banned after they fragmented review
   - `discipline`
5. Agent model pinning
   - Every automated reviewer declares its tier; cheaper tiers rejected by name
   - `enforced`

---

<!-- _class: content -->
<!-- _lens: investor -->

`The five libraries, and why they are still in-tree`

## Five subsystems are already libraries in everything but publication.

Each has a public surface, its own tests, a built distribution, and a gate that stops the engine reaching into it.

They cover reader lenses, narration and read-along, audio, motion scenes, and guided walkthroughs. None is published to a registry. That is a deliberate deferral rather than an oversight — but it means the standalone-value argument is currently a design claim, not a download count.

---

<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->
<!-- _lens: investor buyer -->

`Tier Three`

## What It Cannot Do

---

<!-- _class: content -->
<!-- _lens: brief investor buyer -->

`Read this before the marquee convinces you`

## Every number in this deck is measured. Several of them are unflattering.

A pitch that names no limits is asking you to trust the parts you cannot check.

The four slides that follow are the same audit the engineering team runs on itself, unedited. They are here because the differentiator on the previous forty slides is that this project measures itself — and a deck that claimed otherwise would be evidence against its own argument.

---

<!-- _class: q-and-a -->
<!-- _lens: investor buyer -->

## The four hardest questions, answered before they are asked.

- Is any of this actually adopted?
  - No. No users, no revenue, no external deployment. The engineering is real; the market evidence does not exist.
- What is the bus factor?
  - One. A single primary author, and a manual that assumes agent throughput rather than a team.
- Can we build on it commercially?
  - Not without a conversation. AGPL-3.0-only is deliberate, and a real constraint on embedding.
- Are the libraries reusable?
  - Unproven. Five have public surfaces. None is published, so nobody outside this repo has installed one.

---

<!-- _class: checklist -->
<!-- _lens: investor buyer -->

## Claims this deck deliberately does not make.

- [ ] Real-device behavior on phones — marked unverified throughout, never tested on hardware `unverified`
- [ ] "Faster than the alternatives" — the benchmark refuses to compare across machines `unmeasurable`
- [ ] AI output quality — the kernel is tested, the models never were `unstarted`
- [ ] Per-component capacity coverage — under half the catalog declares a budget `partial`
- [ ] Golden image freshness — 359 references, 148 MB, no cadence watching them `ungated`
- [x] Everything on the marquee slides, each with an artifact behind it `measured`

— Six rows, and only the last one is good news. That ratio is the point of the slide.

---

<!-- _class: list-tabular register -->
<!-- _lens: investor -->

## Three places the architecture leaks, named plainly.

1. The style escape hatch
   - Front matter can override any derived token. A deck was reproduced at 1.06-to-1 contrast, exiting successfully with a clean lint
   - `open`
2. Export to the original renderer
   - The compatibility path is broken and has been for some time; the independence story is real, the retreat path is not
   - `broken`
3. Documentation drift
   - A canonical doc contradicted the generated catalog for months, and was corrected only because this audit named it
   - `recurring`

— The first is a design decision with a missing guard, not a bug. Experienced authors should be able to override. Models should not, and today nothing distinguishes them.

---

<!-- _class: compare-prose -->
<!-- _lens: investor buyer -->

## What this is, stated without the adjectives.

`The two-sentence version for someone who reads no further`

- **What is proven**
  - A rendering engine with unusual depth in accessibility, determinism and machine-checkable invariants, verified by seven thousand tests and seventy-two gates that run on every commit.
- **What is not**
  - That anyone wants it. Every claim in this deck is about the artifact. None of them is about a market, a user, or a dollar.

---

<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->
<!-- _lens: investor buyer -->

`Close`

## The Ask

---

<!-- _class: decision -->
<!-- _lens: brief investor -board -->

`For an investor or acquirer`

## The asset is the invariant system, not the slide renderer.

- Fund the proof, not the build
  - The engineering risk is retired. What is unfunded is every question on the disclosure slides — adoption, publication, and whether the libraries stand alone.
- Do not fund more features
  - Sixty-one components and two hundred and eighty-six shipped decisions is not a capability gap. Another marquee item moves nothing.

---

<!-- _class: decision -->
<!-- _lens: buyer -board -->

`For an enterprise buyer`

## The case is compliance and determinism, not authoring speed.

- Evaluate it on the audit
  - Five color-vision palettes, contrast measured on rendered pixels, reproducible bytes, and an export that opens with the network off.
- Pilot it on one regulated deck
  - The properties that matter here are the ones no other tool can evidence. A general-purpose bake-off will miss all of them.

---

<!-- _class: closing -->
<!-- _lens: brief investor buyer -->

`What to take away`

## It is a compiler that happens to emit slides.

The simple surface is the achievement, not the disguise. Everything on the marquee exists so that an author does not have to think about it, and everything in the substrate exists so the marquee cannot quietly stop being true. What is unproven is whether anyone wants that — which is the only question this deck cannot answer.
