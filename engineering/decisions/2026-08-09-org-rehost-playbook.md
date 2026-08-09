---
status: proposed
summary: Operational run sheet for moving SlideWright/lattice to another GitHub org, built from the repo's actual wiring rather than a generic checklist. Inventories all five secrets and which workflow needs each, the Cloudflare Pages preview (direct wrangler upload to account 6e1dd8d852…, project lattice-docs — NOT the Git integration, so it is independent of the GitHub org), the GitHub Pages production deploy with the lattice.style custom domain, the Main Merge Queue ruleset (id 18317422, no bypass actors), the automation environment, CodeQL default setup, four third-party actions an org policy could block, and the ci-drift-images orphan branch. Bottom line: exactly TWO things genuinely break — AUTOMATION_PAT (a fine-grained PAT is bound to its resource owner) and the Pages custom-domain verification (org-scoped) — plus the Claude GitHub App, which is an org-level install that must be redone. Everything else either transfers with the repository or is unaffected because it never depended on the org. Includes destination-org prep that must happen BEFORE the transfer, an ordered run sheet, post-move smoke tests in dependency order, and a rollback. Disposable: delete once the move is done.
---

# Rehosting Lattice in another org — the run sheet

**Date:** 2026-08-09
**Status:** ready to run
**Scope:** moving the `lattice` repository to a different GitHub organization.
Not a rebrand — the product, the copyright holder and the SPDX headers stay
SlideWright.

> **This note is disposable.** It exists to be followed once. Delete it after
> the move, per `engineering/decisions/README.md`'s absorb-then-delete rule.

## The 60-second version

**Two things genuinely break, and one has to be reinstalled:**

1. **`AUTOMATION_PAT`** — a fine-grained PAT is bound to a *resource owner*. The
   moment the repo belongs to a different org, the token stops matching. The
   backlog mirror and the release both fail (loudly, by design).
2. **The GitHub Pages custom domain** (`lattice.style`) — domain verification is
   org-scoped, so it does not travel.
3. **The Claude GitHub App** — installed at org level, so the destination org
   needs its own install.

**Everything else either transfers with the repository or never depended on the
org in the first place.** The Cloudflare preview in particular is safe: it
deploys by direct `wrangler` upload, not through Cloudflare's GitHub
integration, so it has no GitHub-side coupling at all.

## What this repo actually runs on

Verified by reading the workflows and the live GitHub config, not assumed.

### Secrets — five, and only one is org-bound

| Secret | Needed by | Stored where | After the move |
|---|---|---|---|
| `AUTOMATION_PAT` | `release.yml`, `sync-backlog.yml` | **`automation` environment** | **BREAKS — re-mint** |
| `CLOUDFLARE_API_TOKEN` | `docs-preview.yml` | repo secret | survives — it authenticates to *Cloudflare*, which never knew about the org |
| `OPEN_ROUTER_KEY` | `studio-e2e-nightly.yml` | repo secret | survives — an opaque string |
| `NPM_TOKEN` | `release-publish.yml` | not set yet | n/a — and the plan is OIDC, so it may never exist |
| `GITHUB_TOKEN` | 6 workflows | built-in | automatic |

Secret **values** travel with the repository. `AUTOMATION_PAT` is the exception
not because the value is lost but because the *credential itself* becomes
invalid against the new owner.

### GitHub configuration

| Thing | Detail | Transfers? |
|---|---|---|
| Ruleset **Main Merge Queue** (id `18317422`) | PR required · merge queue (squash) · required check `ci` · **zero bypass actors** · 0 required approvals | **yes** — repo-level |
| Environment **`automation`** | deployment branch rule: `main` only; holds `AUTOMATION_PAT` | **yes** (the secret inside goes stale) |
| Environment **`github-pages`** | created by the Pages deploy | yes |
| Repo settings | auto-merge ON · delete-branch-on-merge ON · squash allowed | yes |
| Labels | `.github/labels.json` applied by `labels.yml` on push to main | **self-healing** — re-runs itself |
| Issue forms + templates, PR template | files in `.github/` | yes |
| **CodeQL** | **default setup** — a repo *security setting*, not a workflow file | probably — **verify** |
| Dependabot alerts + security updates | repo security settings | probably — **verify** |
| `ci-drift-images` | orphan branch hosting golden-diff PNGs for PR comments | yes — it's a branch |
| Open PRs, issues, releases, tags, history, all branches | | yes |
| Old URLs | permanent redirects — **unless someone re-registers the old org name** | yes, conditionally |

