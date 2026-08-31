---
status: shipped
summary: >
  Saved themes could be reopened for editing; saved components and finishes could
  not, though their records already carried everything an editor needs. Closing
  that gap surfaced a latent defect underneath it: neither the component nor the
  finish save passed the record's `id`, so `putAsset` fell back to `(kind, name)`
  dedupe and any rename FORKED the record instead of updating it — leaving every
  deck naming the old asset pointed at an orphan. The component save made this
  hard to see, because it already passed `historyLabel: 'Before edit'` and so read
  as an edit while behaving as a create. Both are now id-pinned. Fixing the UI
  also exposed a measured layout clip in the docked Library that predated this
  change and had never been visible to any oracle in the repo.
tags: [studio, library, assets, indexeddb, versioning, responsive]
---

# Reopening a saved asset (2026-08-31)

## What was actually missing

Three kinds live in the shared IndexedDB asset shelf and are versioned:
`theme`, `component`, `finish` (`VERSIONED_KINDS`, `library/asset-store.js:71`).
Only themes could be reopened. The gap was not in the data — the records already
carry the whole draft:

| Kind | What the record holds | What an editor needs it for |
|---|---|---|
| theme | `text` (the stylesheet), `essentials`, `overrides`, `rampStrategy` | the hand-edit record + the pickers |
| component | `text` (CSS), `skeleton`, `manifest` | all three panes of the Component faculty |
| finish | `recipe` (the five layers) | the whole faculty — its CSS is a projection |

`toStudioComponent`'s `toMeta` mapper had even been written *for* this, and says
so in its own docblock: the manifest "breaks the moment a component can be
REOPENED for editing." So the plumbing was done and only the door was missing.

## The defect under the missing feature

`putAsset` (`library/asset-store.js:187`) decides overwrite-vs-create on one
thing: whether the record carries an `id`.

```js
if (record.id) { write(record.id); return; }        // blind overwrite — rename-safe
// …otherwise resolve by (kind, name); match overwrites, no match creates
```

The theme save passed an id. **Neither the component save nor the finish save
did.** So for those two kinds, "editing" a saved record and changing its name
wrote a *second* asset and left the original in the shelf — with every deck
saying `_class: <old name>` or `finish: <old name>` still resolving to the
untouched original.

The component branch is the one worth remembering, because it looked correct:

```js
// before
saveStudioComponent({ name: compName, … }, { historyLabel: 'Before edit' })
```

It passed a history label naming the edit case, which is exactly what the theme
branch does, while passing no id — so it *read* as an edit and *behaved* as a
create. The finish save passed neither, so an edit also took no version snapshot
and there was nothing in "Earlier versions" to go back to.

