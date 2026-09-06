---
marp: true
theme: indaco
paginate: true
inline-code: literal
header: "Lattice · inline-code: literal"
---

<!-- _class: title silent -->

# Some decks want none of this.

`Lattice · the off switch`

One line of front matter, and every backtick span goes back to being text.

---

<!-- _class: list takeaway -->

## Why an off switch exists.

- The pill grammar reads **every** single-backtick span in every deck.
- Zero collisions measured across our own 12,551 — but that is *our* corpus.
- A deck written elsewhere may say `[x]` in its prose and mean the characters.
- Escaping is right for one span and absurd for ninety.

---

<!-- _class: list-tabular -->
<!-- _footer: "Rendered by this deck, which sets inline-code: literal." -->

## Nothing on this slide is drawn.

1. A pill that isn't
   - Would be a capsule `{STABLE}:c2`
2. A mark that isn't
   - Would be a green disc `[x]`
3. A half mark that isn't
   - Would be an amber disc `[-]`
4. Ordinary code, unchanged either way
   - Always literal `getUserId()`

---

<!-- _class: compare-prose -->

## Two values, two behaviors.

- Rich — the default
  - Set `inline-code: rich`, or omit the key entirely. `{STABLE}:c2` draws a capsule and `[x]` draws a disc. Every deck we ship renders this way.
- Literal — this deck
  - Set `inline-code: literal`. `{STABLE}:c2` and `[x]` are characters. Nothing else changes: same theme, same layouts, same everything.

---

<!-- _class: list -->
<!-- _footer: "A typo must never silently change what a deck looks like." -->

## The value is `literal`, not `off`.

- `inline-code: off` is **not** a known value — the deck keeps drawing pills.
- `lint:deck` warns `unknown-inline-code` and names the two real values.
- The Studio writes the canonical value for you: **General · Inline pills and marks**.
- Unknown always falls to the *running* default, never to silence.

---

<!-- _class: list -->

## On a raw Marp deck, use Marp's own directive.

- Lattice cannot read front matter on a preview it never rendered.
- So the **class** is the contract, not the register.
- `class: inline-code-literal` in front matter — marp-core stamps every section.
- Careful: a slide's own `_class:` replaces the global one, and the grammar returns.

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _header: '' -->

# Your text, as you typed it.

`\[x]` keeps its backslash here — with no grammar running, there is nothing to escape.
