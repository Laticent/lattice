---
marp: true
theme: indaco
paginate: true
header: "Lattice · deck-wide class tokens"
footer: "Feature deck"
finish: atrium
class: no-note
---

<!-- _class: title finish-none -->
<!-- _header: '' -->
<!-- _paginate: false -->

# A deck-wide token reaches every slide

`class: · _class: · the resolved list`

Including the slides that name a class of their own.

---

<!-- _class: content -->

## This deck declares `class: no-note` once, in front matter.

- Written once
  - The token is in the front matter and nowhere else. No slide in this deck repeats it.
- Read everywhere
  - This slide names `_class: content`, and the deck's token still arrives — which is the part that did not work.

Every slide you are about to see inherits it the same way.

---

<!-- _class: content -->

## A section carries the class information twice.

```html
<section id="1" data-class="content" class="content no-note form">
```

- `data-class`
  - The raw `_class:` payload, mirrored from marp-core. It holds what the author typed on this one slide.
- `class`
  - The resolved list: the deck-wide `class:` register merged in, plus `form`, the default component, any finish or mode.

Only the second is the truth, and it is the one a transform must read.

---

<!-- _class: content -->

## `data-class` comes first, so the careless read wins.

| Pattern | Reads | Correct |
|---|---|---|
| `/class="([^"]*)"/` | `content` | no — leftmost match is `data-class` |
| `/\bclass="([^"]*)"/` | `content` | no — `-`→`c` is a word boundary |
| `/\sclass="([^"]*)"/` | `content no-note form` | yes |

A transform reading the first two saw the author's payload and none of the deck's tokens.

---

<!-- _class: content -->

## Two transforms shipped reading it that way.

- Below-note
  - `class: no-note` did nothing on any slide naming its own `_class:`. The opt-out looked applied and was not.
- Image structure
  - `class: image` plus `_class: dark` built no `.image-text` panel — and the DOM path, which reads `className`, built it. The two render paths disagreed.

Both read one attribute earlier in the tag than they meant to.

---

<!-- _class: content -->

## This slide names its own `_class:`, and stays body copy.

- A note is a footnote
  - A short paragraph after a list or a table gets a hairline rule and muted ink.
- A conclusion is not
  - "A list, then a concluding sentence" is ordinary prose, and promotion changes what it meant.

Before the fix this paragraph carried a hairline rule, because the slide named `content` and the deck's `no-note` never reached the transform.

---

## This one names no class at all, and matches it.

- A note is a footnote
  - A short paragraph after a list or a table gets a hairline rule and muted ink.
- A conclusion is not
  - "A list, then a concluding sentence" is ordinary prose, and promotion changes what it meant.

This slide always worked. The point of the fix is that the slide above it now looks the same.

---

<!-- _class: closing finish-none -->
<!-- _header: '' -->
<!-- _paginate: false -->

`Where The Fix Lives`

## One reader, and a gate that keeps it the only one.

`readClassAttr, and a build:check that fails the unguarded regex.`
