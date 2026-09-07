<!-- Design-competition candidate (colour round), 2026-09-07.
     Track 4 — accessibility-colourist.  Judge score: 7.5/10.
     Title: Pigment · Ledger · Emblem — three carriers of identity
     A PROPOSAL. The winner is track 3; the ranking and the grafts to
     fold into it are in ../judgement-colour.md. Brief: ../colour-brief.md. -->

**Track 4 — the accessibility-colourist.** Colour carries context for the great majority of readers. It does not get dulled for everyone to serve a few; it gets a *substitution* where it cannot be received. The three finishes below are vivid on the brand themes, and each one names exactly what carries meaning when hue is gone.

---

# The one idea: a finish names the CARRIER of identity

The failed four-finish attempt varied furniture opacity and corner radius — things nobody reads. The correction is to vary the thing every reader reads first: **which surface of a chart tells you which category you are looking at.**

There are three such surfaces on every one of the 21 members, and only three:

- the **FIELD** — the mark's interior,
- the **EDGE** — its boundary, and the type that names it,
- the **COMPANION** — a second, non-chromatic identity carried alongside the hue.

Three finishes, one carrier each:

| `charts:` | The carrier | The look | For |
|---|---|---|---|
| **`pigment`** | the FIELD | solid pigment blocks, hairline edges, black numbers | the projected deck. Colour is dense and confined to the plot; it reads from the back of the room. |
| **`ledger`** | the EDGE and the TYPE | pale fields, heavy saturated boundaries, category labels and values set in their own hue | the printed board pack and the chart among prose. Colour is **thin and everywhere** rather than dense and confined. |
| **`emblem`** | the FIELD **plus a drawn per-category mark** | solid pigment, a small drawn emblem on each group's mark and in its key, on the figure's own ground | the chart that leaves the deck — exported, forwarded, photocopied, read on an unknown surface or by a reader with no colour. |

This is the brief's own sentence made mechanical: colour is *never removed, only relocated, re-ranked, or given a companion channel.* `ledger` **relocates** it. `pigment` **ranks** it into the field. `emblem` **gives it a companion.** The three verbs are the three finishes.

**And this is why the design is accessible without being dulled.** The carrier is a *geometric* fact, not a chromatic one. Convert any of the three to grayscale and delete every word: `pigment` is solid shapes, `ledger` is outlined shapes, `emblem` is solid shapes with a mark on each, on a ground. **The mechanism that makes the three finishes tellable apart is the same mechanism that makes them survive achromatopsia.** One design decision buys both.

**`ledger` already ships, on one member, and that is the strongest argument for it.** `piechart.styles.css:119-124` paints `fill: var(--chart-cat-N-fill); stroke: var(--chart-cat-N-ink)` — a quiet field with a saturated hue edge, which is `ledger`'s exact recipe. The finish is a generalisation of something the tree already does well, the way `bullet` is the register family's reference. It also means the pie is a **behaviour change under `pigment`**, not a free member: its wedge has to climb from 24 %/40 % to 82 %. That is booked in §7.

---

## 0 · Two layers, landed separately — the correctness layer is NOT the finish

An earlier cut of this design folded the grouping fixes and the ink generalisation into `pigment` and then called `pigment` a no-op default. Both cannot be true. `resolve-corners.js:33` states the property that makes the register family safe — *"square is the default … It is the only value that changes nothing"* — and a `pigment` that re-groups the funnel, re-points timeline-list's dots, moves matrix-grid's colour and colours every name in 21 members changes all 48 chart decks. `finishes.spec.js` got this right and held correctness constant across its four presets.

So the work is **two landings, in order**:

- **Layer A — correctness, no register.** §3's three grouping fixes, the settled dome deaths on `piechart` and `quadrant`, the `--chart-cat-N-ink`-for-every-name rule (I2), and the 6→8 cycle widening (§5). This ships on its own branch, restyles the chart decks, and is what the export sign-off gate is really about.
- **Layer B — the `charts:` register.** Three finishes over the corrected baseline. **`pigment` is then genuinely the no-op**: its values are Layer A's own defaults, so a deck naming no finish renders exactly as Layer A left it.

Everything below describes the finished state; where a statement belongs to Layer A it says so.

---

## 1 · Where colour reaches, per finish

Seven surfaces, ordered outward from the datum. Every entry is an existing token or an existing class.

| Surface | Concretely | `pigment` | `ledger` | `emblem` |
|---|---|---|---|---|
| **FIELD** (non-bearing marks) | `.wedge`, `.funnel-band`, `.bar-mark`, `.sbar-seg`, `.line-area` | **full** — 82 % into `--chart-cat-base` | **quiet** — 24 % light / 40 % dark, i.e. exactly `--chart-cat-N-fill` | **full** — 82 % |
| **FIELD** (text-bearing marks) | kanban card, gantt bar, state node, progress row, timeline item | **pinned** at the canonical wash (20→38 % light / 48→64 % dark) — see I3/I4 | **pinned**, identical | **pinned**, identical |
| **EDGE** | mark stroke, card `border-left` accent, key-swatch border | hairline, slot ink | **heavy — 2× hairline, slot ink.** The carrier. | hairline, slot ink |
| **ACCENT WIDTH** (bearing marks only) | `--chart-fill-accent` | `clamp(4px, .31cqi, 7px)` — today's value | **`--chart-accent-lg`, `clamp(6px, .46cqi, 9px)`** — the sanctioned bookend | today's value |
| **NAME** | `.cart-series`, `.sbar-name`, `.chart-key-label`, funnel stage name, direct labels | **slot ink** | **slot ink** | **slot ink** |
| **CATEGORY LABEL** | `.cart-cat` — the axis-side name | document ink | **slot ink** | document ink |
| **VALUE** | `.cart-value`, funnel value, printed % | document ink | **slot ink** | document ink |
| **EMBLEM** | a drawn shape per group, on the mark and in the key | — | — | **drawn, 8-wide** |
| **GROUND** | `--chart-frame-bg` / `--chart-frame-edge` | none | none | **`var(--bg-alt)` + a `--border` hairline** |
| **CHROME** | `.cart-grid`, `.cart-zero`, `.cart-axis`, `.cart-tick`, `.cart-axis-title` | one neutral ladder, identical in all three | | |

