---
status: shipped
summary: We considered making the Frame/Cell model recursive (a content cell holding a nested frame) and rejected it — cool but useless for slides. Frame stays; the real need (two components side by side) is met by a flat split layout, itself a Frame, whose cells host components.
---

# Frame-in-cell recursion — considered and rejected

**Status:** decided 2026-06-18 — **rejected.** This note is the durable record so
the idea doesn't muddy the docs again. It started from a plain question — *the
concept map says a Frame is recursive and a Cell can hold a Frame; do we actually
have that, and do we want it?* The answer to both is **no**, and the reasoning is
worth keeping because the idea is seductive.

**Keep this distinction front of mind:** we keep **Frame**. We reject **recursive
frames inside cells**. Those are different things (see §3).

---

## 1. What we found

The recursion was **described but never built**. The vocabulary and the schema
reserved it — a Cell could declare `accepts: ["frame"]` (*"admits a nested
Frame"*), and a Frame could be `kind: "framed"` (*"docks in a content cell"*) —
but **nothing populated or ran it**:

- No Frame was ever `kind: "framed"`; every layout is `root` or `sovereign`.
- No Frame said *which* cell it nests into (there is no such field). The chrome's
  internal structure is a **flat** list of cells, not a tree.
- At render time only a frame's `id` and its "skip chrome" flag are read. The
  nesting was never executed (`design/forms.md` §11 — "validated, not executed").

So the recursion was aspirational. Sovereign frames (`split-panel`, `title`)
re-carve the slide with plain class-keyed CSS — not by nesting a frame in a cell.

## 2. Why we rejected it

The idea — *any cell can hold any frame, which holds cells, which hold frames…* —
is the elevator with mirrors facing mirrors: infinitely deep, fascinating, and
pointless. Concretely:

- **A slide is shallow by physics.** It's a rectangle someone looks at for about
  thirty seconds. Split it more than two or three times and every box is too
  small to read. The medium itself caps the depth at ~two. "Infinite" was never
  on the table.
- **Slide content isn't recursive in real life.** Folders nest because real
  folders nest; org charts nest because reporting lines nest. A chart is **not**
  "made of slides." Recursion only earns its keep when it mirrors something
  genuinely recursive in the world — and a slide's content isn't. Adding nesting
  here is decoration, not structure.
- **The one real need it seemed to serve doesn't need it.** The honest, concrete
  gap is *two components side by side* — e.g. two charts under one title, which
  Lattice genuinely **cannot** do today (one slide = one section = one component;
  the existing split/compare layouts host prose or code, not real components).
  But two charts side by side needs exactly **one** split — a frame with two cells,
  a component in each. That is depth **one**, not recursion. Recursion would only
  add the rare "a pane that itself splits again" (a dashboard), which almost no
  boardroom slide wants.

So the capability is cool, the dizziness is real, and it buys us nothing.

## 3. What we keep, and what we removed

**Keep — Frame is real and stays.** The slicer noun, the root chrome frame
(`standard`), the sovereign frames (`split-panel`, `title`, `divider`, …), and the
twelve forms are untouched. A slide still has **one** Frame: the root chrome frame,
or a sovereign frame that claims the whole canvas and suppresses the chrome. The
masthead's internal `lede · bay` and the footer's three zones also stay — those are
**fixed band layouts**, not the open recursion (a content cell never hosts a
composed frame).

**Removed — only the recursive edge:**

- the `framed` frame-kind (it *was* "a frame nested in a content cell"; genuinely
  dead — no layout used it);
- `"frame"` from the **stage** cell's `accepts` (the one spot where "content can
  recursively compose" leaked in);
- the docs/website framing that sold the recursion as the system.

The `frame` accept-kind survives **only** on the masthead/footer cells, redefined
honestly: it means *"this band's interior is a fixed sub-layout of cells"* — a
fixed split, not recursion. (It stays because, in the flat model, no tile docks
directly into a band; removing it would force a needless masthead re-model — the
exact scope creep this whole investigation argued against.)

## 4. The better solution (what to build instead, when there's demand)

> **Built 2026-09-25 as panes (proof of concept)** — the demand arrived. The render-into-half
> capability is a pane rendered as its own one-slide deck and embedded in a `pane` Cell; see
> `2026-09-25-panes-two-components-one-slide.md`.

A flat, named **split layout** — *itself an ordinary Frame*, nothing recursive —
whose cells host real components:

```
form: split-stage   → stage carved into two cells, chrome kept,
                       a real component in each cell
```

- Build it as **one hardcoded layout** (two cells), not a general recursive
  engine. You get the two-charts win for a fraction of the cost.
- The expensive part is **not** the layout or any clever authoring grammar — it's
  teaching the engine to **render a component into half a slide** (run a
  component's transform scoped to a sub-region instead of the whole section).
  That one capability is the whole game.
- **Defer it until a real deck needs it.** Until then, the honest state is: a nice
  idea, written down, not built — a perfectly good place to stop.

## 5. Where recursion could legitimately return (so we don't relitigate)

One place, and it is **not** the markdown authoring path: the internal data model
of a future **drag-to-split visual builder** (the Workbench / Drawing Board).
Direct-manipulation tools (Figma, Keynote) keep a small nestable box-tree inside
because a user can grab any region and cut it — but it's **bounded to two or three
levels and never exposed to deck authors**. Park "nestable box model" with one
sticky note: *revisit only if the visual builder needs free-form region splitting.*
That's the entire future use — a someday-tooling concern, not a slide feature.

---

## See also
- `design/forms.md` — the Form model (Frame · Cell · Tile), now stated as bounded.
- `engineering/decisions/2026-06-15-form-implementation.md` — how Form was built.
- `engineering/decisions/2026-06-16-retire-section-as-grid.md` — the sibling "we
  considered the fancier structure and chose the flat one on merit" decision.
