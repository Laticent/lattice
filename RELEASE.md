# Releasing `@laticent/lattice` and its libraries

> **Status: Changesets, manually triggered, cut in two phases across a merge.**
> A release publishes up to thirteen packages to npm, each on its own version
> line: `@laticent/lattice` and the twelve libraries in
> `tools/release-packages.js` `PUBLISH_SET`. **Release (prepare)**
> (`.github/workflows/release.yml`, `workflow_dispatch`) runs `changeset version`
> and puts the result up as a **pull request with auto-merge already on**, so the
> merge queue lands it unattended. **Release (publish)** (`release-publish.yml`)
> then fires on `main`, runs `changeset publish` for every package npm does not
> have yet (in dependency order, with provenance), tags what it published, and
> creates the engine's GitHub Release with the notes and the showcase zip.
>
> **Why two phases:** `main` takes no direct pushes — the `Main Merge Queue`
> ruleset requires a PR, the queue, and a green `ci`, for bots and humans alike
> (#1439). A release is exactly the change that should go that route: the tags
> end up naming a tree the required check actually passed on. The same phases run
> locally — `npm run release:prepare` / `npm run release:publish`.
>
> **Where the human is:** dispatching **Release (prepare)** *is* the
> authorization to ship — from there nothing waits on a click. That is a
> deliberate narrowing of "a human authorizes every merge" (`CLAUDE.md` rule 7).
> To stop a release mid-flight, disable auto-merge on the PR or close it before
> the queue takes it.
>
> Decision: `engineering/decisions/2026-10-07-first-npm-release.md` (§11 is the
> Changesets build). Weekly automatic releases (slice F) come after 1.0.0, in their
> own PR; today every release starts with a dispatch.

## What a release is

A release is a set of npm versions plus one git tag per package,
`<name>@<version>` (`@laticent/lattice@1.0.0`, `@laticent/ltt@0.1.0`), each on
the merged release commit. When the engine is among them it also gets
`v<version>` (`v1.0.0`), which names its GitHub Release and the showcase zip.
**npm is the source of truth**: Release (publish) publishes whatever is missing
from it and tags whatever is untagged, so a re-run after a partial failure picks
up exactly where the last one stopped.

What a release contains comes from the **changesets** pending on `main`
(`.changeset/*.md`, HARD RULE #10, contract in `.changeset/README.md`), plus any
legacy `changelog.d/` fragment, which the release converts into an engine
changeset first. Six libraries (`filo`, `fuoco`, `suono`, `tavola`, `vetrina`,
`veduta`) are held back by `.changeset/config.json` `ignore` and never publish
until a PR moves them into `PUBLISH_SET`.

## The distribution contract

What ships is defined entirely by `packages/lattice/package.json`, the
engine's publish folder — don't special-case it at release time.

**Where the package lives.** The repository root `package.json` is a private
workspace root: npm scripts, `devDependencies`, `workspaces` and `overrides`.
`packages/lattice/package.json` carries every field the engine publishes
(`name`, `version`, `bin`, `main`, `exports`, `files`, `dependencies`,
`optionalDependencies`, `engines`, `license` and the metadata), and nothing
else of the source moved: `lattice.js`, `lib/`, `themes/` and the docs stay at
the root. Its `prepack` runs `npm run build` at the root, then
`tools/stage-engine-package.js`, which hard-links every `files` entry (and the
`design/README.md` npm adds from a packed folder) into `packages/lattice/`;
its `postpack` removes them again. The staged paths are gitignored. The folder
exists so Changesets can version `@laticent/lattice` as a workspace
(`engineering/decisions/2026-10-07-first-npm-release.md` §8, option A). The
dev CLI and the installed one read the version through
`lib/core/pkg-root.js` `engineManifestPath`. Bump a runtime dependency in
`packages/lattice/package.json`; bump `puppeteer` in both manifests, because
the root's `$puppeteer` override needs a root dependency of the same range
(`test/unit/tools/stage-engine-package.test.js` holds them equal).

- **`exports`** — the public entry points, and at 1.0 every one of them is
  a promise. The root import (`.` and `main`) is the engine,
  `lib/engine/index.js`, the same module as `/engine`: importing the
  package must never run the CLI, which parses the host's argv and calls
  `process.exit`. The CLI is reachable only as the `lattice` bin, and its
  minified twin `dist/lattice-min.js` is not exported.
  `test/integration/export/installed-package.test.js` fails if a
  `require` or `import` of the root does not return. Consumers reach the
  engine's other surfaces through named subpaths (`/css`,
  `/runtime`, `/engine`, `/themes/<name>.css`, and the two named `dist/`
  files `dist/lattice-emoji.css` and `dist/docs/components.json`). There
  is deliberately no `./lib/*` or `./dist/*` wildcard: a wildcard makes
  every internal file public API.
- **`files`** — the allowlist. Ships engine source, `dist/`, `themes/`,
  and the authoring docs (`design/skill.md`, `design/design-system.md`,
  `design/skills/`). PDFs and `*.gallery.md` are excluded via negation —
  they're regression baselines and reviewer deliverables, kept in git but
  never shipped. So are `dist/marp-kit/` and `dist/agent-kit/`, which
  ship on the `dist-kits` branch and in the release zip instead. The
  tarball is ~22 MB packed, ~71 MB unpacked (measured 2026-10-07); the
  bundled `dist/lattice.js` and `dist/lattice-runtime.js` are
  the bulk of it.
- **`dependencies`** — everything shipped code loads at run time, and
  nothing else. That includes the workspace libraries the engine imports
  (`@laticent/segno`, `trama`, `cadenza`, `calco`, `ltt`, `mosaico`, `fluido`, `squadra`, `markup`, `lastra`, `segno-languages`).
  The bundled CLI inlines nine of them (`INLINE_PACKAGES` in `tools/build-cli.js`); it
  still `require`s `@laticent/markup` and `@laticent/segno-languages`, so the CLI needs those
  two installed like any other dependency. A library a plugin keeps a committed copy of
  (Mermaid and its CLI render page, ZenUML, KaTeX, function-plot) is a
  `devDependency`: the build refreshes the copy from it, and no install
  needs it. `test/unit/cli/shipped-imports-resolvable.test.js` fails when
  shipped code loads a package an install would not provide; a loader
  that survives the absence is sanctioned there with its reason.

Verify before any release:

```sh
npm pack --dry-run -w @laticent/lattice   # builds, stages, lists; no .pdf should appear
```

That listing is the root tarball's, file for file: on 2026-11-22 both shipped
2,202 files, 34.2 MB packed and 112.2 MB unpacked, and the two lists diffed
empty. `test/integration/export/installed-package.test.js` stages a copy and
installs from it on every PR.

And install it the way a user will, in an empty directory, before the
first publish of any new dependency shape:

```sh
npm pack --workspaces --pack-destination /tmp/p   # the engine is a workspace too
mkdir /tmp/room && cd /tmp/room && npm init -y && PUPPETEER_SKIP_DOWNLOAD=1 npm i /tmp/p/*.tgz
npx @laticent/lattice deck.md deck.pdf   # also: npx lat deck.md deck.pdf (the short bin)
```

`--workspaces` packs every `@laticent/*` workspace, the engine included, so a new dependency can't be left out.
A hand-kept list here missed `@laticent/segno-markdown` (since renamed `@laticent/segno-languages`), and the install then failed with a
404 for a package that wasn't published yet (found 2026-11-11, PR #3142).

## Versioning

Semver, per package. Each package's own `package.json` `version` is its source
of truth, and each changeset names the packages it changes and the bump for each:

| Bump | When |
|---|---|
| **major** | anything that breaks a deck or a caller: a removed or renamed `exports` key, a dropped theme, a raised Node floor (currently **>=22**), a break to a stable layout or token surface |
| **minor** | something new: a component, theme, modifier or additive export; a deprecation |
| **patch** | a fix, or internal churn (Mermaid CSS) |

`changeset version` applies them: it bumps each named package, patches every
package that depends on one whose new version leaves its range, writes each
package's `CHANGELOG.md`, and deletes the changesets. A legacy fragment converts
with the bump its filename's category always picked (`removed` or a
`**Breaking:**` bullet ⇒ major; `added`/`changed`/`deprecated` ⇒ minor;
`fixed`/`security` ⇒ patch).