**NAME is coloured in all three, and that is deliberate.** The brief's second stated error was a chrome ladder that resolved labels toward grey — which would have taken colour off `stacked-bar`'s series names and `line`'s direct labels, both already correct. So *a name is painted from the slot of the thing it names* is **correctness, not finish** (Layer A): a preset may change how a chart looks, never whether it can be read, and a key whose entry is a different colour from its mark is a key that does not name anything.

*Correction to the brief's premise, re-derived this session.* `grep -rln 'chart-cat-[0-9]-ink' lib/components/chart/` returns **14 files**, not three — bar, bullet, kanban, line, matrix-grid, piechart, progress, quadrant, scatter, stacked-bar, timeline-list, word-cloud (both files), plus the family sheet. Most of those paint a **mark** (a wedge stroke, a dot fill, a row token), not a **name**. So the generalisation is narrower than "three got it right, eighteen ignored it": the token is widely consumed, and what is missing is the *naming* rule — every label, key entry and direct label takes its subject's slot ink.

**Reach, stated as the ladder the brief asked for:** `pigment` reaches four surfaces densely and stops at the plot edge. `ledger` reaches six surfaces thinly, all the way into the numbers and the axis names. `emblem` reaches seven, and carries a second channel so the reach does not depend on the reader receiving hue. Confined → thin and far → complete and self-carrying.

**Why `ledger` is colour-*forward*, not the grey one.** It has more coloured *surfaces* than `pigment` and less coloured *area*. Its edges sit at 100 % hue — more saturated than `pigment`'s fields — and its numbers and axis names are coloured, which `pigment`'s are not. What it refuses is the flooded block, not the pigment.

---

## 2 · How the three stay apart on a member with no gradient

**Name the mechanism: the finishes differ in GEOMETRY — where ink sits, not how it fades.** No finish is defined by a gradient, so nothing about them depends on a member having one. The test is the grayscale test above.

**`scatter`** (points, no gradient anywhere):

- `pigment` — solid dots in the slot hue; point labels and axis names in document ink.
- `ledger` — **ring dots**: a 24 % core with a 2×-weight saturated ring, each point's own label and the axis names in that slot's ink.
- `emblem` — the dot's **shape** is the emblem (circle / square / diamond / triangle / …), solid, on a `--bg-alt` ground with a hairline edge; the key repeats the shape.

**`funnel`** (bands, direct labels, values, no gradient):

- `pigment` — solid bands, black stage names and values.
- `ledger` — pale bands with a heavy saturated top rule; stage name **and value** in the stage's ink.
- `emblem` — solid bands, each carrying its emblem at the left cap, on a ground; key entries repeat the emblem.

Three charts nobody would confuse, on the two members the brief named as the hard case.

**Where the three are honestly thin, and the count is bigger than one member.** On the **eleven text-bearing members** the field is pinned by the contrast floor (I3), so `pigment` and `ledger` separate on the EDGE and the ACCENT WIDTH: a hairline `border-left` at `clamp(4px,.31cqi,7px)` becomes a doubled edge at `--chart-accent-lg`, `clamp(6px,.46cqi,9px)`, and the status word takes status ink. That is a real, visible difference — roughly a 50 % wider accent plus coloured type — but it is **smaller than the field flip the other ten members get**, and I will not call it equal. `word-cloud` is thinner still (§8). The honest claim is: **three finishes are unmistakable on ten members, clearly different on ten, and marginal on one.**

---

## 3 · The grouping rule, applied to all 21 *(Layer A)*

> A group shares one hue. A singular may own one.

| Member | The group(s) | Singulars? |
|---|---|---|
| `bar` | one — the series. Grouped: one per series. Signed: two, up / down | no |
| `stacked-bar` | one per part, held across every bar | no |
| `waterfall` | three, semantic: up / down / total | no |
| `funnel` | **one** — one population at five moments. See below. | no |
| `bullet` | one — the measure. The bands are BACKDROP reference, not data | no |
| `piechart` | slices are different things in one whole | **yes** |
| `map` | one — a sequential magnitude ramp, not a cycle | no |
| `radar` | one per series | no |
| `quadrant` zones | **not data** — reference regions, no categorical hue | — |
| `quadrant` dots | named entities | **yes** |
| `scatter` | one per series; a scatter of named entities is a set of singulars | **yes**, when named |
| `line` | one per series | no |
| `slope` | entities | **yes** |
| `gantt` | one per status | no |
| `kanban` | one per status / column | no |
| `progress` | one per status; a bare row is one group | no |
| `timeline-list` | one per **status** — see below | no |
| `state-chart` | one per status | no |
| `roadmap` | one per status | no |
| `matrix-grid` | **one** — the marked path through the grid. Rows are not groups | no |
| `journey` | one per mood / status; lanes are not groups | no |
| `word-cloud` | one per weight tier | no |

