---
status: proposed
summary: The repo is already a five-package monorepo that has published nothing — @slidewright/lattice plus cadenza, lente, suono and vetrina, with npm `workspaces` declared and all four siblings publish-shaped (exports, dist, files allowlist, README). tools/release.js physically cannot release them: it only knows the root package.json. Adopts Changesets for versioning across the five, keeping the parts of the flow merged in #1443 that Changesets does not do — the ~100 MB showcase zip, the GitHub Release that carries it, and the PR-through-the-merge-queue shape. Corrects #1437 on two points: pnpm is not required (Changesets works with the npm workspaces already declared) and its release.yml block would clobber #1443. Also settles npm auth (OIDC trusted publishing — no NPM_TOKEN exists at all), the canary channel (@next on engine changes only, not every merge), the tag scheme (per-package `@scope/name@x.y.z`, replacing `v<x.y.z>`), the fate of a 17,000-line `## Unreleased` (closed under a dated pre-publish `## 1.0.0`, Changesets accumulates from there), and the HARD RULE #10 change from "edit ## Unreleased" to "add a changeset".
---

# Changesets, and a release pipeline for five packages

**Date:** 2026-08-09
**Status:** proposed — design agreed, not yet implemented
**Issue:** #1437 (Configure Release Pipeline)
**Follows:** `2026-08-09-automation-under-the-merge-ruleset.md` (#1443), whose
two-phase release this supersedes in part
**Rules touched:** HARD RULE #10 (rewritten in place — the artifact changes, the
discipline does not)

## The finding that decides it

`SlideWright/lattice` is not a single-package repo. The root `package.json`
declares **npm workspaces**, and every one of them is shaped to publish:

| Package | Version | Published? | Evidence it is meant to ship |
|---|---|---|---|
| `@slidewright/lattice` | 1.0.0 | **no** | 16-entry `files` allowlist, `exports` map |
| `@slidewright/cadenza` | 0.1.0 | **no** | `exports`, `dist/index.cjs`, files allowlist, README |
| `@slidewright/lente` | 0.1.0 | **no** | same |
| `@slidewright/suono` | 0.1.0 | **no** | same |
| `@slidewright/vetrina` | 0.1.0 | **no** | same, plus a `react >=18` peer |

None is `private`. **None has ever been published** — npm returns *Not found*
for `@slidewright/lattice`.

Two consequences follow immediately:

1. **`tools/release.js` cannot do this job.** It reads and writes exactly one
   `package.json`, cuts one tag, and derives one version from one changelog. The
   four siblings are invisible to it. This is not a gap to patch — a
   single-package versioning engine is the wrong shape for five packages that
   will eventually depend on each other.
2. **Migration is cheapest right now.** There is no published version history to
   reconcile, no consumer pinned to a tag scheme, no changelog format anyone has
   parsed. Every day of delay adds reconciliation work later.

That is the entire argument for Changesets, and it is enough on its own.
Changesets exists to answer "these N packages changed, what version does each
become, and what do their dependents become?" — which is the question this repo
is about to start asking and currently cannot answer.

## What #1437 gets right, and two things it gets wrong

Right: OIDC trusted publishing, canary `@next`, README badges, GitHub Releases
with changelog notes, semver by API impact, per-change intent captured before
merge. Those are the goals and they stand.

**Wrong 1 — pnpm is not required.** The issue prescribes migrating to pnpm.
Changesets works with the **npm workspaces already declared here**. Switching
package managers would touch every workflow, every hook, `npm ci` in six CI
jobs, and every contributor's muscle memory, to buy nothing this design needs.
Dropped.

**Wrong 2 — its `release.yml` block would delete working machinery.** The issue
supplies a complete `release.yml` to paste in. Pasting it removes what #1443
merged this morning: the showcase-zip build, the GitHub Release that carries it,
the two-phase split across the merge queue, and the `AUTOMATION_PAT` wiring that
makes a bot-opened PR actually start CI. Changesets replaces the **versioning**
half of that flow, not the packaging and release half.

## What survives, what retires

