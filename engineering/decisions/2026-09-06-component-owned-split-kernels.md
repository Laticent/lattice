---
status: proposed
summary: >
  Eleven components lose content at a split size with no split available to save them, and the
  reason is not a broken splitter — none of the eleven is enrolled. Eight are barred by the
  NEVER_SPLIT treatment gate, three were classified splittable and never wired. The owner ruled
  that every component splits on structure except the container-responsive figures, and that the
  splitter that knows a component's seam belongs WITH that component. That is not a reversal of
  `2026-07-22-structure-derived-split-patterns.md` — it finishes it: that note's §5 already
  retains ~14 sovereign builders a generic slot walk provably cannot drive, and its P0-P4 phasing
  is entirely unbuilt. The one new thing is WHERE a sovereign builder lives: today
  `lib/core/carousel.js`, from here the component's own folder, dispatched through the shipped
  manifest-kernel machinery (`2026-09-01-manifest-driven-chart-dispatch.md`) rather than a second
  registry. The kernel/engine line is fixed by the owner's earlier envelope ruling: the component
  declares the SEAM and the extras it must carry, the engine builds every PAGE. And the exception
  is re-founded on a measurement rather than a name — "container-responsive AND above the type
  floor" excuses eight of the nine graphics, not nine: state-chart renders labels at ~half the
  legible floor at both split sizes and word-cloud misses by 0.2px at square.
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

A generic walk cannot tell those apart; only the component can. That is the
pre-processor the owner asked for, already argued for and already accepted.

**Its phasing P0–P4 are all unchecked.** None of the mechanism shipped, which is
why `lib/core/carousel.js` still hand-parses six components in one 966-line file.

So exactly one thing here is new: **where a sovereign builder lives.** Today
`lib/core/carousel.js`. From here, the component's own folder.

## The dispatch already exists — do not build a second one

`2026-09-01-manifest-driven-chart-dispatch.md` shipped this shape for chart
rendering: a manifest `kernel` block, a build-time-frozen registry
(`tools/build-chart-registry.js`), the module found by convention at
`<name>.transform.js` with entrypoint `transformSection`. *"A chart is a
folder-drop and no central file names it."*

`lib/components/index.js:669` fences it deliberately —
`KERNEL_BUCKETS = ['chart']`, with the note that widening it *"is a Phase-2
decision (the ADR's `block` kind), not a silent one."* A split kernel is that
second kind. It reuses this machinery; it does not get a registry of its own.

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
names the extras it must carry, and the **content-conservation gate** — §5's, still
unbuilt — is the referee: a builder migrates only once the emitted pages' text
nodes are proved a superset of the source section's.

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
which is noise. **`state-chart` renders its labels at roughly half the legible
floor at both sizes** — not a figure that scales, a figure that shrinks past
readability — and the audit independently found it cutting its terminal state
`Expired` through its own box at portrait. It needs a seam like everything else.

So the exception excuses **eight** components, not nine, and it does so on a
number anyone can re-measure rather than on the word "mermaid".

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

Owner's call, taken 2026-09-06: **three components first, the generic gate
after.** Enroll `pricing` (a plain top-level `<ul>`, the cheap case),
`split-compare` (overturns a recorded refusal — see below) and `code` (the hard
case) with component-owned kernels, then generalize with three real migrations to
test the gate against rather than hypothetical ones. The cost accepted is that the
interface may shift once and the three get revised.

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
- **The other eight of the eleven.** `wifi` and `contact` have a ruled direction
  (credentials → code) and two open questions recorded in the audit;
  `obligation-matrix`, `gantt`, `logo-wall` and `matrix-grid` have none yet.
  `state-chart` now has a reason but no seam.
- **The four silent clips.** `logo-wall.square`, `matrix-grid.square`,
  `state-chart.square` and `obligation-matrix` at both sizes lose content with no
  warning, because the overflow probe measures a box that exceeds its frame, not
  content sitting past the page edge. That is a gap in the safety net every
  "keep whole, ring on overflow" decision was made on the strength of, and it is
  worth closing whether or not those four ever get a seam.
