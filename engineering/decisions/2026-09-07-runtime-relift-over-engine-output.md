---
status: blocked
summary: >
  `transformSlotLabels` in the runtime skips an `li` whose lead is already a `<strong>`, but
  it tests `firstElementChild.tagName === 'STRONG'` — which a LOOSE list defeats, because
  markdown-it wraps a loose lead in a `<p>`. The Playground runs that pass over engine output
  in a srcdoc iframe, so a label the engine already lifted could be re-wrapped as
  `<strong><p><strong>…`, doubling it on screen. `inventory` joining SLOT_LAYOUTS makes it
  easy to hit (its taught shape invites the blank line); the concern predates that for the
  other fifteen registered layouts. NOBODY HAS REPRODUCED IT ON A REAL SURFACE. A guard fix
  plus a jsdom test were written and REVERTED: the test passed with the guard removed, and
  instrumenting the harness showed why — the pass never runs under jsdom at all, so it can
  see neither the bug nor the fix. Settling it costs one docs-site build and a look at the
  live Playground.
---

# The runtime's slot-label pass may re-lift a label the engine already lifted

**Date** 2026-09-07 · **Status** BLOCKED on a docs-site build — unproven on the surface that matters ·
**Found by** the checker pass on PR for `claude/components-text-headers-c771ms`

## The concern

`transformSlotLabels` (`lib/runtime/index.js:1878`) skips an `li` whose lead is
already a `<strong>`, and it tests that with
`li.firstElementChild.tagName === 'STRONG'`. A **loose** list defeats the test:
markdown-it wraps a loose item's lead in a `<p>`, so the engine emits

```html
<li><p><strong>Label</strong></p><ul><li>body</li></ul></li>
```

`firstElementChild` is the `P`, the guard misses, and the pass would re-wrap the
lot as `<strong><p><strong>Label</strong></p></strong>` — a block `<p>` inside a
`<strong>`, and a doubled label on screen.

The Playground is where the two halves meet: `docs/src/playground/deck-preview.js`
writes engine-rendered HTML into a `srcdoc` iframe and loads
`dist/lattice-runtime.js` over it, so this pass runs a second time on markup that
is already correct.

One blank line is the whole difference between a tight list and a loose one, and
`inventory`'s taught shape (`- Label` / `  - body`) is exactly where an author
leaves one. `inventory` joined `SLOT_LAYOUTS` in #2113; the concern predates that
for the other fifteen registered layouts.

## Why this is a note and not a fix

**Nobody has reproduced it on a real surface, including me.** The finding was
established by calling the transform against hand-built DOM. That is not the same
as the bundle running in a document.

A fix was written and reverted. It widened the guard to accept a `<p>` whose only
child is a `<strong>`, and it shipped with a jsdom test driving the real engine
for the input and the real `dist/lattice-runtime.js` for the pass. **The test
passed with the guard removed**, so it proved nothing. Instrumenting the harness
explains why: feed it an `<li>` that is deliberately NOT lifted —
`<section class="inventory"><ul><li>Alpha<ul><li>body</li></ul></li></ul></section>`
— boot the bundle, and `Alpha` comes back unwrapped. The bundle bootstraps (it
logs), but this pass never runs under jsdom. So the harness cannot see the bug,
cannot see the fix, and a test built on it certifies nothing.

Rather than ship an unverifiable change to engine code, the change was reverted
and this note written. HARD RULE #23: a fix to a defect nobody has reproduced,
guarded by a test that cannot fail, is not a fix.

## What would settle it

Build and serve the docs site (`cd docs && npm run dev`), open the Playground,
paste an `inventory` slide authored with a **blank line** between the label and
its nested body, and look at the rendered label in the iframe:

```markdown
<!-- _class: inventory -->

## Heading.

- First label

  - First body.
```

Doubled or visibly wrong → the guard needs widening, and the same check belongs on
every layout in `SLOT_LAYOUTS`. Correct → the second pass is not reaching these
rows in the real iframe either, and the guard is fine as written; say so here and
close this note.

Either way the answer costs one docs-site build, which is the cheapest honest way
to know — and it is a browser question, so no amount of jsdom will substitute.
