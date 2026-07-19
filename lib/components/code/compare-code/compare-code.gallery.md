---
marp: true
theme: indaco
paginate: true
header: "Lattice · compare-code"
---

<!-- _class: title silent -->

# compare-code

`Comparison · Split · Structure`

Two fenced code blocks side-by-side, each with a label.

---

<!-- _class: compare-code -->
<!-- _footer: "Default · compare-code" -->

`Query path · report generation`

## Before and after, the diff you can read aloud.

`Before · one query per row`

```js
const signals = await db.signals.findAll();
for (const s of signals) {
  s.owner = await db.users.find(s.ownerId);
}
return signals;
```

`After · one batched join`

```js
const signals = await db.signals.findAll({
  include: { owner: true },
});
return signals;
```


---

<!-- _class: compare-code -->
<!-- stress-slide -->
<!-- _footer: "Stress test · compare-code — Two ten-line panes — the side-by-side ceiling." -->

`compare-code · stress`

## Ten lines a side is the ceiling.

`Before · at the pane budget`

```js
function beforePane(rows) {
  const out = [];
  for (const row of rows) {
    // ten lines per pane is the most
    // a side-by-side diff can hold
    // before the type drops below
    // back-row legibility
    out.push(transform(row));
  }
  return out;
}
```

`After · same budget, same shape`

```js
function afterPane(rows) {
  // the panes must stay line-comparable:
  // the eye pairs line N with line N
  // across the gutter — pad or trim
  // until the shapes align
  return rows.map(transform);
}
// past ten lines a side, split the
// comparison across two slides
```


---

<!-- _class: compare-code dark -->
<!-- _footer: "Composition: dark · compare-code dark" -->

`Query path · report generation`

## Before and after, the diff you can read aloud.

`Before · one query per row`

```js
const signals = await db.signals.findAll();
for (const s of signals) {
  s.owner = await db.users.find(s.ownerId);
}
return signals;
```

`After · one batched join`

```js
const signals = await db.signals.findAll({
  include: { owner: true },
});
return signals;
```


---

<!-- _class: compare-code compact -->
<!-- _footer: "Composition: compact · compare-code compact" -->

`Query path · report generation`

## Before and after, the diff you can read aloud.

`Before · one query per row`

```js
const signals = await db.signals.findAll();
for (const s of signals) {
  s.owner = await db.users.find(s.ownerId);
}
return signals;
```

`After · one batched join`

```js
const signals = await db.signals.findAll({
  include: { owner: true },
});
return signals;
```


---

<!-- _class: compare-code accent -->
<!-- _footer: "Composition: accent · compare-code accent" -->

`Query path · report generation`

## Before and after, the diff you can read aloud.

`Before · one query per row`

```js
const signals = await db.signals.findAll();
for (const s of signals) {
  s.owner = await db.users.find(s.ownerId);
}
return signals;
```

`After · one batched join`

```js
const signals = await db.signals.findAll({
  include: { owner: true },
});
return signals;
```


---

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · compare-code" -->

## When NOT to reach for compare-code.

- One side is prose
  - If one column is code and the other is description, use a single fenced block with surrounding prose. compare-code is for code-versus-code.
- Snippets longer than 14 lines
  - The text shrinks below readability past 14 lines per side. Split into two slides or extract the key delta into a smaller diff.
- Three-way comparison
  - compare-code is binary. For three configurations or three implementations, use prose with successive fenced blocks or a `compare-table`.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `compare-prose` — the change is state, not code
- `redline` — the comparison is prose-versus-prose
- `redline` — the change is in verbatim text or legal language
- `compare-table` — three or more variants on shared dimensions
