---
marp: true
theme: indaco
size: 4k
---

# A 4K deck in the exported player

The player lays it out on the canvas the screen shows: HD on a phone or a tablet, 4K on a 4K display.

---

## Why the canvas follows the screen

- WebKit pays every layer in a slide at the slide's own box, times the density squared
- A 4K frame on an iPhone reloaded the tab
- Text and vectors are drawn at the screen's density whatever the box

---

## What stays the same

- The deck still says `size: 4k`
- PDF, PowerPoint and image exports render at 4K
- A 4K display presenting full screen keeps 4K

---

## What the probe checks

- The slide is laid out 1280 px wide on this screen
- Swiping through the deck keeps that canvas
- The page never reloads

---

## The last slide

Five slides, swiped through on a phone.
