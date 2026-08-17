---
status: shipped
summary: >
  The component catalog cost 95k tokens to read and HARD RULE #6 makes reading it
  mandatory before every _class: slide, so it was the most-repeated read in the repo
  — while AGENTS.md itself said the file is only for PICKING and the authoring detail
  belongs in each component's docs.md. A one-line-per-component pick list (3k tokens)
  now carries what a pick needs; components.json is untouched for the tools that read
  it. Third application of the index-tiering rule, and the one with the highest hit rate.
---

# The component pick surface — 95k tokens to choose one of 61

## Symptom

`2026-08-17-context-index-tiering.md` fixed the two most expensive *routed-to* reads
and logged the bigger fish: `dist/docs/components.json` at **95,382 tokens**, which
both `CLAUDE.md` and `AGENTS.md` point agents at, with `AGENTS.md` describing it as
"one read gives you every component's axes, search tags, slots, authoring skeleton…".

It fires more often than either file that was already fixed. **HARD RULE #6 makes a
component lookup mandatory before authoring any `<!-- _class: X -->` slide** — a
per-slide cost in a slide-deck engine, against a symptom search that fires only when
something breaks.

The sharpest evidence is that the repo already knew the shape of the answer.
`AGENTS.md` says, verbatim:

> `components.json` is for *picking*; each component's generated
> `lib/components/<bucket>/<name>/<name>.docs.md` is for *authoring inside* the one
> you picked.

The file it points at carries both. Choosing one of 61 components meant reading all 61
components' slots, skeletons, effective variants and anti-pattern prose.

## Cause

Same as the two before it: **one artifact serving two jobs, sized for the larger one.**
`components.json` is a faithful projection of the manifests — nothing in it is wrong or
stale, and its `--check` gate has always held. It is simply the union of what a *tool*
needs and what an *author* needs, read by an agent that needed neither in full.

Measured, four fields carry 58% of the file:

| field | bytes | read by app code? |
|---|---:|---|
| `effectiveVariants` | 44,079 | no |
| `whenToUse` | 43,254 | no |
| `slots` | 39,524 | no |
| `antiPatterns` | 39,367 | no |

"Read by app code" was checked, not assumed: the Studio's `SlidePicker.tsx` reads
`name`, `bucket`, `description`, `purpose`, `form`, `function`, `substance`, `tags`,
`variants`, `skeleton`; `deck-export.js` reads `name`/`description`; `lente/suggest.ts`
reads `name`/`form`/`function`/`bucket`/`tags`; the playground bundle contains zero
references to `effectiveVariants` or `slots`. The docs-site component pages render
`whenToUse`/`antiPatterns` from the **manifests directly** (`lib/components/index.js`
`loadAll()`), not from this file. And all 61 per-component `.docs.md` files carry
Slots / When-to-use / Anti-patterns — the detail is already at L2, where #6 sends you.

## Fix

A fourth projection from the same generator: **`dist/docs/components.pick.md`**, one
line per component, **3,139 tokens** for the whole catalog — a **30× cut** on the
mandated read.

Each row carries exactly what a pick needs and nothing else: name, bucket, the three
axes, search tags, the **effective** `capacity` as `axis:sweet/soft/hard` with its
escalation target, and a one-line purpose. Capacity rides along because `AGENTS.md`
requires counting content against it *before* committing to a component — a pick
surface missing it would just add a hop.

**`components.json` is untouched.** It is a projection that tools consume, not a
document to trim, and shrinking it would have risked the Studio for no gain. What
changed is the routing: `AGENTS.md` and `CLAUDE.md` now send *picking* to the pick
list and say plainly not to load the full catalog to choose.

One line per component also makes the catalog **greppable** — `grep -i comparison`
returns rows, where the JSON needed a structured walk.

## What this confirms about the rule

Three applications now, and the same shape every time: **an artifact that serves two
jobs gets sized for the larger one, and the cheaper job silently pays.** The fix is
never to delete the detail — it is to give the cheap job its own surface and route to
it.

The pick list lands at 3k against the ~10k index budget, comfortably inside, which is
worth stating after the decisions index missed that budget by 2.6×. The difference is
what the row has to carry: 411 decision notes need a sentence each to be
distinguishable; 61 components are distinguishable by name, axes and tags.

A test pins the size (`build-pick-list.test.js` fails past 24 KB) so the pick list
cannot quietly become a document — the exact failure mode this rule exists to catch.

## Deliberately not done

- **`components.json` was not pruned.** Four fields totaling 58% of it are read by no
  code, so pruning is available and tempting. It stays because the file is a published
  machine surface (the LFM spec names it, `sync-playground-assets.mjs` ships it into
  the playground bundle), and a consumer outside this repo would break silently. The
  pick list makes the size irrelevant to agents, which was the actual problem.
- **The 62 `*.docs.md` files (105k tokens combined) are untouched.** Nobody reads them
  in bulk — #6 sends you to exactly one, which is already the right shape.

## Removable when

Never — structural, like its predecessor. If a future field turns the pick list into a
document, the size test fails first, and the answer is to tier again rather than to
raise the ceiling.
