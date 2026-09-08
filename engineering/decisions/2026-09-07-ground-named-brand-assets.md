---
status: shipped
summary: >
  Brand asset filenames now name the GROUND an asset goes on, not a color scheme, and a BARE NAME
  is reserved for a file that adapts. `lattice-lockup.svg` / `-dark.svg` become
  `lattice-lockup-on-light.svg` / `-on-dark.svg`, and the four Laticent lockups follow. The old
  `-dark` suffix was doing two jobs at once: naming a scheme on a file that responds to no scheme,
  and implying its bare twin was the adaptive one — which it was not. `lattice-lockup.svg` was
  fixed light-only and reads 1.086:1 on Lattice's own dark ground. Four of the six family marks
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
adaptive one, the safe pick. It was neither: it was light-only. Put it on Lattice's own
near-black `#15110D` and you get `#1E1A15` ink at **1.086:1**, which is not a
low-contrast logo, it is an invisible one. Laticent's equivalent — `#241F1B` on
`#101314` — is **1.144:1**.

An earlier revision of this record, of the changelog fragment and of the commit
message gave the lattice figure as 1.14:1. That was Laticent's number wearing
Lattice's hex: 1.14 is not reachable by `#1E1A15` on any ground, since even on
pure black it tops out at 1.214:1. The conclusion is unchanged and slightly
stronger — 1.086 is worse than 1.14 — but the measurement named the wrong file,
which is the one thing a record like this must not do.

The trap was found while auditing the Laticent brand kit, where the same pattern
had been copied wholesale from lattice: three of the kit's assets were light-only
under bare names, and a first draft of the kit's own style system asserted the
opposite before the SVGs were actually read.

## The measurement that decided the shape

Every family **mark and lockup**, audited for whether it carries a
`prefers-color-scheme` block. Laticent's two tiles and `docs/public/favicon.svg`
have no column here — the tiles because they are the rule's exceptions, discussed
below, and the favicon because it adapts and is not part of any product's trio:

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
| `laticent-tile.svg`, `laticent-tile-min.svg` | bare **and** fixed — the two exceptions |

The tiles are the exception on purpose and the reason is in the asset, not the
name: a tile carries its own ground, so it is not *for* a light or a dark surface,
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
`.tsx` or JS references a lockup. The site header and the offline page use
`lattice-mark-min.svg`, the docs config uses `favicon.svg`, and
`tools/make-pwa-icons.js` uses `lattice-mark.svg` — three different bare names,
all of them correct, because all three files genuinely adapt. The only code-adjacent reference was the repository
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

- **The renders prove less than the first draft of this record claimed.** It said
  the six renamed files were checked "under both emulated schemes". They carry no
  `<style>` and no `prefers-color-scheme` block — that is the property the rename
  asserts about them — so they render identically under either scheme and that arm
  cannot fail. What the render actually establishes is that each file reads on the
  ground its new name promises, which is the useful half; the assertion that each
  carries its ground's ink and not the other's is the arm that could have caught a
  swap, and it is a string comparison, not a render.
- **Checked against the deployed docs preview**, not just a local build —
  Cloudflare Pages built `dc862d2` at `783a9e4f.lattice-docs-5ji.pages.dev`.
  Every brand asset the live home page references returns 200
  (`/favicon.svg`, `/lattice-mark-min.svg`, `/icons/apple-touch-icon.png`), both
  renamed lockups are live at their new paths, the two old paths return 404 —
  which is the useful half, since it proves nothing is silently falling back to
  them — and none of `/`, `/comparison`, `/features`, `/cadenza`, `/lente`,
  `/suono`, `/vetrina` carries a stale lockup reference.
  **What this does NOT establish:** that the logo looks right on the rendered
  page. Headless Chromium cannot reach the preview host through this sandbox's
  egress proxy, so the check is HTTP status plus HTML inspection. Every asset
  resolves and no page points at a dead path; **a visual read of the live site
  is UNVERIFIED** (HARD RULE #23).
- **The repository README's `<picture>` uses repo-relative paths**, which npm
  rewrites against the default branch when it renders a package page. Already-published
  versions' README may therefore show a broken logo between this landing on `main`
  and the next publish. Not confirmed against npm's current rewrite behavior from
  here — flagged, not measured.
- The two older decision records that cite `lattice-lockup.svg`
  (`2026-07-18-sibling-brand-system.md`, `2026-09-02-motion-engine-bakeoff.md`)
  are dated archives of what was true when they were written. The sibling doc
  gained a one-line amendment pointer because it states the family contract; the
  bakeoff record was left alone because its sentence is a fact about a past run.
