---
status: proposed
summary: >
  Eleven components lose content at a split size with no split available to save them, and the
  reason is not a broken splitter — none of the eleven is enrolled. Eight are barred by the
  NEVER_SPLIT treatment gate, three were classified splittable and never wired. The owner ruled
  that every component splits on structure except the container-responsive figures, and that the
  splitter which knows a component's seam belongs WITH that component. Against
  `2026-07-22-structure-derived-split-patterns.md` that is PART continuation and PART reversal,
  and an independent checker was needed to separate them. Continuation: that note's §5 retains
  ~14 sovereign builders a generic slot walk provably cannot drive, and it never says WHERE one
  lives — so moving a sovereign builder into the component's folder is genuinely new and
  genuinely uncontradicted. Correction: §5 is a stated LIMIT (~14 sovereign against ~45 flow
  layouts), not a sanction for per-component splitters as the default, and substantial mechanism
  DID ship — a whole P-envelope phase, nine §8 rules, and rule 6's content-conservation gate,
  which is built and green. What did not ship is the generic slot re-author, so carousel.js still
  hand-parses nine components in 966 lines. Reversal, and it is the owner's call because it
  overturns a built ruling: §8 rule 8 already measured state-chart below the legibility floor and
  ruled ring-never-split ("a figure has no seam"), so giving it a seam reverses rule 8 rather
  than extending it. The exception test itself — container-responsive AND above the floor, a
  measurement rather than the word "mermaid" — stands. The kernel/engine line follows the owner's
  earlier envelope ruling: the component declares the SEAM and the extras it must carry, the
  engine builds every PAGE. And the first enrollment argues for the narrow reading: `pricing`
  shipped needing NO component-owned kernel at all — a manifest block naming the existing central
  cover-paginate strategy, no new module and no CSS.
builds-on: 2026-07-22-structure-derived-split-patterns.md, 2026-09-01-autosplit-splits-on-structure.md, 2026-09-01-manifest-driven-chart-dispatch.md, 2026-09-05-auto-split-catalog-audit/README.md
---

# The component owns its seam; the engine owns the page

**2026-09-06 · owner ruling, following the auto-split catalog audit**

## What prompted it

The audit rendered all 61 components at portrait and square and found eleven that
lose content — a Wi-Fi password cut to `quarte / reviev`, two of three pricing
tiers gone, `split-compare`'s recommendation dropped, code truncated
mid-identifier. Four of the eleven lose it with **no warning of any kind**.

None of the eleven is a split that went wrong. Not one is enrolled
(`test/oracle/split-oracle.json`: `enrolled: false` on all eleven). They never
reached the splitter.

The owner's ruling: **every component splits on structure, except the few that
genuinely do not need to.** And the splitter that knows a given component's seam
belongs with that component, not in a central file.

## This finishes a ratified decision rather than reversing one

`2026-07-22-structure-derived-split-patterns.md` — hardened by two HARD RULE #25
adversarial trio passes and an owner design review — already rules that the split
kernel is generic and structure supplies the candidate seam. Its stated mechanism
win is *"collapsing the 9 carousel DOM-parsers into content-conservation-gated
slot re-authors."*

Its §5 already concedes the other half:

> *"Some slots can't drive a generic walk: `state-chart`'s `transitions` and
> `detail` share the identical selector `ol > li > ul > li` (disambiguated only by
> a human note); `compare-code` has two positional singleton slots
> (`h3:nth-of-type(2) + pre`) and no collection slot. These ~14 sovereign builders
> are retained behind an allowlist."*

A generic walk cannot tell those apart; only the component can.

**But read that bullet's own label before leaning on it: "Slot insufficiency
(sovereign tail stays)", closing "— matching, not contradicting, the §9 plan."**
§5 is a stated LIMIT on a generic collapse, not a sanction for per-component
splitters as the default. §0 sizes the tail at ~14 sovereign builders against
~45 flow layouts — about a quarter of the catalog. So the ruling is not simply
what §5 already accepted; it widens an exception into an architecture, and that
widening is the thing to argue for on its merits rather than to inherit.

**What did and did not ship, stated exactly, because a first draft of this note
got it wrong.** §9's P1–P4 carry no completion glyph. That is NOT the same as
"nothing shipped": §9 also lists a **P-envelope** phase added by the second trio
pass, marked `☑ SHIPPED`, and nine rules across §8 carry `☑ BUILT`. Among them,
rule 5's oracle (`☑ BUILT, ahead of its P2 slot`) is `test/oracle/split-oracle.json`
plus `checkSplitOracle` in `build:check` today, and rule 6's **content-conservation
gate is BUILT and green** — `test/unit/core/carousel.test.js` § "no strategy drops
content", a word-multiset containment check over every strategy, with
`SANCTIONED_SPLIT_DROPS` empty. What did not ship is the generic slot-driven
RE-AUTHOR that would retire the hand-parsers: `lib/core/carousel.js` is still 966
lines and still hand-parses **nine** components (`feature-cover`, `cover-rows`,
`cover-sides`, `cover-decision`, `cover-code`, `redline-blocks`, `kanban-lanes`,
`roadmap-horizons`, `journey-stages`; `cover-cards` and `cover-paginate` delegate
to `split-envelope.js`). The note's own "9 carousel DOM-parsers" is a 2026-07
count of a table that now holds eleven strategies.

