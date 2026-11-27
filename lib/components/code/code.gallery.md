<!-- @meta{layout=title, class=silent} -->

# code

`2 components`

Code — syntax-highlighted source code blocks.


---

<!-- @meta{layout=code, footer=code · code survey} -->

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

<!-- @meta{layout=compare-code, footer=compare-code · code survey} -->

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