| Concern | Today | After |
|---|---|---|
| Deciding each package's next version | `tools/changelog.js` reads `## Unreleased` headings | `changeset version` reads `.changeset/*.md` |
| Bumping + rolling the changelog | `tools/release.js --prepare` | `changeset version` |
| Rebuilding `dist/` after the bump | `--prepare` (emulator inlines `package.json`) | a `version` script chained after `changeset version` |
| Reaching `main` | branch → PR → auto-merge → queue | **unchanged** |
| Tagging the merged commit | `tools/release.js --publish` | `changeset publish` (per-package tags) |
| The ~100 MB showcase zip | `tools/build-release-zip.js` | **unchanged — Changesets does not do this** |
| GitHub Release carrying the zip | `gh release create … --verify-tag` | **kept**, attached after `changeset publish` |
| Release-body size cap | `changelog.fitReleaseBody` | **kept** — the cap is GitHub's, not ours |
| npm auth | `NPM_TOKEN` (never used) | **OIDC trusted publishing — no secret at all** |

`tools/release.js` and `tools/changelog.js` lose their versioning role.
`extractVersion` and `fitReleaseBody` survive because the GitHub Release step
still needs them. The unit tests for the bump engine retire with the engine; the
tests for `fitReleaseBody` stay.

## The five decisions

### 1. All five packages publish

Including the four under `docs/src/lib/`. They are already shaped for it.

**Structural note, not a blocker:** publishable packages living inside the docs
site's source tree is a strange address. `docs/` is a *separate* npm project with
its own lockfile — it is not a workspace — so today the four libs are root
workspaces that happen to sit inside a sibling project's directory. Changesets
does not care. A future move to `packages/` would be tidier and is worth doing
on its own, not folded in here.

**One hygiene fix belongs in this work:** `docs/package.json` (`lattice-docs`,
0.0.1) is **not** `private`. It is a website, not a package. It escapes
Changesets today only because it is not a workspace — that is luck, not design.
Mark it `private: true`.

### 2. The changelog: close the past, accumulate from here

`## Unreleased` is ~17,000 lines — everything ever written, because nothing has
shipped. Two things follow.

**Close it under a dated `## 1.0.0` marking the pre-publish era.** Nothing is
deleted; the prose stays as history. But the first *published* release's notes
then describe that release rather than five months of development, and the
GitHub Release body stops being 1.4 MB against a 125,000-character cap.

**From then on, Changesets owns new entries.** Each package gets its own
`CHANGELOG.md`; the root one continues as `@slidewright/lattice`'s, with
generated sections prepended above the pre-publish history.

The honest cost: generated entries read differently from the hand-written prose
this repo is proud of. A changeset's body is free-form markdown, so a
well-written changeset produces a well-written entry — the discipline transfers,
the format shifts. If the generated shape grates, a custom changelog generator
is the escape hatch; not worth pre-building.

### 3. HARD RULE #10 changes artifact, not intent

Today: *record every user-visible change in `CHANGELOG.md` `## Unreleased` as it
lands.* After: *ship a changeset with every user-visible change* — naming the
affected package(s) and the bump level, with the same "lead with
`**Breaking:**`" convention inside the changeset body.

The discipline is identical and the rule number is retained. Two genuine
improvements come free:

- **The bump becomes per-package.** A change to `vetrina` no longer implies
  anything about `lattice`'s version.
- **The CHANGELOG conflict class disappears.** One file per change instead of
  every branch editing the same section — the pain HARD RULE #16 currently tells
  you to "resolve mechanically" stops existing.

A gate should enforce it, mirroring the existing ratchets: a PR that touches
publishable source with no `.changeset/*.md` fails. Not automatic today; worth
building with the migration rather than after.

### 4. npm auth: OIDC trusted publishing, no secret

npm verifies the workflow's own OIDC identity. **No `NPM_TOKEN` exists** — nothing
to leak, rotate, scope to an environment, or forget until it expires. It is also
the direct answer to the security thread in
`2026-08-09-automation-under-the-merge-ruleset.md`: the strongest credential is
the one that does not exist.

Two constraints to plan around, neither optional:

- **The package must exist before a trusted publisher can be attached.** So the
  very first publish of each of the five uses a temporary token, which is then
  revoked. Bootstrap is a one-time manual act, not part of the pipeline.
