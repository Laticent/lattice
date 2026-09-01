---
status: shipped
summary: >
  All four manifest families (61 components, 33 themes, 12 frames, 10 cells, 15 tiles)
  already shipped a JSON Schema beside them, and all five already declared
  `additionalProperties: false` — but nothing in the repo ran a JSON-Schema validator, so
  each family grew its own hand-written checker at a different strength. Forms never read
  its schemas at all: renaming the optional `slicing` block on the `standard` frame to
  `slicng` returned zero errors from every checker in the repo, silently deleting the
  frame's whole responsive behavior. Fixed with one shared gate, `tools/manifest-schemas.js`,
  running ajv (devDependency, tools/-only so no schema JSON reaches a browser bundle) over
  a registry of all five families, inside the existing `check-ownership.js` — no new CI job,
  step, or git hook. Three arms: coverage (a manifest no family claims), shape (nested
  fields included), and self-reference (each manifest's `$schema` resolves to its own
  contract). ajv `strict` adds a fourth catch free — a typo'd keyword in a schema file.
  On its first run it found three component manifests carrying undeclared fields two levels
  down in `adapt.capacity`, invisible to the flat top-level check; both fields were
  legitimate and are now declared. Schemas stay beside their manifests (the relative
  `$schema` link is what gives editors inline completion). themes/theme.schema.json moved
  draft-07 -> 2020-12.
---

# One JSON-Schema gate over every manifest family

**Date:** 2026-09-01
**Status:** landed
**Touches:** `tools/manifest-schemas.js` (new), `tools/check-ownership.js`,
`lib/components/manifest.schema.json`, `themes/theme.schema.json`,
`test/unit/tools/manifest-schemas.test.js`

## The question

"Our manifest JSON files should have a JSON schema. Where should these live?
Should we and can we be strict?"

## What was already true

The premise was mostly already met, which changed the work entirely. Four
families of hand-authored manifest, 131 files, and every one of them already
shipped a schema beside it — all five declaring `additionalProperties: false`:

| Family | Files | Schema |
|---|---|---|
| component | 61 | `lib/components/manifest.schema.json` |
| theme | 33 | `themes/theme.schema.json` |
| form frame | 12 | `lib/forms/schema/frame.schema.json` |
| form cell | 10 | `lib/forms/schema/cell.schema.json` |
| form tile | 15 | `lib/forms/schema/tile.schema.json` |

**The gap was not the schemas. It was that nothing ran them.** There was no
JSON-Schema validator anywhere in the repo, prod or dev. Enforcement was
hand-written JavaScript, three separate times, at three different strengths:

- **components** — `validate()` in `lib/components/index.js` derives its
  vocabularies from the schema and rejects unknown top-level keys. Real
  enforcement, but flat: it never descends into `adapt.capacity`.
- **themes** — `checkThemeManifestShape` read the schema at runtime and walked a
  deliberate subset of it. Its own docblock said: *"If it ever needs more, reach
  for a real validator rather than growing this."*
- **forms** — `validateFrame` / `validateCell` / `validateTile` never read their
  schemas at all. `lib/forms/index.js` says so: *"Enums mirrored from the
  schemas."* Unknown keys passed silently across all 37 files.

## The defect this let through

Renaming the **optional** `slicing` block on the `standard` frame to `slicng` —
one letter — returned zero errors from every checker in the repo. The frame's
entire responsive behavior would vanish with no gate saying a word. The forms
test file already conceded the hole in a comment: *"produced ZERO errors (the
JSON-schema was never run)."*

## Where the schemas live: unchanged

Each schema stays beside the manifests it governs. Two of the three already did
this; the relative `$schema` link in each manifest is what gives editors inline
completion with no configuration, and centralizing into a root `schemas/`
directory would break that for nothing. `spec/` is the LFM format spec, a
different artifact.

## Can we be strict: yes, and it was free

Measured before deciding, rather than assumed: across all 37 forms manifests
there were **zero undeclared keys and zero declared-but-unused properties**.
Turning real checking on for forms went green on the first run.

## Should we write the checker: no

