---
status: in-progress
summary: >
  Icons join pills and sparks as a third thing an author writes in inline code, in Segno's record notation
  from day one: `^{database, c3}` on its own, `{S3, icon=bucket, c4}` inside a pill, and the same `icon=`
  parameter (plus an `icon-only` flag) on flowchart nodes, state-chart states and hub-spoke spokes. The set is
  a curated ~250 of Tabler (MIT), picked over Carbon and Lucide because it shares our own marks' 24-unit grid
  and line style; a rendered contact sheet found one real gap (stream) plus one
  lettering icon to replace (API gateway), and we draw those two ourselves. Cloud providers stay neutral: no vendor logos
  or service icons, only a role icon paired with the service name and a color, because the official AWS,
  Azure and GCP icons ship under vendor usage terms, not an open-source license, and are multicolored. Icons take the sparks' frame, look and
  corner axes and an `icon:` register. Icons ship as a PLUGIN (`lib/plugins/icons/`), so a deck that uses none
  loads none; that adds three contribution points to the plugin host (an inline-code kind, the first
  `services` callers, a plugin-declared register). Build waits for Segno phase 2.
---

# Icons — drawn, themed, and written like sparks

**Date:** 2026-09-29, revised 2026-10-06 · **Status:** in progress — phase 1 (1a and 1b) is built; § 12
says what landed and where it differs from the plan. The owner settled eight decisions in
§ "Decided"; decision 7's pick from the phase 1b renders is `framed` (owner, 2026-10-06).
**Follows:** `2026-09-28-inline-sparks.md` (the model this copies),
`2026-09-28-segno-unified-inline-notation.md` (the notation this is written in),
`2026-09-27-plugin-system.md` (the package and contribution model icons ship on, § 6a)
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
| 1 | **Tabler, curated** is the base set (MIT). About 250 icons, no `brand-*` icons. We draw the two concepts it cannot cover well (stream, API gateway) on its grid; see § 3, "Checked by eye" | owner, over Carbon, Lucide and Tabler with Carbon gap-fill, after the § 3 measurements |
| 2 | **Cloud-provider neutral.** No vendor logos and no per-service vendor icons. A cloud service is a role icon paired with the service's name and a color: `{S3, icon=bucket, c4}` | owner |
| 3 | **Written in Segno's notation, and icons are its first new user** after phase 2 | owner |
| 4 | **Design now, build on Segno.** This note lands first; the kernel and chart wiring land after Segno phase 2, so icons never need a codemod | owner |
| 5 | **Icons are a full plugin**, `lib/plugins/icons/`: the syntax, renderer, styles and the Tabler data all live in the package, and the plugin host gains the three contribution points icons need (§ 6a) | owner, 2026-10-04, over a core feature with icon packs as plugins, and core now with a move later |
| 6 | **Sparks and icons share Segno's record spelling.** `^{database, c3, lg}` and `~{12 14 17, bar, c3, lg}`: the sigil, then a record whose first item is the subject (a name, or the data) and whose other items are the shared option words. Sparks move in Segno phase 2's codemod, like every other grammar | owner, 2026-10-04, over colon style for both and records for icons only |
| 7 | **The default look is chosen on renders.** Phase 1b renders framed and bare side by side, in prose, tables, pills and charts, in dark and light, and the owner picks from the images. **Picked: `framed`**, from the light and dark renders of `examples/inline-icons.md` | owner, 2026-10-04; picked 2026-10-06 |
| 8 | **No short form.** `^{database}` already IS the unconfigured icon at its default look; a brace-less `^database` would only be a second spelling to learn and lint | owner, 2026-10-04 |

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

**Checked by eye (2026-10-04).** The name match above is a proxy for "has a usable icon", so every
concept was rendered: three Tabler candidates each, at 44 px, in a pigment tile and an etching tile
at 18 px, and bare at 16 px, in light and dark
([light](2026-09-29-inline-icons/tabler-contact-sheet-light.jpg),
[dark](2026-09-29-inline-icons/tabler-contact-sheet-dark.jpg)). The sheet merges Kubernetes into
"cluster / orchestration", so it shows 43 concepts. It changed two findings:

- **Three of the four name-match "gaps" are not gaps.** CDN/edge has `cloud-network`, DNS has
  `world-search` and `address-book`, and subnet has `topology-ring-3`; each reads at 16 px. **Stream
  is the one real gap**: every candidate (`arrow-wave-right-up`, `timeline`, `wave-sine`) reads as a
  squiggle or a chart line.
- **Icons drawn as letters are out.** `api`, `world-www` and `password` draw letters. The letters are
  not in the deck's typeface, and "www" turns to mush at 16 px. That leaves **API gateway** without a
  good Tabler icon (`door-enter` and `ai-gateway` do not say "gateway").

So we draw two icons, stream and API gateway, on Tabler's grid: 24 units, 2-unit round-capped
strokes. MIT allows the mix, and it keeps one drawing idiom where a Carbon gap-fill would put solid
shapes among line ones. The pigment knock-out and the thinner etching stroke both read at 18 px
on the sheet, in both modes.

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
`^{database}`                 no options: the default look (decision 7), size md, color c1
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

**Sparks take the same shape** (decision 6): `~{12 14 17, bar, c3, lg}`, where the first item is the
series or ratio a spark reads today (`12 14 17`, `72/80`, `72%`) as one scalar, and the rest are
the shared option words. Phase 2 defines that scalar as a `series` type in Segno.

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
its prose. The axes are the same, so the resolver generalizes: `resolve-spark.js` becomes the host's
one register factory keyed by a prefix, rather than a second copy (HARD RULE #1). Sparks stay
first-party and call it directly; the icons plugin DECLARES its register as data (the prefix and the
three axes' words, § 6a) and the host resolves it, because a plugin reaches the engine only through
`ctx` (plugin system § 4.6).

**Line weight is a token.** Tabler draws at a 2-unit stroke on a 24-unit grid. The kernel emits the
SVG with `stroke="currentColor"` and the stroke width from `--icon-stroke`, which each look sets:
`pigment` and `tone` keep 2, `etching` thins it. Color never appears as a literal (HARD RULE #3);
the element's `color` comes from the slot's token.

**Inside a chart, the chart decides the frame.** A flowchart node is already a box, so an icon in a
node draws bare in the node's color, whatever the register says; the register's `look` still
applies. The same holds for an icon inside a pill.

## 6a. Icons are a plugin

The plugin system (`2026-09-27-plugin-system.md` § 1) defines a plugin as "a capability that works on
any slide" and a component as a layout. Icons are the first kind: they render in a sentence, a table
cell, a pill or a chart node, on any slide. So they ship the way math and Mermaid do, as a package:

```
lib/plugins/icons/
  icons.manifest.json      what it contributes: the inline kind, the service, the register, styles,
                           diagnostics, payload; the tokens it paints with
  icons.render.js          resolve(record) → fields, and the two builders: an SVG string (engine
                           path) and DOM nodes (runtime path, HARD RULE #22)
  icons.data.generated.js  name → path data, generated from the curation list (§ 9)
  icons.curation.json      our name, the Tabler source, the category, aliases
  icons.own/               the two icons we draw, stream and API gateway (§ 3) — as built, these
                           sources live in lib/plugins/_icons-source/ (§ 12)
  icons.styles.css         the tile, the axes, `--icon-stroke`; tokens only
  icons.docs.md · icons.gallery.md · icons.fixtures.md
  LICENSE-tabler.md
```

**What already fits, unchanged:**

- **Charts depend on it the way components already do.** `diagram` requires `mermaid`; `math`
  requires `math` and optionally `function-plot`. Flowchart, state-chart and hub-spoke declare
  `"plugins": { "optional": ["icons"] }`. With the plugin off, a node shows its text and the render
  reports `plugin/component-needs-plugin`, as § 4.1 of the plugin note already specifies. A plugin
  never names a component (plugin note, decision 5).
- **Payload when used** (plugin note § 4.8). The icon data loads only for a deck that uses an icon, so
  the ~70 KB in § 7 stops being a cost every deck pays. The probe is the plugin's `detect(source)`: a
  `^{` or an `icon=` in an inline-code span, a superset of what the dispatcher accepts.
- **Lint coaching** reads the build's data-only vocabulary projection: icon names, aliases and the
  service-name table, the way `lint-core` already reads fence names (HARD RULE #7 holds).
- **Styles** go through `build-css.js`'s plugin slot and every CSS gate (#3, #4, #20, #26, #29).

**What the host gains — three contribution points.** The plugin note adds points "each in the phase
whose plugin needs it, as additive schema changes" (§ 4.3). Icons need three:

1. **`inline` — an inline-code kind.** Plugins can add prose syntax (`$…$`) and fences, but every
   inline-code form goes through `lib/core/inline-code-directives.js`, which names its three kinds
   (state marks, pills, sparks) by hand in 93 lines. It becomes a table. A row is a sigil (`^`), a
   Segno schema, and the `resolve` / html / element / diagnose functions the dispatcher already
   calls for sparks. The host keeps the dispatch order and the backslash escape, which is the part
   that must not drift between the two render paths (that file's header says why). Two rows
   claiming one sigil is a build error naming both, as for fence names. Marks, pills and sparks stay
   first-party rows, byte-identical. This is also the "kind character before a record" production
   § 5.1 asks Segno phase 2 for: Segno owns the parse, the table owns the meaning.
2. **`services` gets its first callers.** The point is in the plugin note's list with no consumer
   (§ 4.3, § 6). Icons offer `icons.draw(name, opts) → fields`. The callers are the pill (core, for
   `icon=`) and the chart kernels of components that declare the plugin. A caller never imports the
   plugin: it asks the host, and with the plugin off it gets `null` and renders the text alone.
3. **`registers` — a front-matter register declared as data.** Every register (`spark:`, `tag:`,
   `finish:`) is host code today. The icons manifest declares `{ "prefix": "icon", "axes": … }`, and
   the host's register factory (§ 6) turns it into the `icon:` key and the `icon-*` slide classes.
   Data, not code, so a later data-layer plugin could declare one too.

**Trust follows the channel** (plugin note § 4.10). `inline` and `services` carry code, so they are
in-tree only, like `syntax`. A `registers` declaration is data.

**Icon packs later.** Once the data layer ships (plugin note phase E), an installed data plugin could
add an icon PACK: path data only, validated on install (path, circle, rect, line and polyline
geometry; no markup, no `style`, no `href`, no color), filling an extension point the icons plugin
offers. An organization could then install its own one-color set, including vendor icons it licenses
itself, and Lattice still ships none (§ 4). Not in this plan; recorded so phase E knows the shape.

## 7. Rendering

**Inline SVG built from a generated registry, not one mask token per icon.** Our 21 shapes are
CSS mask tokens (`--shape-spark-open` is a data-URI SVG in `base.tokens.css`). That works for 21;
for 250 it would put every icon in every deck's stylesheet whether it uses them or not. Instead:

- A build step reads `icons.curation.json` (§ 9) and the pinned `@tabler/icons` dev dependency, and
  writes `lib/plugins/icons/icons.data.generated.js`: name → path data. Our own two icons come from
  `own/*.svg` (as built, `lib/plugins/_icons-source/own/`, § 12). The generated file is committed like the plugin registry, and `build:check`
  catches a stale one.
- `icons.render.js` is the kernel, shaped like `inline-sparks.js`: pure, no DOM, no fs.
  `resolve()` returns fields (name, paths, color, size, axes, accessible name), never markup.
- The markdown-it path builds an `<svg>` string from the fields. The runtime builds real nodes with
  `createElementNS`, as `sparkElement` does, because assigning markup inside an already-sanitized
  preview frame is the post-sanitize injection HARD RULE #22 bars. The new runtime sink goes on
  `SANCTIONED_RUNTIME_MARKUP_SINKS` with its justification, as #22 requires.
- **Size.** Tabler's median icon is 251 bytes of SVG body, so a 250-icon registry is on the order of
  70 KB before compression. As a plugin payload it loads only for a deck that uses an icon (§ 6a); a
  static export carries only the icons the deck uses. The Studio's autocomplete loads it on first
  use. The build phase measures the real delta and the gzip cost, and states both in its PR.

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
  business. The list lives in `lib/plugins/icons/icons.curation.json`: our name, the Tabler source name, the
  category, and aliases.
- **No lettering.** An icon that draws letters (`api`, `world-www`, `password`) is excluded: the
  letters are not in the deck's typeface and do not survive 16 px (§ 3, "Checked by eye").
- **Our names, not Tabler's.** An author writes `icon=bucket`, not `icon=bucket-droplet`. Our name is
  the stable API; the source can change under it without a deck noticing.
- **Aliases are Segno aliases** (`db` → `database`, `lb` → `load-balancer`, `fn` → `function`), so an
  ambiguous alias does not build, and the per-deck one-spelling rule (Segno decision 7) applies.
- **Service names are not aliases.** `s3` is not an alias for `bucket`: that would bring a vendor
  vocabulary in by the back door. It is the lint coaching in § 4.
- **License.** Tabler's MIT notice ships in `lib/plugins/icons/LICENSE-tabler.md` and in the third-party
  notices. Our own two icons carry the repository's license.

## 10. Plan

| phase | what lands | depends on |
|---|---|---|
| 0 | This note | — |
| 1a | The host: the inline-code dispatcher as a table with marks, pills and sparks as first-party rows (byte-identical), the `inline`, `services` and `registers` contribution points in the schema and resolver, the register factory, the vocabulary projection's new fields, and the plugin note's § 4.3 and § 5 updated | Segno phase 2 |
| 1b | The icons plugin: the package in § 6a, the data build step, our two icons, `^{…}` and the pill's `icon=`, the `icon:` register, lint coaching, docs, a demo deck `examples/inline-icons.md` with its PDF (HARD RULE #9), the export sign-off, and a `changelog.d/` fragment | 1a |
| 2 | `icon=` and `icon-only` on flowchart and state-chart (each declaring `optional: ["icons"]`), and on hub-spoke once #2396 lands | 1b |
| 3 | The Studio: autocomplete from the plugin's data, and an icon picker | 1b |

1a and 1b are one PR (HARD RULE #17: 1a has no user without 1b), one commit each.

**Verification.** 1a changes what every inline-code span on every deck goes through, and it grows
the plugin contract with three points no plugin has used, so it is high blast radius and novel: it
gets the adversarial trio (HARD RULE #25), aimed at the dispatcher's parity across both render paths
and at the escape rule. 1b copies the sparks' shape and gets maker-checker with one checker.

## 11. Open questions

Each has a recommendation; none blocks this note.

1. **Where an icon sits in a chart node: before the text or above it.** Recommendation: before it in
   `lr` flowcharts and state charts, where nodes are short and wide, and above it in `tb` and in
   hub-spoke, where nodes are closer to square. The layout picks; the author does not.
2. **The default frame** — settled as a method, not a value: decision 7. Phase 1b rendered `framed`
   and `bare` side by side and the owner picked `framed` (2026-10-06), the sparks' default too, so
   § 6's table stands as written.
3. **Service-name coaching coverage.** How many service names § 4's lint table starts with.
   Recommendation: the three largest providers' 20 most-used compute, storage, data and network
   services each, about 60 rows, grown when an author trips on a missing one.

## 12. Phase 1 as built (2026-10-05)

**1a, the host.** `lib/core/inline-code-directives.js` is a table: the host's own rows (marks,
pills, sparks) first, then each plugin's `contributes.inline` rows from
`lib/plugins/inline.generated.js`. The host keeps the order and the escape; every row gets the
deck's `off` set (the plugins it did not load, `md.latticePluginsOff` from the engine), so a
plugin's row and the services a first-party row calls leave the render when the deck does not load
the plugin. The runtime has no `off`, so the engine writes the answer into its markup, as #2525
does for fences: a span left literal only because a plugin is not loaded (`^{database}`, and the icon-only
pill `{icon=bucket}`, which has nothing to show without the drawing) is
`<code data-lattice-off="<plugin>">` (`offPlugin`), and the runtime's pass skips it (spec/LPM.md
§ 3.2.1). Marks, pills and sparks are byte-identical through the table over every inline-code
span in the tracked corpus (`test/unit/core/inline-code-table.test.js`).

The plugin host gained FOUR points, not three. The note's three (§ 6a):

- **`inline`** — `{ "icon": { "sigil": "^" } }` and `<name>.inline.js` exporting
  `{ resolve, html, element, diagnose }` per kind. The resolver refuses a sigil that is not a Segno
  tag, the spark's `~`, or another plugin's, and a kind with no `detect`.
- **`services`** — a list of names and `<name>.services.js`; callers use
  `lib/plugins/services.js` `service(plugin, name, off)` and get null with the plugin off.
- **`registers`** — `{ "icon": { "axes": { … } } }` as data. `lib/core/register-factory.js`
  builds `spark:` and every plugin register; `lib/core/axis-registers.js` is the list both render
  paths, the slide-class vocabulary and `lint:deck` walk. A slide's word evicts the deck's on
  that axis of that register only (`icon:frame` never touches `spark:frame`).

and a fourth the build needed, **`data`**: the drawings live in `<name>.data.generated.js`, which
no kernel requires. Kernels read it through `lib/plugins/plugin-data.js`; the engine registers a
lazy loader for it (`lib/plugins/data.generated.js`), so a Node render loads it on the first
icon and a deck with none never does (pinned in `test/unit/plugins/contribution-points.test.js`).
The playground bundle aliases `data.generated.js` to a stub, and the data ships as its own script,
`lattice-plugin-icons.js` (`tools/build-plugin-data-bundles.js`), which
`docs/src/lib/ensure-plugin-data.ts` fetches before the first render of a deck whose `detect`
matches — the KaTeX provider's shape. The package spine (`lib/packages/kinds.js`) gained the
roles `inline.js`, `services.js`, `data.generated.js` and `vocab.generated.js`; a plugin's
generator SOURCES live outside the package, in `lib/plugins/_icons-source/`.

**1b, the plugin.** `lib/plugins/icons/`: `icons.inline.js` is the kernel (§ 7), `icons.services.js`
hands the pill `known`, `whyUnknown`, `drawHtml` and `drawElement`, `icons.syntax.mjs` is the
`detect`, and `tools/build-icons-data.js` writes the vocabulary (names, aliases, the service-name
coaching table; small, so the linter carries it) and the drawings (validated to six shape elements
with geometry only) from `_icons-source/curation.json`, `coaching.json` and our two drawings in
`own/`. The set is 265 icons in the eleven § 9 categories. The pill's `icon=` is a named-only
parameter on the core pill slot; an icon-only pill names itself (`role="img"`).

**Where it differs from the plan.**

- `function` draws Tabler's `settings-bolt`, not `lambda`: λ is a letter (§ 3 "no lettering") and
  reads as the AWS product.
- `lint:deck` warns per kind (`icon-literal`, from the table, so a later plugin kind is linted
  with no lint-core edit) and on a bad `icon:` word (`unknown-icon`, the generalized
  `unknown-spark`). A pill's unknown `icon=` is `pill-literal`, with the same coaching.
- On a raw Marp preview (no Lattice engine), an icon stays code unless the page has loaded
  `lattice-plugin-icons.js`; the runtime host does not fetch it yet. Recorded in `followups.d/`.
- Decision 7 is settled: the owner looked at the demo deck (`examples/inline-icons.md`, framed and bare
  side by side in prose and pills, light and dark), signed off the export, and picked `framed`
  (2026-10-06). It was already the base rule and the `icon:` register's first `frame` word, so no
  rule changed.

Phase 2 (charts) and phase 3 (the Studio) follow, as § 10 planned.

## 13. Phase 2 as built (2026-10-06)

**Flowchart and state chart.** Both `segno` style slots gained `icon` (named-only text) and
`icon-only` (a flag), and both manifests declare `"plugins": { "optional": ["icons"] }`. The shared
grammar (`lib/core/flowchart-grammar.js`) resolves the name through the host's `known` service once
every shape exists, so an alias lands as its canonical name. Four diagnostics coach what does not
draw: `flowchart-unknown-icon` (the plugin's own `whyUnknown`, so `icon=lambda` points at
`function`), `flowchart-icon-only-without-icon`, `flowchart-icon-on-group`, and the existing
`flowchart-empty-name`, which names an icon-only row with no words. That last one is the § 5.3
refusal: the node would have no name.

**How the drawing reaches the picture.** Both charts lay out in the browser from a measuring
harness (Trama). `lib/components/chart/_chart-family/graph-icons.js` asks the host for `drawHtml`
and puts the `<svg>` in the node's harness tile, before the name. The harness CSS places it (a row,
or a column under `data-*-dir="tb"`), so the measured box holds both and the layout reserves the
room. The adapters read each icon's box and the name's box relative to the tile's center, as the
state chart already did for its name and badge. That keeps both in place when the kernel grows a
tile into a diamond or a circle. They repaint the drawing into the chart's SVG through a new Trama
helper, `drawing(svgEl)`, which rebuilds it from the six shape elements and their geometry and
keeps nothing else. The harness is markup the sanitizer kept, and a deck can forge one, so this is
the post-sanitize shape of HARD RULE #22. The provenance note on Trama's sanctioned `svg.innerHTML`
sink says so, and `test/unit/components/graph-icons.test.js` runs a forged harness through the
real serialized pass.

**The red team's probe, pinned (#2558's P3).** The red team attacked `drawing()` by hand and it
held, but nothing pinned what it tried. `graph-icons.test.js` now runs each case through both
charts' real serialized pass: an `<animate>` or `<set>` inside a kept shape, an entity-encoded
quote in a coordinate, a value past the 4000-character cap, prefixed and uppercase tags, tags
named `__proto__`, `constructor` and `toString`, and a `</title>` in an icon-only name. One case
was not held: a forged `<circle r="1e308">` was kept, and because the icon's wrapper was
`overflow="visible"` it painted over the whole chart. The first fix capped every number at 1e4;
the independent checker showed that is no bound at all, since a relative path (`l9999 0` four
hundred times, under the 4000-character cap) or a single 1e4 coordinate still draws a line
thousands of pixels long. So the bound is now geometric: both adapters wrap the drawing in an
`<svg viewBox="-2 -2 28 28" overflow="hidden">` scaled so the 24-unit grid lands where it did,
which clips a shape two units past the icon's box whatever its numbers say. The per-number cap
stays as hygiene. The shipped set's coordinates run from 2 to 22.5, so nothing real is clipped,
and the test renders all 265 shipped icons through the pass and requires every shape back. Each
guard was shown to bite: with the value checks removed six arms fail, with the cap removed two,
with the shape copied whole two, and with the tag looked up off the prototype two.

**Placement, § 11 q1.** The icon sits above the name when the chart is pinned `tb`, and before it
otherwise, including the unpinned default. Sizes are measured before the layout picks a direction,
so an unpinned chart cannot know where its icon goes until after it has been measured. Before the
name is the shape a short, wide node already has.

**Where the name is read.** Both charts paint into one `<svg role="img">`, so a nested `<title>`
on an icon-only node gives the hover tooltip but is not what assistive technology reads. The
spoken name comes from the chart's `<desc>`, which `describe()` builds from every shape's name in
both transforms, icon-only nodes included.

**Two paths that take no `off`.** The runtime's DOM build (`applyToDom`, for a page the engine did
not render) has no plugin-off set, as the pill's runtime path has none (§ 12). It cannot draw an
icon the deck switched off, because no such page carries the drawings: neither a raw Marp page nor
an Export-to-Marp bundle loads `lattice-plugin-icons.js`, so `drawHtml` returns null and the node
shows its name. `lint:deck` also parses without the deck's off set, so a deck with icons off still
gets icon-name coaching. That matches the pill's `icon=` lint, and a coached name is harmless.

**What did not change.** With no icon written, both galleries and the baseline gallery render
byte-identical engine HTML and pixel-identical pages against `main`. With the plugin off, a chart
that wrote icons is the same string as one that never did (pinned). An optional plugin reports no
`plugin/component-needs-plugin`, as math's optional `function-plot` does not, so § 6a's line that
the render reports it applies to required plugins only.

**Not done: hub-spoke.** Hub-spoke has no Segno style slot. Its rows are read by
`lib/core/hub-spoke-model.js`, where a bare `{icon=x}` span already reads as an icon-only PILL, and
its server-built geometry carries label-placement invariants. Giving it `icon=` needs its own
spelling decision, which is recorded in `followups.d/`. (Done the same day: § 14.)

## 14. Hub-spoke as built (2026-10-06)

**The spelling.** A hub-spoke row already writes its value, its status and its group as separate
pills (`` - Billing `$4M` `at-risk` `Retail` ``), each told apart by what it looks like. The icon
is one more: a Segno record, `{icon=invoice}` or `{icon=invoice, icon-only}`, read by the
component's own `style` slot (`hub-spoke.manifest.json`), which takes `icon=` and `icon-only` and
nothing else. Folding the status or the value into the record, as the state chart does, would
give one row two ways to say `at-risk`; a record holding anything else is coached
(`hub-spoke-bad-record`) and dropped. The two alternatives the followup named were weighed: a bare
`{icon=x}` read as the generic icon-only PILL would have meant the opposite of `icon=` in every
other chart (beside the name), and `icon=` as a bare pill word is not a record at all. Declaring
the slot `sits: "list-rows"` makes hub-spoke own the spans on its rows, as the two graph charts
do, so the inline pill resolver no longer renders them first. Unlike theirs, its ownership stops
at the rows it reads: the first cut owned every depth, and a pill or `^{icon}` in a satellite's
detail sublist (the Present popover) turned back into code. The slot now declares
`rowDepth: { default: 2, tiered: 3 }`, and the three readers of ownership (the markdown-it pass,
the runtime's `isOwnedElement`, and `lint:deck`) all count the depth (`ownedRowDepth`,
`lib/core/resolve-inline-code.js`); a slot without it still owns every depth. A slot that declares
`rowDepth` also owns only the slide's FIRST list, the one its kernel splices: the independent
checker found that a second list after a paragraph had lost its pills too. Two more of its
findings changed the lint. Its depth stack nests by content column, as CommonMark does (a
three-space indent under `  - ` is a sibling), and a blank line no longer resets it, so a loose
list's detail spans are still linted. And a row span that draws as something of its own elsewhere
(a `[x]` mark, a `~{…}` spark, a `^{…}` icon), trailing or inside the name, is now coached
(`hub-spoke-inline-kind`) and dropped. Before this change such a span vanished or printed as a
group named `[x]`, with no warning either way. That also fixes what a record did
before this: `{icon=invoice}` vanished from the row, and `{icon=invoice, icon-only}` printed
"icon-only" into the satellite's name.

**What it draws.** The model resolves the name through the host's `known` service, so an alias
lands as its canonical name and a name the set lacks is coached (`hub-spoke-unknown-icon`, with
the plugin's own `whyUnknown`). The kernel asks the host for `drawHtml` before it measures
anything; an icon it cannot draw (the plugin off, the data not on this surface) is dropped there,
so nothing reserves room for it. A satellite's, branch's or leaf's icon is a square of 1.1 × the
disc's radius (at most 30 units), centered in the disc; under `sized`, a flagged disc's inner
halo bounds it further. Satellites keep their names beside them, so a satellite icon touches no
label placement and no geometry invariant. On the hub the icon is a row of the text block, above
the name, and `hubFit` adds that row to the fit the linter and the kernel share; an `icon-only`
hub fits no name, and with no value its icon fills 0.9 of the disc the layout chose.

**`icon-only` keeps the name.** The label beside the disc is not placed (`blockFor` hands the
solve and the placer an empty block), the name is the drawing's `<title>` for the hover, and the
chart's `<desc>` still names every item, so the spoken description is unchanged. An `icon-only`
item with no words is refused (`hub-spoke-icon-only-empty-name`), as § 5.3 requires.

**The ink, measured.** The first cut painted each icon in its disc's own edge ink. Rendered, that
read brown on brown on a status disc. Measured over the 14 flat-fill palettes in both modes, the
edge ink cleared 1.47:1 at worst on a group disc and the state ink 1.30:1 on a status disc. The
contrast of every candidate token against every disc fill, worst case per kind:

| disc | light: chosen ink | worst | dark: chosen ink | worst |
|---|---|---|---|---|
| hub | `--bg` | 9.65:1 | `--bg` | 7.88:1 |
| neutral satellite | `--text-heading`, L × 0.55 | 3.58:1 | `--text-heading` | 4.35:1 |
| group | `--text-heading`, L × 0.55 | 3.14:1 | `--text-heading` | 4.12:1 |
| status | `--text-heading`, L × 0.55 | 3.66:1 | `--bg` | 3.90:1 |

No existing token clears 3:1 on a light group disc (the plain heading ink measured 2.68:1 on
laguna), so the light arm takes the heading ink a step darker through `oklch(from …)`, which the
group-disc rule above it already uses.

**Under a chart finish, measured afterwards.** A finish repaints the group and status discs, and
the fixed inks above did not hold: a pigment group disc 2.27:1 (onyx dark), a tone group disc
2.27:1 (carbone dark), an etching status disc 1.62:1 (onyx dark). `mode: sketch` held (3.14:1 at
worst). So `tools/build-chart-finish-css.js` now gives `.hub-spoke-icon` the ink the finish's own
disc body clears: `inkOn`, black above OKLCH L 0.565 and white below, computed from the same body
expression the generator gives the disc, behind the same `@supports` as every text ink there.
Worst case after, all 14 palettes in both modes: pigment 4.38:1, etching 7.03:1, tone 3.48:1.
Every figure in this section is re-derivable: `2026-09-29-inline-icons/probe-hub-spoke-icon-ink.cjs`
renders the demo deck under every palette, mode, finish and sketch, and prints the worst icon-on-disc
ratio per disc kind; its output on the commit that shipped this is beside it (`.out.txt`).

**On an engine without relative color** (the independent checker's finding on the finish fix), a
custom property holding an `oklch(from …)` such an engine cannot parse would leave the stroke unset
and the icon undrawn. The icon's base inks are therefore plain tokens (the heading ink; the canvas
ink on a dark status disc), and the measured `oklch(from …)` inks replace them behind
`@supports`, as the finish inks already were. `hub-spoke.test.js` also now reads the disc's finish
body and the icon's ink out of the generated sheet and requires the ink to derive from that exact
body, so a finish level edited without the icon fails there (shown to fail on a 1% drift).

**What did not change.** With no icon written, the hub-spoke gallery, the baseline gallery, both
graph-chart galleries, `examples/chart-icons.md` and `examples/gallery-jargon.md` render
byte-identical engine HTML against `main`. With the plugin off, a chart that wrote icons is the
same string as one that never did (pinned in `hub-spoke.test.js`). Every geometry invariant holds
with icons on in the flat, `sized`, `flow-out` and `tiered` forms (pinned).

## 15. Phase 3 as built (2026-10-06)

**Autocomplete.** `lint-core.js` `inlineCodeCompletions` answers an open `^{da`, and an open
`icon=da` inside a pill or a chart record, with the names the icon kind's new `names(prefix)`
returns (`icons.inline.js`): canonical names that start with the prefix, then the name of every
alias that does (`db` → `database`, with `for "db"` as its info). The vocabulary is the one the
linter already ships (`icons.vocab.generated.js`); no drawing is read to answer. The Studio's
completion source (`editor-complete.ts`) shows that list exactly (`filter: false`) and asks again
on every keystroke, so the menu never offers a name that will not draw.

**The picker is the menu.** Rather than a second control, each icon row draws its icon
(`icon-preview.ts`, CodeMirror's `addToOptions`), built as DOM from the plugin's data. The data
script loads the first time the menu opens with an icon in it, through the same
`ensurePluginData` the render uses. Measured on `npm run build:e2e` at 1440, 820 and 390 wide and
in dark: no request for `lattice-plugin-icons.js` before the menu opened, one after, and every row
drawn. At 1.25em the drawings measured about 10px and read as blots, so they draw at 1.6em.

**Not done.** A browsable grid of all 265 icons, for an author who does not know a name to start
from. Typing `` `^{ `` alone lists all of them, with drawings, which covers it for now.

