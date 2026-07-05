---
marp: true
theme: indaco
paginate: true
header: "Lattice · map"
---

<!-- _class: title silent -->

# map

`Evidence · Spatial · Series`

A world-countries (or US-states) basemap that fills regions by value (choropleth) or category (highlight) so the audience leaves knowing where.

---

<!-- _class: map -->
<!-- _footer: "Default · map" -->

## Where our programs reached — unevenly.

- India `48.2`
  - Largest by volume, thinnest by margin
  - Two new state hubs this year
- Nigeria `36.4`
- Kenya `31.0`
- Brazil `27.5`
- Indonesia `19.3`
- Ethiopia `14.1`
- Bangladesh `11.8`
- Peru `9.6`


---

<!-- _class: map us -->
<!-- _footer: "us · map us" -->

## Grant dollars by state — unevenly.

- California `48.2`
- Texas `36.4`
- New York `31.0`
- Florida `27.5`
- Illinois `19.3`
- Ohio `14.1`
- Georgia `11.8`
- Washington `9.6`


---

<!-- _class: map world -->
<!-- _footer: "world · map world" -->

## The same engine, pinned to the world basemap.

- Germany `42.7`
- Japan `35.1`
- Canada `28.9`
- Australia `21.4`
- Chile `16.2`
- Morocco `12.8`
- Vietnam `10.5`
- Iceland `7.3`


---

<!-- _class: map highlight -->
<!-- _footer: "highlight · map highlight" -->

## The regions we serve.

- Kenya `East Africa`
- Nigeria `West Africa`
- India `South Asia`
- Brazil `Latin America`


---

<!-- _class: map robinson -->
<!-- _footer: "robinson · map robinson" -->

## Where our field offices operate.

- United States `42`
- Brazil `31`
- Nigeria `27`
- Kenya `24`
- India `38`
- Indonesia `19`
- Germany `22`
- Australia `12`


---

<!-- _class: map highlight grouped -->
<!-- _footer: "grouped · map grouped" -->

## Coverage by economic bloc.

- European Union `Tier 1`
- ASEAN `Tier 1`
- Sub-Saharan Africa `Tier 2`
- Latin America `Tier 2`


---

<!-- _class: map us -->
<!-- _footer: "Stress test · map" -->

## A wide spread across fifteen states.

- California `512`
- Texas `438`
- New York `390`
- Florida `301`
- Pennsylvania `188`
- Illinois `164`
- Ohio `142`
- Georgia `121`
- North Carolina `98`
- Michigan `76`
- Arizona `54`
- Tennessee `41`
- Colorado `33`
- Oregon `22`
- Maine `9`


---

<!-- _class: map dark -->
<!-- _footer: "Composition: dark · map dark" -->

## Where our programs reached — unevenly.

- India `48.2`
  - Largest by volume, thinnest by margin
  - Two new state hubs this year
- Nigeria `36.4`
- Kenya `31.0`
- Brazil `27.5`
- Indonesia `19.3`
- Ethiopia `14.1`
- Bangladesh `11.8`
- Peru `9.6`


---

<!-- _class: map compact -->
<!-- _footer: "Composition: compact · map compact" -->

## Where our programs reached — unevenly.

- India `48.2`
  - Largest by volume, thinnest by margin
  - Two new state hubs this year
- Nigeria `36.4`
- Kenya `31.0`
- Brazil `27.5`
- Indonesia `19.3`
- Ethiopia `14.1`
- Bangladesh `11.8`
- Peru `9.6`


---

<!-- _class: map accent -->
<!-- _footer: "Composition: accent · map accent" -->

## Where our programs reached — unevenly.

- India `48.2`
  - Largest by volume, thinnest by margin
  - Two new state hubs this year
- Nigeria `36.4`
- Kenya `31.0`
- Brazil `27.5`
- Indonesia `19.3`
- Ethiopia `14.1`
- Bangladesh `11.8`
- Peru `9.6`


---

<!-- _class: list -->
<!-- _footer: "Anti-patterns · map" -->

## When NOT to reach for map.

- **A map as decoration.** If the regions aren't the comparison — you just want a US-shaped graphic behind some numbers — drop the basemap. An `image` scrim or a `stats` row carries headline figures without implying the geography is the message.
- **Too many shades to read.** A choropleth past a dozen distinct values asks the eye to rank colours it can't separate. Bucket the values, switch to `highlight` for a categorical read, or lead with a `progress` ranking and keep the map as support.
- **Sub-region precision the basemap doesn't have.** The basemaps draw US states and world countries — not counties, districts, sub-national regions, or city pins, and the world cut (110m) omits the smallest city-states. If the story lives below that line, a labelled `image` of the real map serves better than forcing it onto the basemap.

---

<!-- _class: closing silent -->

## See also.

`Related components`

- `progress` — the regions are really a ranking — labelled bars compare magnitudes faster than shades
- `stats` — a few headline figures with no geography to place them on
- `piechart` — regional shares of a single whole rather than a value per place
- `image` — the geography needs detail (counties, cities, routes) the basemap can't draw
