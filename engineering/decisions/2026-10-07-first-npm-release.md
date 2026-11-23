---
status: proposed
summary: Plan for the first npm release, 1.0.0 — four owner rulings (recut 1.0.0, publish all nine libraries, curated notes, weekly automatic releases), what blocks it today, and the ordered slices.
---

# The first npm release: 1.0.0

**The answer:** `@laticent/lattice@1.0.0` ships to npm together with the nine
workspace libraries, each on its own version line. After that, a scheduled job
releases every week with no human step. Today four things block it: the
`@laticent` npm scope does not exist, an installed `lattice` CLI crashes on
start, the version tool computes 2.0.0 with 11,151 lines of notes, and the
tarball is 28 MB. The slices below clear those in order.

This note picks up `2026-08-09-changesets-multi-package-release.md`. That plan
was deferred on 2026-08-24 "until immediately before the first npm publish",
and this is that moment. Its design (Changesets, OIDC trusted publishing,
per-package tags) still stands. This note records what changed since then and
what the owner decided.

## 1. What we measured on 2026-10-07 (main at `7b4aff7`)

| Fact | Measured | How |
|---|---|---|
| `@laticent/lattice` on npm | not found (E404) | `npm view @laticent/lattice` |
| The `@laticent` scope on npm | **does not exist** | `registry.npmjs.org/-/org/laticent/package` returns `Scope not found` |
| npm credential in the cloud session | none (no `NPM_TOKEN`, `NODE_AUTH_TOKEN` or `.npmrc`) | `env` |
| npm credential in GitHub | not visible from a session; `release-publish.yml` skips the publish when `NPM_TOKEN` is unset, and nothing has ever published | workflow source |
| Existing `v1.0.0` | a git tag and a GitHub Release from 2026-08-09, describing 2 palettes and 25 layouts; never on npm | GitHub releases API |
| Next version the tool computes | **2.0.0** (`major`), with 11,151 lines of notes | `npm run release:dry` |
| Pending changelog fragments | 915 files, 1.26 MB (195 added, 226 changed, 454 fixed, 10 removed, 29 security), 62 marked `**Breaking:**` | `ls changelog.d`, `wc -c` |
| GitHub Release body cap | 125,000 characters, so the pending notes are 10× over it | `RELEASE.md` |
| Root tarball | 1,350 files, **28.1 MB packed, 92.7 MB unpacked** | `npm pack --dry-run` |
| Installed CLI | exits with `Cannot find module '@laticent/segno/read'` | `followups.d/2577-p1-installed-cli-misses-workspace-libs.md` |
| Workspace libraries | 9 (ltt, cadenza, vetrina, segno, trama, calco, lente, suono, tavola), all `0.1.0`, all `AGPL-3.0-only`; `tavola` is not in `workspaces` and has no build | each `package.json` |

The largest files in the tarball: `dist/lattice-emulator.js` 18.9 MB,
`dist/lattice-runtime.js` 9.1 MB, `dist/marp-kit/` 18.0 MB in total (it repeats
the runtime, Mermaid and the CSS), `dist/agent-kit/` 4.6 MB, Mermaid twice
(the plugin's vendored copy and the Marp kit's), and 13 MB of `-min` twins.

## 2. The owner's rulings (2026-10-07)

1. **Recut 1.0.0.** Re-label the August release as a `v0.9.0` preview (a new
   tag on the same commit, marked pre-release), delete the old `v1.0.0` tag,
   and cut `v1.0.0` from the fixed `main`. Nothing on npm consumes the old tag,
   so moving it breaks nobody.
2. **Publish all nine libraries.** Each one versions independently of
   `@laticent/lattice`. This makes the Changesets migration a requirement for
   1.0 rather than an option, because `tools/release.js` versions one package.
3. **Curated release notes.** The release text is a short list of highlights
   about what people can now do, not every fragment. The complete record stays
   in each package's `CHANGELOG.md`.
4. **Weekly, fully automatic releases after 1.0.** A schedule opens the release
   PR and the merge queue lands it with no human click. The schedule becomes the
   authorization, the way the dispatch is today.

## 3. Two rulings pull against each other, and how this plan resolves them

Curated notes need an editor, and a fully automatic weekly release has none. So
the plan splits releases in two:

