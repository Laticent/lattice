---
marp: true
theme: indaco
stamp-shape: seal
tone: rail
pagination: true
header: "Lattice · status markers"
---

<!-- @note{Status markers are a SHAPE SYSTEM. A state marker (confidential / wip / …) sets a
     label + palette color; a tone marker (tone-pass / …) sets a color. The deck-wide
     `stamp-shape:` / `tone:` registers pick the SHAPE both render in — once, for the whole
     deck — and a per-slide `stamp-shape-*` / `tone-*` token overrides. This deck seals its
     state markers and rails its tones by default, then overrides a few slides to show
     the range. Every color is a palette token, so the markers are on-brand by theme.} -->

<!-- @meta{layout=title, class=pinned} -->

`A feature demo`

# Status markers, on brand

One shape system for every meta-signal: the marker says **what**, the deck-wide
register says **what shape**. Set it once, override anywhere.

---

<!-- @meta{layout=big-number, class=confidential} -->

`State markers`

- 8
  - state markers — Confidential, WIP, Draft, TBD, Redacted, Archived, Pinned, Revised — each with its own label and palette color.

---

<!-- @meta{layout=content, class=wip} -->

## The default shape is a coherent family

Set nothing and every state marker renders in this deck's `stamp-shape: seal` — the
uniform corner seal — so a mixed-marker deck reads as one hand, not eight
competing signatures. This slide is **WIP** in that same seal.

---

<!-- @meta{layout=cards-grid, class=draft stamp-shape-notch} -->

## Override one slide's shape

- Same marker, different shape
  - Still **Draft**, but wearing `stamp-shape-notch` — a top hairline band — not the deck seal.
- The marker never changed
  - Only the shape token did; the label and `--warn` color are identical.
- Boardroom subset first
  - `tab` · `notch` · `bracket` · `seal` · `pill`, then a wider range.

---

<!-- @meta{layout=content, class=redacted stamp-shape-bracket} -->

## Bracket is the quiet technical tag

`stamp-shape-bracket` frames the label as `[ REDACTED ]` with no fill — the
monospaced option for engineering and legal decks. The same marker-blind rule
serves every state; only the shape token changes.

---

<!-- @meta{layout=content, class=tone-pass} -->

## This quarter cleared every bar

Uptime held at **99.98%**, net revenue retention rose to **+18%**, and the
quarter closed with **zero** Sev-1 incidents. The tone marker sets the color
(`--pass`); the deck `tone: rail` sets the shape.

---

<!-- @meta{layout=content, class=tone-fail tone-glow} -->

## Two Sev-1 incidents are still open

CSAT slipped **4 points** this week and the primary region breached its SLA.
`tone-fail` sets the `--fail` color; `tone-glow` overrides the deck rail with a
full inset ring, so this alert slide reads apart from the quiet default.

---

<!-- @meta{layout=content, class=tone-warn tone-edge} -->

## `tone: edge` recolors the brand bar

Instead of a competing top band, `tone-edge` **recolors the spectrum itself** —
the top bar above is now solid `--warn`, not the rainbow. It respects the
brand frame rather than fighting it, the same move `accent` makes.

---

<!-- @meta{layout=content, class=pinned tone-pass} -->

## Both axes compose without collision

This slide is **Pinned** (a state marker, `--accent`, in the deck seal) **and**
carries a **pass** tone (`--pass`, the deck rail) at once — the state mark and
the tone band never overlap, by construction. One vocabulary, two signals.

---

<!-- @meta{layout=closing, class=revised} -->

# Set it once, override anywhere

`stamp-shape:` + `tone:` in front matter, a token per slide — every marker on brand.