**Four members carry singulars: `piechart`, `quadrant` dots, `scatter` when its points are named, `slope`.** Those are the four where a hue per mark is correct rather than decorative.

**Three consequences the rule forces, and all three remove decoration rather than colour:**

1. **`funnel` is one group, not six.** Its stages are one population narrowing, not six things being compared; position, the stage name and the printed rate already distinguish them. Today it paints six hues at 82 %, and on onyx that measures **COLLAPSED — 0.118 between slots against a 0.15 floor** (`node tools/chart-mark-separation.js --theme onyx --type none`, run this session). One hue spent confidently removes a requirement the palette was failing rather than removing information. *This is the one grouping call I would put to the human, because a reasonable person reads a funnel's stages as a sequence that may be tinted; the fallback is to keep the cycle and accept that onyx's funnel is unseparated.*
2. **`timeline-list`'s dots are cycled by index.** `timeline-list.styles.css` re-points `--timeline-dot-ink` on `:nth-child(6n+1..6)`. Position in a list is not a group, so that hue names nothing. The dot takes its item's **status**; a statusless timeline is one group and one hue.
3. **`matrix-grid`'s colour moves off its rows** — the colour-brief's own example. Rows go to neutral chrome and the **marked path takes one categorical slot**, so a filled cell and an empty one differ by pigment and not only by their text. Today onyx measures matrix-grid **COLLAPSED at 0.018**; one group has nothing to separate from. (matrix-grid is HTML, so its no-colour substitution is the value step / mask arm of §6, not an SVG texture.)

---

## 4 · The four interactions, resolved as rules

**I1 · Occlusion × hue — *identity never rides a surface that composites.***
On a LAYERED member the hue is carried at full strength by the **stroke**; the fill is bounded alpha whose only job is to let you see what is beneath. The overlap region is then never asked to carry identity, so the "fourth colour nobody chose" carries none. Radar keeps its alpha (settled); the finishes vary radar only through stroke weight and emblem, never through fill alpha.

**And the rule has a measured second half — anchored on instruments that read true.** An earlier draft cited radar at "0.023 against a 0.15 floor". **That number is withdrawn**, per the settled grounding in `candidates/5-leverage-existing.md`: `chart-mark-separation` reads only `getComputedStyle(stop).stopColor` and never `stop-opacity`, so an alpha ramp — radar's entire mechanism — scores by construction rather than by measurement. The tool still prints radar today (SWAMPED, nearest 0.023); the reading is not usable and **radar's separation is UNMEASURED** until the tool composites `stop-opacity` against the resolved canvas. The rule stands on the readings that are trustworthy: **funnel 0.118 and matrix-grid 0.018 on onyx, both flat fills the tool reads correctly.**

So: **a member whose *measured* slot separation falls under 0.15 on the deck's own theme owes its non-colour channel there too.** The redundant channel stops being an accommodation and becomes a correctness channel that switches on wherever colour has run out. Onyx is where it first bites, and onyx is a boardroom theme.

**And here is what that rule actually does, walked in full rather than named on two members.** `node tools/chart-mark-separation.js --theme onyx --type none` fires on **seven**:

| Member | Onyx reading | Reading trustworthy? | Channel that switches on |
|---|---|---|---|
| `funnel` | COLLAPSED 0.118 | yes | moot after §3 — one group, nothing to separate |
| `matrix-grid` | COLLAPSED 0.018 | yes | moot after §3 — one group |
| `kanban` | COLLAPSED 0.000 | yes | **HTML, no texture path.** Value step + status word; emblem under `emblem` |
| `slope` | COLLAPSED 0.000 | yes | **stroke, no texture path.** Dash cycle + direct label (slope labels its lines) |
| `piechart` | SWAMPED 0.107, self-range 0.286 | yes | texture (SVG) — the acute case, §5 |
| `quadrant` | SWAMPED 0.107, self-range 0.286 | yes | dots are singulars, each directly labelled |
| `radar` | SWAMPED 0.023 | **no — alpha-blind** | unmeasured; no channel derived from it |

Two of the seven have no texture mechanism at all, and two more are resolved by the grouping fixes rather than by a channel. **What is left, honestly, is the pie: under `pigment` on onyx the rule hatches a pie on a brand theme.** That is a boardroom look decision, not a derivation, and it goes to the human alongside the funnel call in §8.

**I2 · Naming × ink — *a name takes the slot of the thing it names, and it sits on the canvas.***
Clause one generalises the naming rule to all 21 (Layer A), and makes a key swatch and its mark read the same token by construction.
Clause two is an accessibility hard floor with a number behind it: **`--chart-cat-N-ink` is solved to AA against `--bg` and `--bg-alt` — the slide surfaces — and against nothing else.** `quadrant.styles.css` records what happens when you put it on a categorical tint instead: **77 of 240 palette × mode × slot combinations below AA, worst 3.33:1** (concrete light, slot 5), which is why quadrant's corner labels darken 65 % toward `--text-heading` — "the largest hue share that clears AA in EVERY theme (worst case concrete light at 4.99:1)", gated by `check-viz-render.js`. **No finish paints a name onto a categorical surface.** `funnel.styles.css` already states the practice — *"Labels + values sit on the canvas, never on a band"* — and `ledger`, the finish that colours the most type, is the one that most depends on it.

