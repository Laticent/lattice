---
origin: 3484
priority: P1
recorded: 2026-11-23
area: website
severity: high
swimlane: docs/src/lib/component-search.ts
deferred: large — needs its own design (stemming, typo tolerance, a concept vocabulary in the manifests) and its own branch
source: https://github.com/Laticent/lattice/pull/3484
---

# Search the slide gallery by meaning, not only by spelling

```text
  P1 · [no ticket] the gallery understands what an author means
       why now   — the owner, on an iPhone (#3484): "grade" ranks compare-code first, "movie"
                   ranks line, "science" ranks scene, "data" ranks policy-recommendation.
                   #3484's "Best match" label makes each of those visible. Measured on the real
                   ranker (component-search.ts searchHits) with the shipped catalog:
                   1. a confident FUZZY hit returns before the intent pass runs, so a one-word
                      query never reaches meaning ("grade" -> compare-code, "data" -> a spelling
                      neighbor of "update"); multi-word queries rank well ("quarterly revenue"
                      -> line, "testimonial" -> quote, "budget" -> table);
                   2. the substring pass has no stemming: "grades" and "pictures" return nothing,
                      "quotes" and "charts" fall to fuzzy;
                   3. no concept vocabulary: nothing in a manifest says data -> the chart family,
                      photo/picture -> imagery, grade/score -> verdict-grid/kpi, movie -> video;
                   4. "chart" finds flowchart/piechart by substring before the chart family.
                   The exemplar decks (exemplars/<sector>/) are a corpus of real usage by sector
                   that could seed the vocabulary.
       done when — a design note picks the mechanism (owner pick), then: every query in a
                   committed benchmark (one-word, plural, misspelled, everyday words, sector
                   words) puts a defensible component first, measured before and after; stems
                   and typos both survive; the ranker stays on-device and under its time budget.
```