This was not reachable before, which is why it never bit: with no reopen path,
no save ever carried a stale name to rename away from. Adding the door is what
made the bug live, so it is fixed in the same change rather than filed (HARD
RULE #18).

**Proved by mutation, not by reading.** `library-reopen.spec.ts` seeds a record
through the app's own Save, reopens it, renames it, saves, and counts the cards.
Removing the two `id` spreads and rebuilding turns exactly the two no-fork tests
red and leaves the two reopen tests green — so those tests measure the id pinning
and nothing else.

## Three shapes that are NOT symmetric, and must not be flattened

1. **A finish rename is one field; a component rename is three.** `compFindings`
   gates Save on `skeletonInvokes(compSkeleton, compName)` *and* on every
   `gateCss` selector still scoped to the old name. So renaming a component means
   the name, the skeleton's `<!-- _class: -->` and every CSS selector, or Save
   stays disabled. That is correct — a component whose CSS still says
   `section.callout` would leak onto other slides — but it means a one-click
   component rename belongs in the **Library**, where all three can be rewritten
   together, and is why this change does not claim to have delivered rename.

2. **`FinishStudio.name` holds the LABEL, not the slug** (the slug is derived by
   `safeFinishSlug`). The seed therefore sets `setName(record.label)`. Seeding it
   with `record.name` would round-trip a slug through the slugifier and quietly
   re-title the finish on the next save.

3. **A finish's CSS is regenerated from its recipe on every save**
   (`finish-library.ts:80`), so the recipe is the model and there is nothing else
   to restore. A theme's hand-edited bytes ARE the record, which is why its seed
   effect is the complicated one.

## What the independent checker found, and it was most of the value

Maker-checker (HARD RULE #25) ran over the first draft of this change and returned
six findings, four of them confirmed against the real Studio rather than by
reading. Three were defects the change itself had introduced, which is the case
the ladder exists for:

| Finding | What it actually was |
|---|---|
| **The finish faculty had no name-collision guard** | The theme and component faculties refuse a rename onto another record's name; the finish one did not — and the id pin is what made that reachable. Measured: two live `navy` records, one slug. Worse than untidy: the shell resolves the active finish by name and takes the newest, while `finishExtraCss` concatenates BOTH `section.finish.finish-navy` rules with the older one last, so the Inspector shows one recipe and the preview renders the other. The changelog fragment claimed collisions were refused; it was wrong. |
| **A fresh AI generate after a reopen would overwrite the reopened record** | The component branch replaces the name outright on a bare generate and nothing cleared `compEditingId`, so an unrelated generated component saved over the record you had opened. Before the id pin the same save created a second record — a hazard the pin introduced and had to close. Theme and finish avoid it only by accident, because both keep an existing name. |
| **The Edit button re-introduced the clip this change set out to fix** | See below. |
| **`@[31rem]` could never fire** | `PANEL_MAX = 420`; the query asked for 496px. Right outcome, unreachable branch, and a comment describing a two-column docked state that cannot occur. |
| **A finish whose label does not slugify back to its name is renamed by reopen + save** | `{ name: 'corporate-blue', label: 'Corporate Blue v2' }` — a shape the zip import passes through verbatim — reopened and saved as `corporate-blue-v2`. Every deck saying `finish: finish-corporate-blue` stops resolving, silently, with the author having renamed nothing. |
| **Reopening a zip-imported component is a dead Edit** | The import drops `function`/`form`/`substance` from the manifest, so `validateManifest` fails and Save is disabled with three findings. **Not fixed here** — see "Deliberately not in this change". |

The fifth is the one worth generalizing from: the seed effect's docblock had
argued carefully for seeding the label rather than the slug, and was right about
the direction it considered and silent about the opposite one. A comment that
reasons about one direction of a round trip is evidence about that direction
only.

## The clip the change had to fix on the way

The docked Library's card grid was `grid-cols-1 sm:grid-cols-2` — a **viewport**
breakpoint — while the docked panel is a ~270px column that is nearly always on a
≥640px screen. It therefore took two columns of 125px, and a four-control action
row overflowed its own box by **~110px**: Share and Delete rendered, reported
themselves visible, and sat behind the card's edge.

Measured at 1440 in the docked panel, before: row 216px inside a 105px box, on
all three kinds.

**The first fix was half of one, and the checker measured the other half.** The
docked panel is not a fixed column — it is DRAGGABLE between `LIB_MIN = 240` and
`PANEL_MAX = 420`. Two consequences the first draft missed:

- Two 236px cards plus a 12px gap need 484px, and the panel tops out at 420. So
  there is no width at which the docked answer is two columns, and the container
  query asking `@[31rem]` (496px) was a branch that could never be true. It is
  now simply `grid-cols-1` when docked, which is the honest statement.
- At the 240px **minimum**, the four-control row still overflowed by **31px**
  (185px box, 216px row) — and hiding the new Edit control took it to 0 on all
  three kinds. The fourth control is what tipped it, so it is this change's to
  fix. The Share label now collapses to its icon below `@[20rem]`, the same
  threshold and the same idiom the Import button above it already uses.

After: **0px overflow at 1440 / 820 / 390 AND at both ends of the drag range**,
on all three kinds.

Two things about it are worth recording:

- **It predated this change.** The theme card has carried four controls since
  #1850 and clipped exactly this way. Adding Edit to components and finishes
  spread the same clip to two more kinds, which is what turned a pre-existing
  nick into this change's business rather than a note.
- **Nothing in the repo could see it.** Every overflow oracle here reads the
  *header's* `scrollWidth` (`check:overflow`, `studio-header-fit.spec.ts`), and
  this is a card inside a panel; jsdom has no layout, so the unit tier cannot
  measure a box at all. `library-card-fit.spec.ts` measures the row against its
  own card in a real browser, which is the only oracle that exists for this shape
  (HARD RULE #23). It is the same failure mode as the deck pill in #1417: the
  element engineered to absorb the pressure is the one that breaks silently.
- **A spec that says "at every width" has to visit the width that varies.** The
  first version of that spec iterated 1440 / 820 / 390 — VIEWPORT sizes — and
  passed while the invariant it names was false, because the docked panel's own
  width is set by a drag handle no viewport size can reach. It now drags the
  panel to both stops and asserts the two ends actually differ, so a silent
  no-op drag cannot let it pass at the default width forever. Both arms are
  mutation-proved: restoring the Share label reproduces 31px at a 185px card on
  the drag arm, and leaves the viewport arm green.

Every other responsive control in that panel already switched on `docked` + a
container query (the Import label at `@[20rem]`, the status breakdown at
`@[18rem]`), and `LibraryFrame` has made the docked column an inline-size
container all along. The card grid was the one that never got the memo.

## Deliberately not in this change

- **Rename with a deck rewrite.** `asset-rename.ts` is a complete, tested, pure
  kernel — `renameAssetInSource` / `renameAssetAcrossDecks`, twelve tests,
  including one pinning that `finish-override:` is keyed on LAYER names
  (backdrop/wash/mark/edge) and must NOT be moved by a rename. It still has **zero
  production callers.** Wiring it needs a driver over `studio-store.ts`'s
  localStorage deck index and a confirmation surface that shows the author how
  many decks a rename will rewrite *before* it runs — plus, per shape 1 above, the
  component's own CSS and skeleton. That is its own change.
- **Motion scenes.** `scene` is excluded from `VERSIONED_KINDS` and has no Library
  card at all (#1678). Giving one kind Edit before it has a card would ship half a
  set of actions.
- **A usable Edit on a zip-imported or workspace-restored component.** Confirmed
  by the checker and left standing, deliberately. `Library`'s import writes
  `meta: { bucket }` and `workspace-backup` writes no meta at all, so both drop
  `function` / `form` / `substance`; the reopen path seeds `compMeta` from that
  record and `validateManifest` then fails Save with three findings. The
  underlying loss is PRE-EXISTING and off the path of this change (HARD RULE
  #18's on-path/off-path rule), and the two available fixes are both worse than
  the gap: back-filling from `STARTER_META` would invent a classification and
  persist it as if the author had chosen it, and suppressing the gate for
  imported records would let an under-specified component into the catalog. The
  findings panel already names the three fields to fill in, so the round trip
  completes — it just is not one click. Fixing it properly means the IMPORT
  carrying the manifest, which is where the bytes are lost.
