---
marp: true
theme: indaco
stamp: seal
tone: rail
paginate: true
header: "Lattice · status markers"
---

<!-- Status markers are a SHAPE SYSTEM. A state marker (confidential / wip / …) sets a
     label + palette color; a tone marker (tone-pass / …) sets a color. The deck-wide
     `stamp:` / `tone:` registers pick the SHAPE both render in — once, for the whole
     deck — and a per-slide `stamp-*` / `tone-*` token overrides. This deck seals its
     state markers and rails its tones by default, then overrides a few slides to show
     the range. Every color is a palette token, so the markers are on-brand by theme. -->

<!-- _class: title pinned -->

`A feature demo`

# Status markers, on brand

One shape system for every meta-signal: the marker says **what**, the deck-wide
register says **what shape**. Set it once, override anywhere.

---

<!-- _class: big-number confidential -->

`State markers`

- 8
  - state markers — Confidential, WIP, Draft, TBD, Redacted, Archived, Pinned, Revised — each with its own label and palette color.

---

<!-- _class: content wip -->

## The default shape is a coherent family

Set nothing and every state marker renders in this deck's `stamp: seal` — the
uniform corner seal — so a mixed-marker deck reads as one hand, not eight
competing signatures. This slide is **WIP** in that same seal.

---

<!-- _class: cards-grid draft stamp-notch -->

# Override one slide's shape

- Same marker, different shape
  - Still **Draft**, but wearing `stamp-notch` — a top hairline band — not the deck seal.
- The marker never changed
  - Only the shape token did; the label and `--warn` color are identical.
- Boardroom subset first
  - `tab` · `notch` · `bracket` · `seal` · `pill`, then a wider range.

---

<!-- _class: content redacted stamp-bracket -->

## Bracket is the quiet technical tag

`stamp-bracket` frames the label as `[ REDACTED ]` with no fill — the
monospaced option for engineering and legal decks. The same marker-blind rule
serves every state; only the shape token changes.

---

<!-- _class: content tone-pass -->

## This quarter cleared every bar

Uptime held at **99.98%**, net revenue retention rose to **+18%**, and the
quarter closed with **zero** Sev-1 incidents. The tone marker sets the color
(`--pass`); the deck `tone: rail` sets the shape.

---

<!-- _class: content tone-fail tone-glow -->

## Two Sev-1 incidents are still open

CSAT slipped **4 points** this week and the primary region breached its SLA.
`tone-fail` sets the `--fail` color; `tone-glow` overrides the deck rail with a
full inset ring, so this alert slide reads apart from the quiet default.

---

<!-- _class: content tone-warn tone-edge -->

## `tone: edge` recolors the brand bar

Instead of a competing top band, `tone-edge` **recolors the spectrum itself** —
the top bar above is now solid `--warn`, not the rainbow. It respects the
brand frame rather than fighting it, the same move `accent` makes.

---

<!-- _class: content pinned tone-pass -->

## Both axes compose without collision

This slide is **Pinned** (a state marker, `--accent`, in the deck seal) **and**
carries a **pass** tone (`--pass`, the deck rail) at once — the state mark and
the tone band never overlap, by construction. One vocabulary, two signals.

---

<!-- _class: closing revised -->

# Set it once, override anywhere

`stamp:` + `tone:` in front matter, a token per slide — every marker on brand.