So what is new here is narrower than "finishing" suggests: **where a sovereign
builder lives** — `lib/core/carousel.js` today, the component's own folder from
here. That half is genuinely uncontradicted; the source note says sovereign
builders are retained and never says where they live.

## The dispatch already exists — do not build a second one

`2026-09-01-manifest-driven-chart-dispatch.md` shipped this shape for chart
rendering: a manifest `kernel` block, a build-time-frozen registry
(`tools/build-chart-registry.js`), the module found by convention at
`<name>.transform.js` with entrypoint `transformSection`. *"A chart is a
folder-drop and no central file names it."*

`lib/components/index.js:669` fences it deliberately —
`KERNEL_BUCKETS = ['chart']`, with the note that widening it *"is a Phase-2
decision … not a silent one."*

**A split kernel is NOT the ADR's `block` kind, and an earlier draft of this note
said it was.** The plugin ADR's five `kind`s are AUTHORING SURFACES — `block` is
"a fence ```name" producing an inline figure (mermaid, function-plot). An author
types nothing to invoke a split. So a split kernel is a new kind, and widening
`KERNEL_BUCKETS` for it is a contract change to argue for, not a free reuse.
Three costs the reuse carries: the generated registry resolves kernels relative
to `_chart-family/`; `figureClass` is chart-frame-specific; and the convention
entrypoint returns ONE rewritten section, while a split kernel must return N
pages plus its declared extras. The dispatch SHAPE (manifest block → generator →
frozen registry → convention path) is timing-agnostic and worth copying. The
bucket fence is not free to move.

## Where the line falls, and what fixes it there

The owner's earlier envelope ruling governs: refine the shared envelope, reuse
the component's own styling, one envelope for every component. Component-owned
pre-processors could drift into 61 different-looking splits, which is the thing
that ruling rejects. They do not, if the kernel's job stops at the seam:

| | decides | owner |
|---|---|---|
| **Seam** | what the members are, in what order, which material is cover, which is closing, and the extras that must ride along | the component |
| **Page** | cover / body / closing construction, role stamps, the k-of-N rail, page numbering, the relationship signal | the engine |

`split-compare` is the clean case. Its kernel says *"the title is cover, the two
options are members, the verdict is closing."* It says nothing about how a body
page looks.

**Extras are declared, not inferred, and §5 is why.** A pure seam interface drops
content: `readFeature` pulls `.watermark`, `.panel-eyebrow` and `.lede`;
`splitCoverSides` carries a `.below-note` verdict to a final slide. None of those
is a member, and a slot walk that returns only members loses all four. So a kernel
names the extras it must carry, and the **content-conservation gate is the
referee** — a builder migrates only once the emitted pages' text nodes are proved
a superset of the source section's. That gate already exists and is green
(`test/unit/core/carousel.test.js` § "no strategy drops content",
`SANCTIONED_SPLIT_DROPS` empty), so a component-owned kernel inherits it rather
than waiting on it. What it does not yet do is cover a kernel that lives outside
`lib/core/carousel.js`; extending its case table is the first thing any migration
owes.

## The exception is a measurement, not a name

The owner named mermaid as the exception. Mermaid is one member of a class:
**container-responsive viewBox figures**, which do not need a seam because they
scale. `lib/core/split-facts.js:46` already states it that way.

Scaling is only a valid exception while the result stays readable, so the test is
**container-responsive AND above the legibility floor**. Rendering all nine
`graphic`-treatment components at both split sizes:

| Component | portrait | square |
|---|---|---|
| `diagram` `funnel` `map` `piechart` `quadrant` `radar` `scene` | clean | clean |
| `word-cloud` | clean | 10.6px against a 10.8px floor |
| `state-chart` | **6.7px against a 13.5px floor** | **6.9–7.4px against 10.8px** |

Seven earn the exception outright. `word-cloud` misses at one size by 0.2px,
which is noise, and only in its `dense` and `focal` variants — the default is
clear. **`state-chart` renders its labels at roughly half the legible floor at
both sizes**, and the audit independently found it cutting its terminal state
`Expired` through its own box at portrait.

**Here the ruling REVERSES a shipped ruling of the same note, and this section's
title does not cover it.** §8 rule 8 — `☑ BUILT`, hardened by the second trio
pass — already measured exactly this, already published `state-chart` at
0.74 / 0.81% of slide height, and ruled the opposite remedy: *"below the floor →
the honest ring, never a silent shrink"*, and explicitly *"the slide is never
handed to the splitter — a figure has no seam."* The measurement offered above is
not new evidence; it is rule 8's own instrument (`probeFigureLegibility`)
reporting what rule 8 already recorded.

