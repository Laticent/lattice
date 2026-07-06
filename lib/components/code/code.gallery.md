<!-- _class: title silent -->

# code

`2 components`

Code — syntax-highlighted source code blocks.


---

<!-- _class: code -->
<!-- _footer: "code · code survey" -->

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

<!-- _class: compare-code -->
<!-- _footer: "compare-code · code survey" -->

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