- **Weekly releases** build their notes mechanically from **the first line of
  each changeset**. The changeset contract therefore changes: the first line is
  one plain sentence about what a user can now do, or what stopped breaking,
  with no file paths and no mechanism. The rest of the body is free for the
  engineering detail and lands only in `CHANGELOG.md`. A release whose
  changesets touch nothing a user sees (tests, CI, docs tooling) publishes
  nothing.
- **Milestone releases** (1.0.0, and any later minor with a story) carry a
  hand-curated `release-notes/<version>.md`. When that file exists, the release
  uses it as the GitHub Release body and appends the generated list under it.
  Writing it is a normal PR, so it waits on a human exactly when one is wanted.

If the owner wants every weekly release curated too, the alternative is a
weekly PR that waits for a merge click. That is ruling 4's runner-up; it costs
one click a week.

## 4. Defaults this plan takes, which the owner can overturn in review

The owner confirmed the fragment archive and the libraries' AGPL license on 2026-11-22 (§9).

Each of these can be undone until the first publish, and none can be undone after it.

- **Libraries start at `0.1.0`, not `1.0.0`.** Under semver, `0.x` lets a
  library make breaking changes in a minor version while its API settles. Only
  `@laticent/lattice` makes the 1.0 promise.
- **The `./lib/*` and `./dist/*` wildcard exports go.** At 1.0 every exported
  path is public API, and a wildcard exports every internal file. Nothing in
  the repo imports through them; the two `dist/` files that are referenced
  (`lattice-emoji.css`, `docs/components.json`) get named exports.
- **The Marp kit and the agent kit leave the npm tarball.** They ship on the
  `dist-kits` branch and in the release zip already. This removes about 22 MB
  unpacked.
- **The 915 pending fragments are archived, not published.** They move into
  `changelog/pre-release-archive.md` beside the August history, the way #1735
  moved the earlier log. The 1.0.0 notes are the curated highlights in §7.
- **The libraries keep `AGPL-3.0-only`.** `followups.d/2556-p3-calco-license-and-types-for-outside-users.md`
  points out that AGPL keeps them out of closed-source web apps. Changing a
  license is the owner's call, and it is far cheaper before the first publish
  than after it.

## 5. The slices, in order

One branch and one PR each (HARD RULE #17). Slices A and B can run in
parallel; everything after them is sequential.

| # | Slice | Who | Done when |
|---|---|---|---|
| 0 | **Claim the scope.** Create the `laticent` organization on npmjs.com, turn on 2FA, add a second owner. | owner, ~5 min | **Done 2026-10-07:** `registry.npmjs.org/-/org/laticent/package` now returns `{}` instead of `Scope not found`. 2FA on: owner, 2026-11-22. A second owner comes later and does not block the first publish (§9) |
| A | **An installable `@laticent/lattice`.** Declare the libraries as `dependencies` (or bundle them where the CLI already inlines); narrow `exports`; drop the kits from `files`; fix `--player`'s jsdom requirement (`followups.d/2248-p3-…`); add an integration test that packs the tarball, installs it in an empty directory and renders a deck. | agent; maker-checker (it changes what ships) | the clean-room render passes, and fails with one library removed |
| B | **Nine publishable libraries.** For each: `repository`, a LICENSE file, `publishConfig.access: public`, its own `prepack` build, `types` pointing at `.d.ts` before `.ts`, a README fit for npmjs.com (install line, no repo-relative links). `tavola` gets a build and joins `workspaces`. `docs/package.json` becomes `private`. (An earlier draft gave `trama` and `calco` a first test each; they have suites already, in `test/unit/trama/` and `test/unit/calco/`.) | agent; maker-checker | `npm publish --dry-run` is clean in every folder |
| C | **Changesets in, fragments archived, notes split.** Slice 1 of the Changesets note, plus §3's notes contract: archive the 915 fragments; `release.yml` and `release-publish.yml` run `changeset version` / `changeset publish` in the existing PR-through-the-queue shape; per-package tags (`@laticent/lattice@1.0.0`); a gate that requires a changeset on a PR that touches published source (Dependabot exempt); rewrite HARD RULE #10, `RELEASE.md` and `changelog.d/README.md`. | agent; adversarial trio (release pipeline, irreversible output) | a dry-run release on a fork or a dry-run flag produces the right versions, tags and notes |
| D | **Retire the August tag.** Tag its commit `v0.9.0`, re-label its GitHub Release as a pre-release preview, delete `v1.0.0`. | agent, after the owner confirms at the time (externally visible) | `v1.0.0` is free |
| E | **Bootstrap publish = 1.0.0.** Put a short-lived granular npm token in the `automation` environment; the release workflow publishes `ltt` first, then the other libraries, then `@laticent/lattice@1.0.0` with the curated notes; attach a trusted publisher (OIDC) to each of the ten packages; revoke the token. | owner (token, npm UI); agent (the release PR) | all ten on npm with provenance; a clean-room `npx @laticent/lattice deck.md deck.pdf` works; no token left anywhere |
| F | **Weekly automatic releases.** A `schedule` trigger on the prepare workflow (one fixed weekday), auto-merge on the version PR, a no-op when no changeset is pending, OIDC publish. Amend CLAUDE.md rule 7's list of PRs that merge themselves to include the scheduled release PR. | agent; maker-checker | two consecutive weekly runs: one that releases, one that no-ops |

Slice E is the first and only manual publish. Before E, two items the Changesets
note flagged as unproven must be checked against the real registry: that the
workflow's npm is new enough for trusted publishing (it upgrades npm explicitly
if not), and how `changeset version`'s PR behaves in the merge queue.