Both candidate designs give the same structure — one schema per family, kept
beside its manifests, one shared checker reading them all. The only question was
whether we write that checker or use the standard one. We use `ajv`, for three
reasons:

1. **The repo already said to.** The theme walker's docblock named this exact
   moment. Reaching the same coverage by hand needed nested objects and
   `patternProperties`, which is the growth it warned against.
2. **A homegrown walker reproduces the bug being fixed.** Any rule we forget to
   implement fails silently — which is precisely how a schema became decoration.
3. **A real validator found things ours could not.** On its first run it flagged
   three shipped component manifests carrying undeclared fields two levels down
   (below), invisible to a flat top-level check.

Cost: 3 MB, `devDependency`; four net-new lockfile entries (`ajv`,
`fast-deep-equal`, `fast-uri`, `json-schema-traverse` — the closure's fifth
member, `require-from-string`, was already present).

This module is required only from `tools/`, never from `lib/`, and
**`checkAjvBoundary` in `tools/check-ownership.js` enforces that** rather than
trusting a comment. The boundary is about the LIBRARY: `tools/` is not in
`package.json` `files`, so a `require('ajv')` in `lib/` would ship a
devDependency to consumers and inline a validator into a browser bundle. The
temptation is one import away — `docs/src/components/studio/Fabricate.tsx`
already validates AI-authored manifests in the browser with a hand-written
check, and "why not use the real one?" is the natural follow-up. A boundary held
only by prose fails exactly the way these schemas used to: silently.

### CORRECTION: schema JSON already reaches a browser bundle

The first draft of this record claimed the hand-copied enums in `lib/` "exist to
keep schema JSON out of the browser bundles" and that nothing here ships to a
browser. **That is wrong**, and the adversarial trio caught it.
`lib/layout/gate.js:34` requires `manifest.schema.json` on purpose — its own
comment says esbuild inlines it — and `tools/build-layout-core.js` bundles it
into `docs/src/playground/layout-core.generated.js` for the Studio.

The consequence is specific: this change's first cut added **1,690 bytes** to
that bundle, including a 778-character `description` whose own text claimed we
avoid shipping ~750 characters of rationale into every bundle. A schema
`description` is not a private note — it is shipped bytes and an editor tooltip.
Both new descriptions were cut to a line plus a pointer here (778 → 445, 589 →
322). What the enums in `lib/` actually avoid is a heavier import path, not the
schema itself.

## What the schema does NOT replace

A JSON Schema describes the shape of one file in isolation. It cannot express
"this theme claims to be a dark variant, so its CSS must import a base"
(`checkThemeRoles`) or "every cell id in a frame's `slicing` exists in that
frame's `cells`" (`checkIntegrity`). Those cross-artifact gates stay exactly
where they are and keep running. The runtime validators in `lib/` also stay:
they are browser-safe, fs-free, and do cross-field work. This gate owns *shape*,
so each side does the half it can see.

## The three findings, and why both fields were declared rather than stripped

- **`adapt.capacity.axisRetired`** (`matrix-2x2`, `split-compare`) — a tombstone,
  and load-bearing. `splitFactsFor` in `lib/core/split-facts.js` reads
  `adapt.capacity.axis` as a split opt-in (`enrolled: Boolean(axis || split)`),
  so the *absence* of `axis` is the behavior and this prose is what stops a
  future author restoring it. `lib/authoring/lint.js` already filtered it by
  name to keep ~750 characters of rationale out of the browser lint vocabulary —
  the code knew about the field; only the schema did not.
- **`adapt.capacity.<family>.note`** (`kpi`) — the per-family counterpart of the
  flat `capacity.note`, which has always been declared. The two blocks are
  alternatives, so an author moving to per-family counts reasonably expects the
  field to travel with them. It is real shipped data: `capacityBlock` in
  `tools/build-component-docs.js` spreads the family block, so the note reaches
  `dist/docs/components.json`.

Both blocks stay `additionalProperties: false`; declaring these two did not open
the door.

## Three arms, because each catches what the others cannot

