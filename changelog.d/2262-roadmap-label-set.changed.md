- **A roadmap's status key can be renamed.** `Shipped` / `In flight` / `Planned` /
  `Out of scope` are right for a product plan and wrong for a legislative or research one,
  and until now no deck could say otherwise — the words were a constant in the transform.
  They are now the default declared in `roadmap.manifest.json`, and an author overrides any
  of them with a label set above the grid:
  `` `[{[x], Enacted}, {[-], In committee}]` ``. **Naming a subset is the normal case** —
  the states you do not name keep their defaults. The key is the MARKER you already type in
  a cell, brackets included; a bare space key collapses to empty and would drop its row, so
  `[ ]` is the spelling that works. Everything the key already did, it still does: one chip
  per state actually present, canonical lifecycle order, no key at all when the grid carries
  no markers, and none under the `status` variant, which labels every cell itself.
  `lint:deck` warns on a key that would be dropped, naming the keys that would work.
  Demo deck: `examples/roadmap-label-sets.md`.
  (`lib/components/chart/roadmap/roadmap.transform.js`)