## 6. What 1.0 deliberately leaves out

- **Canary `@next` builds.** Weekly releases cover the need for now.
- **The desktop app.** It lives in this repo and is not built; it consumes the
  same packages when it arrives.
- **A version-bump backstop** (`RELEASE.md` "No contract-diff backstop"). Once
  each changeset states its own bump, this is less urgent; revisit after the
  first few weekly releases.

## 7. Draft highlights for 1.0.0

A starting point for `release-notes/1.0.0.md`, written for someone deciding
whether to install it. Slice E finalizes it.

- **Write a deck as a text file and get a boardroom-ready PDF.** Plain Markdown
  in, a finished deck out, with no manual layout work.
- **More than sixty slide components**, from title and verdict grids to gantt
  charts, roadmaps, KaTeX proofs and statute stacks. The component reference
  shows every one.
- **Fourteen palettes, one switch.** Every layout takes its colors from the
  palette, so changing the theme never breaks a slide.
- **Every format from one source:** PDF, PPTX, ODP, PNG sets and HTML, with
  editable text in the PowerPoint and LibreOffice exports.
- **Diagrams and math built in:** all 25 Mermaid diagram types and KaTeX,
  rendered at export time.
- **Accessible by default:** decks pass WCAG AA contrast.
- **Built for AI agents too:** the agent kit gives an LLM the authoring
  contract and the component catalog.
- **Install:** `npm i -g @laticent/lattice`, then `lattice deck.md deck.pdf`.

Each claim gets checked against the shipped package in slice E, and the
`prose-checker` agent reviews the final text.

## 8. Slice C is blocked: Changesets cannot version the root package (2026-10-08)

Measured before building slice C, on a replica of this repo's package layout (the root
`package.json` and its nine workspaces):

- **Changesets 2 (2.x latest) and 3.0.3 both leave `@laticent/lattice` out.** `@manypkg/get-packages`
  lists the nine workspaces and no root package, and a changeset that names `@laticent/lattice`
  stops `changeset status` with `Found changeset test for package @laticent/lattice which is not in
  the workspace`. The engine lives at the repo root, so the plan's per-package versioning of
  `@laticent/lattice` (§5 C, and `2026-08-09-changesets-multi-package-release.md`) does not work as
  written. The 2026-08-09 note flagged two unproven points; this is a third, and it decides the slice.
- **The libraries alone work.** With the engine moved into a workspace folder in the replica,
  `changeset version` bumped it 1.0.0 → 1.1.0 and `@laticent/ltt` 0.1.0 → 0.1.1 from one changeset,
  and wrote a `CHANGELOG.md` for each.

Three ways forward. Each is an architectural choice, and each changes how every later PR records a
change, so the owner picks:

