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

## The clip the change had to fix on the way

The docked Library's card grid was `grid-cols-1 sm:grid-cols-2` — a **viewport**
breakpoint — while the docked panel is a ~270px column that is nearly always on a
≥640px screen. It therefore took two columns of 125px, and a four-control action
row overflowed its own box by **~110px**: Share and Delete rendered, reported
themselves visible, and sat behind the card's edge.

Measured at 1440 in the docked panel, before: row 216px inside a 105px box, on
all three kinds. After, switching on the panel's own inline size at `@[31rem]`:
**0px overflow at 1440 / 820 / 390, on all three kinds.**

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