### Outside GitHub

| System | How it's wired | Affected? |
|---|---|---|
| **Cloudflare Pages** (previews) | `cloudflare/wrangler-action@v3` → `pages deploy docs/dist --project-name=lattice-docs`, account `6e1dd8d852d61410a91dd1c909404e63` | **No.** Direct upload, not the Git integration. Nothing on the Cloudflare side references the GitHub org. |
| **GitHub Pages** (production) | `actions/deploy-pages@v4`, custom domain `lattice.style` from `docs/public/CNAME` | **Domain verification is org-scoped — must be redone** |
| **npm** | nothing published; scope becoming `@workwel` | unaffected by the GitHub move |
| **OpenRouter** | key used only by the nightly Studio e2e (sanctioned under HARD RULE #24) | unaffected |
| **Claude GitHub App** | org-level installation | **must install on the destination org** |

### Third-party actions — the org policy that can silently block everything

Four workflows depend on actions **not** owned by GitHub:

- `browser-actions/setup-chrome@v1`
- `cloudflare/wrangler-action@v3`
- `dorny/paths-filter@v3` — used by `ci.yml`'s `changes` job, so this one gates **all of CI**
- `withastro/action@v3`
- `dependabot/fetch-metadata@v2` *(arrives with #1453)*

**If the destination org restricts Actions to "allow GitHub-owned and verified
creators only", CI breaks on the first run** — and the failure reads as a
mysterious action-resolution error rather than a policy problem. Check this
*before* transferring, not after.

## Destination-org prep — do all of this BEFORE you transfer

Each of these leaves the repo broken on arrival if skipped.

- [ ] **No repo named `lattice` already exists** in the destination org — the
      transfer refuses a name collision.
- [ ] You hold **repo-creation rights** in the destination org.
- [ ] **Actions policy allows the four third-party actions** above
      (Settings → Actions → General → *Allow all actions*, or add them to the
      allowlist). This is the one that breaks CI outright.
- [ ] **Fine-grained PATs are allowed** (Settings → Personal access tokens).
      Orgs block them by default; without this you cannot re-mint
      `AUTOMATION_PAT` and both automations stay dark.
- [ ] Decide the **PAT approval policy** — leaving approval *on* is fine and
      costs one click; just know you must go approve your own token.
- [ ] **Claude GitHub App** installed on the destination org, with access to the
      repo.
- [ ] Check for **org-level rulesets** that could conflict with the repo's
      `Main Merge Queue` ruleset (org rules are additive, not overriding).
- [ ] Check **org Actions spending / runner** settings. Public repos get free
      minutes, but an org-level restriction still applies.

## The run sheet

**1 — Land the open work first.** Merging what's already green means fewer
moving parts and no open PRs straddling the move. Open PRs *do* survive a
transfer, so this is preference, not necessity.

**2 — Transfer the repository.**
Settings → General → Danger Zone → *Transfer ownership*.

**3 — Re-mint `AUTOMATION_PAT`** (the first thing that will bite):
- Create a fine-grained PAT: **resource owner = the destination org**,
  repository access = `lattice` only, permissions **Contents: write** +
  **Pull requests: write**, nothing else.
- Approve it if the org requires approval.
- Update the secret **inside the `automation` environment** — not repo secrets.
  Confirm the environment still shows its `main`-only branch rule.

**4 — Re-establish the Pages custom domain.**
Settings → Pages → set the custom domain to `lattice.style`, and complete the
org-scoped domain verification. The `CNAME` file in `docs/public/` is already
correct and needs no change; this is GitHub-side verification only.

**5 — Update the hardcoded references** (one small PR, after the transfer so the
new URLs actually resolve):
- `tools/sync-backlog.js` — the issues URL in the generated header
- `docs/src/lib/feedback-issue.ts` — the feedback issue target
- `.github/ISSUE_TEMPLATE/config.yml` — contact links
- `package.json` — `homepage`, `repository.url`, `bugs.url`

Deliberately **not** updated: dated `engineering/decisions/` records and
`CHANGELOG` history. They are records of what was true when written, and GitHub
redirects keep their links working.

**6 — Claim the old org name.** Once renamed away or emptied, `SlideWright`
becomes available to anyone, and if someone registers it **every redirect
dies**. Create a placeholder org holding the name.

## Post-move verification, in dependency order

Run these in sequence — each one depends on the last, so the first failure tells
you exactly where the break is.

1. **CI runs at all.** Open any trivial PR. If `changes` fails to resolve
   `dorny/paths-filter`, it's the org Actions policy (prep step 3), not your
   repo.
2. **The full CI tier passes.** Unit, integration, golden-diff, docs-build,
   studio-smoke.
3. **`AUTOMATION_PAT` works.** Actions → *Sync backlog mirror* → Run workflow.
   Success = a `chore(backlog)` PR opens, goes green, and merges itself. A
   failure naming the missing secret means step 3 of the run sheet is incomplete;
   a `403` from `gh` means the token exists but wasn't approved or lacks a
   permission.
4. **The environment gate still holds.** The mirror run proves the positive case
   (a `main` job can read the secret). The negative case — that a PR branch
   *cannot* — is only worth testing if you want the assurance.
5. **Cloudflare previews.** Any open PR should get a docs-preview comment with a
   `*.pages.dev` URL. If this is the *only* thing broken, it's the Cloudflare API
   token, not the move.
6. **Production docs.** Merge anything touching `docs/`, `dist/`, `themes/` or
   `lib/` and confirm `lattice.style` serves the new build. A 404 or a
   certificate warning means the custom domain needs re-verification.
7. **Nightlies.** They run on cron, so the honest check is to look the next day:
   integration, perf, studio-e2e, preview-e2e, modulepreload-coverage.
8. **CodeQL and Dependabot** still appear in Security. Both are settings rather
   than files, so they're the most plausible silent casualties.

## If it goes wrong

**A repository transfer is reversible** — you can transfer it back, and history,
issues and PRs are untouched throughout. Nothing in this playbook destroys data.

The realistic failure is not catastrophe but **quiet degradation**: the mirror
stops running, or previews stop appearing, and nobody notices for a week. The
mitigations are already in place — every automation fails *loudly* rather than
silently, and the verification sequence above is ordered so the first red step
names the cause.

The one genuinely unrecoverable mistake is **letting the old org name lapse and
be claimed**, which permanently breaks every redirect in every doc, issue and
external link. That's run-sheet step 6, and it's the only step with no undo.

## Appendix — exact values

| | |
|---|---|
| Ruleset | `Main Merge Queue`, id `18317422`, target `refs/heads/main` |
| Required check | `ci` |
| Approvals required | **0** — this is what lets automation auto-merge |
| Environment | `automation` — deployment branch rule `main`, no reviewers, admin bypass **off** |
| Cloudflare account | `6e1dd8d852d61410a91dd1c909404e63` |
| Cloudflare Pages project | `lattice-docs` |
| Custom domain | `lattice.style` (`docs/public/CNAME`) |
| Artifact branch | `ci-drift-images` (golden-diff PNGs for PR comments) |
| Collaborators | one — `saden1` (admin) |
| Published packages | **none** — all five are unpublished |

**Unverified from the sandbox:** the Pages, environments, Actions-permissions
and installations APIs are blocked by this environment's proxy, so the live
state of CodeQL default setup, Actions permissions and app installs could not be
read. They are listed as *verify* items above rather than asserted.
