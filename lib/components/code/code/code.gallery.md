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
  // Twelve lines reads from the back row; twenty is the wall.
  return lines <= 12 ? 'readable' : lines <= 20 ? 'squinting' : 'split it';
}
```


---

<!-- _class: code -->
<!-- stress-slide -->
<!-- _footer: "Stress test · code — Twenty lines — the wall for one block." -->

## Twenty lines is the wall.

```js
// A stress block at the ceiling: every line still earns its place.
function stressTheFrame(lines) {
  const budget = 20;                      // the hard wall
  const readable = 12;                    // the comfort line
  if (lines <= readable) return 'fine';
  if (lines > budget) return 'split it';  // two slides beat one scroll
  // Between comfort and the wall, trim ruthlessly:
  // - drop imports and boilerplate
  // - elide with ... what the point survives without
  // - keep the line the talk is about
  const keep = ['the signature', 'the branch', 'the return'];
  return keep.join(' + ');
}
// The frame does not scroll. The audience does not squint.
// What does not fit was never the point.
```


---

<!-- _class: code dark -->
<!-- _footer: "Composition: dark · code dark" -->

## One block, syntax lit, sized to be read from the back.

```js
// The code slide holds ONE idea — a function, not a file.
function fitsOnASlide(block) {
  const lines = block.split('\n').length;
  // Twelve lines reads from the back row; twenty is the wall.
  return lines <= 12 ? 'readable' : lines <= 20 ? 'squinting' : 'split it';
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
  // Twelve lines reads from the back row; twenty is the wall.
  return lines <= 12 ? 'readable' : lines <= 20 ? 'squinting' : 'split it';
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
  // Twelve lines reads from the back row; twenty is the wall.
  return lines <= 12 ? 'readable' : lines <= 20 ? 'squinting' : 'split it';
}
```


---

<!-- _class: list -->
<!-- _footer: "Anti-patterns · code" -->

## When NOT to reach for code.

- **Comparing two versions.** If you need before/after, use compare-code — it gives both snippets parallel framing. code is for a single snippet doing one job.
- **Code-as-decoration.** A screenshot of an IDE or a snippet the audience cannot read defeats the layout. If the code is too long to legibly fit, the slide isn't a code slide — it's a content slide that talks about code.
- **No language hint.** A bare fence renders as undifferentiated mono. Always tag the language so the highlighter and the reviewer both know what they are looking at.

---

<!-- _class: closing silent -->

## See also.

`Related components`

- `compare-code` — before/after snippet comparison
- `diagram` — the architecture matters more than the code
- `math` — the equation is the argument, not the implementation
- `content` — code is one piece of a longer prose explanation
