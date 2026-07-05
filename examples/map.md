---
marp: true
size: 4K
theme: indaco
paginate: true
header: "Lattice · map"
---

<!-- _class: title silent -->

# Show them where.

`New component · evidence · spatial · series`

The first layout on the new **spatial** form — regions placed by real-world geography, not a grid or an axis. Author a value per named place; the basemap fills it. US states or world countries, for program reach, service territories, jurisdictions, and where the money landed.

---

<!-- _class: content -->

## One grammar, two basemaps, two reads.

Name a place, give it a value. The tokens pick the rest.

- **`map`** is US states; **`map world`** is world countries (Robinson projection). Same authoring — one place per li with a trailing inline-code value: `- Brazil \`31\``.
- **Choropleth** (default) shades a single-hue ramp — *how much, where*. **`highlight`** gives each named place its own colour — *which ones*.
- Names resolve loosely — `California` / `CA` / `Calif.`, or `Brazil` / `BR` / `Brasil` — and anything the basemap can't place is reported, never dropped.

---

<!-- _class: map us -->

## Where the recovery grants landed.

- California `48.2`
- Texas `36.4`
- New York `31.0`
- Florida `27.5`
- Illinois `19.3`
- Pennsylvania `17.6`
- Ohio `14.1`
- Washington `9.6`

---

<!-- _class: map world -->

## Where our field offices operate.

- United States `42`
- India `38`
- Brazil `31`
- Nigeria `27`
- Kenya `24`
- Germany `22`
- Indonesia `19`
- Australia `12`

---

<!-- _class: map world highlight grouped -->

## Coverage, told at bloc scale.

- European Union `Tier 1`
- ASEAN `Tier 1`
- Sub-Saharan Africa `Tier 2`
- Latin America `Tier 2`

---

<!-- _class: content -->

## Naming a region is the hard part — so we made it cheap.

World names vary wildly (Côte d'Ivoire, Myanmar, Czechia), and a mistyped name is a silent gap. Two defences, both off the same baked vocabulary — no model call, no token cost.

- **Group as a fat alias.** Name a continent or a dated bloc — `European Union`, `Sub-Saharan Africa`, `G20` — and the kernel fills every member. Blocs carry the year their membership is asserted.
- **Autocomplete + did-you-mean.** In the editor, region names complete as you type; a name that still slips through is flagged at lint time with the nearest match (`Brasil` → `Brazil`).

---

<!-- _class: content -->

## What it doesn't do — yet.

The spatial form is built to grow; the boundary stays provable.

- **No sub-national detail.** Counties, districts, and city pins are out of scope; the world cut (110m) also omits the smallest city-states.
- **Continents, blocs, and stated categories.** EU / ASEAN / G20 / BRICS / OECD ship with dated provenance; Global South / Global North ship too, pinned to a stated, dated definition (the UN G77 + China) with the same provenance — so the definition travels with the data and an author can cite it, rather than every deck hand-rolling its own roster.
- **No magnitude in highlight.** If you need *which* and *how much*, lead with choropleth and name the set in the prose.

---

<!-- _class: closing silent -->

## Geography is the argument.

`map`

When *where* is the point — coverage, reach, jurisdiction — a basemap says it in one glance a table of names never will. When it isn't, reach for `progress` or `stats` instead.
