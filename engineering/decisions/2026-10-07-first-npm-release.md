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
| 0 | **Claim the scope.** Create the `laticent` organization on npmjs.com, turn on 2FA, add a second owner. | owner, ~5 min | **Done 2026-10-07:** `registry.npmjs.org/-/org/laticent/package` now returns `{}` instead of `Scope not found`. Still to do: 2FA and a second owner |
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

Until the owner picks, slice C does not start and the 955 pending fragments stay in `changelog.d/`.
Slices D and E wait on C, so the first publish waits on this choice.
