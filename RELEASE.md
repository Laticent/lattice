# Releasing `@slidewright/lattice`

> **Status: automated, manually triggered.** The **Release** GitHub Action
> (`.github/workflows/release.yml`, `workflow_dispatch`) cuts a release
> end-to-end: it reads the bump from the changelog, bumps the version, rolls
> `## Unreleased`, tags, and publishes a GitHub Release with notes + the
> showcase zip. **npm publish is opt-in** (off by default until an
> `NPM_TOKEN` is configured). You can also run the same flow locally with
> `npm run release`.

## What a release is

A release is a git tag `v<x.y.z>` whose number matches `package.json`
`version`, pointing at a commit with a freshly built, in-sync `dist/` and a
`CHANGELOG.md` whose `## Unreleased` items have been rolled into a dated
section. The tag is the source of truth; the GitHub Release (and, when
enabled, npm publish) follows from it. **The bump level is derived
deterministically from `## Unreleased`** — see Versioning.

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
level is computed from `CHANGELOG.md` `## Unreleased`** by
`tools/changelog.js`, mapping Keep-a-Changelog categories to semver:

| Category in `## Unreleased` | Bump |
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

**Primary path — the Release workflow** (Actions → **Release** → *Run
workflow*):

- `bump`: leave as **`auto`** to use the changelog-derived level, or force
  `patch`/`minor`/`major`.
- `publish_npm`: leave **off** unless npm publishing is enabled.

The workflow gates (lint + unit + `build:check`), then runs
`tools/release.js`, which: computes the bump, `npm version`s, rolls
`## Unreleased` → `## <version> - <date>`, rebuilds `dist/`, commits
`release: v<version>`, tags it, **pushes to `main`**, and creates the
GitHub Release with the `## Unreleased` notes + the showcase zip.

**Local fallback** — identical flow on a clean `main`:

```sh
npm run release:dry          # preview: bump level, version, notes — changes nothing
npm run release -- --push    # cut it for real and push the commit + tag
# then attach the zip + notes to the Release (the workflow does this for you):
# gh release create v<version> release/lattice-v<version>.zip \
#   --notes-file release/notes-v<version>.md
```

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

`.github/workflows/release.yml` (`workflow_dispatch`) runs on
`ubuntu-latest`, node 22:

1. `checkout` (`fetch-depth: 0`, `fetch-tags: true`) + `setup-node` +
   `npm ci`.
2. Gate: `npm run lint`, `npm test`, `npm run build:check`. (The
   integration tier already ran on the commit via `ci.yml`; the release
   only adds a version bump + changelog roll + dist rebuild.)
3. Set the `github-actions[bot]` git identity.
4. `node tools/release.js --bump=<input> --push --skip-checks` — the bump,
   changelog roll, dist rebuild, commit, tag, zip, and push to `main`.
5. `gh release create v<version>` with `--notes-file release/notes-v<version>.md`
   and the `release/lattice-v<version>.zip` asset (`--verify-tag`).
6. **If `publish_npm`** — `npm publish --access public --provenance`.

Prerequisites:

- **Branch protection on `main` must allow the `github-actions` bot to
  push.** The release commit + tag go straight to `main` (the chosen
  direct-push flow); a protected branch without a bypass rule will reject
  the push. Add an allowance for the Actions bot, or switch the workflow
  to open a PR instead.
- The job already declares `permissions: { contents: write, id-token: write }`
  (write to push + create the Release; id-token for npm `--provenance`).
- **To enable npm publish:** add an **`NPM_TOKEN`** repo secret (publish
  rights, exposed as `NODE_AUTH_TOKEN`), confirm the `@slidewright` scope
  exists and the token can publish to it, then run the workflow with
  `publish_npm` checked. Until then leave it off — the GitHub Release +
  zip still ship.
