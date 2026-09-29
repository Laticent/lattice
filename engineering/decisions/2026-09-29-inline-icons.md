---
status: proposed
summary: >
  Icons join pills and sparks as a third thing an author writes in inline code, in Segno's record notation
  from day one: `^{database, c3}` on its own, `{S3, icon=bucket, c4}` inside a pill, and the same `icon=`
  parameter (plus an `icon-only` flag) on flowchart nodes, state-chart states and hub-spoke spokes. The set is
  a curated ~250 of Tabler (MIT), picked over Carbon and Lucide because it shares our own marks' 24-unit grid
  and line style; we draw its four architecture gaps ourselves. Cloud providers stay neutral: no vendor logos
  or service icons, only a role icon paired with the service name and a color, because the official AWS,
  Azure and GCP icons ship under vendor usage terms, not an open-source license, and are multicolored. Icons take the sparks' frame, look and
  corner axes and an `icon:` register. Build waits for Segno phase 2.
---

# Icons — drawn, themed, and written like sparks

**Date:** 2026-09-29 · **Status:** proposed. The owner settled the four forks in § "Decided"; the
three questions in § "Open questions" are small and wait for the build.
**Follows:** `2026-09-28-inline-sparks.md` (the model this copies),
`2026-09-28-segno-unified-inline-notation.md` (the notation this is written in)
**Related:** `2026-08-25-typed-glyphs.md` (HARD RULE #29: we draw the shape), open PR #2396 (hub-spoke)

## 1. What an icon is, in one example

```markdown
<!-- _class: flowchart -->

## Uploads reach the warehouse in under a minute.

- Web app `{icon=browser}` -> Gateway `{icon=gateway, c2}` -> Ingest `{icon=function, c3}`
- Ingest `{icon=function, c3}` -> Raw store `{icon=bucket, c4}` -> Warehouse `{icon=warehouse, c5}`

Each stage runs on managed services: `^{bucket, c4}` S3 for raw files, `^{warehouse, c5}` Snowflake for
the model.
```

The chart draws each node with its icon beside the node's text. The sentence underneath carries two
icons at the size of the words around them, in the same colors as the nodes they refer to, so the
reader can match the prose to the diagram without a legend.

An **icon** is a drawn, single-color shape from a curated set, which an author names in inline code.
It works like a spark: one kernel reads the span, both render paths draw from the kernel's fields, and
the deck's colors and finishes style it. It never arrives as a font glyph or an emoji, because
HARD RULE #29 already bars those for exactly this job.

## 2. Decided

| | decision | by |
|---|---|---|
| 1 | **Tabler, curated** is the base set (MIT). About 250 icons, no `brand-*` icons. We draw the four architecture concepts it lacks on its grid | owner, over Carbon, Lucide and Tabler with Carbon gap-fill, after the § 3 measurements |
| 2 | **Cloud-provider neutral.** No vendor logos and no per-service vendor icons. A cloud service is a role icon paired with the service's name and a color: `{S3, icon=bucket, c4}` | owner |
| 3 | **Written in Segno's notation, and icons are its first new user** after phase 2 | owner |
| 4 | **Design now, build on Segno.** This note lands first; the kernel and chart wiring land after Segno phase 2, so icons never need a codemod | owner |

## 3. Which icon set, measured

The owner asked for pros and cons, so the sets were measured, not described. Method: the
`@iconify-json/<set>` package for each (the upstream SVGs, repackaged), checked for icon count,
license, drawing style and grid, and matched by name against a list of 44 architecture concepts
(server, database, bucket, block and file storage, load balancer, API gateway, CDN, DNS, firewall,
VPC, subnet, router, queue, event bus, stream, cache, container, Kubernetes, serverless function,
scheduler, identity, keys, secrets, certificates, monitoring, logs, alerts, pipelines, repositories,
mobile, web, desktop, IoT, ML model, warehouse, ETL, search, email, payments, cloud, region, backup,
cluster). A name match is a first pass: the curation in § 9 still looks at every icon.

| | **Tabler** 3.48 (MIT) | **Carbon** 11.89 (Apache-2.0) | **Lucide** (ISC) |
|---|---|---|---|
| icons | 6,268 | 2,776 | 1,928 |
| concepts covered | 40 / 44 | **43 / 44** | 36 / 44 |
| architecture icons with no vendor name | 92 | **149** | 41 |
| vendor-branded icons | 411 (`brand-*`) | 204 (`ibm-*`, Watson) | 0 |
| drawing style | **83% line drawings, 24 grid** | solid shapes, 32 grid | 100% line drawings, 24 grid |
| median icon size | 251 B | — | — |
| missing | CDN/edge, DNS, subnet, stream | cache | API gateway, CDN, DNS, subnet, event bus, stream, Kubernetes, IoT |

The deciding row is the drawing style. Lattice already draws 21 shapes as mask tokens
(`--shape-*`, `--mark-*` in `lib/base/base.tokens.css`). All 21 sit on a 24-unit grid, and 18 of
them are line drawings. Tabler matches that, so an icon next to a spark or a status mark reads as
one family, and its line weight can become a token that follows the finish (§ 6). Carbon covers the
most architecture, but its solid 32-grid shapes are a different idiom from our marks, and a solid
shape has no line weight to theme. Lucide is the docs site's UI set (`lucide-react`), but it lacks
8 of the 44, API gateway and Kubernetes among them, which is too thin for architecture slides.

Tabler's four gaps (CDN/edge, DNS, subnet, stream) are ours to draw on its grid: 24 units, 2-unit
round-capped strokes. MIT allows the mix, and it keeps one drawing idiom where a Carbon gap-fill
would put solid shapes among line ones.

## 4. Cloud providers: neutral, by license and by choice

The official provider icons cannot meet the brief. AWS's own icon page
(`aws.amazon.com/architecture/icons`, read 2026-09-29) grants customers and partners permission to
use the toolkits "to create architecture diagrams" and in presentations. That is a usage grant under
AWS's terms, not an open-source license, and it says nothing that permits redrawing or recoloring.
Third-party sites describe the set as CC-BY-ND 2.0 (no derivatives), but AWS's page does not say so,
and this note does not rely on it. Azure and GCP publish theirs under their own vendor terms, also
not an open-source license. The icons are multicolored besides, so they would break a palette-blind
layout whatever the license said.

So a cloud service is **a role icon, the service's name, and a color**:

```markdown
- `{S3, icon=bucket, c4}` raw uploads, 30-day lifecycle
- `{Lambda, icon=function, c3}` one per upload
- `{Snowflake, icon=warehouse, c5}` the reporting model
```

The reader learns the provider from the name, which the author writes anyway, and the color does the
grouping: one color per provider, or per tier, is the author's call. That also makes a multi-cloud
slide read evenly, because no vendor's house colors outshout the others.

The set therefore has no `aws`, `lambda` or `s3` icon. `lint:deck` coaches an author who writes one:
an unknown icon name that matches a common service name gets a warning naming the role icon
(`icon=s3` → "use `icon=bucket` and put S3 in the label"). The table of service names lives beside
the registry (§ 9), not in `lint-core.js` itself (HARD RULE #7 keeps the rule there; the data is a
table it reads).

## 5. The notation

Icons are written in Segno's notation (`2026-09-28-segno-unified-inline-notation.md`), with no
older spelling first.

### 5.1 On its own: `^{…}`

```
`^{database}`                 the default look: framed, pigment, square; size md; color c1
`^{database, c3, lg}`         categorical slot 3, large
`^{bucket, c4, bare}`         no frame, ink only
`^{shield, etching, rounded}` the line-led look, soft corners
`^{server, label="Primary DB host"}`   an accessible name different from the icon's
`\^{database}`                escaped: shows as written
```

The first positional item is the **icon name** (an enum over the registry, with declared aliases,
§ 9). Every other parameter binds by type, as Segno binds any record: `c1`–`c12` is the color
(`indexed('c', { max: 12 })`), `sm` `md` `lg` the size, and the frame, look and corner words the
three style axes (§ 6). `label=` is named-only text.

**The opener is `^{`.** Measured on 2026-09-29: of every inline-code span in every tracked `*.md`
file, none opens with `^{`. The spans that open with `^` are regex anchors (`` `^---` ``,
`` `^\s*…` ``), and none continues with `{`. `^` also reads as "a mark placed here", the way `~`
reads as "trend" for sparks.

**What this asks of Segno.** Segno's grammar has no prefixed record today. Sparks' `~{…}` landed
the same day Segno did and is not yet in its table, so phase 2 needs one production, a single kind
character before a record (`~` spark, `^` icon), for sparks either way. Icons use it; they do not
create it. If phase 2 rejects the production, icons still have a full form without it:
`{icon=database}` is a pill with an icon and no label, and draws the same shape. That fallback is
valid Segno under decision 3 as written.

### 5.2 Inside a pill: `icon=`

```markdown
`{S3, icon=bucket, c4}`            the icon leads the label, inside the pill, in the pill's color
`{Primary, icon=database, tag}`    any pill shape
`{icon=database}`                  an icon-only pill (the fallback in § 5.1)
```

`icon` is a named-only parameter on the pill schema: a pill's primary is text, and a bare word
like `database` must stay a label. Segno's `named(...)` does exactly that.

### 5.3 In charts: `icon=` and `icon-only`

Every chart whose items end in a record takes the same two parameters:

| chart | today (after phase 2) | with an icon, beside the text | the icon instead of the text |
|---|---|---|---|
| flowchart | ``API `{#api, diamond, c2}` `` | ``API `{#api, diamond, c2, icon=gateway}` `` | ``API `{#api, c2, icon=gateway, icon-only}` `` |
| state-chart | ``2. Submitted `on-track` `` | ``2. Submitted `{on-track, icon=send}` `` | ``2. Submitted `{on-track, icon=send, icon-only}` `` |
| hub-spoke (#2396) | a spoke's record | `icon=` on the hub or a spoke | `icon-only` on the hub or a spoke |

**`icon-only` keeps the text.** The node's text becomes the icon's accessible name and its hover
title, so a diagram of icons still reads aloud in order, and exports still carry every word for
search. The linter refuses an `icon-only` node with no text, because that node would have no name.

Hub-spoke takes `icon=` whenever both it and phase 2 of this plan have landed; whichever lands
second wires it up (§ 10).

## 6. Styling: the sparks' axes, unchanged

An icon takes the same three style axes as a spark, with the same words and the same defaults, so a
deck that styles one family has learned the other:

| axis | values | default | what it does to an icon |
|---|---|---|---|
| **frame** | `framed` · `bare` | `framed` | a square tile behind the icon, or ink only |
| **look** | `pigment` · `etching` · `tone` | `pigment` | pigment: the tile takes the hue and the lines knock out; etching: a clear tile, hued lines, a thinner stroke; tone: one hue stepped by value |
| **corners** | `square` · `rounded` | `square` | the tile's corners |
| **size** | `sm` · `md` · `lg` | `md` | sized to the text beside it, as sparks are |
| **color** | `c1`–`c12` | `c1` | the categorical slot, as pills and sparks use |

Three tiers, most specific wins, exactly as `lib/core/resolve-spark.js` resolves sparks: the icon's
own words → the slide's class (`_class: icon-bare`) → the deck's register (`icon: bare etching`) →
the default. A slide's word evicts the deck's word on that axis only.

**The register is separate from `spark:`.** A deck may want framed sparks in a table and bare icons in
its prose. The axes are the same, so the resolver generalizes: `resolve-spark.js` becomes one
factory keyed by a prefix, with `spark` and `icon` as its two users, rather than a second copy
(HARD RULE #1).

**Line weight is a token.** Tabler draws at a 2-unit stroke on a 24-unit grid. The kernel emits the
SVG with `stroke="currentColor"` and the stroke width from `--icon-stroke`, which each look sets:
`pigment` and `tone` keep 2, `etching` thins it. Color never appears as a literal (HARD RULE #3);
the element's `color` comes from the slot's token.

**Inside a chart, the chart decides the frame.** A flowchart node is already a box, so an icon in a
node draws bare in the node's color, whatever the register says; the register's `look` still
applies. The same holds for an icon inside a pill.

## 7. Rendering

**Inline SVG built from a generated registry, not one mask token per icon.** Our 21 shapes are
CSS mask tokens (`--shape-spark-open` is a data-URI SVG in `base.tokens.css`). That works for 21;
for 250 it would put every icon in every deck's stylesheet whether it uses them or not. Instead:

- `tools/build-icons.js` reads the curation list (§ 9) and the pinned `@tabler/icons` dev dependency,
  and writes `lib/icons/icons.generated.js`: name → path data. Our own four icons come from
  `lib/icons/own/*.svg`. The generated file is committed like other kernel data, and
  `build:check` catches a stale one.
- `lib/core/inline-icons.js` is the kernel, shaped like `inline-sparks.js`: pure, no DOM, no fs.
  `resolve()` returns fields (name, paths, color, size, axes, accessible name), never markup.
- The markdown-it path builds an `<svg>` string from the fields. The runtime builds real nodes with
  `createElementNS`, as `sparkElement` does, because assigning markup inside an already-sanitized
  preview frame is the post-sanitize injection HARD RULE #22 bars. The new runtime sink goes on
  `SANCTIONED_RUNTIME_MARKUP_SINKS` with its justification, as #22 requires.
- **Size.** Tabler's median icon is 251 bytes of SVG body, so a 250-icon registry is on the order of
  70 KB before compression. It ships in the runtime bundle (the Studio needs every icon for
  autocomplete), while a static export carries only the icons the deck uses. The build phase
  measures the real bundle delta and the gzip cost, and states both in its PR.

**Exports.** An inline SVG with `currentColor` renders in the PDF and HTML exports as sparks do.
The PPTX path must be checked, not assumed. Because the build adds a new element to what the
exports carry, the build PR goes through the export sign-off in the QUALITY BAR: a demo deck
rendered in dark and light, sent for the owner's review.

## 8. Accessibility

- **Beside text**, an icon is decorative (`aria-hidden="true"`): the text already says it, and a
  screen reader that reads "database, Database" helps nobody.
- **On its own or `icon-only`**, an icon is `role="img"` with a name: the `label=` if given, else
  the node's text, else the icon's name.
- **Color never carries meaning alone.** The shape and the text do; the color groups. The a11y
  finish's texture channel (`engineering/textures.md`) applies to an icon's tile as it does to a
  spark's.

## 9. The curated set

- **About 250 icons** (the owner accepted "about 250" with the Tabler choice), in role categories:
  compute, storage, data, network, security, integration, observability, delivery, clients, people,
  business. The list lives in `lib/icons/curation.json`: our name, the Tabler source name, the
  category, and aliases.
- **Our names, not Tabler's.** An author writes `icon=bucket`, not `icon=bucket-droplet`. Our name is
  the stable API; the source can change under it without a deck noticing.
- **Aliases are Segno aliases** (`db` → `database`, `lb` → `load-balancer`, `fn` → `function`), so an
  ambiguous alias does not build, and the per-deck one-spelling rule (Segno decision 7) applies.
- **Service names are not aliases.** `s3` is not an alias for `bucket`: that would bring a vendor
  vocabulary in by the back door. It is the lint coaching in § 4.
- **License.** Tabler's MIT notice ships in `lib/icons/LICENSE-tabler.md` and in the third-party
  notices. Our own four icons carry the repository's license.

## 10. Plan

| phase | what lands | depends on |
|---|---|---|
| 0 | This note | — |
| 1 | The registry and its build step, the curation list, our four icons, the kernel, `^{…}` and the pill's `icon=`, the `icon:` register and `icon-*` classes (the resolver made a shared factory), lint coaching, component docs, a demo deck `examples/inline-icons.md` with its PDF (HARD RULE #9), the export sign-off, and a `changelog.d/` fragment | Segno phase 2 |
| 2 | `icon=` and `icon-only` on flowchart and state-chart, and on hub-spoke once #2396 lands | phase 1 |
| 3 | The Studio: autocomplete from the registry, and an icon picker | phase 1 |

Phase 1 touches `lib/core`, both render paths and the exports, so it gets maker-checker with one
independent checker (HARD RULE #25). It is not novel in the way Segno phase 2 is: it copies the
sparks' shape, so the adversarial trio is not required.

## 11. Open questions

Each has a recommendation; none blocks this note.

1. **Where an icon sits in a chart node: before the text or above it.** Recommendation: before it in
   `lr` flowcharts and state charts, where nodes are short and wide, and above it in `tb` and in
   hub-spoke, where nodes are closer to square. The layout picks; the author does not.
2. **Whether an icon's default frame should be `bare`** rather than the sparks' `framed`. An icon
   inside a sentence may read better as ink. Recommendation: keep `framed`, so the one rule "icons
   and sparks default the same" holds, and let `icon: bare` handle decks that want ink. Phase 1's
   demo deck shows both, so the call is made on renders.
3. **Service-name coaching coverage.** How many service names § 4's lint table starts with.
   Recommendation: the three largest providers' 20 most-used compute, storage, data and network
   services each, about 60 rows, grown when an author trips on a missing one.
