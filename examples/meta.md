---
theme: indaco
paginate: true
header: "Lattice · slide records"
footer: "One record per slide"
---

<!-- {layout=title, footer=""}
note: |
  Open on the record itself: everything a slide is told lives in one comment.
reader: |
  Every slide in this deck sets its layout, footer and notes with one record comment. Nothing else is configured.
-->

# One record per slide

`Slide metadata · records`

A slide's layout, footer and notes live in one comment.

---

<!-- {layout=list-steps, footer="How a record is read"} -->

## A record is read in four steps.

1. The door finds each own-line record comment before anything else reads the deck.
2. It checks every field against the catalog and drops what a slide may not set.
3. It writes one internal comment on the same lines, so no position moves.
4. The engine applies the fields exactly as the old comments applied them.

---

<!-- {layout=columns, footer="Panes take a record too"} -->

## A pane is one more field.

<!-- {pane=bar} -->
### Directive comments today
`by key, example and gallery decks`

- Class `3026`
- Footer `936`
- Header `166`

<!-- {pane=list, note="The pane record mixes with any other field."} -->
### What a record replaces

- One comment per setting
- A separate speaker-note comment

> One comment, typed fields, the same pixels.

---

<!-- {layout=list-steps, focus-steps="item 1 | item 2 | item 3", footer="Focus steps walk one item at a time"} -->

## Focus steps still walk the slide.

1. Each step lights the next item, live.
2. The record's class stays on the slide.
3. The footer rides along unchanged.

---

<!-- {layout=list-steps, footer="Long text goes in a block"}
note: |
  Two paragraphs of speaker note.

  The second one says the arrow --\> needs an escape inside a comment.
reader: |
  A reader note is for whoever opens the file. PowerPoint and PDF label it "Reader:" after the speaker note.
-->

## Notes go inside the same comment.

1. A note field is the speaker note, for the presenter.
2. A reader field is for whoever opens the exported file.
3. An arrow that ends a comment gets a backslash before its last character.

---

<!-- {layout=title, footer=""} -->

# Same slides, one grammar.

`Records · step 2 of the meta record`

Directive comments still work; the next steps retire them.
