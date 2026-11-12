---
marp: true
theme: indaco
size: hd
---

## Markers stay in the photo

- Alpha is a plain item.
- Bravo holds `code` in running text.
- **Charlie** is bold first.
  - Delta is nested.

1. Echo is numbered.
2. Foxtrot is numbered too.

---

<!-- _class: dark -->

## Markers stay on a dark slide

- Golf is a plain item.
- Hotel holds `code` in running text.

1. India is numbered.

---

<style>
/* Slide 3 only: the engine applies a style block deck-wide, and rewrites a data-lattice-* selector. */
section[id="3"] li > code:first-child { display: block; padding: 20px; }
section[id="3"] li:nth-child(3)::first-letter { color: red; }
</style>

## A structural selector holds still

- Kilo text `codefirst` after words.
- <s>Struck</s> and Lima.
- Mike opens on a first letter.

---

<style>
/* Slide 4 only. */
section[id="4"] li:nth-child(2) { text-emphasis: dot; }
section[id="4"] ul > li:nth-child(3) { list-style: none; }
</style>

## Photo-only words keep every letter

- *Ελληνικά* opens Nova.
- Oscar carries emphasis dots.
- Papa has no bullet of its own.
  - Quebec is nested under it.

*Ελληνικά* opens Romeo.

---

<style>
/* Slide 5 only: two items the color hide cannot keep exact, so they take the old hide. */
section[id="5"] li:has(> span)::first-line { color: red; }
section[id="5"] ul:first-of-type > li:nth-child(2)::before { content: "+ "; color: inherit !important; }
section[id="5"] li li::before { content: "+ "; color: inherit !important; }
</style>

## A rollback keeps the old photo

- <span style="font-variant-caps: small-caps">Refused</span> Sierra keeps its red first line.
- Tango keeps the author's plus.

<ul><li><ul><li>Victor rolls back first.</li></ul>Uniform comes after its nested list.</li></ul>

---

<style>
/* Slide 6 only. */
section[id="6"] li:nth-child(1) { border-bottom: 6px solid rgb(220, 0, 0); }
section[id="6"] li:nth-child(2)::before { content: "W "; color: rgb(220, 0, 0); }
</style>

## A drawn border paints once

- Whiskey wears a drawn underline.
- Xray opens on the author's letter.

---

<style>
/* Slide 7 only: items whose own paints follow their color in ways the hide does not pin. */
section[id="7"] li:nth-child(1)::before { content: ""; }
section[id="7"] li:nth-child(1)::first-letter { color: rgb(0, 200, 0); }
section[id="7"] li:nth-child(2) { color: rgb(220, 0, 0); border-left: 12px solid; border-image: linear-gradient(currentcolor, currentcolor) 1; }
section[id="7"] li:nth-child(3) { color: rgb(0, 200, 0); border-bottom: 4px solid rgb(0, 0, 0); filter: drop-shadow(10px 10px 0 currentcolor); }
</style>

## Fail safe keeps main's photo

- Yankee opens on an author first letter.
- Zulu wears a border image.
- Xenon casts a drop shadow.

---

<style>
/* Slide 8 only: an inherited paint and a mask the hide must not touch. */
section[id="8"] li:nth-child(1) { color: rgb(0, 0, 200); background: rgb(255, 200, 0); -webkit-mask-box-image: linear-gradient(currentcolor, currentcolor) 0 stretch; }
section[id="8"] li:nth-child(2) { text-emphasis: dot; }
section[id="8"] li:nth-child(2) b { color: rgb(220, 0, 0); }
section[id="8"] li:nth-child(3) b { color: rgb(220, 0, 0); -webkit-text-stroke-width: 2px; }
</style>

## Inherited paints keep their own color

- Alfa sits on a masked yellow band.
- Bravo wears <b>red dotted</b> words.
- Charlie has a <b>STROKED</b> word.

---

<!-- _class: split-compare -->

`Cards`

## Card lists keep their bullets

The cards below hold plain nested items, as a split-compare slide writes them.

- Before
  - Delta one runs a manual shift
  - Echo two waits twelve weeks
- After
  - Foxtrot three runs two shifts
  - Golf four waits four weeks

---

<style>
/* Slide 10 only: an item's first letter and first line painting a currentcolor background. */
section[id="10"] li:nth-child(1) { color: rgb(220, 0, 0); }
section[id="10"] li:nth-child(1)::first-letter { background-color: currentcolor; -webkit-text-fill-color: white; padding: 0 6px; }
section[id="10"] li:nth-child(2) { color: rgb(220, 0, 0); }
section[id="10"] li:nth-child(2)::first-line { background-color: currentcolor; -webkit-text-fill-color: white; }
</style>

## A first letter's badge stays

- Hotel opens on a badge.
- Juliett runs on a red bar.
