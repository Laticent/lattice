---
marp: true
theme: indaco
paginate: true
footer: "SlideWright · auto-glossary"
glossary: auto
acronyms:
  ARR: { expansion: annual recurring revenue, definition: "Revenue a business can reliably expect to recur every year." }
  NDR: { expansion: net dollar retention, definition: "The share of last year's revenue kept and expanded, before new sales." }
  CAC: { expansion: customer acquisition cost, definition: "The average sales and marketing spend to win one new customer." }
  GTM: { expansion: go to market, definition: "The plan for how a product reaches and wins its customers." }
  KPI: key performance indicator
---

<!-- _class: title silent -->

# The deck that writes its own glossary.

`Feature · auto-glossary`

Add `glossary: auto` to the front matter and the acronym registry's definitions become a reference appendix — on every surface, no extra authoring.

<!-- Bienvenue is elsewhere; this is English. This deck writes its own glossary from the acronyms you already defined. -->

---

<!-- _class: divider -->

## You already wrote the definitions.

The `acronyms:` registry (the one that teaches narration how to say `ARR` in full) carries an optional one-sentence `definition` per term. Until now it was stored and never shown.

---

## The quarter in three numbers.

- ARR crossed the plan a quarter early.
- NDR held above target, entirely from expansion.
- CAC fell as the GTM motion matured.

Each acronym is defined once, at the back — so a first-time reader is never lost.

---

## One switch, every surface.

`glossary: auto` in the front matter is the whole opt-in. Because it appends a real slide — built with the `glossary` component — the reference page ships in the PDF, the PPTX, the HTML player, and the live Studio alike. No per-surface work.

---

## Boardroom restraint: define once.

The generated page lists each defined term alphabetically, with the runtime's auto range pill. An acronym with only a spoken expansion — no definition — is left off; there's nothing to define.

---

<!-- _class: light -->

## It also rides in the manifest.

Beyond the slide, the exported `.html` manifest carries the term → definition map, so a downstream tool can read your glossary without scraping the page. The stored field is no longer dead.

The next slide is generated — you didn't write it.
