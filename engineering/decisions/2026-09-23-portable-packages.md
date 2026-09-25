---
status: proposed
summary: One package shape for themes, components, finishes and motion — a folder named for the item, a manifest that owns the name, and role-named files — read by one pure spine that the build, the engine, the CLI and the Studio all call. The repo folder, the exported zip and the Studio record hold the same files. Data files are always gated; a package carrying JavaScript needs the user's consent, pinned to the code's hash, and runs contained. Shipped names are reserved. The CLI gains list / add / export / remove over a user-global ~/.lattice.
---

# Portable packages — one shape, one spine, four kinds

> **Proposed.** Nothing here is built. The owner settled the four forks on
> 2026-09-23 (§9); §8 lists the order of work.

## 1. The symptom

Lattice ships four kinds of reusable design asset — **themes, components,
finishes and motion** — and the Studio's Fabricate can make all four. Each kind
has a different shape in each of the three places it can live, and nothing
converts between them:

| Kind | In the repo | In the Studio (IndexedDB record) | In an exported `.zip` |
|---|---|---|---|
| Theme | flat `themes/<name>.css` + `<name>.manifest.json`; four separate folder walks read it | CSS + `essentials` | `<name>.css` + an envelope `manifest.json`; no theme manifest |
| Component | `lib/components/<bucket>/<name>/` with `.manifest.json`, `.styles.css`, `.docs.md`, `.gallery.md`; `loadAll` walks it | manifest fields + CSS + skeleton | `<name>.css` + `<name>.skeleton.md` + envelope — the repo's file names differ |
| Finish | a hand-kept row in `FINISH_REGISTER`, hand CSS in the shared `base.finish.css`, a hand-kept mirror in `finish-catalog.ts`, and a *second* hand-kept copy as a recipe in `PRESET_RECIPES` | recipe + generated CSS | `<name>.finish.css` + `<name>.recipe.json` + envelope |
| Motion | none — examples live inline in decks | spec + poster + art (`kind:'scene'`) | `<name>.scene.json` + SVGs + envelope |

The consequences are concrete, and each was confirmed in source:

- **Exports lose items.** The Markdown export passes an empty component list
  (`share-export.ts:772`), so a saved component's styling disappears. The Marp zip
  fetches a saved theme from the site's shipped themes, finds nothing, and falls
  back to `indaco` without a word. The `.lattice` project file embeds no package at
  all, although `2026-06-16-lattice-export-format.md` §3b specified that it would.
- **The CLI can't use anything made in the Studio.** It reads themes only from its
  own install folder (`lattice-emulator.js:938`), and a component or finish reaches
  it only as CSS pasted into the deck. The theme zip's README tells the user to
  "drop `<name>.css` into a deck's `themes/`"; the CLI has no such lookup.
- **A saved theme can hijack a shipped one.** `saveStudioTheme` accepts any valid
  slug, and `StudioShell.tsx:2945` checks saved themes first, so a theme saved as
  `indaco` re-skins every deck in the workspace that says `theme: indaco`. Finishes
  guard against this (`RESERVED_FINISH_NAMES`); themes, components and motion don't.
- **Registration is four different chores.** A theme is a file drop plus a
  rebuild. A component is a folder plus a rebuild. A finish is four hand edits in
  four files, kept aligned by rot-guard tests. Motion can't be registered at all.
- **The duplicated finish definition has already produced a bug.** On the print
  face, `halo` and `nimbus` paint solid slide color over their own wash, so the
  committed `examples/finish-backdrops.pdf` shows no accent at all on those two
  slides (pixel-sampled: pure white plus a gray rim). The Studio generator repeats
  the same layering (`finish-generate.ts:344`), so a Studio-made mesh or vignette
  finish very likely prints the same way. That second claim comes from reading
  the code, not from a render.

## 2. What already exists to build on

- **Identity is already decided for themes.** `2026-08-16-theme-identity-ownership.md`
  §4: *the manifest owns the name*; the filename and `@theme` are projections a gate
  verifies (`checkThemeIdentity`), and identity is **passed, never searched for**
  (`ThemeStore.add(name, css)`). This note generalizes that rule; it does not
  replace it.
- **Components already have the target folder shape**: `<name>/<name>.<role>.<ext>`.
  All 71 manifests' `name` equals their folder name today. That agreement comes
  from discipline, not a gate: nothing checks it.
- **One schema gate already spans every manifest family**: `tools/manifest-schemas.js`
  `FAMILIES`. It checks shape and coverage, not identity.
- **The Studio already has one store and one zip format** for all four kinds:
  `asset-store.js` with `kind` = `theme` / `component` / `finish` / `scene`, and
  `lattice-asset/1` in `asset-bundle.ts`. The *idea* of a shared spine is already
  there; the shape is simply different from the repo's.
- **The Studio already derives a finish's print face from a recipe**
  (`finish-generate.ts`), and the Library's import already throws away a zip's
  finish CSS and `saveStudioFinish` regenerates it from the recipe (`Library.tsx:498-501`). The recipe
  is already the source for user finishes; only shipped finishes are hand-written.

## 3. The model

### 3.1 A package is a folder

```
<name>/
  <name>.manifest.json        required — owns the name, declares the type
  <name>.<role>.<ext>         the files the kind's descriptor names
```

The repo folder, the unzipped export and the Studio record all hold **the same
files under the same names**. A zip is that folder zipped — no envelope, no
renaming. A bundle zip is several such folders under `<type>/`.