So there are two questions, and only the first is settled. **Settled:** the
exception is "container-responsive AND above the legibility floor", a measurement
rather than the word "mermaid". **Open, and the owner's to decide because it
overturns a built ruling:** what happens to a figure that fails the floor. Rule 8
says ring and never split. The alternative is to give it a seam — for
`state-chart`, one transition per page. Rule 8's reason for refusing was that a
figure has no seam; `state-chart` is the case where that is arguably false, since
its transitions are a real collection. Until that is decided, `state-chart` keeps
ringing and this note claims nothing more.

## What this costs the NEVER_SPLIT gate

`NEVER_SPLIT = ['anchor', 'graphic', 'asset', 'atomic']`
(`lib/core/split-facts.js:188`) fails the build when a component with one of those
treatments declares a split axis. It was added after `matrix-2x2` was shredded
into 2-of-4 quadrants, and that protection is real.

It does not survive this ruling unchanged, because the ruling enrolls members of
three of its four treatments. What replaces it is the conservation gate plus the
floor test: a component may split when its kernel proves it loses nothing, and a
figure may decline to split when it proves it stays legible. Both are
measurements. `NEVER_SPLIT`'s blocklist was an opinion, and the audit is the
evidence that the opinion was placed on the wrong question — every treatment in
that table was decided by asking whether splitting would destroy the component's
meaning, and none by asking whether the slide survives a portrait box. `wifi` is
`atomic` because a password has no second page, which is true and says nothing
about whether the one page it has fits.

## Order of work

Owner's call, taken 2026-09-06: **three components first, the generic mechanism
after.** Enroll `pricing` (a plain top-level `<ul>`, the cheap case),
`split-compare` (overturns a recorded refusal — see below) and `code` (the hard
case), then generalize with three real migrations to test the interface against
rather than hypothetical ones. The cost accepted is that the interface may shift
once and the three get revised.

**`pricing` shipped first and it needed NO component-owned kernel, which is a
result worth reading rather than an exception to explain away.** Its enrollment is
a manifest `capacity` + `split` block naming the existing central
`cover-paginate` strategy, plus a treatment move to `read-across`. No new module,
no dispatch change, no CSS: the lone-member fill in `base.modifiers.css` was
already there, written for the enrollment that was backed out on 2026-09-01. So
the generic mechanism reached one of the three on its own. That is evidence for
§5's framing — a residual tail needs its own builder, the rest does not — and
against reading "the splitter belongs with the component" as the default for all
61. Take the same measurement on `split-compare` and `code` before generalizing:
if `code` is the only one that truly needs its own module, the architecture is a
tail, not a rule.

**`split-compare`'s recorded refusal no longer holds.** `split-facts.js:232`
declines it because *"N is 2 by contract, the `.verdict` is a sibling of
`.options` so a slice repeats it on every page, and one `.option` in a `1fr 1fr`
grid leaves half the slide empty at landscape."* Two of three reasons dissolve
under the ruled run: the verdict becomes the run's closing page rather than
repeating (`closingPage`, `split-envelope.js:1170`), and landscape never splits
(`lattice-emulator.js:2026`). What survives is `N is 2` — a short run, not a
broken one.

**`code` needs a line-splitter, and one fact will break a naive one.** Highlight
spans cross line boundaries: a block comment renders as a single
`<span class="hljs-comment">` covering three source lines (measured). Cutting on a
newline leaves one page with an unclosed tag and the next with an orphan close. The
splitter must carry an open-span stack — close every open span at the break, reopen
at the top of the next page. Line numbering rides the same stack.

## What this note does not settle

- **The interface's exact shape.** "Seam plus declared extras" is the contract;
  the field names, and whether extras are selectors or named slots, are settled by
  building the first three.
- **Whether a below-floor figure rings or splits.** The owner's call, because it
  overturns §8 rule 8, which is built and says a figure is never handed to the
  splitter. `state-chart` is the case that forces it. Until then it rings.
- **Whether "the splitter lives with the component" is the rule or the tail.**
  `pricing` enrolled with no component-owned kernel at all. If `split-compare` and
  `code` split the same way, this note describes a residual tail (§5's ~14) rather
  than an architecture, and its title overstates it. That is decided by building
  the other two, not by argument.
- **The other eight of the eleven.** `wifi` and `contact` have a ruled direction
  (credentials → code) and two open questions recorded in the audit;
  `obligation-matrix`, `gantt`, `logo-wall` and `matrix-grid` have none yet.
- **The four silent clips.** `logo-wall.square`, `matrix-grid.square`,
  `state-chart.square` and `obligation-matrix` at both sizes lose content with no
  warning, because the overflow probe measures a box that exceeds its frame, not
  content sitting past the page edge. That is a gap in the safety net every
  "keep whole, ring on overflow" decision was made on the strength of, and it is
  worth closing whether or not those four ever get a seam.