The libraries are `0.x`: under semver a `0.x` minor may break, which lets a
library's API settle. Only `@laticent/lattice` makes the 1.0 promise.

> **No contract-diff backstop (yet).** The bump trusts the changeset. A
> structural break (e.g. a removed `exports` key) filed as `minor` would
> under-bump. If that ever bites, add a check that diffs `exports`/`themes`/
> `engines` since the last tag and fails when the declared bump is lower.

## The first release: 1.0.0

The first npm release **bumps nothing.** The engine ships at the `1.0.0` it
carries and each library at its `0.1.0`. `tools/release.js` recognizes it by
asking npm: the engine is `1.0.0`, `npm view @laticent/lattice@1.0.0` returns
404, and no `@laticent/lattice@1.0.0` tag exists. Any other unpublished engine
version is refused, because it means the previous release never finished.

For that release, Release (prepare) archives every pending fragment and
changeset into `changelog/pre-release-archive.md` (1.0.0's notes are the curated
`release-notes/1.0.0.md`) and writes each package's first `CHANGELOG.md` section.
Release (publish) refuses to publish while the August `v1.0.0` tag still exists,
before anything reaches npm.

**Release-day steps (issue #3449):**

1. Every blocker on #3449 is checked off and `main` is green. `npm run release:dry`
   on a synced `main` prints `BOOTSTRAP` and the thirteen packages, with no
   warning. (A warning naming `markup`, `lastra` or `segno-languages` means #3451
   or the Segno rename has not merged.)
2. `NPM_TOKEN` is listed under Settings → Environments → `automation`. Never read
   or print it.
3. Owner: retire the August tag. Tag its commit `v0.9.0`, mark that GitHub
   Release as a pre-release, delete `v1.0.0`.
4. **Actions → Release (prepare) → Run workflow** on `main`. The release PR
   (`release: v1.0.0`) auto-merges through the queue. Between step 3 and this PR
   merging, nothing else publishes: Release (publish) runs on a push only for a
   commit titled `release: …`.
5. Release (publish) runs by itself: thirteen `npm publish --provenance` (the
   eleven libraries with no `@laticent/*` dependency first, then `cadenza`, then
   the engine), fourteen tags, and the `v1.0.0` GitHub Release.
6. From a clean folder: `npx @laticent/lattice deck.md deck.pdf` renders.
7. Attach a trusted publisher to each of the thirteen packages on npmjs.com. Keep
   `NPM_TOKEN` until the publish job upgrades npm: trusted publishing needs npm
   11.5.1 or later, Node 22 ships 10.9, and that upgrade step is slice F's PR. Revoke
   the token once it has merged.

## How to cut a release

**Primary path — the Release workflows.**

1. **Actions → Release (prepare) → *Run workflow*** (no inputs: each changeset
   names its own bump). It gates (lint + unit + `build:check`), then runs
   `tools/release.js --prepare`: converts pending fragments, runs
   `changeset version`, refreshes `package-lock.json`, rebuilds, and commits
   `release: v<engine version>` (or `release: libraries-<date>` when only
   libraries move) — **no tag, no publish, no push to `main`**. It pushes
   `release/<name>`, opens the PR, and turns on auto-merge, **unless a package
   crosses a major version** (the engine to 2.0.0, say). Then auto-merge stays off,
   a comment names each crossing, and a human merges it.
2. **Nothing to do — the queue lands it.** Worth a look while `ci` runs: the
   versions and each package's new `CHANGELOG.md` section. To abort, disable
   auto-merge or close the PR.
3. **Release (publish) fires by itself** on the push to `main`, for a commit whose
   title starts `release: ` (the squashed release PR) and for no other push. It
   no-ops unless a publish-set package is missing from npm or untagged, then runs
   `tools/release.js --publish --push`: `build:check`; the engine's notes and zip
   (before anything reaches npm); `changeset publish`; the tags; then
   `gh release create v<version>` when the engine shipped. Re-run it by hand
   (`workflow_dispatch`) after a partial failure; it publishes and tags only what is
   left. One case it cannot repair: the engine is on npm and `v<version>` is pushed,
   but `gh release create` failed. Create that Release by hand with the local-fallback
   command below (`npm run release:publish` regenerates the notes and zip on a synced
   `main`).

**Local fallback** — the same phases, same tools:

```sh
npm run release:dry              # preview: bootstrap or the pending bumps; changes nothing
npm run release:status           # the exact bumps changeset version will apply
git switch -c release/vX.Y.Z     # cut the release commit on a branch, never on main
npm run release:prepare          # convert, version, rebuild, commit (no tag, no push)
git push -u origin release/vX.Y.Z
# open the PR, get it merged through the queue, then on a synced main:
npm run release:publish          # publish, tag, push the tags
gh release create v<version> release/lattice-v<version>.zip \
  --notes-file release/notes-v<version>.md --verify-tag
```

`node tools/release.js --publish --dry-run` runs the publish with npm's dry-run on
and tags locally without pushing; run it on a scratch clone, never on your working
copy. `npm run release` with no phase flag prints the menu rather than guessing.

The engine's `prepack` runs the root build and stages the files; there is no
`prepublishOnly` test run. Inside `changeset publish`, npm hands `--json` to
lifecycle scripts, which broke a packing test there, and the release commit has
already passed the required `ci` check on the same tree.

## The GitHub release zip

Three artifacts ship from a tag, each for a different audience — don't
conflate them:

| Artifact | Built by | For |
|---|---|---|
| **npm tarball** | `npm publish` (`files` allowlist) | `npm install` consumers; engine source + `dist/` (incl. `-min` variants), no PDFs, no kits. ~22 MB packed. |
| **Source code (zip/tar.gz)** | GitHub, automatically | the whole repo at the tag — clone-and-build. |
| **`lattice-v<x.y.z>.zip`** | `npm run release:zip` | download-and-use: the curated, offline-browsable **full showcase**. |

The release zip is the only one that carries the **gallery + example
PDFs** (npm drops them, the source zip buries them in the tree). It is a
`git archive` of HEAD under a `lattice-v<x.y.z>/` prefix, so it is
tracked-only and deterministic per commit. Contents (full showcase):

- `dist/` — the engine: `lattice.css`, `lattice-default.css`,
  `lattice-runtime.js`, the bundled `lattice.js`, each one's
  minified `-min` twin (`lattice-min.css`, `lattice-default-min.css`,
  `lattice-runtime-min.js`, `lattice-min.js`), `README.md`,
  and `docs/components.{md,html,json}`. The whole `dist/` directory is
  archived (`git archive … -- dist`), so any tracked artifact ships
  automatically — no per-file allowlist to keep in sync.
- `lib/` — the owned-engine source (transformers, core,
  component transforms, integrations) **and** every per-component,
  per-bucket, and integration gallery PDF the component reference links
  to (~140), so `dist/docs/components.md` resolves its
  `../../lib/components/…` links inside the unzipped tree.
- `themes/` — all palette files.
- `examples/` — showcase decks + their PDFs.
- `design/skill.md`, `design/design-system.md`, `README.md`, `LICENSE`,
  `CHANGELOG.md`.

Deliberately excluded: `test/`, `tools/`, `engineering/`, editor/CI
config, `node_modules/`, and the repo-root `lattice.js` source
(the bundle supersedes it).

The tool gates on a clean tree (it archives HEAD, not the working tree —
pass `--allow-dirty` to override) and on `build:check` (pass `--skip-check`
to override). Output lands in the gitignored `release/` dir; it is
uploaded to the Release, never committed.

> **Standalone-ness caveat.** PDF *export* (the emulator / marp-cli) shells
> out to Chromium (puppeteer) + `mmdc`, which a zip can't carry. The
> genuinely unzip-and-go surface is the CSS/runtime drop-in (browser /
> Marp-theme use) and the offline HTML + PDF reference. Rendering new decks
> to PDF from the zip still needs `npm install puppeteer
> @mermaid-js/mermaid-cli katex function-plot` (or a global marp-cli).

## How the workflow works

**`.github/workflows/release.yml` — Release (prepare)** (`workflow_dispatch`),
`ubuntu-24.04`, node 22:

1. `checkout` (`fetch-depth: 0`, `fetch-tags: true`) + `setup-node` + `npm ci`, and
   zsh, which `npm test`'s completion test drives (in CI it fails, not skips, without it).
2. Gate: `npm run lint`, `npm test`, `npm run build:check`. (The full tier runs
   again on the PR and in the queue; this only stops an obviously broken release
   from becoming a PR.)
3. Set the `github-actions[bot]` git identity.
4. `node tools/release.js --prepare --skip-checks`. It refuses unless the strict
   publish-set check passes (all thirteen packages exist and are public) and every
   changeset and fragment parses. It asks npm whether the engine's version is
   published, so it needs the network. `version`, `name` and `branch` come back
   via `$GITHUB_OUTPUT`.
5. Push `release/<name>` and `gh pr create` — both as `AUTOMATION_PAT`, not the
   repo token (see Prerequisites).
6. `gh pr merge --auto --squash`, so the queue lands it once `ci` is green; or,
   when `needs_review` is true (a major crossed), a comment instead, and a human merges.

**`.github/workflows/release-publish.yml` — Release (publish)** (`push` to `main`
touching a publish-folder or library `package.json` or `CHANGELOG.md`, run only
when the commit's title starts `release: `; plus `workflow_dispatch` for recovery):

1. `checkout` with full history + tags, `setup-node` with the npm registry.
2. **Gate:** `node tools/release.js --plan` lists every publish-set package that
   is missing from npm or untagged; with none, every remaining step is skipped. A
   dependency bump touches a manifest too, so this must be a quiet no-op.
3. `npm ci`, the git identity, and a check that no GitHub Release is already named
   `v<version>` when the engine is due (the August release owns `v1.0.0` until step 3).
   `--publish` also refuses a package whose `CHANGELOG.md` has no section for its
   version: only a release commit can publish.
4. `npm whoami` when the token is set, so a bad token stops the run before anything
   publishes; then `node tools/release.js --publish --push`, with `NODE_AUTH_TOKEN`
   (the `NPM_TOKEN` secret) and `NPM_CONFIG_PROVENANCE=true`. It asks npm up to four
   times, 15 s apart, before calling a just-published package missing. Changesets publishes in
   dependency rounds (`@pnpm/deps.graph-sequencer`); within a round, in parallel.
   A failure stops before the next round, so the engine, which depends on the
   most, publishes last or not at all.
5. `gh release create v<version>` with the notes and the zip, when the engine
   shipped.

Prerequisites:

- **Nothing needs a ruleset bypass.** Phase 1 pushes a branch, phase 2 pushes
  tags, and the ruleset targets `refs/heads/main` only. See
  `engineering/workflow.md` § Automation vs. the main ruleset.
- **`AUTOMATION_PAT` (required), in the `automation` environment.** A branch
  pushed or a PR opened with `GITHUB_TOKEN` never starts `ci` — GitHub suppresses
  workflow runs for events raised by the repo token — so the required check never
  appears and the PR could never merge. Phase 1 uses a fine-grained PAT with
  **Contents: write** + **Pull requests: write**, and **fails loudly** if it is
  missing. It is an *environment* secret restricted to `main`, so a PR branch
  cannot read it; both release jobs therefore declare `environment: automation`.
- The jobs declare the permissions they need: `contents: write` +
  `pull-requests: write` for phase 1, `contents: write` + `id-token: write` for
  phase 2 (`id-token` for npm provenance, and later for trusted publishing).
- **`NPM_TOKEN`, in the `automation` environment, for the first publish only.**
  npm can attach a trusted publisher only to a package that already exists, so
  the bootstrap publish uses a short-lived granular token; once each package has
  a trusted publisher, the token is revoked (release-day step 7). Without a token
  and without trusted publishers, npm refuses the publish and nothing is tagged.

### The release notes

The engine's GitHub Release body is `release-notes/<version>.md` when that file
exists (1.0.0 has one; so will any later release with a story), followed by
**Packages in this release**: one line per package, built from the first line of
each entry in that package's `CHANGELOG.md` section, which is each changeset's
first line. The body is capped at **125,000 characters**; `tools/release.js` trims
on a line boundary and says so rather than letting `gh release create` fail after
the tags are pushed.
