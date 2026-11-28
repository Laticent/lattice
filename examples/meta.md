---
theme: indaco
pagination: true
header: "Lattice · slide records"
footer: "One record per slide"
---

<!-- @meta{layout=title, footer=""} -->
<!-- @note{Open on the record itself: everything a slide is told lives in one comment.} -->
<!-- @handout{Every slide in this deck sets its layout and footer with one record comment, and each note with its own. Nothing else is configured.} -->

# One record per slide

`Slide metadata · records`

A slide's settings live in one comment; each note lives in its own.

---

<!-- @meta{layout=list-steps, footer="How a record is read"} -->

## A record is read in four steps.

1. Find
   - The door finds each own-line record before anything else reads the deck.
2. Check
   - Every field is checked against the catalog; what a slide may not set is dropped.
3. Rewrite
   - One internal comment takes the same lines, so no position moves.
4. Apply
   - The engine applies the fields exactly as the old comments did.

---

<!-- @meta{layout=columns, footer="Panes take a record too"} -->

## A pane is one more field.

<!-- @meta{pane=bar} -->
### Directive comments before the cut
`by key, example and gallery decks`

- Class `3026`
- Footer `936`
- Header `166`

<!-- @meta{pane=list} -->
<!-- @note{The pane record mixes with any other field.} -->
### What a record replaces

- One comment per setting
- A speaker note that was any plain comment

> One comment, typed fields, the same pixels.

---

<!-- @meta{layout=list-steps, focus-steps="item 1 | item 2 | item 3", footer="Focus steps walk one item at a time"} -->

## Focus steps still walk the slide.

1. Light
   - Each step lights the next item, live.
2. Keep the class
   - The record's class stays on the slide.
3. Keep the footer
   - The footer rides along unchanged.

---

<!-- @meta{layout=list-steps, footer="Settings in the record, notes beside it"} -->
<!-- @note{Two paragraphs of speaker note.

The second one says the arrow --\> needs an escape inside a comment.} -->
<!-- @handout{A handout note is for whoever reads the deck alone. PowerPoint and PDF label it "Handout:" after the speaker note.} -->

## Notes sit beside the record.

1. Settings in the record
   - Layout, footer, panes and focus share one comment.
2. Notes beside it
   - Each note is its own comment, named for where it shows up.
3. Arrows escaped
   - An arrow that would end the comment gets a backslash before its last character.

---

<!-- @meta{layout=list-steps, footer="Old comments set nothing"} -->
<!-- @note{The cut: an old comment is blanked before the parse, so the slide falls back to the default layout and lint says why.} -->

## Only the record is read.

1. An old comment
   - `<!-- _class: cards -->` sets nothing; the slide renders the default layout.
2. A bare record
   - `<!-- {layout=cards} -->` sets nothing either; it needs `@meta` before the brace.
3. Lint says so
   - Each one is an error, `legacy-directive-comment` or `meta-opener-bare`, with the fix.

---

<!-- @meta{footer="One command converts a deck"} -->
<!-- @note{Run the fix once per deck. The migrated deck renders what the old one rendered before the cut.} -->

## One command converts an old deck.

```text
$ lattice migrate meta deck.md
rewrote deck.md: 12 comments → records

before   <!-- _class: cards dark -->
         <!-- _footer: Q3 review -->

after    <!-- @meta{layout=cards, class=dark, footer=Q3 review} -->
```

The same pass runs from `lattice lint --fix` and from the fix button in the Studio. A deck is never converted when it is opened.

---

<!-- @meta{layout=title, footer=""} -->

# Same slides, one grammar.

`Records · the meta record, after the cut`

Only `<!-- @meta{…} -->` sets a slide; `lattice migrate meta` converts the rest.
