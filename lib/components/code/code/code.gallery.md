---
marp: true
theme: indaco
paginate: true
header: "Lattice · code"
---

<!-- _class: title silent -->

# code

`Evidence · Canvas · Prose`

Single fenced code block as the slide's centerpiece.

---

<!-- _class: code -->
<!-- _footer: "Default · code" -->

## One block, syntax lit, sized to be read from the back.

```js
// The code slide holds ONE idea — a function, not a file.
function fitsOnASlide(block) {
  const lines = block.split('\n').length;
  // Ten lines reads from the back row; fourteen is the wall.
  return lines <= 10 ? 'readable' : lines <= 14 ? 'squinting' : 'split it';
}
```


---

<!-- _class: code -->
<!-- stress-slide -->
<!-- _footer: "Stress test · code — Fourteen lines — the wall for one block." -->

## Fourteen lines is the wall.

```js
// At the ceiling: every line still earns its place.
function stressTheFrame(lines) {
  const budget = 14;      // the hard wall
  const readable = 10;    // the comfort line
  if (lines <= readable) return 'fine';
  if (lines > budget) return 'split it';
  // Between comfort and the wall, trim:
  //  - drop imports and boilerplate
  //  - elide with ... what survives
  //  - keep the line the talk is about
  const keep = ['signature', 'branch'];
  return keep.join(' + ');
}
// The frame does not scroll.
```


---

<!-- _class: code dark -->
<!-- _footer: "Composition: dark · code dark" -->

## One block, syntax lit, sized to be read from the back.

```js
// The code slide holds ONE idea — a function, not a file.
function fitsOnASlide(block) {
  const lines = block.split('\n').length;
  // Ten lines reads from the back row; fourteen is the wall.
  return lines <= 10 ? 'readable' : lines <= 14 ? 'squinting' : 'split it';
}
```


---

<!-- _class: code compact -->
<!-- _footer: "Composition: compact · code compact" -->

## One block, syntax lit, sized to be read from the back.

```js
// The code slide holds ONE idea — a function, not a file.
function fitsOnASlide(block) {
  const lines = block.split('\n').length;
  // Ten lines reads from the back row; fourteen is the wall.
  return lines <= 10 ? 'readable' : lines <= 14 ? 'squinting' : 'split it';
}
```


---

<!-- _class: code accent -->
<!-- _footer: "Composition: accent · code accent" -->

## One block, syntax lit, sized to be read from the back.

```js
// The code slide holds ONE idea — a function, not a file.
function fitsOnASlide(block) {
  const lines = block.split('\n').length;
  // Ten lines reads from the back row; fourteen is the wall.
  return lines <= 10 ? 'readable' : lines <= 14 ? 'squinting' : 'split it';
}
```


---

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · code" -->

## When NOT to reach for code.

- Comparing two versions
  - If you need before/after, use compare-code — it gives both snippets parallel framing. code is for a single snippet doing one job.
- Code-as-decoration
  - A screenshot of an IDE or a snippet the audience cannot read defeats the layout. If the code is too long to legibly fit, the slide isn't a code slide — it's a content slide that talks about code.
- No language hint
  - A bare fence renders as undifferentiated mono. Always tag the language so the highlighter and the reviewer both know what they are looking at.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `compare-code` — before/after snippet comparison
- `diagram` — the architecture matters more than the code
- `math` — the equation is the argument, not the implementation
- `content` — code is one piece of a longer prose explanation
