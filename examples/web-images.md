---
marp: true
theme: indaco
paginate: true
header: "Lattice · web images"
---

<!-- _class: title silent -->

`Feature demo · web images`

# A deck's web images wait for your say-so.

An image a deck loads from the web tells its server who opened the deck, and when. So Lattice leaves each one out until you choose to load it, and shows a placeholder where it would be. Every web address in this deck points at a site that serves nothing: what you see is exactly what a reader sees before they choose.

---

`In the flow of a slide`

## A web image becomes a placeholder, the same size a picture takes.

![The team at the offsite](https://images.example.com/offsite/team.png)

The drawn box keeps the slide's layout, and its address stays in the file for when you load it.

---

<!-- _class: image -->

`As an image slide's background`

## A background from the web becomes the same hatch.

The `image` layout reads a `![bg](…)` as its panel. From the web, the panel shows the placeholder's hatch in the deck's own colors instead of a blank.

![bg](https://images.example.com/offsite/lake.jpg)

---

`What still loads`

## Your own files are not web images.

A relative path, a file on your disk and an embedded image load as they always did. Only an address on the web waits, such as `https://…`.

![The Acme logo, a local file](../lib/base/_logo/acme-logo.svg)

---

`In the Studio`

## One strip names the sites, and one button loads them.

- The strip above the preview
  - "This deck loads 2 images from images.example.com and cdn.example.net." Load them, or leave them out.
- Remembered for this deck
  - The choice is per deck and per site. A new site asks again, and Block again takes it back.
- Never automatic
  - Your own decks are not trusted by default: a paste or an AI edit can add a web image too.

---

`In the exports and the CLI`

## Exports follow the same choice.

- Studio exports
  - A PDF, PowerPoint or image set loads what you allowed and shows the placeholder for the rest.
- The CLI
  - Every render prints one line naming what was left out. `--allow-remote` loads them.
- The player
  - A webpage export never loads a web image, so it always shows the placeholder.

---

<!-- _class: title silent -->

`Default: blocked`

# Nobody learns you opened the deck until you say so.

Load a deck's web images in one click, per deck and per site, in the Studio; or pass
`--allow-remote` to the CLI.
