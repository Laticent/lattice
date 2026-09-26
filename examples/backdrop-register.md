---
marp: true
theme: indaco
paginate: true
header: "Lattice · Backdrop register"
finish: atrium
backdrop: 60 clear
---

<style>
/* A fabricated finish, written in the shape Fabricate generates: a bold grid with a BAKED
   clearance. Slides 7–8 show the register overriding that baked value. */
section.finish.finish-graph {
  --fin-wash: none;
  --fin-texture: repeating-linear-gradient(0deg, color-mix(in srgb, var(--field-accent, var(--accent)) 22%, transparent) 0 1px, transparent 1px 30px), repeating-linear-gradient(90deg, color-mix(in srgb, var(--field-accent, var(--accent)) 22%, transparent) 0 1px, transparent 1px 30px);
  --fin-mark: none;
  --fin-mark-text: "";
  --fin-edge: none;
  --fin-backdrop-mask: var(--backdrop-clear-mask);
  --fin-backdrop-mask-opaque: var(--backdrop-clear-mask-opaque);
}
@media print {
  section.finish.finish-graph {
    --fin-texture: repeating-linear-gradient(0deg, color-mix(in srgb, var(--field-accent, var(--accent)) 22%, var(--fin-canvas)) 0 1px, transparent 1px 30px), repeating-linear-gradient(90deg, color-mix(in srgb, var(--field-accent, var(--accent)) 22%, var(--fin-canvas)) 0 1px, transparent 1px 30px);
    --fin-backdrop-mask: var(--fin-backdrop-mask-opaque, none);
  }
}
:where(.lattice-exporting) section.finish.finish-graph,
section.finish.finish-graph.lattice-exporting {
  --fin-texture: repeating-linear-gradient(0deg, color-mix(in srgb, var(--field-accent, var(--accent)) 22%, var(--fin-canvas)) 0 1px, transparent 1px 30px), repeating-linear-gradient(90deg, color-mix(in srgb, var(--field-accent, var(--accent)) 22%, var(--fin-canvas)) 0 1px, transparent 1px 30px);
  --fin-backdrop-mask: var(--fin-backdrop-mask-opaque, none);
}
</style>

<!-- _class: title -->

# Restrain any finish

`backdrop: 60 clear · deck-wide`

The atrium finish at 60%, cleared behind the words, on a dark bookend.

---

`Deck-wide`

## One line tames the whole deck.

`backdrop: 60 clear` dims atrium to 60% and clears it from behind the content on every slide. Atrium is built in, so until now it had no restraint control.

The finish still frames the slide at the margins.

---

<!-- _class: backdrop-full backdrop-open -->

`backdrop-full backdrop-open`

## For contrast: atrium at full strength.

This slide opts out of both deck values: full strength, no mask. The glow and grid sit right behind the text, which is the problem the register exists to solve.

---

<!-- _class: backdrop-full -->

`backdrop-full · deck mask kept`

## A slide overrides one axis at a time.

This slide sets only its strength. It keeps the deck's `clear`, so atrium returns at full strength yet still steps back behind the words.

---

<!-- _class: backdrop-spot-tr -->

`backdrop-spot-tr`

## Or show the finish in a single window.

`spot-tr` reveals atrium in the top-right corner and hides it everywhere else. Nine anchors cover the slide, from `spot-tl` to `spot-br`.

---

<!-- _class: finish-graph backdrop-40 backdrop-spot-bl -->

`finish-graph · backdrop-40 backdrop-spot-bl`

## Both axes compose on one slide.

The graph grid at 40%, shown only in the bottom-left corner. The words sit on clean canvas.

---

<!-- _class: finish-graph backdrop-full backdrop-open -->

`finish-graph · backdrop-full backdrop-open`

## A fabricated finish bakes its own mask.

The **graph** finish bakes a clearance in Fabricate. On this slide, `backdrop-open` discards it and the grid runs right through the text.

---

<!-- _class: finish-graph backdrop-full backdrop-spot-c -->

`finish-graph · backdrop-spot-c`

## The register replaces a baked mask.

Here `spot-c` swaps graph's baked clearance for a centered window. The slide token wins, then the deck line, then the value baked in Fabricate.

---

<!-- _class: closing -->

## Any finish, any slide.

`backdrop: 20–80 · clear · spot-* · open · full`

Restraint for built-in and fabricated finishes, deck-wide or per slide.