1. **Coverage** — a manifest belonging to no registered family. Without it the
   gate certifies only what it happens to know about, which is how three forms
   families sat unchecked behind schemas that described them.
2. **Shape** — the manifest against its schema, nested fields included.
3. **Self-reference** — each manifest's `$schema` resolves to the file that
   actually governs it. A copy-pasted wrong link sends an author's editor to the
   wrong contract while every other gate stays green.

`strict: true` on ajv adds a fourth catch for free: an unknown *keyword* in a
schema file. A `patttern` typo now fails the build instead of silently checking
nothing — this gate's own failure mode, one level up. `strictRequired` is off,
because these schemas legitimately declare requiredness in an `if`/`then` arm
away from the property (theme `tier`); that is valid JSON Schema and ajv's
objection is a style rule.

## A trap worth recording

**Cells are `<name>.cell.json`, not `.manifest.json`.** The first survey of this
repo used a `*.manifest.json` glob and reported `cell.schema.json` as an orphan
describing zero files. It describes ten. The registry pins the extension per
family and a test asserts it.

## Where it runs

Inside `checkManifestSchemas` in `tools/check-ownership.js`, which
`npm run build:check` already runs in CI and in the pre-push hook. **No CI job,
no CI step, and no git hook was added** — a deliberate constraint, since the
cost of a new gate is paid by every future PR.

`themes/theme.schema.json` also moved from draft-07 to 2020-12 so one validator
compiles all five without special-casing one.

## What the adversarial trio changed

The trio (red team · Munger inversion · independent checker) ran against the
shipped diff and found five things worth the latency. Two were the kind a gate
this size exists to prevent, and both were in the gate itself:

- **`slots.<name>` was an open object.** `properties.slots.additionalProperties`
  had no `additionalProperties: false`, leaving 180 nested paths unchecked in the
  family the gate covers most. `build-component-docs.js:264` reads
  `slot.required` to write the "required" column of every Agent contract, and 61
  manifests set it — so `required` → `requird` silently flipped that column to
  "no" with zero errors. The `slicng` failure mode, alive, inside the change
  built to abolish it. All 180 slots use exactly the three declared keys, so
  closing it cost nothing.
- **The sweep walked dot-directories.** `.gitignore` reserves
  `.claude/worktrees/` for transient agent worktrees; one `git worktree add`
  made `build:check` — and the pre-push hook — fail with up to 131 bogus errors.
  The sweep now skips dot- and `_`-prefixed directories, the latter matching
  `loadDir` and `loadAll`, which both treat a parked `_draft/` as not part of the
  catalog. A gate that fires on work the author never touched is the one people
  learn to bypass.

Three more, all coverage or diagnosis rather than correctness:

- The swept filename set was hardcoded to two suffixes, so a sixth family with a
  new suffix was invisible to the sweep that exists to catch a sixth family. It
  is now derived from `FAMILIES`, and the sweep also collects the bare
  `manifest.json` folder shape `loadAll` still accepts (`.endsWith('.manifest.json')`
  is false for it, so it slipped both arms).
- One typo in a schema produced 62 errors — 61 of them telling a reviewer to
  delete shipped components, because a compile failure returned `[]` and dropped
  the family out of `claimed`. One cause now reads as one error.
- The self-reference arm exempted any `https?:` link and a missing one entirely,
  waving through `http://json-schema.org/draft-07/schema#` — the likeliest wrong
  paste, and what `theme.schema.json` itself carried until this change.

**What the trio cleared** matters as much. Red team transcribed the retired
walker verbatim and ran 39 mutations through both implementations: **zero
regressions**, ajv is a strict superset. It compiled `theme.schema.json` under
both drafts against all 33 manifests plus a 20-case mutation corpus: **zero
disagreements**, so the draft-07 → 2020-12 bump changes no meaning. It also
found no crash, no prototype pollution, and no error explosion (zero
`anyOf`/`oneOf` across all five schemas). The checker independently re-derived
the 131/61/33/12/10/15 counts and reproduced the `slicng` defect on `origin/main`.

Cost of the review: 3 agents, ~350k tokens.
