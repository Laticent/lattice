---
status: shipped
summary: >
  All five manifest families (61 components, 33 themes, 12 frames, 10 cells, 15 tiles)
  already shipped a JSON Schema beside them, and all five already declared
  `additionalProperties: false` — but nothing in the repo ran a JSON-Schema validator, so
  each family grew its own hand-written checker at a different strength. Forms never read
  its schemas at all: renaming the optional `slicing` block on the `standard` frame to
  `slicng` returned zero errors from every checker in the repo, silently deleting the
  frame's whole responsive behavior. Fixed with one shared gate, `tools/manifest-schemas.js`,
  running ajv over a registry of all five families, inside the existing `check-ownership.js`
  — no new CI job, step, or git hook. ajv is a devDependency kept out of `lib/` by
  `checkAjvBoundary`; note that the schema JSON ITSELF does reach a browser bundle by design
  (`lib/layout/gate.js` requires it and esbuild inlines it for the Studio), so a `description`
  here is shipped bytes — an earlier draft of this record claimed otherwise and was wrong.
  Three arms: coverage (a manifest no family claims), shape (nested fields included), and
  self-reference (each manifest's `$schema` resolves to its own contract). ajv `strict` adds
  a fourth catch free — a typo'd keyword in a schema file. On its first run it found three
  component manifests carrying undeclared fields two levels down in `adapt.capacity`,
  invisible to the flat top-level check; both fields were legitimate and are now declared.
  The adversarial trio then found two holes of the same kind in the gate itself — an open
  `slots.<name>` object leaving 180 nested paths unchecked, and a sweep that walked
  `.claude/worktrees/` and failed build:check with up to 131 bogus errors — plus three
  coverage and diagnosis gaps; all fixed. It cleared the two real risks: zero regressions
  against the retired walker, and zero draft-07 vs 2020-12 disagreements — both now
  re-derivable by running `test/unit/tools/manifest-schema-equivalence.test.js` rather
  than only in an agent's transcript. That harness was then itself reviewed (#2016), which
  was worth doing: three of its arms measured less than they claimed — a coverage guard
  keyed on six hardcoded keyword NAMES, a generator blind to the schema's own conditional
  and to any nested block, and a draft comparison that was a tautology because both
  dialects compile this schema to byte-identical code. All three are fixed, the superset
  is now checked in both directions, and the corpus is pinned by fingerprint as well as
  by size.
  Schemas stay beside their manifests (the relative `$schema` link is what gives editors
  inline completion). themes/theme.schema.json moved draft-07 -> 2020-12.
---

# One JSON-Schema gate over every manifest family

**Date:** 2026-09-01
**Status:** landed
**Touches:** `tools/manifest-schemas.js` (new), `tools/check-ownership.js`,
`lib/components/manifest.schema.json`, `themes/theme.schema.json`,
`test/unit/tools/manifest-schemas.test.js`,
`test/unit/tools/manifest-schema-equivalence.test.js`

## The question

"Our manifest JSON files should have a JSON schema. Where should these live?
Should we and can we be strict?"

## What was already true

The premise was mostly already met, which changed the work entirely. Five
families of hand-authored manifest — components, themes, and the Form model's
frames, cells and tiles — 131 files, and every one of them already shipped a
schema beside it, all five declaring `additionalProperties: false`:

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

### Both cleared risks are now re-derivable, and the numbers moved

The paragraph above was an agent's report, and it stayed one: the harness lived
in a transcript, and the walker it compared against was **deleted by this same
commit**. So the two claims this change rests on could not be re-run by anyone —
which is what HARD RULE #23 calls a claim rather than evidence.

`test/unit/tools/manifest-schema-equivalence.test.js` commits both comparisons.
It carries the retired `checkThemeManifestShape` transcribed from `71539f7` (the
walk unchanged; only its input is a passed-in list rather than a directory read),
and it **generates** its corpus from the schema's own keywords instead of listing
mutations by hand — one per `required` / `enum` / `pattern` / `type` / `minimum` /
`items` / `uniqueItems` / `minItems` / `additionalProperties` the schema actually
uses, over two real seeds that sit on opposite arms of the schema's one
`if`/`then`/`else`.

| | trio's report | first harness | after review (#2016) |
|---|---|---|---|
| walker-equivalence mutations | 39 | 51 | **55** |
| ajv passed what the walker caught | 0 | 0 | **0** |
| mutations only ajv catches | not reported | 2 | **4** |
| legal variants compared (the other direction) | not compared | not compared | **210** |
| walker rejected what ajv accepts | not compared | not compared | **0** |
| draft comparison | 33 manifests + 20 mutations | 33 manifests + 51 mutations | **the compiled validators, directly** |
| draft disagreements | 0 | 0 | **0** |

The counts differ because the corpora are built differently, not because any is
wrong — and 55 is the one a reader can reproduce. Four things the harness adds
that the transcript did not:

- **The superset margin is named**, and the first naming of it was wrong. See the
  correction below.
- **Every mutation is proved to be a defect first**, and proved to break the rule
  it is NAMED for. A generator emitting legal manifests would report a flattering
  equivalence over cases neither side rejects; a generator emitting manifests
  broken for the wrong reason would report a real-looking one over cases that say
  nothing about the rule.
- **The superset is checked in BOTH directions.** Every probe being a defect means
  the case that makes `superset` false — the walker rejecting something ajv
  accepts — cannot be observed at all. 210 legal variants drawn from the shipped
  tree now check it.
- **The corpus is pinned by composition, not just by size**, so an offsetting edit
  cannot hold the number while moving what is actually compared.

### CORRECTION: three of the first harness's arms measured less than they claimed

The harness above shipped as a *measuring instrument* that nothing independent had
measured, and its own pre-merge card said so — capped at `high` on the
independent-eyes axis, naming this review as the raise path. It was worth running.
A checker and a red team, working separately, converged on the same three holes,
and all three are the flattering-green failure mode rather than a crash:

- **The coverage guard did not bind.** It scanned for six hardcoded keyword NAMES
  and treated a namesake anywhere as covering a keyword everywhere. Four ordinary
  tightenings (`note.maxLength`, `name.minLength`, `order.maximum`,
  `modes.maxItems`) were added to the schema and enforced by ajv while the corpus
  stayed at 51, `missing` stayed empty, and all seven arms passed. The census is
  now derived from the schema and keyed by JSON POINTER, and it REFUSES a
  construct the generator has no strategy for rather than skipping it.
- **The generator could not reach the schema's own conditional, or any nested
  object.** It walked only top-level `properties`, so `allOf[0].then` — the one
  region this schema puts logic in — and any nested block were invisible. That is
  the `adapt.capacity` defect family this whole gate was built to catch, alive
  inside the instrument built to certify it. Demonstrated: a `pattern` on
  `then.properties.swatch` that ajv enforces and the walker cannot see, with the
  harness green at 51.
- **The draft arm was a tautology.** Both dialects compile this schema to
  BYTE-IDENTICAL validator code (10,324 characters, measured after normalizing
  ajv's gensym numbering and dropping the 2020-12 `evaluated` preamble, which is
  dead unless a schema uses `unevaluated*`). So "33 manifests + 51 mutations, zero
  disagreements" was one trivially true fact repeated 84 times, and a 200,000-case
  fuzz across both validators found zero disagreements for the same reason. The
  identity is now asserted DIRECTLY, which is strictly stronger: it holds for every
  possible input rather than for the 84 tried. A negative control proves the rig
  can still detect a real divergence, and a third arm proves the two ajv classes
  refuse each other's `$schema` — so a mis-wired comparison throws rather than
  passing.

Two smaller corrections, both to claims this record made:

- **The margin was misattributed.** This record said the margin was the walker's
  `if (k === '$schema') continue;` and credited it to "arm 3 of the gate". Arm 3 is
  `checkFamily`'s `$schema`-LINK check in `tools/manifest-schemas.js`, which this
  test file never calls. What the walker actually misses is (a) that `$schema` must
  be a STRING — it `continue`s past the key entirely — and (b) **any undeclared key
  whose name is an `Object.prototype` member**. `const spec = props[k]` is an
  unguarded index, so `constructor`, `toString`, `valueOf` and `__proto__` all
  resolve truthy against the prototype, `if (!spec)` never fires, and the
  `additionalProperties` branch is skipped. ajv emits a `hasOwnProperty` guard. That
  second class is a real divergence the first corpus could not express, and it is
  why the margin is four cases rather than two.
- **`Ajv7` was ajv 8.20.0.** The dialect comes from the CLASS — ajv's default export
  is its draft-07 implementation, `ajv/dist/2020` is the 2020-12 one — not from the
  `$schema` string the harness re-points. The name and its comment invited the
  opposite reading, which is the misunderstanding that would let someone
  "simplify" both sides onto one class and make the arm decorative. Renamed to
  `AjvDraft07`.

**One gap is closed by refusing rather than by covering.** The legal-variant arm
draws its values from the shipped tree, so a property NO theme carries yet gets no
legal probe — and a newly declared `boolean` field is exactly the case the walker's
`typeOk` cannot handle (it knows `string | integer | array | null | object` and
returns false for `number` and `boolean`, so it would reject every legal value).
Measured: with a `boolean` field a theme carries, the arm fires; with the same
field unused, the whole file passed. The arm now fails by name on any declared
property no theme exercises.

**Also corrected: the recovery command in the test's own docblock.**
`checkThemeManifestShape` spans lines 698-**766** at `71539f7`, not 698-760; the
cited range dropped the `uniqueItems` and `minItems` checks, so a reader following
it literally diffed a copy missing two of the nine rules. The transcription itself
is sound — diffed mechanically against the original under exactly its three
declared changes (signature, schema passed in, manifest list passed in) and
identical. And the NAME survives at HEAD: `tools/check-ownership.js:710` is now a
four-line delegator to `checkFamily`, so grepping it finds an ajv shim rather than
the implementation under test.

**Cost of this round:** 2 agents, ~225k tokens. Six of the seven original arms
changed; the corpus grew 51 → 55 and the margin 2 → 4.

The corpus is pinned in the test BY SIZE AND BY FINGERPRINT (a hash of the sorted
mutation ids), so growing or reshaping `theme.schema.json` fails here and forces
this table to be updated with it. Both numbers must move together.

## The checker's second pass — the fix for a finding introduced three more

The adversarial trio's findings were fixed in one commit, and a follow-up checker
then reviewed **that commit** — the ~500 lines nothing independent had seen. It
was worth running: the fix for the dot-directory false positive had introduced
three new divergences, all of the same species as the bug it repaired.

**The rule the first cut broke: agree with the loaders, never invent policy.**

- **`SKIP_ROOTS` anchored to the repo root** meant the sweep walked every NESTED
  `node_modules` and `dist`. `docs/` is its own npm package, so `docs/node_modules`
  is 743 packages and 4,193 directories: the sweep went from 8 ms to 71 ms, and —
  paired with `manifest.json` in the swept names — the next dependency to ship a
  bare `manifest.json` fixture would have failed `build:check` and the pre-push
  hook for everyone, telling them to delete a file inside `node_modules`. Zero such
  files exist today, which is luck. The root-anchoring had been justified here as
  stopping a manifest HIDING under a nested `dist/`; that trade was backwards, and
  the justification was invented rather than derived from any loader.
- **Skipping dot-directories at every depth** traded the false positive for a
  FALSE NEGATIVE. `loadAll` skips only `_` bucket children, so
  `anchor/.hidden/.hidden.manifest.json` loads into the shipped catalog — and with
  both the sweep and the lister skipping it, nothing checked it. Dot-directories
  are now skipped at the ROOT only, which is where `.claude/worktrees/` lives.
- **A `_` filter on flat-family FILES** had no basis: `listThemeManifests` filters
  on the extension alone. The lister excluded `themes/_wip.manifest.json` while the
  sweep still saw it, manufacturing a guaranteed "no schema family covers" error
  for a theme every other theme gate reads.

It also found `checkAjvBoundary` shipped with **zero tests**, directly beneath a
comment in `check-ownership.js` saying gates are exported "so the suite can drive
them against synthetic fixtures — a gate only proves something if you can watch it
fail." It matched only `ajv` and `ajv/`, waving through `ajv-formats` and
`ajv-keywords` (the same devDependency leak under another name), and lacked the
per-file dedupe its sibling gates have. All three fixed, and the gate now has
tests that watch it fail.

**What the checker could not break.** It attacked the `if`-error skip hardest,
since suppressing ajv's `if` keyword could in principle silence a manifest's ONLY
error: five hand-built adversarial schema/data pairs and a **8,456-mutation fuzz**
over the real tree produced zero all-`if` error sets. Not a defect; the invariant
rests on ajv behavior nothing pins, which is recorded here rather than claimed as
proven.

**Cost of the two review rounds:** 4 agents, ~470k tokens. They found two HIGH
defects in the original and three regressions in its fix. Every one was in the
gate itself rather than in the manifests it checks.

### Measured, after both rounds

| | |
|---|---|
| repo-wide sweep | 9 ms (was 71 ms mid-fix; 8.5 ms before this change) |
| `checkAjvBoundary` | 176 ms |
| `check-ownership.js` total | 6.47 s |
| unit / integration | 7,623 pass / 804 pass, 0 fail |

## The Studio, driven — the one surface this change never touched by hand

The CORRECTION above establishes that `manifest.schema.json` is shipped bytes:
`lib/layout/gate.js:34` requires it and esbuild inlines it into
`docs/src/playground/layout-core.generated.js`, which the Layout Studio's
component picker and Fabricate's component gate both read. The change reasoned
about that bundle and measured its size. Nobody opened it.

Driven at 1440 / 820 / 390 on the **production `docs/dist` build** — the bytes a
visitor gets — not only on the dev server. That distinction earned itself: the
Astro dev server renders Fabricate's live preview EMPTY, and the same walk
against the built site renders it correctly (see below).

- **The bundle diff is the schema text and nothing else.** Rebuilding
  `layout-core.generated.js` from the pre-change schema (`71539f7`) and diffing
  against the current one gives 18 changed lines: the two new `description`
  strings, and `additionalProperties: false` on `slots`. No code path moved.
  143,930 → 145,061 bytes.
- **The component picker is unchanged** — "Add a slide" over 61 components, 62
  tiles with `Blank`, the same search placeholder at each width.
- **The gate still passes AND still bites.** Fabricate's Component tab opens
  ALL CLEAR on the default component, with its BUCKET / FUNCTION / FORM /
  SUBSTANCE selects populated from the schema enums; typing `#ff0000` into the
  CSS pane flips it to `GATE — 1 TO FIX / no-hex:1 — hex literal "#ff0000"`.
  An all-clear panel alone proves nothing, which is why the failing case is here.

**Nothing shipped is broken, and one trap is worth writing down.** On the Astro
DEV server Fabricate's `LIVE PREVIEW` figure has zero children — it looks like a
dead surface. On the built site the same figure holds the `srcdoc` iframe and
renders the slide. The consequence for how we verify is the durable one: **a
verification run against `npm run dev` alone would have reported the opposite of
the truth here** — in both directions, since a dev-only break reads as shipped and
a dev-only pass would too. Drive `docs/dist`.

### CORRECTION: it is a dev-only DEFECT, not an artifact — and the cause is named

This record called the empty preview "a dev-server artifact and not a defect".
That was the limit of what had been established, not a finding, and #2016
root-caused it. It is a real defect that happens to be invisible in production,
and the distinction matters because "artifact" invites walking past it.

`StudioIsland.tsx` wraps the shell in `<StrictMode>` deliberately, and StrictMode
double-invokes mount effects in dev only. `DeckPreview`'s unmount cleanup calls
`engineRef.current?.dispose()` (`DeckPreview.tsx:650`), but the renderer is built
in the RENDER BODY behind `if (engineRef.current === null)`
(`DeckPreview.tsx:224`) — and a StrictMode remount re-runs effects, not the render
body. The host therefore keeps a DISPOSED renderer for the rest of its life, and
every later render resolves `{ ok: false, slides: 0, error: 'renderer disposed' }`.
The silence is the other half: #1164 excludes exactly that sentinel from the
failure surface because it is normally TRANSIENT (a host detached mid-render), so
the one signal that would have drawn a card is the one suppressed. Measured:
removing `<StrictMode>` renders the preview; nulling the ref in the cleanup does
NOT (it trades a disposed renderer for no renderer), and neither does dropping
`coalesce` — both plausible theories, both wrong, which is why this was pinned by
instrumenting `renderInto`'s status rather than by reading.

All four Fabricate hosts are affected (Component preview, Theme / Chart / Diagram
specimens), not just the one this record named. Written up as a symptom in
`engineering/gotchas.md` → `engineering/gotchas/docs-site.md`, beside the
`/@fs` source-CJS trap it rhymes with. NOT fixed here: pre-existing and off this
change's path (HARD RULE #18); the candidate fix is to let an effect own the
renderer's whole lifecycle instead of a render-body guard paired with an effect
cleanup.

Both surfaces also log a 404 for the fabricated theme's CSS
(`/playground/v/<hash>/themes/fab-<id>.css`) — a theme authored in the browser
cannot exist under a staged asset path. It is present with the pre-change bundle
rebuilt in place, so it is neither caused nor worsened here, it costs one failed
request, and the preview renders regardless. Recorded, not fixed: off the path of
this change (HARD RULE #18). **It does NOT share the empty-preview root cause**
(#2016 checked): it appears identically on the built site, where the preview
renders correctly.
