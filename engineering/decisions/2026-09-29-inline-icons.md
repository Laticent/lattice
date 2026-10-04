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
  corner axes and an `icon:` register. Icons ship as a PLUGIN (`lib/plugins/icons/`), so a deck that uses none
  loads none; that adds three contribution points to the plugin host (an inline-code kind, the first
  `services` callers, a plugin-declared register). Build waits for Segno phase 2.
---

# Icons — drawn, themed, and written like sparks

**Date:** 2026-09-29, revised 2026-10-04 · **Status:** proposed. The owner settled eight decisions in
§ "Decided"; the three questions in § "Open questions" are small and wait for the build.
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
| 1 | **Tabler, curated** is the base set (MIT). About 250 icons, no `brand-*` icons. We draw the four architecture concepts it lacks on its grid | owner, over Carbon, Lucide and Tabler with Carbon gap-fill, after the § 3 measurements |
| 2 | **Cloud-provider neutral.** No vendor logos and no per-service vendor icons. A cloud service is a role icon paired with the service's name and a color: `{S3, icon=bucket, c4}` | owner |
| 3 | **Written in Segno's notation, and icons are its first new user** after phase 2 | owner |
| 4 | **Design now, build on Segno.** This note lands first; the kernel and chart wiring land after Segno phase 2, so icons never need a codemod | owner |
| 5 | **Icons are a full plugin**, `lib/plugins/icons/`: the syntax, renderer, styles and the Tabler data all live in the package, and the plugin host gains the three contribution points icons need (§ 6a) | owner, 2026-10-04, over a core feature with icon packs as plugins, and core now with a move later |
| 6 | **Sparks and icons share Segno's record spelling.** `^{database, c3, lg}` and `~{12 14 17, bar, c3, lg}`: the sigil, then a record whose first item is the subject (a name, or the data) and whose other items are the shared option words. Sparks move in Segno phase 2's codemod, like every other grammar | owner, 2026-10-04, over colon style for both and records for icons only |
| 7 | **The default look is chosen on renders.** Phase 1b renders framed and bare side by side, in prose, tables, pills and charts, in dark and light, and the owner picks from the images | owner, 2026-10-04 |
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
  icons.own/               the four icons we draw (§ 3)
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
  writes `lib/plugins/icons/icons.data.generated.js`: name → path data. Our own four icons come from
  `icons.own/*.svg`. The generated file is committed like the plugin registry, and `build:check`
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
- **Our names, not Tabler's.** An author writes `icon=bucket`, not `icon=bucket-droplet`. Our name is
  the stable API; the source can change under it without a deck noticing.
- **Aliases are Segno aliases** (`db` → `database`, `lb` → `load-balancer`, `fn` → `function`), so an
  ambiguous alias does not build, and the per-deck one-spelling rule (Segno decision 7) applies.
- **Service names are not aliases.** `s3` is not an alias for `bucket`: that would bring a vendor
  vocabulary in by the back door. It is the lint coaching in § 4.
- **License.** Tabler's MIT notice ships in `lib/plugins/icons/LICENSE-tabler.md` and in the third-party
  notices. Our own four icons carry the repository's license.

## 10. Plan

| phase | what lands | depends on |
|---|---|---|
| 0 | This note | — |
| 1a | The host: the inline-code dispatcher as a table with marks, pills and sparks as first-party rows (byte-identical), the `inline`, `services` and `registers` contribution points in the schema and resolver, the register factory, the vocabulary projection's new fields, and the plugin note's § 4.3 and § 5 updated | Segno phase 2 |
| 1b | The icons plugin: the package in § 6a, the data build step, our four icons, `^{…}` and the pill's `icon=`, the `icon:` register, lint coaching, docs, a demo deck `examples/inline-icons.md` with its PDF (HARD RULE #9), the export sign-off, and a `changelog.d/` fragment | 1a |
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
2. **The default frame** — settled as a method, not a value: decision 7. Phase 1b renders `framed`
   and `bare` side by side and the owner picks. Until then § 6's table shows `framed`, the sparks'
   default, as a placeholder.
3. **Service-name coaching coverage.** How many service names § 4's lint table starts with.
   Recommendation: the three largest providers' 20 most-used compute, storage, data and network
   services each, about 60 rows, grown when an author trips on a missing one.