| Option | What it is | Cost | Risk |
|---|---|---|---|
| **A. A publish folder for the engine** (recommended) | `packages/lattice/` holds the engine's `package.json` (name, version, `bin`, `exports`, `dependencies`, `files`) and a `prepack` that copies `lattice.js`, `lib/`, `dist/`, `themes/` and the shipped docs in from the root. The root becomes a private workspace root. Source stays where it is. | One new folder and a `prepack`; the root `package.json` loses its published fields; tests that read the root manifest (`shipped-imports-resolvable`, the clean-room install test) read the new one. Measured working in the replica. | `npm pack` from a copied tree must ship exactly what the root ships today; the clean-room test (slice A) is the check. |
| B. Changesets for the libraries, `tools/release.js` for the engine | Two release paths: changesets for the nine, the current fragment flow for the engine. | No restructure. | Two formats for one act (recording a change), two version tools, and a weekly release that must run both in order. |
| C. Our own multi-package versioner | Extend `tools/release.js` to read changeset-format files for all ten packages. | No dependency; we own every edge case (dependency ranges between packages, prerelease, notes). | Rebuilds what Changesets does (HARD RULE #15), and the edge cases are where release tools break. |

Until the owner picks (picked 2026-11-22: option A, §9), slice C does not start and the 955 pending fragments stay in `changelog.d/`.
Slices D and E wait on C, so the first publish waits on this choice.

## 9. Owner rulings (2026-11-22)

**2026-11-23, the current state, given in the release desk session (tracker #3449).** These
rulings extend the 2026-11-22 table below; they do not reverse it.

| Item | Ruling |
|---|---|
| Which packages 1.0.0 publishes | **The engine plus 12 libraries:** `segno`, `segno-languages`, `trama`, `cadenza`, `calco`, `ltt`, `mosaico`, `fluido`, `squadra`, `markup`, `lastra` and `lente`. The first eleven are the engine's `dependencies` that the 2026-11-22 row publishes. `segno-languages` is `segno-markdown` under its new name, with a `/markdown` subpath. `lente` is the one library on the list the engine does not depend on. |
| Their standing | **Every published library is official** and joins the family on the docs site, with a page under `/libraries/`. None is plumbing-only. The owner plans to extend them. #3456 adds the LTT, Markup and Lastra pages; `segno-languages` gets its page after the rename, and until then `nav.test.ts` lists it as `unlisted`. |
| Lastra's scope | **All image work belongs in `@laticent/lastra`**: in the owner's words, "all image work we do for example belongs lastra". Moving the image code that lives elsewhere today is post-1.0 work: `followups.d/3456-p1-consolidate-image-work-into-lastra.md`. |
| Lente's scope | **Lente grows past reader lenses**: in the owner's words, "lente will become more than it is today including being able to host outline and slice and dice a deck into views logically and physically (we have had trouble with this and the export)". Post-1.0, and a design note comes before code: `followups.d/3456-p2-lente-outline-and-views.md`. |

A release-audit session put the open items in §4, §5 and §8 to the owner, who answered:

| Item | Ruling |
|---|---|
| §8, how the engine joins Changesets | **Option A, build it now:** a `packages/lattice/` publish folder. The owner first asked for the cost, measured below. |
| §5 slice 0, 2FA | **Done.** |
| §5 slice 0, a second owner | **Later, and not a blocker** for the first publish. |
| §4, archive the pending fragments | **Confirmed.** |
| §4, the libraries keep `AGPL-3.0-only` | **Confirmed.** |
| §5 slice B, which libraries publish | **All 11 that `@laticent/lattice` lists under `dependencies`**, the three that were `"private": true` included (`@laticent/markup`, `@laticent/lastra`, `@laticent/segno-markdown`, since renamed `@laticent/segno-languages`). A private one cannot publish, so a clean `npm i @laticent/lattice` would fail with E404. The three now meet slice B's bar; they are published without a docs-site page for now (`docs/src/lib/nav.test.ts`, `unlisted`). |
| The 1.0.0 date | **1.0.0 ships Friday 2026-11-27**, with a merge freeze from **Wednesday 2026-11-25 23:59 UTC**. |
| The 1.0.0 date, corrected 2026-11-23 | **Moved by the owner:** Release (prepare) is dispatched **Sunday 2026-11-29, 14:00 UTC or later**, with the merge freeze **Saturday 2026-11-28 23:59 UTC** (relayed by the release desk, issue #3449). This row replaces the one above. |
| The 1.0.0 date, corrected again 2026-11-23 (about 20:45 UTC) | **Moved by the owner:** 1.0.0 waits until **all nine deck-key rename PRs are on `main`, likely Tuesday–Wednesday 2026-12-01–02** (relayed by the release desk, issue #3449). This row replaces both above. |
| §5 slice C, Changesets | **Lands before 1.0.0.** The owner does not want to ship known tech debt in public, so 1.0.0 is not cut on the fragment flow with Changesets promised for later. |

**What option A costs, measured on `main` at `ff2d32e` (2026-11-22).**

- The root `package.json` has 510 lines. The fields the engine publishes (`name`, `version`,
  `description`, `bin`, `main`, `exports`, `files`, `dependencies`, `optionalDependencies`,
  `engines`, `license`, `repository`, `homepage`, `bugs`, `keywords`, `author`) take 112 of them.
  `scripts` (309 entries), `devDependencies`, `workspaces` and `overrides` stay at the root.
- Of the 60 open PRs, 10 edit the root `package.json`. The 4 written by sessions add `scripts`
  entries only, so none would conflict. The 6 from Dependabot bump `dependencies` and would
  conflict; Dependabot rebuilds its own PRs.
- Of the 39 commits to `main` that touched the root `package.json` in the 30 days to
  2026-11-22, 22 changed only `scripts` and 12 changed a field that moves, mostly
  `dependencies`. After the move, that kind of edit goes to `packages/lattice/package.json`.
- `npm pack --dry-run` on the root today: 2,202 files, 34.2 MB packed, 112.2 MB unpacked. The
  copied folder must ship the same set, and `test/integration/export/installed-package.test.js`
  is the check.

Status stays `proposed` until slice C lands (§11).

## 10. Option A, built (2026-11-22)

§9 records the owner picking option A. This section records what was built.

**The layout.** `packages/lattice/package.json` holds the sixteen published fields and a three-script
pack lifecycle (`prepublishOnly`, `prepack`, `postpack`). The root `package.json` is now
`lattice-workspace`, `"private": true`, with `scripts`, `devDependencies`, `workspaces` (plus
`packages/lattice`) and `overrides`. No source moved.

**How it packs.** `prepack` runs `npm run build` at the root, then `tools/stage-engine-package.js`
hard-links each positive `files` entry into the folder (copying where a hard link fails), plus the
README or LICENSE that npm adds from any folder it packs (`design/README.md` came along with
`design/skill.md` at the root). `files` negations stay with npm, so the listing cannot drift from
the `files` list. `postpack` removes the staged paths; `.gitignore` lists each one, not
`/packages/lattice/*`, because a blanket ignore also hid the folder from Biome's lint-coverage probe.

**Measured, main at `84bb080`.** The staged folder's `npm pack --dry-run` lists the same 2,202
paths as the root's did (the diff of the two lists is empty), 34.2 MB packed and 112.2 MB unpacked.
Only three files differ in size: `lattice.js` and `lib/core/pkg-root.js` (this change) and
`package.json` (27,089 bytes shipped before, 3,765 now: the scripts and devDependencies no longer
ship). `npm install` moved only the declarations in `package-lock.json`; no resolved version changed.

**Readers re-pointed.** `lattice.js` `pkgVersion()` reads through `lib/core/pkg-root.js`
`engineManifestPath()` (`packages/lattice/package.json` in the repository, the package's own
manifest installed). `tools/release.js` bumps with `npm version --workspace packages/lattice` and
stages that manifest. `build-release-zip.js`, `build-player-core.js`, `export-marp.js` and
`structure.js` read the engine manifest. Tests that read `bin`, `version`, `dependencies` or
`exports` read it too; two that resolved `@laticent/lattice/*` through the root's own name build a
scratch package from the engine manifest instead.

**One constraint found.** The root's `"$puppeteer"` override must name a root dependency, so the
root keeps `puppeteer` as a devDependency at the engine's range. A unit test holds the two equal.

**Workflows (owner's ruling, 2026-11-22: change them in the same PR).** `release-publish.yml` now
triggers on `packages/lattice/package.json`, reads the version there and runs `npm publish
--workspace @laticent/lattice`; left alone, the first release after the move would have pushed a tag
and then failed (a root version of `undefined`, a private root that refuses `npm publish`). The
`code` paths filter in `ci.yml` and the render-slice glob in `lefthook.yml` also match the engine
manifest, so a PR that edits only `exports` or `files` runs the code tier. `.github/dependabot.yml`
already covers workspaces from `/`, so it needs no change.

**Dead-code ratchet.** knip reads `packages/lattice` as a workspace whose code is elsewhere, so it
called the engine's dependencies unused (28) and the root's imports of them unlisted (400).
`tools/quality-assessment.js` `foldEngineManifest` credits one to the other, for root-workspace files
only. A workspace package (`@laticent/*`), which knip never lists as unlisted, counts as used only when
`lattice.js` or `lib/` names it in an import specifier. An import nobody declares, another workspace's
import of an engine-only package, and an engine dependency nothing loads all still count; the second
checker reproduced the last with `@laticent/veduta`, which an earlier draft of the fold hid. Slice C (Changesets, the fragment archive, the gate, the
HARD RULE #10 rewrite) waits for its own decisions.

**Trial publish (2026-11-23).** The owner approved the local-registry trial for #3438 and then a CI job
for it ("targeted + nightly + release"): `tools/trial-publish.js` and `.github/workflows/trial-publish.yml`.
Before #3451 it stopped on three private engine dependencies (markup, lastra, segno-markdown); with #3451
on `main` the whole trial passes in about 49 s. The clean install pins its third-party packages to the
repository lockfile's versions (513 names; 36 held at several versions stay on their ranges), after a
#3471 trial went red on a release npmjs had listed but not yet served.

`trial-publish.yml` runs the release's own publish path since #3471: `TRIAL_PUBLISH_COMMAND` is
`bash tools/release-trial.sh`, which runs `tools/release.js --prepare` (only while the engine's
version has no CHANGELOG section) and `--publish` in a temporary worktree against the local
registry. That is the owner's "hold until proven" (issue #3449): the publish path proven on a real
runner before #3471 merges.

## 11. Slice C, built: Changesets for thirteen packages (2026-11-23)

Built on `main` at `c0fbbd9`, after §10's publish folder (#3438). The owner's 2026-11-23 rulings
(issue #3449) set the scope: Changesets before 1.0.0; the engine plus twelve libraries, each on its
own version line; six libraries held back; curated 1.0.0 notes; the pending fragments and the
August `## 1.0.0` section archived; weekly releases later, in their own PR.

**The publish set** lives once, in `tools/release-packages.js`: `PUBLISH_SET` (thirteen names) and
`IGNORED` (filo, fuoco, suono, tavola, vetrina, veduta), which must equal `.changeset/config.json`
`ignore`. `build:check` (`checkChangesets`) holds every workspace in exactly one place: published,
ignored, or private. The release runs the same check in strict mode, which also requires all
thirteen to exist and be public. On `main` today strict mode names four problems, each an open PR's
job: `markup` and `lastra` are private (#3451), and `@laticent/segno-languages` does not exist yet
while the engine still depends on `@laticent/segno-markdown` (the Segno desk's rename, B9). (Both have
since merged: #3451 on 2026-11-23, and the rename as #3488 the same day; strict mode is clean.) So a
release cut before those merge stops before it opens a PR.

**Config choices.** `privatePackages.version: true`, `tag: false`. With `version: false`,
Changesets refuses the whole tree while the engine depends on a private package (`Invalid tree:
"@laticent/lattice" depends on the skipped package "@laticent/lastra"`), which is `main` until #3451
merges; `version: true` lets it read the tree, and `tag: false` still keeps a private package off
npm and untagged. The changelog formatter is `tools/changeset-changelog.cjs`, the default shape
without the commit hash, because the release notes print each entry's first line.

**Fragments keep working (the brief's constraint 1).** 19 open PRs carried `changelog.d/` fragments
on the cutover day. `checkChangelogFragments` is unchanged, and Release (prepare) converts each
pending fragment into a changeset for `@laticent/lattice` (`tools/changesets.js`), with the bump its
category always gave it. Every open PR's change to `changelog.d/` was an addition (measured against
all 60 open PRs; #3356 also deletes one, which merges cleanly against this PR's deletion), so the
archive conflicts with none of them. `test/unit/release/changesets-release.test.js` runs the real
`changeset version` on a fixture workspace to prove the conversion.

**The first release bumps nothing (constraint 2).** The old tool computed 1.0.0 → 2.0.0 from a
`**Breaking:**` fragment. `tools/release.js` treats the release as the bootstrap when the engine is
`1.0.0`, `npm view @laticent/lattice@1.0.0` is a 404, and no `@laticent/lattice@1.0.0` tag exists:
it archives whatever is pending (fragments and changesets that landed after this PR) and writes
each package's first changelog section, at the versions the packages already carry. Asking npm
rather than reading tags alone keeps a tagless local checkout from mistaking a later release for
the first. Any other unpublished engine version is refused: the previous release never finished,
and the fix is a Release (publish) run.

**Publish (constraint 3).** `changeset publish` (3.0.3) sorts the plan into dependency rounds with
`@pnpm/deps.graph-sequencer` and publishes each round in parallel: the eleven libraries with no
`@laticent/*` dependency (`ltt` among them), then `cadenza`, then the engine. A failure stops
before the next round, so the engine publishes last or not at all. Provenance comes from
`NPM_CONFIG_PROVENANCE=true`, which Changesets passes through to `npm publish`. Tags are
Changesets' `<name>@<version>` plus `v<version>` for the engine's GitHub Release. Before anything
reaches npm, `--publish` refuses while `v1.0.0` already tags a commit (slice D not yet done), and
writes the notes and builds the zip, so their failure leaves nothing half-published.

**Guards the adversarial trio added.** The Munger inversion reproduced a release-day failure and
found three more ways release day could go wrong:

- The engine's `prepublishOnly` ran `npm test` inside `changeset publish`, which fails two ways
  there (the red team and the inversion each reproduced one): npm passes `--json` to lifecycle
  scripts, which breaks `package-nodenext-types.test.js`'s `npm pack`, and the zsh completion test
  fails rather than skips in CI without zsh. Libraries publish before the engine, so every run would
  have stranded twelve libraries on npm without their engine. `prepublishOnly` is gone (the release
  commit already passed `ci`; `prepack` builds), and Release (prepare), whose gate runs `npm test`,
  installs zsh as `ci.yml`'s unit job does.
- Release (publish) runs on a push only for a commit titled `release: `. Before, any manifest or
  changelog push could publish whatever `main` held once the August tag was gone.
- A release that crosses a major version (or takes a `0.x` library to 1.0.0) does not auto-merge;
  95 of the 1,674 archived fragments were marked breaking, many by mistake. The changeset gate
  also rejects `major` on a `0.x` library.
- The post-publish registry check asks up to four times, so a brand-new package's cached 404
  cannot leave it untagged; the GitHub Release step runs even when that check finally fails
  (`!cancelled()`), and a recovery run's notes list the packages tagged at the same commit.
- `--publish` refuses any package whose `CHANGELOG.md` lacks its `## <version>` section, and the
  workflow refuses when a GitHub Release named `v<version>` already exists. Both run before npm.
- The changeset gate also runs `@changesets/parse`, the reader `changeset version` uses, so an
  unquoted `@scope/name` key or a package named twice fails when it lands.
- The card grader then found that this last fix broke the publish gate: `--plan` runs before
  `npm ci`, and a top-level require of `@changesets/parse` crashed it, so a release commit would have
  published nothing. The parser now loads on first use, and a test plans from a tree with no
  `node_modules`. All twelve libraries list `CHANGELOG.md` in `files` (npm 10 packs it only when
  listed, and a published 0.1.0 tarball cannot be changed later).
- A second checker re-reviewed every post-trio fix. Release (publish) now checks every commit of a
  push for the `release: ` title, not only the last: the merge queue lands up to three PRs as one
  push. A registry error during the post-publish check counts as "not yet" rather than aborting
  before the tags are pushed, and the GitHub Release name check fails unless `gh` says "release not
  found".

**Changelogs.** Each package keeps its own `CHANGELOG.md`, written by `changeset version`. The
engine's is `packages/lattice/CHANGELOG.md`, committed; `tools/stage-engine-package.js` treats it as
native (neither staged from the root nor removed after packing). The root `CHANGELOG.md` becomes an
index that takes no entries. The archive gained the August section and the 1,674 fragments.

**Not in this PR, each on purpose:**

- **A gate that requires a changeset** on a PR that touches published source (§5 slice C). A
  diff-aware gate is a new CI step, which is the owner's call (CLAUDE.md, SECOND FILTER row 2).
- **Weekly releases** (slice F), and npm trusted publishing, which needs npm 11.5.1+ in the publish
  job (Node 22 ships 10.9). Both come after 1.0.0.
- **GitHub Releases for libraries.** Only the engine gets one; a library-only release publishes and
  tags without one. Slice F decides whether weekly library releases need their own.

Status stays `proposed` until slice E, the first publish, lands. Slices D and E happen on release day (#3449).
