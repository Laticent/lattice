# map

> A world-countries (or US-states) basemap that fills regions by value (choropleth) or category (highlight) so the audience leaves knowing where.

**Function** evidence · **Form** spatial · **Substance** series

**Tags** `metric` · `proportion` · `overview` · `visual`

Use when the story is geographic — program reach, service territories, where the grants landed, the regions you operate in. Author a value per named region (full name, postal/ISO code, or a common alias); choropleth shades each region on a single-hue ramp (low→high), while `highlight` gives each named region its own categorical color. The default basemap is the **world** (Equal Earth projection); add `us` (or `usa`) for the US-states map. On the world map you can also name a continent, a bloc (`European Union`, `ASEAN`), or a stated category (`Global South`, `Global North`, `Global South — Africa`) and the kernel fills every member. Because the term is contested, two sourced views of the Global South ship: `Global South` (G77 + China) and `Global South — Brandt Line` (the 1980 North–South divide) — pick the framing your deck argues. Regions the basemap can't match are reported in the legend, never silently dropped.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — name the geography and the takeaway (‘Where the program runs’). |
| `regions` | `ul > li` | yes | One li per region (or group). Lead with the name — world (default): full (`Brazil`), ISO (`BR`), alias (`Burma`), or a group (`European Union`, `Sub-Saharan Africa`, `Global South`) that expands to its members; US (`map us`): full (`California`), postal (`CA`), or abbreviation (`Calif.`) — then a trailing inline-code value: `Brazil \`4.2\``. In choropleth the value drives the ramp; in highlight it's an optional legend label. Names the basemap can't resolve surface as muted ‘?’ legend rows. |
| `detail` | `li > ul` | no | Optional nested sublist under a region. Drives two surfaces from one source (shared with pie/funnel/quadrant via the chart-family mark-detail substrate): (1) Present/Practice — the kernel tags the region `<path>`(s) with `data-mark` (a group shares one index across all its regions) and emits the sublist as an inert `<template class="chart-detail">` the reveal layer reads; (2) the static PDF — the same detail is folded into the slide's speaker note (`Region (value): item · item`) as a Marp-faithful comment that notes-core lifts into the per-slide note channel. The note rides the existing channel, so the chart pixels stay byte-identical. A map with no sublists emits no note and is unchanged. |

### Variant decision rule

- **`world`.** The story spans multiple countries — program reach, service territories, grants — the default basemap, spelled out.
- **`us`.** The story is entirely within the United States — swaps to the US-states basemap with insets.
- **`highlight`.** The regions are a SET, not a ranked magnitude — membership matters (pilot states, regions served), not a gradient of values.
- **`robinson`.** A different, less area-distorting world projection fits the deck's visual tone better than the default Equal Earth.
- **`grouped`.** Whole blocs, continents, or categories should fill as one unit (European Union, ASEAN) rather than spelling out every member country.

### Common mistakes

- **Assuming an unresolved region name is silently dropped.** An unmatched region name isn't silently dropped or fatal — it surfaces as a muted '?' row in the legend and is stamped on the figure; fix the spelling rather than assuming the pipeline validates names for you.
- **Using `highlight` with numeric-looking trailing values, expecting a color ramp.** Under `highlight`, the trailing value is just an optional legend LABEL, not a magnitude — it doesn't drive a color ramp the way it does under the default choropleth; a numeric string there is treated as a category label, not a number.

### Data shape

- Region names resolve by full name, ISO/postal code, or common alias — the resolver accepts any mix, but picking one convention per chart keeps the legend readable.
- Choropleth values must share one consistent unit/scale across all regions — the ramp maps low→high over the full authored range, so mixing e.g. raw counts and percentages skews the gradient.

## When to use

- **The story is geographic.** Reach for a map only when WHERE is the point — coverage areas, jurisdictions, service territories, where the grants or pilots landed. If the geography is incidental and the comparison is really between named things, a `progress` or `stats` row reads faster than a basemap.
- **Choropleth for magnitude, highlight for membership.** Use the default choropleth when each region carries a number and the audience needs the gradient — how much, where. Use `highlight` when the named regions are a set (the eight pilot states, the four regions we serve) and there is no magnitude to rank.
- **Name regions any common way.** Country names resolve by full name, ISO code, or common alias (`Brazil` / `BR` / `Burma`→Myanmar); on `map us`, by full name, postal code, or abbreviation (`California` / `CA` / `Calif.`). A name the basemap can't bind is reported as a muted ‘?’ row in the legend and stamped on the figure — fix the spelling, don't ignore the gap.

## When NOT to use

- **A map as decoration.** If the regions aren't the comparison — you just want a US-shaped graphic behind some numbers — drop the basemap. An `image` scrim or a `stats` row carries headline figures without implying the geography is the message.
- **Too many shades to read.** A choropleth past a dozen distinct values asks the eye to rank colors it can't separate. Bucket the values, switch to `highlight` for a categorical read, or lead with a `progress` ranking and keep the map as support.
- **Sub-region precision the basemap doesn't have.** The basemaps draw US states and world countries — not counties, districts, sub-national regions, or city pins, and the world cut (110m) omits the smallest city-states. If the story lives below that line, a labeled `image` of the real map serves better than forcing it onto the basemap.

## Authoring

```markdown
<!-- _class: map -->

## Where the program runs.

- Kenya `4.2`
- Nigeria `3.1`
- India `2.8`
- Brazil `2.2`
```

## Variants (component-specific)

### `us` — us

The US-states basemap, with insets.

```markdown
<!-- _class: map us -->

## us swaps in the US-states basemap.

- California `48.2`
- Texas `36.4`
- New York `31.0`
- Florida `27.5`
- Illinois `19.3`
- Ohio `14.1`
- Georgia `11.8`
- Washington `9.6`
```

### `world` — world

The Basemap axis default, spelled out.

```markdown
<!-- _class: map world -->

## The same engine, pinned to the world basemap.

- Germany `42.7`
- Japan `35.1`
- Canada `28.9`
- Australia `21.4`
- Chile `16.2`
- Morocco `12.8`
- Vietnam `10.5`
- Iceland `7.3`
```

### `highlight` — highlight

Category fills instead of values.

```markdown
<!-- _class: map highlight -->

## highlight fills by category, not value.

- Kenya `East Africa`
- Nigeria `West Africa`
- India `South Asia`
- Brazil `Latin America`
```

### `robinson` — robinson

The Robinson projection swap.

```markdown
<!-- _class: map robinson -->

## robinson swaps the projection.

- United States `42`
- Brazil `31`
- Nigeria `27`
- Kenya `24`
- India `38`
- Indonesia `19`
- Germany `22`
- Australia `12`
```

### `grouped` — grouped

Whole blocs fill as one.

```markdown
<!-- _class: map highlight grouped -->

## grouped fills whole blocs at once.

- European Union `Tier 1`
- ASEAN `Tier 1`
- Sub-Saharan Africa `Tier 2`
- Latin America `Tier 2`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`progress`](../../chart/progress/progress.docs.md) — the regions are really a ranking — labeled bars compare magnitudes faster than shades
- [`stats`](../../evidence/stats/stats.docs.md) — a few headline figures with no geography to place them on
- [`piechart`](../../chart/piechart/piechart.docs.md) — regional shares of a single whole rather than a value per place
- [`image`](../../imagery/image/image.docs.md) — the geography needs detail (counties, cities, routes) the basemap can't draw

## Demo deck

See [map.gallery.light.pdf](./map.gallery.light.pdf) for rendered examples of every variant.
