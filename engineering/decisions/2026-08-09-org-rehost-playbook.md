---
status: proposed
summary: Operational run sheet for moving lattice to another GitHub org, built from the repo's actual wiring and hardened by an adversarial trio (red team, Munger inversion, independent checker) that overturned three of the first draft's load-bearing claims. THE TRANSFER IS EFFECTIVELY ONE-WAY — GitHub permanently retires the OWNER/NAME combination when a repo had >100 clones or >100 Actions uses in the prior week, which this repo exceeds by an order of magnitude, so "transfer it back" is not a rollback and a git clone --mirror plus an issue/PR export is the only real safety net. "Every automation fails loudly" is FALSE — docs-preview.yml fails GREEN by explicit design, studio-e2e self-skips green, and golden-diff is continue-on-error, so the realistic outcome of a lost secret is silent degradation. The verification sequence itself was defeated: a blocked third-party action makes ci.yml's dependent tiers report `skipped`, which the `ci` aggregate accepts, so the required check goes GREEN with zero tests run. Also corrects: GitHub Pages URLs are explicitly NOT redirected (11 refs), the URL sweep is ~25-43 files with committed generator output and three failing tests rather than the four files first listed, org-level Project v2 board and a second artifact branch were missing from the inventory, issue types are DELETED on org-to-org transfer unless the destination has matching types, and Pages domain verification belongs in pre-transfer prep because it is repo-independent and doing it late opens a takeover window. Disposable: delete once the move is done.
---

# Rehosting Lattice in another org — the run sheet