- **It needs a recent npm CLI.** Node 22 ships an npm that predates OIDC
  publishing; the workflow must upgrade npm explicitly before publishing. **This
  is the piece I am least sure of and it must be verified against the real
  registry, not assumed** — a version mismatch fails at the publish step, after
  the tag exists.

### 5. Canary `@next` on engine changes only

Not every merge. `ci.yml`'s `changes` job already computes whether a merge
touched engine source, and that filter is reused: a docs-only merge, a backlog
mirror sync, or a dependency bump does not publish a canary. `@next` stays
meaningful — every canary version corresponds to actual engine work.

This matters more now that patch/minor dependency bumps auto-merge: without the
filter, every dependency bump would mint an npm version nobody asked for.

Snapshot versions come from `changeset version --snapshot canary` published with
`--tag next`. Worth stating plainly: **this is the one capability the current
engine does not have at all**, and having it as a flag rather than as ~40 lines
of bespoke snapshot-versioning code is a real, if secondary, argument for the
migration.

## Sequencing

Four slices, each independently mergeable, in this order. HARD RULE #17: one
branch and one PR each, never stacked.

1. **Changesets in, versioning out.** Add `@changesets/cli` + config, mark
   `lattice-docs` private, close `## Unreleased` under the dated `## 1.0.0`,
   retire the versioning half of `tools/release.js` + `tools/changelog.js`,
   rewrite `release.yml` / `release-publish.yml` around `changeset version` /
   `changeset publish` while keeping the zip, the GitHub Release, the body cap
   and the queue shape. Rewrite `RELEASE.md`. Rewrite HARD RULE #10.
   **Also convert the pending `changelog.d/` pile.** #1593 (2026-08-11) moved
   per-PR entries out of `## Unreleased` into `changelog.d/<slug>.<category>.md`
   to stop the merge queue ejecting PRs on a shared-region conflict — an interim
   whose successor is `.changeset/`. Every fragment then in the directory has to be
   converted (or folded into the dated `## 1.0.0`) as part of this slice, or the
   entries are silently lost: nothing else reads that directory.
   See `2026-08-11-changelog-fragments.md` §7, which also records where the two
   designs disagree.
2. **Bootstrap publish (manual, human).** First publish of all five with a
   temporary token; attach trusted publishers in npm's UI; revoke the token.
   *Nothing after this point works until this is done.*
3. **OIDC + badges.** Switch the publish step to OIDC, verify the npm CLI
   version on the real registry, add `@latest` / `@next` / CI badges to the
   READMEs.
4. **Canary `@next`.** Snapshot publishing on merges that touch engine source,
   reusing the `changes` filter.

Slice 2 is a hard dependency for 3 and 4 and cannot be automated — a trusted
publisher cannot be attached to a package that does not exist.

## Risks and open questions

- **The tag scheme changes.** Changesets tags per package
  (`@slidewright/lattice@1.0.1`), not `v1.0.1`. `RELEASE.md` currently states
  "a release is a git tag `v<x.y.z>`" as the contract. Per-package tags are the
  only coherent scheme once there are five packages, so the contract changes —
  but it must change *in writing*, not by accident. No consumer is pinned to the
  old scheme, because nothing has been published.
- **`changeset publish` vs the merge queue.** Publishing happens after the
  version PR merges to `main`, on the merged commit — the same shape as
  `release-publish.yml` today, which is proven. The specific interaction of
  `changesets/action` with a merge queue is **not** proven here and is the main
  integration risk in slice 1.
- **`dist/` freshness.** The emulator bundle inlines `package.json`, so a version
  bump restales it. `changeset version` must be chained with a rebuild in the
  same commit or `build:check` fails in the queue. Solved by a `version` script;
  named here because it is easy to miss and fails late.
- **Grouped-Dependabot interaction.** Dependency bumps must not mint canary
  versions (handled by the `changes` filter) and must not require changesets
  (the gate in §3 must exempt them, or every Dependabot PR goes red).
- **The four libs have no tests of their own** worth speaking of, and no
  READMEs verified for a public audience. Publishing creates a compatibility
  obligation on day one. Worth a look before slice 2 — the bootstrap publish is
  the moment their API becomes a promise.
