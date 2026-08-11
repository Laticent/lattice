# Releasing `@workwel/lattice`

> **Status: automated, manually triggered, cut in two phases across a merge.**
> **Release (prepare)** (`.github/workflows/release.yml`, `workflow_dispatch`)
> reads the bump from the changelog, bumps the version, rolls `## Unreleased`,
> rebuilds `dist/`, and puts the result up as a **pull request with auto-merge
> already on** — so the merge queue lands it unattended. **Release (publish)**
> (`release-publish.yml`) then fires on `main`, tags the merged commit, and
> publishes a GitHub Release with notes + the showcase zip. **npm publish is
> opt-in** (skipped until an `NPM_TOKEN` is configured).
>
> **Why two phases:** `main` takes no direct pushes — the `Main Merge Queue`
> ruleset requires a PR, the queue, and a green `ci`, for bots and humans alike
> (#1439). A release is exactly the change that should go that route: the tag
> ends up naming a tree the required check actually passed on. The same two
> phases run locally — `npm run release:prepare` / `npm run release:publish`.
>
> **Where the human is:** dispatching **Release (prepare)** *is* the
> authorization to ship — from there nothing waits on a click. That is a
> deliberate narrowing of "a human authorizes every merge" (`CLAUDE.md` rule 7),
> and it is the only merge in the repo besides the backlog mirror that a human
> doesn't approve. To stop a release mid-flight, disable auto-merge on the PR or
> close it before the queue takes it.

## What a release is

A release is a git tag `v<x.y.z>` whose number matches `package.json`
`version`, pointing at a commit with a freshly built, in-sync `dist/` and a
`CHANGELOG.md` whose `## Unreleased` items — and every pending `changelog.d/`
fragment, folded in and deleted by the same commit — have been rolled into a
dated section. The tag is the source of truth; the GitHub Release (and, when
enabled, npm publish) follows from it. **The bump level is derived
deterministically from `## Unreleased` + the fragments** — see Versioning.

## The distribution contract

What ships is defined entirely by `package.json` — don't special-case
it at release time:

- **`exports`** — the public entry points. Consumers reach the engine
  through named subpaths (`/css`, `/runtime`, `/config`,
  `/themes/<name>.css`), never raw repo paths.
- **`files`** — the allowlist. Ships engine source, `dist/`, `themes/`,
  and the two authoring docs (`design/skill.md`,
  `design/design-system.md`). PDFs and `*.gallery.md` are excluded
  via negation — they're regression baselines and reviewer
  deliverables, kept in git but never shipped. Tarball is ~2.3 MB
  (the bundled `dist/lattice-emulator.js` is the bulk of it).

Verify before any release:

```sh
npm pack --dry-run        # inspect file list + size; no .pdf should appear
```

## Versioning

Semver. `package.json` `version` is the single source of truth. **The bump
level is computed from `CHANGELOG.md` `## Unreleased` plus every pending
`changelog.d/` fragment** by `tools/changelog.js`, mapping Keep-a-Changelog
categories to semver. A fragment's category is in its FILENAME
(`<slug>.<category>.md`), so it maps through the same table:

| Category in `## Unreleased` / a fragment filename | Bump |
|---|---|
| `### Removed`, or any `**Breaking:**` bullet / `BREAKING CHANGE` token | **major** |
| `### Added`, `### Changed`, `### Deprecated` | **minor** |
| `### Fixed`, `### Security` | **patch** |

This is why `## Unreleased` must be kept accurate **as changes land** (the
`CLAUDE.md` convention) — the changelog *is* the release input. The
semantic policy behind the categories: removed/renamed `exports`, dropped
themes, a raised Node floor (currently **>=22**), or any break to a stable
layout/token surface ⇒ major (flag with `**Breaking:`**); new
components/themes/modifiers or additive `exports` ⇒ minor; fixes and
internal (Mermaid CSS) churn ⇒ patch. An empty `## Unreleased` means there
is nothing to release.

> **No contract-diff backstop (yet).** The bump trusts the changelog. A
> structural break (e.g. a removed `exports` key) mis-filed under
> `### Changed` without a `**Breaking:`** marker would under-bump. If that
> ever bites, add a `tools/check-version-bump.js` that diffs
> `exports`/`themes`/`engines` since the last tag and fails when the
> computed bump is lower than the diff requires.

## How to cut a release

**Primary path — the Release workflows.**

1. **Actions → Release (prepare) → *Run workflow***. Set `bump` to **`auto`**
   for the changelog-derived level, or force `patch`/`minor`/`major`. It gates
   (lint + unit + `build:check`), then runs `tools/release.js --prepare`:
   computes the bump, `npm version`s, rolls `## Unreleased` →
   `## <version> - <date>`, rebuilds `dist/`, and commits `release: v<version>`
   — **no tag, no push to `main`**. It pushes `release/v<version>`, opens the
   PR, and turns on auto-merge.
2. **Nothing to do — the queue lands it.** `ci` runs on the PR, the merge queue
   rebases and re-runs it on the combined state, and the PR squash-merges. Worth
   a look while it runs (the version, the rolled changelog section, the `dist/`
   rebuild); to abort, disable auto-merge or close the PR.
3. **Release (publish) fires by itself** on the resulting push to `main`. It
   no-ops unless `package.json`'s version is untagged, then runs
   `tools/release.js --publish --push`: tags **the merged commit**, rederives
   the notes from the changelog section, builds the zip from the tagged tree,
   pushes the tag, creates the GitHub Release, and publishes to npm if
   `NPM_TOKEN` is set. Re-runnable by hand (`workflow_dispatch`) if a step
   failed partway.

The tag is deliberately cut in phase 2: the queue squashes the PR into a new
commit, so a tag made on the release branch would name a sha `main` never gets.

**Local fallback** — the same two phases, same tools:

```sh
npm run release:dry              # preview: bump level, version, notes — changes nothing
git switch -c release/vX.Y.Z     # cut the release commit on a branch, never on main
npm run release:prepare          # bump, roll, rebuild dist, commit (no tag, no push)
git push -u origin release/vX.Y.Z
# open the PR, get it merged through the queue, then on a synced main:
npm run release:publish          # tag the merged commit, zip, notes, push the tag
gh release create v<version> release/lattice-v<version>.zip \
  --notes-file release/notes-v<version>.md --verify-tag
```

`npm run release` with no phase flag prints this menu rather than guessing.

`prepublishOnly` re-runs `npm test` as a backstop before any registry
upload.

## The GitHub release zip

Three artifacts ship from a tag, each for a different audience — don't
conflate them:

| Artifact | Built by | For |
|---|---|---|
| **npm tarball** | `npm publish` (`files` allowlist) | `npm install` consumers; engine source + `dist/` (incl. `.min` variants), no PDFs. ~2.6 MB. |
| **Source code (zip/tar.gz)** | GitHub, automatically | the whole repo at the tag — clone-and-build. |
| **`lattice-v<x.y.z>.zip`** | `npm run release:zip` | download-and-use: the curated, offline-browsable **full showcase**. |

The release zip is the only one that carries the **gallery + example
PDFs** (npm drops them, the source zip buries them in the tree). It is a
`git archive` of HEAD under a `lattice-v<x.y.z>/` prefix, so it is
tracked-only and deterministic per commit. Contents (full showcase):

- `dist/` — the engine: `lattice.css`, `lattice-default.css`,
  `lattice-runtime.js`, the bundled `lattice-emulator.js`, each one's
  minified `.min` twin (`lattice.min.css`, `lattice-default.min.css`,
  `lattice-runtime.min.js`, `lattice-emulator.min.js`), `README.md`,
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
config, `node_modules/`, and the repo-root `lattice-emulator.js` source
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
`ubuntu-latest`, node 22:

1. `checkout` (`fetch-depth: 0`, `fetch-tags: true`) + `setup-node` + `npm ci`.
2. Gate: `npm run lint`, `npm test`, `npm run build:check`. (The integration
   tier already ran on the commit via `ci.yml`, and the full tier runs again on
   the PR and in the queue; this only stops an obviously broken release from
   becoming a PR.)
3. Set the `github-actions[bot]` git identity.
4. `node tools/release.js --prepare --bump=<input> --skip-checks` — the bump,
   changelog roll, dist rebuild, and the commit. The version comes back via
   `$GITHUB_OUTPUT`, so the workflow never re-derives it.
5. Push `release/v<version>` and `gh pr create` — both as `AUTOMATION_PAT`, not
   the repo token (see Prerequisites).
6. `gh pr merge --auto --squash`, so the queue lands it once `ci` is green.

**`.github/workflows/release-publish.yml` — Release (publish)** (`push` to
`main` touching `package.json`, plus `workflow_dispatch` for recovery):

1. `checkout` with full history + tags.
2. **Gate:** read `package.json`'s version; if `v<version>` is already tagged,
   every remaining step is skipped. A dependency bump touches `package.json`
   too, so this must be a quiet no-op rather than a failure.
3. `node tools/release.js --publish --push` — `build:check`, rederive
   `release/notes-v<version>.md` from the changelog's `## <version>` section,
   tag `HEAD`, build the zip, push the tag.
4. `gh release create v<version>` with `--notes-file` and the
   `release/lattice-v<version>.zip` asset (`--verify-tag`).
5. `npm publish --access public --provenance`, if `NPM_TOKEN` is set.

Prerequisites:

- **Nothing needs a ruleset bypass.** Phase 1 pushes a branch, phase 2 pushes a
  tag, and the ruleset targets `refs/heads/main` only. See
  `engineering/workflow.md` § Automation vs. the main ruleset.
- **`AUTOMATION_PAT` (required), in the `automation` environment.** A branch
  pushed or a PR opened with `GITHUB_TOKEN` never starts `ci` — GitHub
  suppresses workflow runs for events raised by the repo token — so the required
  check never appears and the PR could never merge. Phase 1 uses a fine-grained
  PAT with **Contents: write** + **Pull requests: write**, and **fails loudly**
  if it is missing rather than opening a PR that can never land. It is an
  *environment* secret restricted to `main`, so a PR branch cannot read it; both
  release jobs therefore declare `environment: automation`. The same secret
  drives `sync-backlog.yml`. Details:
  `engineering/workflow.md` § Automation vs. the main ruleset.
- The jobs declare the permissions they need: `contents: write` +
  `pull-requests: write` for phase 1, `contents: write` + `id-token: write` for
  phase 2 (`id-token` for npm `--provenance`).
- **To enable npm publish:** add an **`NPM_TOKEN`** secret (publish rights,
  exposed as `NODE_AUTH_TOKEN`) and confirm the `@slidewright` scope exists and
  the token can publish to it. **Put it in the `automation` environment, not in
  the repo secrets** — a registry-publish credential is the last thing that
  should be readable from a PR branch. **Setting the secret *is* the opt-in** —
  the phase that publishes is no longer the phase you dispatch, so there is no
  run to tick a checkbox on. Until it is set the step is skipped with a notice,
  and the GitHub Release + zip still ship.

### One caveat on the release notes

The GitHub Release body is capped at **125,000 characters**, and this repo's
`## Unreleased` is currently the entire changelog (~1.4 MB). `tools/release.js`
trims the notes on a line boundary and appends a pointer to `CHANGELOG.md`,
warning when it does — without that, `gh release create` fails *after* the tag
is pushed. The changelog remains the complete record.
