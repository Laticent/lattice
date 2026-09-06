---
status: proposed
summary: Five candidate marks for the Laticent org, each iterated to shipping quality with mark, minimal variant and both lockups, and each put through an independent visual review. The reviews are the value here: every one of the five landed on an unintended reading that no amount of parameter tuning would have found — a papal cross, a bank-lobby arch, a chain-link fence, a carpenter's square, a Rubik's cube — and two defects turned out to be systemic rather than per-concept. Gold and slate sit at 1.23:1 on dark, so every focal element was carried by hue alone and died in grayscale; and a GitHub or Slack avatar is a circle, which was slicing the foundation off two marks. Both are now enforced in the generator (a ground-color hairline around gold, and a 54-unit safe radius checked by audit.py) rather than left to the eye. The pick itself is the owner's.
---

# Five candidate marks for Laticent

**Ask (2026-09-06, the owner, verbatim):**

> we have incredible logos for libraries and lattice. we need to create one for
> Laticent. we need to create 5 killer boardroom 10/10 designs iterated 5 times
> with the best iteration selected from each design. don't settle.

## What the parent has to do that a product mark does not

Laticent sits above Lattice, Cadenza, Lente, Suono and Vetrina. The five
products share a form language — circular, radial, one chromatic hue each,
plus a warm gold — so the parent has exactly two ways to differ, and only one
of them is cheap.

**Color is the cheap axis, and it is the right one.** The parent takes no
product hue: slate structure plus the family's shared gold. It reads as the
root rather than a sixth sibling, and it costs nothing structurally.

**Form is the expensive axis.** Every reviewer independently reported that a
parent which also abandons the family's construction idiom stops looking like
the root these five grew from and starts looking like a mark from another
company's system that happened to get the same color file. That is why the
candidates keep the family's *construction* — a haloed focal element, a
128 viewBox, one adaptive file per asset — while varying the silhouette.

## The two roots, as drawing constraints

| Latin root | What it demands |
| --- | --- |
| *latus* — broad, expansive | the surface is the widest thing in the frame |
| *latere* — the hidden bedrock | the load-bearing part recedes; it never shouts |

The second is the one that keeps getting lost, and it fails in a specific way:
**fade alone does not read as "buried."** Without a surface — a grade line, a
cut plane, something that separates above from beneath — a faded element reads
as *de-emphasized*, which is the visual grammar of a dimmed bar chart. Three of
the five candidates needed a datum line added before *latere* was true in the
geometry rather than only in the caption.

## What the review caught that iteration did not

Each concept was iterated against real renders in both schemes at 128/64/32/24
before any reviewer saw it. The iteration fixed craft. It did not find a single
one of the following, because they are all **first-second readings** — and you
cannot see the first second of a drawing you have been staring at for an hour.

| Concept | Unintended reading | Fix |
| --- | --- | --- |
| a-core | **Papal cross** — three widening bars on a centered vertical staff. The two-bar minimal variant was a Cross of Lorraine. | Move the pile off the center axis |
| b-keystone | Bank/insurance arch; and a **suono** collision at 24px (radial half-disc, gold tick at 12 o'clock) | Gold moved from the crown to the footing |
| c-substrate | **Chain-link fence**, and the hero element was the *Lattice child mark desaturated* | The grade line now cuts the cell; only the apex shows |
| d-monogram | **Carpenter's square** — the arm ran 1.44× the riser | Arm cut to ~1.06× the riser |
| e-cornerstone | **Rubik's cube** — an n×n×n grid with one off-color cell is the definition of an unsolved twisty puzzle | 3×3×2 courses, true isometry, filled top |

Two further findings were not per-concept at all.

### Gold and slate are the same value on dark

`#F6B64A` on `#9DB2BE` measures **1.23:1**. Every candidate put gold directly
against slate, so on dark the focal element — the keystone, the bearing pad,
the cornerstone — was carried by hue alone. It vanishes in grayscale, in mono
print, and for a viewer with a color vision deficiency. Light mode is fine at
3.45:1, so the defect is one-sided and invisible unless you look for it.

The fix follows the family's own idiom: the product marks already ring their
gold hub with a ground-color halo. `grect()` now fences every gold element the
same way, or the geometry places gold where it only ever meets the ground —
`a-core` draws its pile *behind* the strata, so the gold shows in the gaps and
never touches slate at all.

### A GitHub or Slack avatar is a circle

Two marks had their foundation amputated by a round crop: the grade line and
raft of `b-keystone` sat 68 units from center against a 64-unit radius. The
existing family marks all clear it (41–61), so this was a regression against a
standard the repo already met, not a new constraint.

`SAFE_R = 54` now clamps every horizontal extent, and `audit.py` measures every
painted point in every asset against both the round-avatar radius (64) and the
Android maskable safe circle (51.2). It is a script, not a judgment: the marks
that matter here are the ones nobody looks at in a circle until it is live.

## What is deliberately not settled

**The pick.** A brand mark is irreversible and externally visible, so which of
the five gets adopted is the owner's call, not this session's. All five are
drawn to shipping quality so the choice is between finished things rather than
sketches.

**Downstream adoption.** Nothing outside `design/logo/laticent/` changed. The
winning mark still needs `docs/public/` copies, PWA icons via
`tools/make-pwa-icons.js`, and the site header — all of which depend on which
one wins, and none of which should land before it does.

## Files

- `design/logo/laticent/generate.py` — all five concepts, one run
- `design/logo/laticent/audit.py` — the crop / bounding-box gate
- `design/logo/laticent/candidates/` — 20 assets (5 × mark, min, 2 lockups)
- `design/logo/laticent/README.md` — palette, rules, regeneration