### 3.2 The manifest owns the name

- `name` in the manifest is the identity. The folder name and every file's
  `<name>.` prefix are **projections**, and one gate checks them for every kind,
  not only themes.
- **Why not the filename?** A filename is the first thing to change in transit:
  a browser saves `brand (1).zip`, a user renames a folder, and the Studio's
  IndexedDB has no filenames at all. The manifest travels inside the package. On
  import the spine reads the manifest and **writes the projections to match it**;
  it never trusts a filename.
- The manifest gains two fields: `"type"` (`theme` | `component` | `finish` |
  `motion`) and `"format": 1`. A repo folder implies its type by where it sits,
  but a loose zip does not. `kind` is **not** used, because frame and tile
  manifests already use `kind` for a domain value (`root`, `surface`, …).

### 3.3 One descriptor per kind

The spine knows the four kinds through a small table: the root folder, the role
files, and which gate each file passes. Adding a kind means adding a row.

| Type | Repo root | Required files | Optional files |
|---|---|---|---|
| `theme` | `themes/` | `manifest.json`, `.css` | `.essentials.json` (the Studio's inputs, so a theme reopens for editing) |
| `component` | `lib/components/<bucket>/` | `manifest.json`, `.styles.css`, `.gallery.md` | `.docs.md`; `.transform.js`, which makes it a **code package** (§3.5) |
| `finish` | `lib/finishes/` (new) | `manifest.json`, `.recipe.json` | none. The CSS is generated from the recipe (§3.6) |
| `motion` | `lib/motion/` (new) | `manifest.json`, `.scene.json`, `.poster.svg` | `.art.svg` |

The Studio's component `skeleton.md` becomes `gallery.md`, which is what the repo
already calls the same file. Motion takes the name `motion`, not `scene`, because
`scene` already names a component, a frame and a slide class.

Build outputs (`.gallery.*.pdf`, generated finish CSS) are **not** package
files: they don't travel, and the build regenerates them.

### 3.4 One spine, thin adapters

```
lib/packages/                pure, no fs, bundles into the browser (like resolve-finish.js today)
  kinds.js                   the descriptor table (§3.3)
  read.js                    files → validated package: schema, identity, per-file gates
  write.js                   package → files, with projections rewritten from the manifest
  index.js                   packages → the generated index; the add / list / remove registry
```

Each surface adds only the input/output it needs:

| Surface | Adapter | Operations |
|---|---|---|
| **Build** | fs folder walk | discover every shipped package, gate it, and write **one** `packages.generated.json` |
| **Engine** (npm API) | none — in memory | `packages.add(pkg)`, `packages.list({type})`, `packages.remove(type, name)` |
| **CLI** | fs + zip (`jszip` is already a root dependency) | `lattice packages list \| add \| export \| remove` (§6) |
| **Studio** | IndexedDB + zip | the Library's existing import / export / edit / delete, moved onto the spine |

`packages.add` dispatches on type: a theme calls `ThemeStore.add(name, css)`; a
component or finish appends its sanitized CSS and adds its name to the lint
vocabulary; a motion package registers nothing in the engine (§5). This one call
replaces the hand merging `StudioShell.tsx:1856-1872` does today to teach the
linter and pickers about saved names.

The generated index **replaces** `FINISH_REGISTER`, `finish-catalog.ts`, the theme
catalog and the four theme folder walks. It does **not** replace the component
catalogs the build derives from manifests (stage catalog, chart registry, guide
handles). Those are projections of a manifest's *contents*, not registration,
and they keep working. `loadAll` becomes a thin wrapper over the spine's walk.

### 3.5 Trust: data is gated, code needs the user's consent

28 of the 71 shipped components carry a `.transform.js`, wired in by a static
`require` in a generated registry. The owner chose to let portable packages carry
JavaScript too (§9 Q4), behind a trust prompt, so charts and other transform
components can be shared. That splits every package into two tiers.

**Data files: always gated, never prompted.** CSS, JSON, Markdown and SVG pass
their gate on every import: CSS through the existing theme/component gates and
then `sanitizeStyleText` (HARD RULE #22), SVG through the slide sanitizer, JSON
through the kind's schema. A data-only package imports without a prompt. Imports
get the same size caps `.lattice` already enforces (`lattice-file.ts:18-19`);
today `asset-bundle.ts` has none.

**Code files: consent, then containment.** A package holding a `.transform.js`
is a **code package**, and every surface treats it the same way:

1. **Consent, pinned to the bytes.** Import shows the code files and asks. The
   answer is recorded against a SHA-256 of the code, so an updated package asks
   again. The CLI takes `--trust` or an interactive yes, and a non-interactive
   render of an untrusted code package **fails with the package named**. It never
   silently renders the component without its transform.
2. **A narrow contract, not the engine's internals.** A shipped transform imports
   engine modules freely. A user transform can't, because it runs across a message
   boundary. It receives the slide's data and returns an HTML string, which is
   async and time-limited. Contract v1 needs its own design pass (phase 6); the
   existing shipped transforms are the test corpus for how much it must carry.

   **Measured after this note merged: as written, the contract fits none of the 28
   shipped transforms.** Every one imports engine code. Counting the component
   transforms that import each helper:

   | Helper | Transforms | What it gives them |
   |---|---|---|
   | `transform-utils` | 21 | the chart family's shared string helpers |
   | `cartesian` | 15 | scales and axes |
   | `mark-detail` | 15 | per-mark interactive detail |
   | `svg-label` | 13 | label placement |
   | `html-lists` | 11 | walking the authored Markdown lists |
   | `svg-legend` | 10 | legends |
   | `coda` | 6 | a slide's trailing key-insight and source beats |

   And three need a live page, not a string:
   - **`state-chart`** measures its own layout with `getBoundingClientRect`
     (`state-chart.transform.js:792`), so it can't run anywhere that doesn't
     lay out text.
   - **`scene`** and **`team-profile`** have a runtime half that walks the rendered
     slide with `querySelectorAll`.

   So a useful contract v1 is not "data in, HTML out" alone. It must hand the
   sandboxed transform a **helper toolkit** across the message boundary: at
   least parsing, scales, axes, labels and legends, and a way to measure text.
   That toolkit is a published API, which means its surface, versioning and
   who may call what are phase 6's first design question, ahead of the sandbox
   itself.

   (Re-derive the table with a `require`/`import` scan of
   `lib/components/*/*/*.transform.js`, `_`-prefixed folders excluded; the DOM
   list with a grep for `document.`, `querySelector` and `getBoundingClientRect`,
   excluding comment lines.)
3. **Output is sanitized like any other untrusted markup.** A transform's HTML goes
   through `sanitizeSlideHtml` before it reaches a slide. The transform can't
   inject what an author couldn't have typed.
4. **Containment, per surface. Neither half is verified yet:**
   - **Studio:** a sandboxed iframe without `allow-same-origin`, so the code gets
     an opaque origin: no IndexedDB, no cookies, and no reach into the user's
     OpenRouter OAuth key (HARD RULE #24). A `default-src 'none'` content-security
     policy blocks network exfiltration. This is designed and still needs a proof
     on the real Studio (HARD RULE #23).
   - **CLI:** a child process under Node's `--permission` model. **Measured on our
     floor (Node 22.22): it blocks the filesystem and subprocesses but not the
     network** — `fetch` succeeded under `--permission`. So in the CLI a trusted
     transform can read the deck's content and send it somewhere, and the consent
     prompt is the real boundary. The prompt text says so.

**The cost the owner accepted.** Every code-package import becomes a security
decision a user has to make, and the CLI can't fully contain what they approve.
Phase 6 is critical, novel, high-blast-radius work, so it gets the full
adversarial trio (HARD RULE #25) on what actually ships. Code packages come
**last** in §8 so that none of phases 0–5 waits on it.

A shipped code package **can** be exported under this model. Its transform is
then held to the user contract on re-import, so a shipped transform that reaches
into engine internals exports as data-only until it's ported to the contract.

### 3.6 Finishes: the recipe is the source

Each finish is one `recipe.json`, and one generator (today's `finish-generate.ts`,
moved into `lib/`) writes both faces of its CSS. That deletes the hand-written
presets in `base.finish.css` and `PRESET_RECIPES`, the hand-kept catalog, and the
rot-guard tests that kept them aligned. It also moves the print-face fix into one
place. The rule that fix follows: only the **bottom** full-bleed layer may end on
solid slide color. Every layer above it must end on the same color at zero
opacity, or be a hard-edged pattern.

**Open risk, not yet measured:** the recipe vocabulary may not express every
detail of the 9 hand-written presets (`none` is the tenth register value and paints nothing). The first step of that phase is a
pixel-diff of generated against hand-written CSS for all 9. Anything the
vocabulary can't express either becomes a new vocabulary term or stays behind as
an explicit, gated hand-CSS exception. It is never dropped silently.

### 3.7 Names: shipped names are reserved, per type

- Names are unique per type. A theme and a finish may both be called `atrium`,
  because they never share a namespace.
- A user package may **not** take a shipped name of the same type. On import the
  spine renames the clash to `<name>-custom` and says so. That is today's finish
  rule, generalized; the reserved list comes from the generated index, so it can't
  drift the way `RESERVED_FINISH_NAMES` did.

## 4. Decks and exports

A deck names a theme, component or finish by name. Every export carries the
**user** packages the deck uses; shipped packages ride with the engine.

| Export | Change |
|---|---|
| `.lattice` project | gains `packages/<type>/<name>/…`, the same folders. This finally delivers `2026-06-16` §3b |
| Markdown | embeds used components as well as the theme and finish (fixes the `[]`) |
| Marp zip | bundles a user theme's CSS instead of falling back to `indaco`, and bundles component CSS |
| PDF / HTML | unchanged. They already bake in the CSS and the transforms' output |

A **code package** can ride only in a `.lattice` file, because Markdown and a Marp
zip can carry CSS but not a transform. Those two exports name the component they
couldn't carry and warn, rather than shipping a deck that silently renders it
without its transform.

## 5. Motion is the deliberate exception at the deck level

A deck **inlines** its motion (poster SVG plus an ```` ```anima ```` fence) and never
names it. That is why a Studio-made motion already renders from the CLI. We keep
that: a motion package is a library item that *Insert* copies into the deck, not a
dependency the deck looks up. Deleting a motion package therefore never breaks a
deck, and the package format still gives motion what it lacks today: a home in
the repo, a manifest, a zip that matches the folder, and a place in `list`.

## 6. The CLI

```
lattice packages list   [--type theme|component|finish|motion]   shipped + installed, with a SOURCE column
lattice packages add    <file.zip | folder> [--replace]          gate, then copy into the store
lattice packages check  <file.zip | folder>                      gate only; install nothing
lattice packages export <type>/<name> [-o file.zip]              zip one package (refused if it carries code)
lattice packages remove <type>/<name>                            installed packages only; shipped are read-only
```

**Where the CLI keeps user packages:** a user-global `~/.lattice/packages/<type>/<name>/`,
overridable with a `LATTICE_HOME` environment variable (so CI and tests can point
it at a fixture) and, for one run, with a `--packages <dir>` flag. The owner chose
this over a project-local folder (§9 Q3): install once, use in every deck.

**The cost, and what pays it down.** The same deck can render differently on two
machines, and a CI job sees none of a user's packages unless it is given them.
Two things carry that cost:

- **Exports carry the packages a deck uses** (§4). A `.lattice` file, a Markdown
  export and a Marp zip all render on a machine without the author's
  `~/.lattice`.
- **A render that names a package it can't find fails with the name and the
  command that installs it.** It never falls back to another theme, which is
  exactly what the Marp zip does today and exactly what §1 calls a bug.

A project-local folder can be added later as a second, higher-priority search
root without changing the package format.

**No `edit` command.** A package is plain text in a folder, so an editor is the
editing tool. A `lattice packages check` that runs the spine's gates is the one
addition worth having.

## 7. Deliberately not built

Each is cut because nothing in §1 needs it, and each one would be a permanent cost:

- **Per-package versions and a dependency resolver.** The only dependency between
  packages is a theme's `extends`. It resolves by name, and an export bundles a
  user parent alongside its child.
- **A remote registry, marketplace, `install` from a URL, or package signing.**
- **Forms (frames, cells, tiles) as portable packages.** They are the engine's
  own structure, not user content. They may reuse the spine's walk later.

## 8. Order of work

Each phase ships on its own and leaves the tree green.

0. **Standalone bug fixes.** These don't wait for the spine: the Markdown export
   dropping components, the Marp theme fallback, theme and component name
   shadowing, zip size caps, and the halo/nimbus print face (export sign-off with
   dark + light renders, per the Quality Bar).
1. **The spine core** (`lib/packages/`), the manifest `type`/`format` fields, the
   identity gate for every kind, and `packages.generated.json`. Themes and
   components are discovered through it, and no file moves yet.
2. **Finishes become packages** (`lib/finishes/<name>/`), with the generated CSS
   and the pixel-diff described in §3.6.
3. **The Studio store and zip move onto the spine.** Old `lattice-asset/1` zips
   still import through a one-way reader.
4. **CLI `packages` commands** over `~/.lattice`, and `.lattice` embedding.
5. **Themes into folders** (§9 Q2), and a shipped motion library seeded from the
   example decks.
6. **Code packages** (§3.5): the transform contract v1, consent pinned to a hash,
   and the Studio iframe and CLI child-process containment, with the full
   adversarial trio on what ships. Last, so that no earlier phase waits on it.

## 9. Owner decisions (settled 2026-09-23)

1. **Identity: the manifest's `name`.** Filenames and folder names are checked
   copies, and import rewrites them from the manifest. This extends the 2026-08-16
   theme rule to every kind.
2. **Themes move into `themes/<name>/` folders**, like every other kind. Measured
   cost: 67 non-test source files reference a theme path (`grep -rlE "themes/[${a-z'\"\` ]|'themes'|\"themes\""`
   over `lib tools docs/src lattice-emulator.js build-css.js`, `.js/.mjs/.ts/.tsx/.astro`,
   tests excluded; counting tests, JSON, YAML and shell raises it to about 150). The published `./themes/*.css`
   import path survives through an `exports` remap to `./themes/*/*.css`.
   Scheduled for phase 5.
3. **The CLI keeps user packages in a user-global `~/.lattice`**, not a
   project-local folder. §6 records the reproducibility cost and what pays it down.
4. **Portable packages may carry JavaScript behind a trust prompt**, not data-only.
   §3.5 records the design, and the measured limit: Node 22's `--permission` doesn't
   block the network, so in the CLI the prompt is the real boundary.

## 10. Progress

Each line names what landed, where, and what is still open. §1 stays as written:
it is the record of what was wrong.

- **Phase 0, export and shadowing fixes: done.** The Markdown and Marp exports
  carry the saved components a deck uses (`StudioShell.tsx` `usedLocalComponents`
  feeds both the preview and `ShareSheet`). The Marp bundle writes a saved theme's
  own CSS and fails with the theme's name when it can't bundle one; the `indaco`
  fallback is gone (`deck-export.js` `exportMarp`). Shipped theme and component
  names are reserved and a clash saves as `<name>-custom`
  (`library/reserved-names.ts`, fed by the generated `SHIPPED_THEME_NAMES` and the
  stage catalog's `COMPONENT_NAMES`), and a record saved under a shipped name before
  the guard no longer overrides the shipped item. Asset-zip import has the same size
  caps as `.lattice` import (`zip-limits.ts`).
- **Phase 0, the halo/nimbus print face: done, pending the owner's export sign-off.**
  `base.finish.css` now states THE BOTTOM-LAYER RULE: only the bottom full-bleed
  layer ends on solid `--fin-canvas`, and every full-bleed layer above it ends on
  `rgb(from var(--fin-canvas) r g b / 0)`. Halo's vignette and nimbus's top three
  blooms and vignette follow it, and so does the Studio generator
  (`finish-generate.ts` `fadeClear`). Corner and strip patches (ledger's fold,
  strata's hairline) keep their solid end: in print a zero-opacity end fades
  faster, because PDF rasterizers interpolate color and opacity separately, and a
  small patch hides nothing. `test/unit/css/finish-bottom-layer.test.js` checks
  every shipped preset. Measured with poppler and Ghostscript: the halo spotlight
  core goes from 255,255,255 to 246,250,252 in light, and a nimbus bloom from
  255,255,255 to 235,243,248. The vignette rim reads 2 to 4 levels lighter than
  before, for the same interpolation reason.
- **Phase 1, the spine core: done.** `lib/packages/` holds `kinds.js`, `read.js`,
  `write.js`, `index.js` and the build's walk `fs.js`. Themes and components are
  discovered through it: `loadAll`, the theme catalog, `listThemeManifests` /
  `listThemeFiles` and the new `checkPackageIdentity` share the one walk, and
  `tools/build-packages-index.js` writes the committed `packages.generated.json`
  (33 themes, 71 components, 28 of them code packages). The component schema accepts
  `type` and `format`, **optional in the repo**, where the folder implies the type;
  `write.js` stamps both on every package it writes, so a loose zip says what it is.
  Stamping all 104 shipped manifests would be churn with no reader today. The THEME
  schema does not take them yet: `manifest-schema-equivalence.test.js` pins that
  schema's exact mutation corpus and requires every property to be carried by a
  shipped theme, so the fields land in phase 5, when every theme manifest is rewritten
  into its folder anyway. Until then a Studio-exported theme's stamped manifest is a
  valid package but not yet a valid `themes/` manifest; phase 3 or 5 strips or accepts
  the two fields.
  Writing the failing arm of the identity gate found a real gap: a renamed component
  folder didn't fail anything, it vanished, because the walk only looked for
  `<folder>/<folder>.manifest.json`. `loadAll` had the same blind spot. The walk now
  lists a folder's lone manifest whatever its prefix, and the strict read names the
  mismatch. The rest of the tool walks over `themes/` (contrast audits, the scorecard,
  the docs portal) still read the folder directly; phase 5 moves them onto the spine
  when themes become folders.
- **Phase 2, finishes become packages: the registration half is done; the CSS half
  is measured and waits on the owner.** Each of the 9 presets is now
  `lib/finishes/<name>/` (manifest: name, label, blurb, picker swatch, `order`;
  plus `<name>.recipe.json`). `tools/build-packages-index.js` generates
  `lib/finishes/presets.generated.js`, and `FINISH_REGISTER`, the lint vocabulary,
  the Studio's `finish-catalog.ts`, `PRESET_RECIPES` and `RESERVED_FINISH_NAMES` all
  read it. That removes three of the four hand registrations. The fourth, the CSS,
  stays hand-written in `base.finish.css`, bound to the packages by
  `checkFinishPackages`.

  **The §3.6 pixel-diff, run before any CSS moved.** Each preset was rendered through
  the CLI twice, once with the hand CSS and once with `generateFinishCss(recipe)`,
  and compared per slide (share of pixels differing by more than 2%). The first pass
  exposed recipe DATA drift, now fixed in the packages: halo's spotlight sat in the
  corner instead of at 50%/42%, loom's glow on the wrong side, and meridian's and
  halo's texture pitches were one pixel off. So "Start from preset" in the Studio did
  not reproduce those presets. After the fix, with no ghost glyph:

  | preset | print light | print dark | screen light | screen dark |
  |---|---|---|---|---|
  | atrium | 0.60% | 0.60% | 0.62% | 0.62% |
  | meridian | 0.00% | 0.00% | 0.00% | 0.00% |
  | strata | 0.50% | 0.49% | 0.67% | 0.50% |
  | halo | 0.00% | 0.00% | 0.00% | 0.00% |
  | ledger | 0.00% | 0.00% | 0.38% | 0.00% |
  | nimbus | 0.00% | 0.00% | 0.00% | 0.00% |
  | loom | 0.00% | 0.00% | 0.00% | 0.00% |
  | savile | 0.00% | 0.00% | 0.00% | 0.00% |
  | gallery | 0.00% | 0.00% | 0.00% | 0.00% |

  Three gaps the vocabulary can't close, and a fourth that only shows with a glyph:
  - **atrium**'s margin rule is 0.47cqi; the vocabulary's `bar` is ledger's 1.1cqi.
  - **strata**'s top hairline strip (`100% 0.31cqi`) has no wash term.
  - **ledger**'s screen fold is hand-tuned (22% to 65%); the generator's rich face is
    formulaic (19% to 60%).
  - **Text marks.** With the demo deck's glyphs (`Q3`, `AB`, `04`), meridian, savile
    and gallery differ on 5–6% of pixels: the shipped CSS anchors the ghost glyph to a
    corner with flex alignment, and the generator centers it and shifts it with a
    transform. A generated rule also uses `section.finish.finish-<name>` (two
    classes), which outranks the one-class deck overrides the demo deck relies on
    (`section.finish-meridian { --fin-mark-text: "Q3" }`), so it has to emit the
    shipped one-class selector.

  So generating the shipped CSS today changes exported bytes on five of nine presets.
  That is a direction call with a sign-off attached, so it is left for the owner; the
  follow-up names three ways forward.
- **Phase 3, the Studio's zip on the spine: done.** A Studio export is now the package
  folder itself: `<name>/<name>.manifest.json` plus role files, or
  `<type>/<name>/…` in a bundle, with no envelope (`package-zip.ts`, through the spine's
  browser bundle `packages-core.generated.js` from `tools/build-packages-core.js`). A
  component's files take the repo's names (`styles.css`, `gallery.md`, not `.css` and
  `.skeleton.md`), and a finish ships its recipe only, since the CSS regenerates.
  `lattice-asset/1` zips still import through a one-way reader. Import trusts the
  manifest, not the file names: a folder saved as `harbor (1)` imports as `harbor`,
  and the toast says what was renamed or left out. A package carrying a
  `transform.js` is refused by name until phase 6. Each Studio record now carries
  what a package held that the record doesn't model (`PackageCarry`: the full
  manifest, a component's `docs.md`, a recipe's exact text). With that,
  `package-roundtrip.test.ts` shows repo package → zip → Studio → zip is
  byte-identical for a component, a theme and a finish, and
  `library-package-roundtrip.spec.ts` shows the same on the real Library.
  The carry lasts until the record is edited: the faculties save what they model and
  pass no carry, so an edited repo component exports without its `docs.md`. That is
  the safe direction, since an export never writes a stale manifest over an edit.
  A theme package's `essentials.json` is not CSS but becomes CSS when Fabricate
  reopens it, so import keeps only slug-named hex values from it (HARD RULE #22).
  Three things changed shape to get there. A finish or motion name may start with a
  digit (the Studio has always saved "2024 Launch" as `2024-launch`); a theme or
  component name, used bare as a `@theme` or a class, may not. The motion
  `poster.svg` is optional, because the Studio has always allowed a scene without one. The `@theme` helpers moved out of
  `parse.js` into `lib/theme/directive.js` (re-exported, API unchanged), so the spine's
  browser bundle is 15.7 KB instead of 63 KB.
- **Phase 4, the CLI's packages: done.** `lattice packages list | add | check | export
  | remove` (`lib/packages/cli.js`, dispatched from `lattice-emulator.js` before any
  render argument is parsed) works over `lib/packages/home.js`'s store:
  `--packages <dir>`, else `$LATTICE_HOME/packages`, else `~/.lattice/packages`.
  `add` runs the Studio's own gates, not a copy of them: the refusing rules moved into
  the leaf `lib/packages/import-gate.js`, the caps into `limits.js`, and the selector
  rename into `rename.js`, and the Studio's `import-gate.ts`, `zip-limits.ts` and
  `reserved-names.ts` now import those leaves. A shipped name installs as
  `<name>-custom` with its `@theme` or its selectors and gallery rewritten, a package
  with a `transform.js` is refused by name, and `add` will not overwrite an installed
  package without `--replace`.
  The render path looks up a theme it doesn't ship in the store, and fails with the name
  and the `add` command when it isn't there. An installed theme may import the base
  theme and nothing else, the Studio's own rule, so the two front doors refuse the same
  packages.
  An installed component's CSS is embedded into the deck with the Studio Markdown
  export's bridge (`lib/packages/render.js`), so the engine needs no second path for
  it; a component the deck already embeds keeps the deck's copy. `lattice` is reserved
  as a theme name, as the Studio reserves it. `packages export` of a shipped component
  works from a repo checkout only, because the npm package leaves galleries out.
  A `.lattice` project now carries the saved theme, components and finishes the deck
  uses as `packages/<type>/<name>/` folders (§4). They come back out through the
  Library's reader, and opening the file routes them through the one import funnel
  (`library/import-parsed.ts`, which the Library's `.zip` import uses too), so a
  project file is never a side door around the gates. A carried package that replaces
  a saved one of the same name keeps the old version in its history, and the toast
  says so.
  `jszip` moved from `devDependencies` to `dependencies`: the CLI reads and writes zips
  at run time (`packages add <zip>`, `packages export`, and the image-set `.zip` output).
  It used to arrive only through `pptxgenjs`'s dependency on it, which a strict installer
  such as pnpm does not expose to Lattice.
- **The adversarial trio on phases 0–4 (PR #2336).** A red team, a Munger inversion and an
  independent checker ran on what ships, and these findings were fixed before merge:
  - **Opening a `.lattice` overwrote saved assets.** A carried theme named `brand` replaced
    your saved `brand` in place, and every other deck of yours that said `theme: brand`
    changed with it. Opening a file now never writes over anything (`keepMine` in
    `library/import-parsed.ts`): an identical item is skipped, and a different one is saved
    under a free name (`brand-2`) that the opened deck is rewritten to use. A `-custom`
    rename reaches the deck the same way, and so does a workspace restore of a backup made
    before names were reserved. A `.lattice` no longer brings motion into the Library at
    all: a deck carries its motion inline (§5), so nothing needs it.
  - **A component could take a slide class the engine owns.** A package named `finish`,
    `print` or `dark` restyled every slide the engine stamps with that class. Those names
    are reserved for components as well: the deck linter's modifier vocabulary, every
    `section.<class>` in the engine's CSS and the `tint-*`/`mark-*`… families, generated
    into `lib/packages/reserved-classes.generated.js` and read by the CLI's registry and
    the Studio's save path.
  - **The CLI store was gated only at `add`.** A package unzipped into
    `~/.lattice/packages` by hand, or a `--packages` folder, rendered ungated. The render
    and `list` now run the same gate (`lib/packages/gate.js`).
  - **`add` said "added" for a theme no deck could use** (no `@theme` line). `add` now
    reads back strictly what it will install, the way the render reads it.
  - **The two front doors disagreed.** The CLI accepted a theme importing a shipped
    palette, which the Studio refuses, and only the Studio read a zip with its manifest at
    the root. Both now match the Studio.
  - **Smaller:** an old-format zip passed a theme's colors through unfiltered; a
    `.transform.JS`, `.mjs` or `.cjs` file rode along as an asset (any script now makes a
    code package); `export`/`remove` could not name a finish whose name starts with a
    digit; file names from a zip reached the terminal with their control characters; a
    finish saved before the print fix kept the defect until re-saved (its CSS is now
    regenerated from the recipe on read); a deck naming a component nobody has rendered it
    unstyled without a word (the CLI now warns); and the finish files called the recipe
    "the look" when `base.finish.css` is still what renders.
  What was found and deliberately NOT fixed here is in
  `followups.d/2336-p3-packages-trio-followups.md`.
- **Remote references in markup: done (follow-up items 2 and 3).** A package carries markup,
  not only CSS, in two places, and both could reach the network from the Studio origin.
  `lib/core/remote-ref.js` is the one predicate for both. A target is remote when it names a
  scheme other than `data:` or is protocol-relative; a relative path is not, because it
  resolves against the page that shows it. (That is looser than `css-scan.js` `urlIsLocal`,
  which holds a component STYLESHEET to `#fragment` and `data:` only.)
  - **A component's sample slide is refused on import when it fetches.** The gate RENDERS the
    gallery through the engine and parses the result with a spec HTML parser — parse5 in the
    CLI (`lib/packages/gallery-gate.js`), `DOMParser` in the Studio
    (`library/gallery-gate.ts`) — then reads every element: an attribute that loads (`src`,
    `srcset`, `href` on anything but a link, `xlink:href`, `poster`…), a `url()` or string in
    a style, a presentation attribute or a `<style>` body, a SMIL `<set>`/`<animate>` that
    sets `href`, a meta refresh, and the text of a Mermaid fence (its `img:` shapes and
    `themeCSS` load at run time). It also refuses any remote link reference definition, used
    or not: a definition renders nothing where it is written, yet the first definition of a
    label wins across the whole deck the slide is inserted into, so it can hand the deck's
    own `![logo]` a remote target. The engine exposes `referenceTargets()` for that read.
  - **Why render first.** The first cut scanned the markdown source with regexes, and the
    red team found eleven spellings it missed, each a place where a regex disagreed with
    markdown-it, the HTML5 parser or a component transform: a fence closed by a longer
    fence, an escaped backtick, a reference definition in a blockquote or on the next line,
    Unicode case folding of a label, `&bsol;` and `&#X3A;`, an `image-set()` string holding
    a `)`, a `/*` in prose hiding a style attribute, the `logo:` front matter key, and the
    `video` component's `poster` bullet. The rendered check holds on all of them
    (`test/unit/core/gallery-remote-refs.test.js` keeps each as a row), and the CSS scan is
    now a tokenizer rather than a regex for the same reason. A final checker on the rendered
    version found two more on the CLI's PDF render, both fixed: a Mermaid label spelled with
    Mermaid's own entity codes (`https#58;#47;#47;…`, which Mermaid decodes after the page has
    the fence, so the scan now decodes them first), and a nested document (`srcdoc`, and a
    `data:` document in an `iframe`, `object` or `embed`, which load whatever they hold), plus
    `imagesrcset`. A third checker pass on that fix found four more, all fixed and each a test
    row: a Mermaid fence inside an HTML block (plain text in the page, yet the CLI export
    draws it, so the gate now also scans every fence `lib/core/mermaid-fences.js` finds in the
    source), a slashless `http:host/x` in Mermaid text (a `file:` page resolves it), `&#58`
    without its semicolon, and a `data:` scheme split by a tab or led by a control
    character. The Mermaid class match is now the runtime's own substring rule, so a
    `mermaid-x` fence it would draw is scanned too. A fourth pass found two more, both fixed:
    a CRLF or lone-CR gallery (the fence walker matched nothing raw, while the CLI converts
    line endings before drawing, so both doors now convert them first), and a tab inside a
    slashless scheme (`ht<TAB>tp:host`, or Mermaid's `ht#9;tp:`), which the URL parser drops.
    It found no false positive across 305 tracked decks, galleries and baselines.
  - **Why the gate now uses an allowlist in two places.** Four passes found 11, 2, 4 and 2
    bypasses, and every late one lived in the same two families: a URL spelled some new way
    inside Mermaid text, and a nested document. Refusing spellings one at a time can't end,
    so both families now refuse the CONSTRUCT whatever it points at. A gallery's Mermaid
    may not use an image shape (`img:`), an HTML media tag in a label, a `src=`/`href=`
    attribute, a markdown image, a `click` directive, `url()`, `image-set()`, `themeCSS`,
    `@import`, `//`, or an entity code (`MERMAID_FORBIDDEN` in `lib/core/remote-ref.js`).
    A gallery may not contain an `iframe`, `frame`, `object`, `embed`, `portal`,
    `fencedframe` or `applet` at all. Measured against the tree first: 0 of the 163 Mermaid
    fences in 352 tracked files and 0 of 305 decks and galleries trip it. Plain words stay
    legal (`diagram.gallery.md` labels a node `src/`), and so does `R&D`.
  - **Front matter, the fifth pass.** A final checker found two bypasses outside both
    families, both in front matter, which the gate's own render prints nothing from: Insert
    splices a gallery after a `---`, so its front matter becomes an ordinary slide; and the
    CLI's `readGlobalStyle` pastes a front-matter `style:` key into the export's stylesheet,
    matched line-wise so an indented `style:` inside another key's block counts. The gate now
    also renders the gallery AS INSERTED, and reads the front-matter block with the Mermaid
    allowlist plus a refusal of any `style:` line. All 71 shipped component galleries open
    with front matter (`marp`, `theme`, `paginate`, `header`) and pass.
  - **Scripts, the sixth pass.** A review of the render containment found that a deck script
    could still send WebRTC UDP and a DNS lookup past the proxy (fixed there), and that the
    gate never read `<script>` at all. The gate now refuses an inline `<script>`, a `data:` or
    `javascript:` script source, any `on…=` event handler and any `javascript:` URL. An empty
    script loaded by a relative path stays legal: the shipped diagram gallery loads the
    vendored Mermaid that way, and a package cannot supply such a file, since any script file
    makes it a code package.
  - **Scripts, the seventh pass.** An independent checker on the sixth pass found that the
    source check read only `src`, while an SVG `<script>` names its file in `href` or
    `xlink:href`: `<svg><script href="data:text/javascript,…">` passed the gate and ran in
    Chromium. All three attributes are now read. The same review showed a `<meta
    http-equiv="refresh">` to a `data:` page running that page's script in a subframe, so a
    refresh is now refused whatever it points at. Still legal, and recorded rather than closed:
    a relative script `src` resolves against the Studio origin or the author's disk, so it can
    load code the package did not supply, though never code the package wrote.
  - **Both doors, one wording.** The Studio's `refuseImportedComponent` (the Library zip and
    a `.lattice`, through `import-parsed.ts`) and the CLI's `refusePackage` at `add`, `check`
    and `list` refuse with `remote-ref.js`'s `galleryRefusal`. A slide that cannot be checked
    (the engine failed to load or to render) is refused, not waved through. The CLI's render
    path skips the gallery (`forRender`): it embeds a component's CSS and never its gallery.
    Fabricate shows the same finding live on the Component tab as a WARNING: your own
    component still saves, and the warning says a recipient's import will refuse it. All 84
    shipped galleries pass, in about 20 ms each after a one-time ~300 ms engine load.
  - **Motion art** keeps `sanitizeSlideHtml`'s profile (which leaves remote references on
    purpose, since a deck's own images are remote) and then loses every attribute that
    fetches from another origin (`scene-library.ts` `stripRemoteRefs`). It runs on every
    save and again on every read, so a record saved before the fix is drawn without its
    beacon too. Line-art has no use for the network, so nothing legitimate is lost; a
    same-document `url(#id)` stays. DOMPurify already drops `<set>`, `<animate>` and
    `<style>` from it.
  - **What this does not close.** A DECK is still allowed to load remote images: a deck's own
    images are legitimately remote, so `sanitizeSlideHtml` keeps them, and a deck someone
    sends you can beacon in the preview and in every export. This change closes the package
    doors, where the markup rides in under a name the user trusts. The root fix for decks is
    at the render boundary: an `img-src` policy on the preview frames with a visible "load
    remote images" switch, and an export option that inlines or strips them. That is
    recorded in `followups.d/2336-p3-packages-trio-followups.md`, with the workspace
    restore, which still saves library items without the import gates.
  The e2e `library-remote-refs.spec.ts` imports both through the real Library and asserts,
  against a control fetch that proves the log works, that the browser made no request to the
  beacon host.
- **Trio follow-ups 1, 4, 6 and 9.**
  - **1, the CLI half: done.** A shipped name hides an installed package of the same name,
    and that is now said out loud: the render path warns when the deck's theme, or a
    component it uses, is shipped AND installed, and `packages list` marks the installed row
    as hidden. The Studio half and a user namespace stay open as the owner's call.
  - **4, the streaming inflate: done.** `lib/packages/zip-read.js` `readEntryCapped` inflates
    an entry through JSZip's `internalStream` and stops at the chunk that takes the running
    total past the cap. The CLI's `add` and the Studio's `readBudget` (asset zips and
    `.lattice` packages) both read through it. Measured on a 51 KB zip whose 50 MB entry
    declares 10 bytes: the capped read stops after 1.06 MB against a 1 MB cap, in 125 ms;
    `entry.async()` inflates all 50 MB before JSZip's own size check throws.
  - **6, the `process.execPath` spawn: declined.** Running `packages` in-process needs the
    rest of `lattice-emulator.js`'s top-level code not to run, and the only in-file way, a
    top-level `return`, is legal CommonJS that Biome refuses to parse. The clean fix is a thin
    bin entry that dispatches before loading the renderer, and it is worth building together
    with a single-executable build, which does not exist yet. Nothing ships on a runtime other
    than Node today.
  - **9, escaped selectors: done.** `renameComponentSelectors` decodes each class token's CSS
    escapes before comparing, so `.\6b pi` and `.k\70 i` are renamed with `.kpi`.
