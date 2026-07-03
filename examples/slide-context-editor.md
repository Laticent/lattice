---
marp: true
theme: indaco
paginate: true
header: "Lattice · This slide"
---

<!-- _class: title silent -->

`Feature demo · the "This slide" drawer`

# Craft, one slide at a time.

Every treatment on the slides that follow is a single click in the Studio's
**This slide** drawer — no hand-writing directive comments.

<!-- note: The drawer edits the active slide's _class token list span-surgically. -->

---

<!-- _class: content -->

## What the drawer edits

- Look
  - Dark canvas, type scale, and a per-slide finish backdrop.
- Status
  - A collaboration stamp, and a pass / warn / fail tone.
- Decoration and chrome
  - A tint or mark treatment; hide the header, footer, or page number.

The line under each control shows the exact `_class` it writes — so the drawer
teaches the markdown while you click.

---

<!-- _class: content dark -->

## Dark is a click — and honest

This slide carries `dark`. When the **deck** is dark, the drawer reads the
toggle as *inherited* rather than a broken "off" — the state always tells the
truth, because it mirrors how the engine composes deck-wide and per-slide
classes.

---

<!-- _class: content tone-fail -->

## Tone marks the failure slide

`tone-fail` reuses the status-token color system at the canvas level. One click
in the drawer; the whole slide reads as the thing that went wrong.

---

<!-- _class: content confidential -->

## State stamps ride with the slide

`confidential` is the team-collaboration vocabulary — a meta-signal independent
of the content. Stamp it in the drawer; it stays in the markdown and exports
with the deck.

---

<!-- _class: content scale-l tint-edge at-right -->

## Scale and decoration

This slide bumps the type scale (`scale-l`) and adds an edge tint
(`tint-edge at-right`). Decoration is a treatment plus a placement — the drawer
composes both tokens for you, and never stacks two tints.

---

<!-- _class: content finish-atrium -->

## A per-slide finish

`finish-atrium` overrides the deck's backdrop for this one slide. Choose
*Inherit*, *None*, or any preset (or a finish you saved) from the drawer's
finish picker — it clears any prior finish so backdrops never stack.

---

<!-- _class: closing -->

# One drawer, the whole slide.

Note, look, status, decoration, chrome — context-sensitive, validity-aware, and
always written as canonical markdown you can read back.

`lattice.style`