**One known exception, named rather than inherited silently.** `word-cloud.styles.css:195-201` re-points `--chart-cat-1-ink … -5-ink` (and 6, 7 — **not 8**, an existing latent gap) to the RAW hue under `section.dark.word-cloud`, deliberately trading the contrast solve for vividness because the solved ink "reads as pastel against navy". `ledger`'s carrier is that token, so on a dark word-cloud `ledger` inherits an unsolved ink. **Decide at Layer A:** either re-solve the dark word-cloud inks, or word-cloud opts out of the naming generalisation and keeps its override. My recommendation is opt-out plus a comment, because word-cloud's marks *are* its names and the vividness call was made on purpose.

*The tier that would lift the on-tint restriction does not exist: `--cat-on-fill` / `--cat-on-mark` are the engine-wide neutral inks (black/white that flip), not "the hue as text on a tint". Adding a `--chart-cat-N-ink-on-fill` arm to `tools/derive-chart-cat-ink.js` is a real and principled extension — quadrant's own comment asks for it — and **none of the three finishes requires it.** I name it as an option, not a dependency.*

**I3 · Text-bearing × saturation — *a mark that carries text takes the quiet field; colour reaches it through the EDGE and the ACCENT WIDTH, and the text on it stays document ink.***
The distinction that matters: text sitting *on* a mark is **content** (a card's title, a state's name), not a **name**, so it never takes category ink — that would colour the sentence rather than the identity. This is R0 with its consequence spelled out. The eleven text-bearing members keep **exactly today's canonical wash in all three finishes** — `--chart-fill-top-l/-d: 20 % / 48 %`, `--chart-fill-bottom-l/-d: 38 % / 64 %` — because that wash is what their text contrast was tuned against. The finish varies them through `--chart-fill-edge`, `--chart-fill-accent` and the ACCENT WIDTH row instead. On `kanban`: hairline accent (`pigment`) → **`--chart-accent-lg` stripe with the status word in status ink** (`ledger`) → hairline accent plus a status emblem, on a plate (`emblem`).

**I4 · Substrate × weight — *a finish sets strength per SUBSTRATE, not one strength for everything.***
The tree already does this and never named it: `.line-path` strokes at **raw `--chart-cat-N-hue` (100 %)** while `.funnel-band` fills at **82 %** and `--chart-cat-N-fill` tints at **24 % / 40 %**. A 1px stroke needs roughly 18 more mix-points than a 200px area to read as equally coloured. Name it as scalars the finish sets — AREA, STROKE, POINT — and the "colourful in the tokens, grey on the slide" failure cannot happen through a finish.

**The scalar is SPLIT, and the split is what resolves I3 against I4.** An earlier draft defined BACKDROP as `calc(area / 3)` for every member. Under `ledger` that gives 8 % / 13 % — a third of the wash the eleven bearing members carry today — so their fill would nearly vanish and bullet's qualitative band would drop from 27 % to 8 %. Two rules, one derivation, and the contrast floor loses. So:

- **`--chart-strength-area-*`** — the NON-BEARING mark field. The finish varies it (82 % → 24 %/40 % → 82 %).
- **`--chart-fill-top/bottom-*`** — the BEARING mark wash. **The finish pins it**; only Layer A or a member may change it. This is the arm that protects the text-contrast floor.
- **`--chart-strength-backdrop-*`** — reference layers behind a mark (bullet's bands). Defined `calc(area / 3)` **and floored**: `max(8%, calc(area / 3))` light, `max(13%, calc(area / 3))` dark, with the floors set at today's `pigment`-derived values so the band never *drops* below what ships. Under `pigment` the floor is inert (82/3 = 27 %); under `ledger` it binds.

The derivation therefore protects **R1 ordering by construction** (backdrop ≤ area/3 whenever area is large) *and* the **contrast floor** (the floor binds when area is small), and it says which one it is protecting in each regime. `bullet` needs no exception, and the a11y note's deliberate choice — *"Its three layers are separated by VALUE, not hue … value is exactly what survives grayscale"* — survives all three finishes untouched.

---

## 5 · The a11y and print substitution — what carries meaning, per finish

**First, the fact that should govern this whole section, because it is stronger than people assume.** These surfaces do not *desaturate* our design. They **replace hue entirely**:

- **The four variant palettes — `a11y-deuteranopia`, `-protanopia`, `-tritanopia`, `-achromatopsia` — override no `--chart-cat*` token; `a11y-base.css` itself defines the ramp** (`--chart-cat1..8: #2e2e2e … #929292` at lines 174-181, and `--chart-cat1-ink..8-ink` at 189-196), and all four `@import` it. Deuteranopia, protanopia, tritanopia and achromatopsia therefore get the **same eight grays** for charts; only the status trio differs between them.
- **`section.print` remaps `--chart-catN` *and* `--chart-catN-ink` to `--print-chart-1..8`** (`#333333 … #686868`) in `base.modifiers.css`.

So on five surfaces there are eight grays and no hue at all, under every finish. A design whose three variants differed by saturation would be **one finish** there. Mine differ by geometry, so they remain three.

**Mode is *mostly* pinned, not entirely.** `a11y-base.css` forces `color-scheme: light` at `:root` and `:root:root`, but its own header records that title / closing / divider slides set `color-scheme: dark` **on the section**, "which the `:root` pin cannot reach" — which is why the eight inks are `light-dark()` pairs. **`ledger` is the finish this touches**, because it is the one that puts coloured type on the canvas: on an a11y divider slide the section flips dark and `ledger`'s names resolve the dark branch of the ink pair. That branch exists and is solved; it needs a render check on an a11y title slide in the demo deck, not a new mechanism.

Second: **the texture patterns destroy hue on purpose.** `latt-a11y-chart-tex-1..8` paint a *literal hex* rect (`CHART_FILLS = #2e2e2e … #929292` in `lib/core/accessibility-textures.js`) before overlaying geometry — literal, because resolving a token in page-level `<defs>` proved fragile on real iOS Safari and rendered pies all-black. **Texture and hue are therefore mutually exclusive in this family**, which is exactly right (the pattern is only ever applied where hue has already gone) and exactly why texture must not be sprayed onto brand themes as "extra safety".

**And texture is an SVG-only channel.** It is delivered as `fill: url(#latt-a11y-chart-tex-N)`; a pattern fragment is not a valid `background-image`, so it cannot reach an HTML `<td>`, card or row. `a11y-base.css` textures **zero** HTML chart members today. The cited precedent `--cat-N-texture` is likewise consumed only as an SVG `fill:` (`mermaid.css`). So the family has **two substitution arms, and they are not interchangeable**:

- **SVG members (14, plus the SVG half of the 2 hybrids)** — texture in the field, dash on the stroke.
- **HTML members (kanban, matrix-grid, progress, roadmap, timeline-list)** — a **value step** on the field plus, under `emblem`, the `--shape-*` mask the emblem already needs. `--chart-cat-N-paint` is the **SVG arm only**; the HTML arm is `--chart-cat-N-field` (a colour) plus an optional mask.

`matrix-grid` is the member that makes this load-bearing: §3 newly gives its marked path a categorical hue on an HTML `<td>`, so its no-colour channel is the value step, and the channel-coverage gate below must accept a value step as a satisfying answer or it has an unsatisfiable case on five members.

### What carries meaning, per finish

| | brand themes (cuoio, indaco, …) | onyx (value, no hue budget) | a11y palettes + print (no hue at all) |
|---|---|---|---|
| **`pigment`** | the FIELD's hue | the field's value step, **plus texture/dash wherever *measured* separation < 0.15 and a channel exists** (see I1's seven-member walk) | **texture in the field** (SVG) / **value step** (HTML) — the existing channels, widened 6 → 8 |
| **`ledger`** | the EDGE's hue + the NAME's ink | edge **weight + dash**, and the name | **dash on the edge + the name.** No texture. |
| **`emblem`** | the FIELD's hue + the EMBLEM | unchanged — the emblem is already there | **the emblem, unchanged. Zero substitution**, except where it does not fit (below). |

**The three finishes have three different accessibility costs, paid at three different times, and I will not pretend they are equal:**

- **`pigment` pays at render.** A texture swaps in and the hue is gone; the reader gets a hatched chart. Correct, already built, and the weakest of the three for a low-vision reader, because eight hatch patterns at small mark sizes are harder work than eight shapes or eight words.
- **`ledger` pays nothing**, because its carrier was never hue alone. Its edge is a stroke, so it takes **dash** (already 8-wide after the widening below) and **weight**; its name is a **word**, which is rung 2 on the reception ladder and beats texture, which is rung 5. **Suppressing texture under `ledger` is derived from the ladder, not chosen** — a texture flooding a 24 % field with a fixed deep gray would bury the pale field the finish exists to keep.
- **`emblem` pre-pays on every theme**, so nothing swaps at all *where the emblem fits*. That qualifier is real and §8 owns it.

**The guard that stops a finish removing the last channel** — and it is keyed on the *rendered instance*, not on a member name:

> **A finish may move the redundant channel; it may never remove the last one.** A member keeps its texture under every finish unless the finish gives it something higher on the ladder **that actually renders on that instance** — a fitting direct label (`ledger`) or a placed emblem (`emblem`).

`piechart` is the member this catches: no position, and at its documented eleven-slice ceiling no room for a direct label and no room for an 8px emblem inside a thin wedge. An earlier draft keyed this on a new `data-named="direct"` attribute. **That attribute is dropped.** It does not exist in `lib/`, `chart-language-census.js` distinguishes the key model by sniffing selectors on rendered output rather than by reading an attribute, both values can be pushed at once, and — decisively — *whether a direct label fits is per-instance*: a four-slice pie has room, an eleven-slice pie does not. No static per-member attribute can carry it.

**The guard keys on the transform's own emitted count instead.** Every categorical transform already knows how many marks it drew; it emits `data-cat-count` on the frame (this is a real cost, booked in §7 against the transforms, not hidden in "9 members change nothing"). The kernel's placement pass sets `data-emblem="placed"` or `"key-only"` per mark from the geometry it computed. The guard reads those: **key-only ⇒ keep the texture.** A four-slice pie gets emblems in its wedges and drops texture; an eleven-slice pie keeps texture and carries the emblem in the key alone.

**Screen readers get nothing new, deliberately.** The emblem is a mask or a `<path>` with no accessible name; the group's name is already text in the DOM. That follows the precedent in `a11y-base.css`, where the status glyphs are declared `content: "\2713\00a0" / ""` — an empty alt measured over the real accessibility tree via CDP `Accessibility.getFullAXTree` — because announcing a redundant *visual* channel turns "on-track" into "check mark on-track" for the one reader who gains nothing from the shape. **The emblem is drawn, never typed** (HARD RULE #29): the `--shape-*` mask idiom with `--shape-paint: center / contain no-repeat` for the HTML members, an eight-entry `<path>` cycle in the shared kernel for the SVG ones. A typed `◆` would fall back to a different font, a colour emoji or a `.notdef` box across the three surfaces this finish exists to survive.

**Width — the silent merge, fixed, and the false distinction it would otherwise create.** The palette is 8 (`--chart-cat1..8`); the engine emits **8** chart textures; the print band carries **8** grays. But `a11y-base.css` and `base.print-textures.css` wire **6** — `nth-of-type(6n+…)` and `data-cat="0..5"` — so slots 7 and 8 wear the textures of 1 and 2, and `data-series="6"`/`"7"` match no dash rule and render solid, identical to series 0.

**Widening only the redundant channel would be worse than the bug.** `piechart.styles.css:119-124` and `funnel.styles.css:42-47` cycle their *colour* at `nth-of-type(6n+1..6)`, and `piechart.gallery.md` stress-tests eleven slices. Colour and texture repeat together at 7 today, which merges a pair honestly; take texture to 8 and leave colour at 6 and slot 7 shares slot 1's colour while wearing texture 7 — two repeat periods manufacturing a distinction that is not in the data. **So all four cycles go to 8 in the same change (Layer A): the colour cycle on pie and funnel, the texture cycle, the dash cycle, and the emblem cycle from day one.**

And the gate measures the right thing: **the RENDERED repeat period** — what `nth-of-type` / `data-cat` actually cycles in the resolved stylesheet — not the number of declared tokens. A token-count assertion would read 8 == 8 and pass over exactly the mismatch above.

**Low vision, measured against the tokens that exist.** `ledger`'s edge is `calc(var(--chart-hairline) * 2)` — `--chart-hairline` is `clamp(1px, 0.078cqi, 2px)`, so the edge lands at 2–4px, well inside the family's existing bookend `--chart-accent-lg: clamp(6px, 0.46cqi, 9px)`, and resolution-stable by construction. `--chart-cat-N-ink` is solved to the 4.5:1 text floor (with the word-cloud exception named in I2), so a stroke painted in it clears the 3:1 non-text floor (WCAG 1.4.11) with margin on both canvases.

---

## 6 · The architecture — a finish is token declarations

**The seam already exists, and it is bigger than it looks. Eight of 21 members already take their mark fill from four family scalars:**

- `buildFillDefs` in `_chart-family/cartesian.js` mints a `<linearGradient>` per slot whose stops name `--chart-fill-top-l/-d` and `--chart-fill-bottom-l/-d` — used by **bar, line, stacked-bar, waterfall**;
- the canonical rectangular fill recipe reads the same four plus `--chart-fill-edge` / `--chart-fill-accent` — used by **gantt, progress, roadmap, state-chart**.

**`bullet` is NOT on that list, and the reason matters here.** `bullet.transform.js:26` records that `buildFillDefs` is *deliberately* not used because "its gradient stops do not survive the CLI's PDF export faithfully", and the measure is the one mark whose contrast has to hold in the exported artifact. Export fidelity is exactly what §7's sign-off gate is about, so bullet is booked as a **re-point** member, not a free one.

Those scalars are custom properties, and the gradient stops are inline `style` attributes, so a declaration on the frame inherits into them. **Setting `top == bottom` flattens a mark; setting both low quiets it.** That is one pair of numbers, in one place, reaching eight members with no member rule.

**The finish must therefore write those four names, not only its own.** An earlier draft declared `--chart-strength-area-*` and derived `--chart-cat-N-field` / `-paint`, which **no seam member reads** — as written, `ledger` and `emblem` changed nothing on the eight. There are two parallel seams and the block declares both:

```css
/* chart-family.css — `pigment` reproduces Layer A's defaults exactly, so a deck
   naming no finish renders as the corrected baseline left it. */
:is(section, figure).chart-frame {
  /* seam 1 — the eight canonical-fill members (BEARING wash: pinned by finish) */
  --chart-fill-top-l: 20%;    --chart-fill-top-d: 48%;
  --chart-fill-bottom-l: 38%; --chart-fill-bottom-d: 64%;
  --chart-fill-edge: 38%;
  --chart-fill-accent: clamp(4px, 0.31cqi, 7px);

  /* seam 2 — the non-bearing mark field */
  --chart-strength-area-l: 82%; --chart-strength-area-d: 82%;
  --chart-strength-backdrop-l: max(8%,  calc(var(--chart-strength-area-l) / 3));
  --chart-strength-backdrop-d: max(13%, calc(var(--chart-strength-area-d) / 3));
  --chart-strength-stroke: 100%;

  --chart-edge-w: var(--chart-hairline);
  --chart-emblem-size: 0;
  --chart-frame-bg: transparent;   --chart-frame-edge: transparent;
  --chart-cat-label-ink: var(--text-body);
  --chart-value-ink: var(--text-heading);

  /* the one derived per-slot recipe, ×8 — same shape as --chart-cat-N-fill */
  --chart-cat-1-field: light-dark(
    color-mix(in oklab, var(--chart-cat-1-hue) var(--chart-strength-area-l), var(--bg)),
    color-mix(in oklab, var(--chart-cat-1-hue) var(--chart-strength-area-d), black));
  --chart-cat-1-paint: var(--chart-tex-1, var(--chart-cat-1-field)); /* SVG fill: arm only */
  /* … slots 2–8 identical */
}

:is(section, figure).charts-ledger.chart-frame {
  --chart-strength-area-l: 24%;  --chart-strength-area-d: 40%;  /* == --chart-cat-N-fill */
  --chart-edge-w: calc(var(--chart-hairline) * 2);
  --chart-fill-edge: 100%;                       /* seam 1: the saturated boundary */
  --chart-fill-accent: var(--chart-accent-lg);   /* seam 1: the ACCENT WIDTH axis */
  --chart-cat-label-ink: var(--chart-slot-ink);
  --chart-value-ink:     var(--chart-slot-ink);
  /* --chart-fill-top/bottom-* deliberately NOT re-declared: the bearing wash is pinned (I3) */
}

:is(section, figure).charts-emblem.chart-frame {
  --chart-emblem-size: 0.9em;
  --chart-frame-bg: var(--bg-alt);   --chart-frame-edge: var(--border);
}
```

**Two shape corrections against the register family, both taken from `resolve-corners.js`.**

1. **Class tokens, not a data attribute.** All fourteen existing registers map front matter to a class the resolver stamps on every `<section>` (`corners: rounded → corners-rounded`); `data-corners` appears nowhere in `lib/`. The class token is precisely what makes the per-slide `_class:` override work. So `charts: ledger → charts-ledger`, and a slide can name `_class: charts-pigment` to opt out.
2. **`:is(section, figure)`, not `section`.** `chart-family.css` and 13 member stylesheets carry a parallel `figure.chart-frame` arm for the Studio and the docs component previews (verified: `:is(section.piechart, figure.chart-frame)`, `:is(section.slope, figure.chart-frame)`, …). A `section`-only override would render **only `pigment`** on both of those surfaces.

**Three layers that never collide.** The **theme** writes `--chart-tex-N`; the **family** derives `--chart-cat-N-paint` from it; the **finish** overrides `--chart-cat-N-paint` to suppress texture. Because the finish and the theme write to *different names*, the cascade race that `themes/a11y-base.css` documents at length — where a `:root` pin lost to a `section` declaration and a11y dark slides took onyx's dark chips at 1.55:1 — cannot recur here. It still gets pinned by `texture-polarity.test.js`'s method (resolve the real cascade, specificity first, source order as tie-break), because that file exists precisely because reasoning about it was wrong once.

**Two values in the block are not new numbers.** `ledger`'s 24 / 40 lands exactly on `--chart-cat-N-fill`, the tier measured at **0 of 224** combinations below AA. `pigment`'s 82 % is the level six members already paint. Both are already gated; the finish inherits their measurements rather than opening new contrast questions.

**Zero *finish* rules name a member.** The finish reaches marks through attributes the family already uses — `data-cat`, `data-series`, `data-s` — and through the two seam scalar sets. The two new emitted attributes (`data-cat-count`, `data-emblem`) are transform work, booked in §7.

**The a11y and print stylesheets get smaller — measured against what actually collapses.** `a11y-base.css` carries 33 `latt-a11y-chart-tex` references and 13 `stroke-dasharray` declarations; `base.print-textures.css` carries 33 and 10. The texture references are the SVG arm and they collapse to 8 `--chart-tex-N` declarations per file — **66 member-named texture rules → 16 token declarations**. The **dash cycles do not collapse**; they widen from 6 to 8 (23 declarations → ~31). And the **HTML members gain rules they do not have today**, because their value-step substitution does not exist yet. Net: a clear simplification on the texture arm, a small growth on the dash arm, and new HTML-arm rules. **The universal texture channel already works this way for Mermaid** (`--cat-N-texture`, `2026-07-16-universal-texture-channel.md`); this is the chart family adopting a pattern the tree proved, on the surface where that pattern applies.

**Print is correct with no extra work.** `section.print` remaps at the *source* tokens `--chart-catN` / `--chart-catN-ink`, so anything derived from them follows the print band by construction.

---

## 7 · Cost

**Members changed: 21 of 21**, and I will not shade that number. The work splits three ways, and the split is re-derived here rather than inherited:

| | Members | What changes |
|---|---|---|
| Free on the seam | **8** — bar, line, stacked-bar, waterfall, gantt, progress, roadmap, state-chart | nothing in the member's paint. They inherit all three finishes from the four `--chart-fill-*` scalars they already read. (Still owe `data-cat-count` — see below.) |
| Re-point only | **10** — bullet, journey, kanban, map, quadrant, radar, scatter, slope, word-cloud, and the SVG half of the hybrids | hand-mixed paint moves to the family tokens. **bullet is here, not above**, because it refuses `buildFillDefs` for a measured PDF-export reason. `grep -c 'color-mix(' ` over the 21 members' `.styles.css` + `.transform.js` returns **206** calls; the ones that move are those naming a chart categorical or state token. |
| Change behaviour | **3 + the pie** — funnel (one group), timeline-list (dots by status), matrix-grid (colour to the marked path), **piechart** (dome dies *and* its wedge climbs 24/40 → 82 under `pigment`; its colour cycle widens 6 → 8) | plus quadrant's dome. All of this is **Layer A**. |

**Every categorical transform gains one emitted attribute** (`data-cat-count`), and the emblem kernel adds `data-emblem`. That is real transform work on all 21 including the eight "free" ones — the free claim is about *paint*, not about *emitting nothing*.

**The one genuinely new mechanism is the emblem cycle** — 8 drawn shapes, in the existing `--shape-*` mask idiom for the 5 HTML + 2 hybrid members and as a `<path>` cycle in the shared kernel for the 14 SVG ones, plus the placement pass that decides `placed` vs `key-only`. It is candidate 5's proposed point-shape channel, generalised from points to groups, and paid for by one finish rather than charged to everyone.

**Decks re-rendered.** **48 of the 168 committed `examples/*.md`** carry at least one chart member class, plus `chart.gallery.{light,dark}.pdf` and the showcase galleries — **on the Layer A landing**, not on the register landing. HARD RULE #8 graduates the galleries in a separate post-review commit. HARD RULE #9 owes a demo deck — `examples/<slug>.md` + committed PDF, 6–10 slides — showing all three finishes on a `scatter` and a `funnel`, in both modes, plus one a11y palette **including an a11y divider slide** (the section-level `color-scheme: dark` case in §5). **Both landings change exported bytes, so CLAUDE.md's export sign-off gate applies to each**: dark and light renders for inspection before anything merges.

**Plumbing.** `charts:` is the fifteenth front-matter register, not a new mechanism: a resolver in the shape of `lib/core/resolve-corners.js` (119 lines) emitting a **class token**, a `.charts-*` token block in the family sheet, a Studio control, docs in `base.registers.docs.md`.

**Gates, inside checks that already run — no CI job or step added.**

- **Channel-coverage assertion**: for each of 3 finishes × 5 colour-free surfaces (4 a11y palettes + print), every member emitting `data-cat` must resolve at least one non-hue channel — texture ≠ field (SVG), **value step ≠ neighbour (HTML)**, dash ≠ none, emblem placed, or a fitting direct label. Shape of the existing `tools/check-ownership.js` checks, with a budget and a staleness arm.
- **Width assertion**: the **rendered repeat period** of colour, texture, dash and emblem must be equal on every member — measured from the resolved cascade, not from token counts.
- **Jank**: `taxonomy.md` says flatly that *"a new preset is a new row"* for `npm run check:jank`, and this design earns three rows. `emblem` adds a per-mark glyph and a figure ground with a hairline edge; `ledger` doubles every edge (1–2px → 2–4px) across 14 SVG members and widens the accent stripe to `--chart-accent-lg` on the bearing members. Both change a mark's measured extent. **Add the three finishes as jank rows and run `check:jank` and `check-chart-fit` before costing is final** — the edge doubling in particular is a measurable extent change family-wide, and it is the most likely source of an unbudgeted reflow.

**What a NEW chart pays: nothing, if it meets a five-item emitter contract.**

1. Paint marks from `var(--chart-cat-N-paint)` (SVG) or `var(--chart-cat-N-field)` (HTML) / `-ink`, never a hand mix.
2. Emit `data-cat` (or `data-series` / `data-s`) on every categorical mark **and** its key swatch, plus `data-cat-count` on the frame.
3. Use the shared `.cart-*` and `.chart-key-*` classes for chrome and key.
4. Carry a `figure.chart-frame` arm alongside its `section` arm.
5. Put every name on the canvas, never on a categorical surface.

A member that does those five inherits all three finishes, both substitution arms and the print band with zero new rules. A member that does not is caught by the census, which is why the contract is checkable rather than aspirational. **Under `emblem` there is one extra line of work**: the kernel places the emblem at the mark's leading cap from geometry the transform already computes; a member with unusual geometry overrides one coordinate, or the placement pass marks it `key-only`.

---

## 8 · What this gets wrong, and what is the human's call

- **`word-cloud` is the thinnest case, and it is a real limit, not a solved one.** Its marks *are* text, so it has no FIELD and no EDGE — two of the three carriers do not exist on it. `pigment` and `emblem` differ there by the ground and the key; `ledger` differs by a slot-ink rule under the top weight tier's words, which is a genuine editorial device but a smaller difference than most members get. It also carries the dark-mode ink override (I2), so it is the one member where `ledger`'s carrier is not AA-solved.
- **The bearing eleven are thinner than the rest**, and §2 says so with the count rather than conceding one member. `pigment` vs `ledger` there is an accent stripe going from `clamp(4px,.31cqi,7px)` to `clamp(6px,.46cqi,9px)` plus a coloured status word — visible, but not the field flip the other ten get.
- **`emblem` degrades to `plate` where the emblem cannot be placed**, and the pie is the acute case. On an eleven-slice wedge, on `word-cloud`'s glyph marks and on `map`'s small regions there is nowhere for an 8px drawn mark to sit, and "solid pigment plus a ground" is exactly the failed attempt's `plate`. The `data-emblem="key-only"` path keeps the texture in those cases, so nothing is *lost* — but be clear about what key-only buys a reader looking at the wedge itself: **nothing.** The key tells them which shape belongs to which name; the wedge still carries only its texture. **Before `emblem` ships, place the emblem on the eleven-slice pie gallery case and look at it.** If it cannot be placed on the pie, `emblem`'s claim of "zero substitution" is a claim about the members where it fits, and should be written that way.
- **`funnel` as one group is a grouping call I would put to you.** It is what the rule says and it fixes a measured onyx collapse (0.118 against a 0.15 floor); it is also the most visible single change to a shipped chart.
- **Textures on onyx is the second call.** I1's rule, run against the tool rather than against two examples, hatches the **pie** on a brand theme under `pigment`. kanban and slope have no texture path (they get a value step and a dash), and funnel and matrix-grid become moot after §3 — so the pie is the whole of it, and it is a boardroom look decision, not a derivation.
- **Radar is unmeasured.** The instrument is alpha-blind and the reading is withdrawn. Extending `chart-mark-separation` to composite `stop-opacity` against the resolved canvas is the fix, and it is not on this design's critical path — but until it lands, no rule here may cite a radar number.
- **The default.** `pigment` is nearest to what Layer A leaves, so defaulting there restyles nothing further; `ledger` is the better boardroom look and defaulting there ships the language to everyone at once. My recommendation is `pigment`, and it is your decision, not mine.
- **Where `emblem` lands.** It is the only finish with new machinery. It can ship second without stranding anything — `pigment` and `ledger` are complete without it — but if it does, `emblem` is unavailable until it lands rather than degrading to something else.
- **Not re-opened, as instructed:** the three registers and R0, the dead dome, radar's alpha, the palette.