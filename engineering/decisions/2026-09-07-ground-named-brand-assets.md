---
status: shipped
summary: >
  Brand asset filenames now name the GROUND an asset goes on, not a colour scheme, and a BARE NAME
  is reserved for a file that adapts. `lattice-lockup.svg` / `-dark.svg` become
  `lattice-lockup-on-light.svg` / `-on-dark.svg`, and the four Laticent lockups follow. The old
  `-dark` suffix was doing two jobs at once: naming a scheme on a file that responds to no scheme,
  and implying its bare twin was the adaptive one — which it was not. `lattice-lockup.svg` was
  fixed light-only and read 1.14:1 on the brand's own dark ground. Four of the six family marks
  already conformed (their lockups adapt, so they keep a bare name); only lattice and laticent
  carried the old pair. Rename only — no artwork changed, and both generators reproduce every file
  byte-identically. The alternative, making the two lockups adaptive so the `-dark` files could be
  deleted, ships two fewer files and stays open.
companion:
  - ./2026-07-18-sibling-brand-system.md
  - ./2026-09-06-laticent-org-mark.md
---

# Names say the ground, not the scheme (2026-09-07)

## What was wrong

A brand asset can be one of two things, and the old names could not tell them apart.

An **adaptive** file carries an inline `<style>` with
`@media (prefers-color-scheme: dark)` and repaints itself from the viewer's OS
setting. A **fixed** file paints one set of colors and is correct on exactly one
kind of ground.

`-dark` named the first thing on a file that was the second. And by implication
it made the bare name — `lattice-lockup.svg` — look like the default, the
adaptive one, the safe pick. It was neither: it was light-only. Put it on the
brand's own near-black and you get `#1E1A15` ink at **1.14:1**, which is not a
low-contrast logo, it is an invisible one.

The trap was found while auditing the Laticent brand kit, where the same pattern
had been copied wholesale from lattice: three of the kit's assets were light-only
under bare names, and a first draft of the kit's own style system asserted the
opposite before the SVGs were actually read.

## The measurement that decided the shape

Every family asset, audited for whether it carries a `prefers-color-scheme`
block:

| Product | mark | mark-min | lockup |
|---|---|---|---|
| cadenza | adaptive | adaptive | **adaptive** |
| lente | adaptive | — | **adaptive** |
| suono | adaptive | adaptive | **adaptive** |
| vetrina | adaptive | — | **adaptive** |
| lattice | adaptive | adaptive | **fixed, plus a `-dark` twin** |
| laticent | adaptive | adaptive | **fixed, plus `-dark` twins** |

Four of six already did the right thing, and the sibling brand system
(`2026-07-18-sibling-brand-system.md`) had written the rule down: *"never a
second file for dark."* Lattice predates that doc, which explicitly scoped
itself out of touching the Lattice mark; Laticent then copied lattice's older
pattern. So this was never a family convention — it was two files nobody had
revisited, and one new set built from them.

That reframes the fix. The bare name already means "adaptive" for four products
and for every mark including lattice's and laticent's. Nothing needs a new
meaning; two products need to stop contradicting it.

## The rule

**The suffix names the ground the asset goes on. A bare name means the file
adapts.**

| Name | Means |
|---|---|
| `<name>-mark.svg`, `<name>-mark-min.svg` | adapts |
| `<name>-lockup-on-light.svg` | fixed color, for a light ground |
| `<name>-lockup-on-dark.svg` | fixed color, for a dark ground |
| `laticent-tile.svg` | bare **and** fixed — the one exception |

The tile is the exception on purpose and the reason is in the asset, not the
name: it carries its own ground, so it is not *for* a light or a dark surface,
it goes on any. A `-on-*` suffix would be a lie about a file that has no such
constraint. It is also fixed by design — an app-icon tile is a brand constant,
the way Facebook's `f` stays blue — which is `design/logo/laticent/README.md`
1.1, unchanged by this.

## What changed

Eight files renamed, in two directories that hold identical copies:

```
design/logo/lattice-lockup.svg              -> lattice-lockup-on-light.svg
design/logo/lattice-lockup-dark.svg         -> lattice-lockup-on-dark.svg
docs/public/  (the same two web copies)
design/logo/laticent/laticent-lockup.svg           -> -on-light.svg
design/logo/laticent/laticent-lockup-dark.svg      -> -on-dark.svg
design/logo/laticent/laticent-lockup-bare.svg      -> -bare-on-light.svg
design/logo/laticent/laticent-lockup-bare-dark.svg -> -bare-on-dark.svg
```

Both generators were updated and re-run; every SVG is byte-identical to the file
git moved, which is the check that this is a rename and not a redraw. No `.astro`,
`.tsx` or JS references a lockup — the site header, the favicon and the PWA icon
tool all use `*-mark-min.svg` and `favicon.svg`, which keep their bare names
because they really do adapt. The only code-adjacent reference was the repository
`README.md`'s `<picture>` element, which now points at both new names.

## What was NOT done, and why it stays open

**Making the two fixed lockups adaptive** would satisfy the sibling doc's "never
a second file for dark" literally, delete two files per product, and give lattice
and laticent a bare `*-lockup.svg` like their four siblings have. It is the
smaller end state.

It was not taken here because it is an artwork change, not a rename: the lockups
would need color classes and a `<style>` block, and for Laticent that block has a
known hazard — an inline `<svg><style>` in an HTML document is *document*-scoped,
so two Laticent assets on one page already collided once and painted the
light-mode mark at 1.99:1 (`2026-09-06-laticent-org-mark.md`). Adding a fifth
styled asset to that set wants its own measurement, not a drive-by.

The rename is strictly an improvement either way: if the lockups later become
adaptive, `-on-light` / `-on-dark` are simply deleted and the bare name appears,
with no third meaning to unwind.

## Ledger

- Nothing here has been checked in a browser against the live docs site; the
  claim is that no site code references a lockup, which is a grep, and that the
  generators reproduce the renamed files, which is a byte comparison. Both are
  in the PR. **A rendered docs-site page is UNVERIFIED** (HARD RULE #23).
- The two older decision records that cite `lattice-lockup.svg`
  (`2026-07-18-sibling-brand-system.md`, `2026-09-02-motion-engine-bakeoff.md`)
  are dated archives of what was true when they were written. The sibling doc
  gained a one-line amendment pointer because it states the family contract; the
  bakeoff record was left alone because its sentence is a fact about a past run.