**Date:** 2026-08-09
**Status:** ready to run — hardened by the adversarial trio (HARD RULE #25)
**Scope:** moving the `lattice` repository to a different GitHub organization.
Not a rebrand — product, copyright holder and SPDX headers stay SlideWright.

> **This note is disposable.** Delete it after the move, per
> `engineering/decisions/README.md`'s absorb-then-delete rule.

## Read this first — three things that are not what they look like

**1. This is a one-way door.** GitHub's transfer documentation:

> If the transferred repository contains an action listed on GitHub Marketplace,
> **or had more than 100 clones or more than 100 uses of GitHub Actions in the
> week prior to the transfer, GitHub permanently retires the owner name and
> repository name combination**… "The repository REPOSITORY_NAME has been
> retired and cannot be reused."

This repo clears that bar by an order of magnitude — five nightly crons are 35
runs a week before a single PR, and `ci.yml` alone contains 21
`actions/checkout` steps, each one a clone. **So `SlideWright/lattice` is
retired the moment you press Transfer, and "just transfer it back" is not a
rollback.** Take the snapshot in Phase 0 instead; that is the actual safety net.

**2. Losing a secret is silent, not loud.** Three automations fail *green*:

- `docs-preview.yml:45-51` — explicit comment: *"Fail SAFE, not red: until
  `CLOUDFLARE_API_TOKEN` is added, skip the build and deploy so the check stays
  green."* Lose that token and previews just stop appearing.
- `studio-e2e-nightly.yml` — the AI tier self-skips green without
  `OPEN_ROUTER_KEY`, and it is the one nightly with no failure-issue reporter.
- `ci.yml:287,336` — golden-diff publish and comment are `continue-on-error`.

Only `AUTOMATION_PAT` fails loudly. **So re-paste every secret after the move
whether or not it looks like it survived** — ten minutes, and it removes the
doc's only unverifiable premise.

**3. A green `ci` check does not mean CI ran.** `ci.yml:527-553` accepts
`skipped` as a passing tier result, and `unit`, `integration` and `docs-build`
all `needs: changes`. If an org Actions policy blocks `dorny/paths-filter@v3`,
`changes` fails → dependents report **skipped** → `lint` passes alone → the
required `ci` check goes **green with nothing tested**. The verification
sequence below is written to defeat that.

## What this repo actually runs on

### Secrets — five; storage location is INFERRED, not verified

| Secret | Consumed by | Failure mode if lost |
|---|---|---|
| `AUTOMATION_PAT` | `release.yml:86`, `sync-backlog.yml:83` | **loud** — job reds |
| `CLOUDFLARE_API_TOKEN` | `docs-preview.yml:51,90` | **silent — green** |
| `OPEN_ROUTER_KEY` | `studio-e2e-nightly.yml:115` | **silent — green** |
| `NPM_TOKEN` | `release-publish.yml:107` | not set yet |
| `GITHUB_TOKEN` | ~14 workflows (7 explicit, plus `github-script` defaults) | automatic |

GitHub's docs confirm secrets *"remain associated after the transfer"* — but
that is about **repository** secrets. **Nothing available from this sandbox can
distinguish a repo secret from an org-inherited one** (`/actions/secrets` → 403;
`${{ secrets.X }}` is byte-identical either way). Org secrets do **not** travel.
Hence: re-paste regardless.

`AUTOMATION_PAT` breaks for a different reason — not value loss but
**resource-owner binding**. It will arrive *present and stale*, so the
`-z GH_TOKEN` guards in `sync-backlog.yml:93` and `release.yml:92` never fire.

### GitHub configuration

| Thing | Detail | Transfers? |
|---|---|---|
| Ruleset **Main Merge Queue** (`18317422`) | PR · merge queue (squash) · required `ci` · `deletion` · `non_fast_forward` · **zero bypass actors** · 0 approvals | yes — repo-scoped |
| Ruleset **`19400032`** | "Code Quality Copilot review", **disabled** | yes |
| Environment **`automation`** | `main`-only; declared by **three** jobs — `sync-backlog.yml:61`, `release.yml:48`, `release-publish.yml:39` | yes (secret inside goes stale) |
| **Org Project (v2) board** | an **org resource** with auto-add scoped to repos *in that org* (`engineering/workflow.md:908-919`) | **NO — dies silently** |
| **Issue types** | *"all other issue types are removed from issues"* unless the destination org has matching types | **DATA LOSS unless pre-mirrored** |
| Labels | `labels.yml` triggers only on changes to `labels.json` / `sync-labels.js` / itself — **not** self-healing on arbitrary pushes | yes (labels travel anyway) |
| CodeQL | **default setup** — a repo security setting, no workflow file | verify |
| Dependabot alerts + security updates | repo security settings | verify |
| Artifact branches | `ci-drift-images` (exists) **and** `ci/preview-e2e-screenshots` (`preview-e2e-nightly.yml:35`, not yet created) | yes |
| Repo settings | auto-merge ON · delete-branch-on-merge ON · **public** | yes — but confirm visibility after |
| `github.com/<org>/lattice/…` links | redirected — **unless a repo is created at the old location** | conditional |
| **`slidewright.github.io/lattice/…`** | *"we don't redirect GitHub Pages"* — **11 references** | **NO — must be swept** |

### Outside GitHub

| System | Wiring | Affected? |
|---|---|---|
| **Cloudflare Pages** | `wrangler pages deploy docs/dist --project-name=lattice-docs`, account `6e1dd8d852d61410a91dd1c909404e63` | **Deploy path: no.** But `lattice-docs` began as a Git-integrated project whose builds were merely *switched off* (`2026-07-01-docs-pr-preview.md:70,100`), so a dormant Git binding and the Cloudflare Pages GitHub App on the org may persist. **Check the dashboard before transferring.** |
| **GitHub Pages** | `actions/deploy-pages@v4`, custom domain `lattice.style` | Custom domain must be re-entered; **verify the domain on the destination org in Phase 0** |
| **npm** | nothing published | Unaffected **today**. Once OIDC trusted publishers exist they bind `owner/repo` — so set them up *after* the move (see #1455) |
| **Claude GitHub App** | org-level install | must be installed on the destination org |

### Third-party actions — four, across five workflows

`browser-actions/setup-chrome@v1` · `cloudflare/wrangler-action@v3` ·
`dorny/paths-filter@v3` · `withastro/action@v3` — plus
`dependabot/fetch-metadata@v2` arriving with #1453 (maintained under GitHub's
own `dependabot` org). **`dorny` and `browser-actions` are not verified
creators**, so a "verified creators only" policy blocks those two. Both gate all
of CI: `paths-filter` via `changes`, `setup-chrome` inside `docs-build`, and
`ci` needs both.

## Phase 0 — before you touch anything (~30 min, all repo-independent)

Every item here is doable **while the repo still lives in SlideWright**, and
each one closes a window that would otherwise be open during the move.

- [ ] **Snapshot — this is the rollback.** `git clone --mirror`, plus a `gh`
      export of issues and PRs. The transfer is one-way; this is what makes the
      word "recoverable" true.
- [ ] **Verify `lattice.style` on the destination org** — publish the
      `_github-pages-challenge-<ORG>` TXT record. Verification is repo-independent,
      so doing it now means **zero window** in which the domain is verified by
      nobody. Leave the old org's TXT record in place.
- [ ] **Mirror the issue types** on the destination org, or accept that they are
      deleted from all open issues.
- [ ] **Actions policy: allow all actions** (or allowlist the four above).
      Otherwise CI breaks *and reports green*.
- [ ] **Allow fine-grained PATs**; decide the approval policy.
- [ ] **Install the Claude GitHub App** on the destination org.
- [ ] **No `lattice` repo — and no fork in the same network** — in the destination.
- [ ] **Recreate the Project (v2) board** on the destination org (auto-add,
      PR-merged → Done).
- [ ] **Check the Cloudflare dashboard** — `lattice-docs` → Builds & deployments:
      is the Git source still bound to `SlideWright/lattice`?
- [ ] **Collect all four secret values** from their consoles, ready to re-paste.
- [ ] **Standing prohibition, effective now: never delete or rename the
      SlideWright org.** An *emptied* org keeps its name; only deletion or
      renaming releases it. This is a rule, not a task — a task can be forgotten
      at the end of a list.
- [ ] **Freeze the crons** — six schedules fire between 03:11 and 06:17 UTC
      (`integration`, `preview-e2e`, `studio-e2e`, `modulepreload`, `perf`,
      `sync-backlog`) and will generate red noise against a half-migrated repo.

## Phase 1 — the move (one sitting, ~15 min)

1. **Land or note the open PRs.** They survive, but golden-diff comments embed
   `raw.githubusercontent.com/<owner>/<repo>/ci-drift-images/…` and whether
   those follow the transfer redirect is untested.
2. **Transfer** — Settings → General → Danger Zone.
3. **Confirm the repo is still public.** Private would take Pages and the merge
   queue with it, and start billing Actions.
4. **Re-enter the Pages custom domain** (`lattice.style`). Verification is
   already done from Phase 0, so this is just re-attaching it.
5. **Re-mint `AUTOMATION_PAT`**: resource owner = destination org, repo =
   `lattice` only, **Contents: write** + **Pull requests: write**. Approve it.
   Update it **inside the `automation` environment**.
6. **Re-paste `CLOUDFLARE_API_TOKEN` and `OPEN_ROUTER_KEY`** — they fail green,
   so "it looks fine" proves nothing.
7. **Unfreeze the crons.**

## Phase 2 — the URL sweep (its own PR, ~the size of #1466)

**Not "one small PR."** 25–43 files depending on how you count, ~193 references,
in four categories:

- **Generators whose committed output is byte-diffed by `build:check`** —
  `tools/build-spec-docs.js:44`, `tools/build-forms.js:163`,
  `tools/build-docs-portal.js:119,703`, `lib/concepts/concepts.json:3`. Editing
  these restales `docs/src/content/docs/spec/*.md` and `dist/docs/*.json`.
- **`package.json`** `homepage` / `repository.url` / `bugs.url` — inlined into
  `dist/lattice-emulator.js`, so this touches `dist/`. **HARD RULE #2: run
  `npm run build`, don't hand-edit.**
- **Three tests that hard-assert the old URL and will go red** —
  `docs/src/lib/feedback-issue.test.ts:8`, `test/unit/tools/sync-backlog.test.js:20`,
  and `test/unit/playground/preview-host.test.js:33`.
- **User-facing site + prose** — `docs/src/lib/nav.mjs:29`,
  `docs/astro.config.mjs:162`, `docs/src/pages/{index,features,comparison}.astro`,
  ~30 links under `docs/src/content/docs/`, `README.md`, `RELEASE.md`,
  `.github/ISSUE_TEMPLATE/config.yml`, `docs/src/lib/feedback-issue.ts:15`,
  `tools/sync-backlog.js:126`.

**Include the 11 `slidewright.github.io` references** — GitHub does not redirect
Pages URLs, so these break permanently and no placeholder org saves them.

Still deliberately excluded: dated `engineering/decisions/` records and
`CHANGELOG` history — records of what was true when written.

## Verification — written to defeat the false green

1. **Smoke PR must touch `lib/**` AND `docs/**`** (a one-line comment in each).
   A README-only PR sets neither `code` nor `docs` in the `changes` filter, so
   every real tier legitimately skips and proves nothing.
2. **Open the run and confirm `unit`, `integration` and `docs-build` actually
   RAN.** Do not trust the aggregate `ci` check — it accepts `skipped`. If they
   are skipped, suspect the Actions policy blocking `paths-filter`.
3. **`AUTOMATION_PAT`: force a real diff first.** Label any issue, *then*
   dispatch *Sync backlog mirror*. Otherwise `sync-backlog.yml:88` exits 0 at
   *"BACKLOG.md unchanged"* **before it ever authenticates** — a green run that
   tested nothing. Success = a `chore(backlog)` PR opens, goes green, merges.
   A **404** from `gh` means unapproved or under-scoped; a **403** on push means
   the token lacks Contents: write.
4. **Previews** — confirm a `*.pages.dev` comment appears. Its absence is the
   silent failure; nothing will go red.
5. **Production docs** — merge anything touching `docs/`, `dist/`, `themes/` or
   `lib/` and confirm `lattice.style` serves it. If assets 404 while HTML loads,
   the custom domain is detached and Astro is serving from
   `<neworg>.github.io/lattice/` with `base: '/'`.
6. **Project board** — file a test issue and confirm it lands on the board.
   Nothing anywhere goes red if it doesn't.
7. **Nightlies** — check the next morning. All but `studio-e2e` file a tracking
   issue on failure; that one reports to nobody.
8. **CodeQL, Dependabot, issue types** still present in the destination.

## If it goes wrong

**There is no transfer-back.** `SlideWright/lattice` is retired by the transfer
itself. Recovery means the Phase 0 mirror clone + issue export, restored into a
**new** repository name.

The realistic failure is not catastrophe but **quiet degradation** — the
board stops collecting, previews stop appearing, the AI nightly dies unreported.
Hence the verification list above tests for *silence*, not just for red.

**The escape hatch worth pre-agreeing:** if CI is broken by the Actions policy,
the ruleset has **zero bypass actors**, so nothing can merge — including the
Phase 2 PR that fixes it. Do **not** delete the ruleset. Temporarily add
yourself as a bypass actor, land the fix, then remove yourself. Note that if the
ruleset is ever deleted and recreated, id `18317422` no longer identifies it.

## Appendix — values, with provenance

**Verified from the repo or the live API:** ruleset `18317422` (rules, zero
bypass actors, `ci` required, 0 approvals) · second ruleset `19400032`
(disabled) · Cloudflare account `6e1dd8d852d61410a91dd1c909404e63`, project
`lattice-docs` · custom domain `lattice.style` (`docs/public/CNAME`) ·
`ci-drift-images` exists, `ci/preview-e2e-screenshots` does not yet · five
packages, none published · every workflow uses `${{ github.repository }}`, no
hardcoded org.

**Verified from GitHub's transfer documentation:** name retirement above 100
clones/Actions-uses · secrets, webhooks and deploy keys remain associated ·
Pages URLs are not redirected · issue types removed without a matching type ·
target must have no same-name repo *or fork in the same network* · creating a
repo at the old location permanently deletes redirects.

**NOT verified — proxy-blocked (403/401) from the sandbox:** `/environments`,
`/pages`, `/collaborators`, `/actions/permissions`, `/actions/secrets`,
`/code-scanning/default-setup`, `/installation`. So the live state of the
`automation` environment's rules, CodeQL default setup, the Actions policy, the
collaborator list, **whether each secret is repo- or org-scoped**, and the Claude
App's installation level are all *assumed*, not read. Treat every one as a
verify-by-hand item.
