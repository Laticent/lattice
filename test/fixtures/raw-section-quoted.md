---
theme: indaco
---

# Slide one

A deck whose body quotes the section tag in the two shapes that reach the
rendered HTML as raw markup.

---

## Slide two

<!-- a speaker note quoting <section class="title"> -->

The note above quotes an open section tag.

---

## Slide three

<style>
/* <section> quoted inside style text */
h2 { letter-spacing: 0; }
</style>

The style block above quotes an open section tag.

---

## Slide four

<div>An unterminated comment in a raw HTML block <!-- oops</div>

The line above opens a comment that never closes.
