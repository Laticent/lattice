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
lattice packages list   [--type theme|component|finish|motion]   shipped + project, with a SOURCE column
lattice packages add    <file.zip | folder>                      gate, then copy into the project folder
lattice packages export <type>/<name> [-o file.zip]              zip one package (refused if it carries code)
lattice packages remove <type>/<name>                            project packages only; shipped are read-only
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
