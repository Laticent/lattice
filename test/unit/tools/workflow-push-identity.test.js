/**
 * WHO A WORKFLOW'S `git push` AUTHENTICATES AS.
 *
 * Two workflows reach `main` by opening a PR and letting the merge queue land
 * it — the backlog mirror and the release. Both push with an explicit
 * credential URL carrying `AUTOMATION_PAT` rather than the built-in
 * `GITHUB_TOKEN`, and both say why in a comment: **GitHub starts no workflow
 * run for an event raised by the repo token.** A branch pushed with
 * `GITHUB_TOKEN` produces a `pull_request` event that never starts `ci`, the
 * required check never reports, `mergeable_state` stays `blocked`, and
 * auto-merge can never fire.
 *
 * `actions/checkout` quietly defeats that. By default it writes the job's
 * GITHUB_TOKEN into the repository's git config as an
 * `http.https://github.com/.extraheader` Authorization header, and that header
 * OVERRIDES the credentials embedded in a push URL. The push succeeds, is
 * attributed to `github-actions[bot]`, and the run lands in `action_required`
 * with zero jobs started.
 *
 * IT COST THREE WEEKS AND NOBODY NOTICED, because every symptom points away
 * from the cause. The workflow is green: it regenerates the file, commits,
 * pushes, and exits 0. The PAT is present and demonstrably working — `gh pr
 * create` and `gh pr merge` go over REST with it and are attributed correctly.
 * Only the git operations pick up the extraheader, so the run log shows the
 * identity SPLIT rather than a failure. `BACKLOG.md` on `main` froze at
 * 2026-08-10 claiming "167 open · 8 need triage" against a live queue of 271,
 * and the one place anybody would look — the workflow's own run history — was
 * twenty consecutive successes.
 *
 * What makes it worth a test rather than a comment: the release workflow
 * carried the identical bug and was saved only by luck. It cuts a fresh
 * `release/v$V` branch every time, so the PR's first event is the `opened`
 * raised over REST by the PAT. The first release that ever needed a second
 * push to an open PR would have frozen the same way, on the repo's
 * highest-stakes automation.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const WF_DIR = path.join(__dirname, '..', '..', '..', '.github', 'workflows');

/**
 * WHAT THIS FILE DOES NOT SEE, stated so nobody reads it as full coverage.
 *
 * Push sites are found by one URL shape — `x-access-token:$GH_TOKEN` in a `run:`
 * block. That pins the four sites in the tree today and catches a rewrite of any
 * of them. It does NOT find a new automation that authenticates some other way:
 * a secret interpolated straight into the URL (`${{ secrets.X }}`, where the
 * `{{` defeats the pattern), a different variable name, `git remote set-url`
 * followed by a plain `git push origin`, a credential helper, `.netrc`,
 * `GIT_ASKPASS`, or a push inside a composite action or reusable workflow.
 *
 * There is no arm enumerating "jobs that open a PR which must start `ci`", which
 * is the property actually at stake — only a list of the ways we happen to write
 * it down today. A new workflow in any of the forms above is invisible here.
 */

/**
 * Jobs that push with an embedded credential URL from a working tree that is
 * NOT the `actions/checkout` one, so the extraheader cannot reach them. Each
 * builds its own repository in a temp directory — a `git clone` into `mktemp
 * -d`, or a `git init` plus `git remote add` — which has its own git config.
 *
 * VERIFIED BY REVIEW, not by the test. See the comment at the check below: no
 * string match over a shell block can decide where a push actually runs, so the
 * control here is that the list is short, each entry carries its reason, and a
 * third one is a diff someone has to agree with. Both current entries were read:
 * `ci.yml::golden-diff` clones into `mktemp -d` and `cd`s there
 * (`.github/workflows/ci.yml:420-425`), and `publish-kits.yml::publish` does
 * `mktemp -d` + `cd` + `git init` (`:139-140`). Staleness IS checked — an entry
 * naming a job that no longer pushes this way is an error.
 */
const SEPARATE_WORKTREE = {
  'ci.yml::golden-diff':
    'clones the ci-drift-images branch into a mktemp dir and pushes from there; it also uses ' +
    'GITHUB_TOKEN on purpose — an artifacts branch wants no CI run',
  'publish-kits.yml::publish':
    'builds the orphan dist-kits branch in its own directory via git init + git remote add, ' +
    'and publishes to a branch with no PR and no required check',
};

const runOf = (step) => String(step.run || '');

test('a workflow that pushes with its own credentials keeps them', async (t) => {
  const pushers = [];
  for (const file of fs.readdirSync(WF_DIR).filter((f) => f.endsWith('.yml'))) {
    const doc = YAML.parse(fs.readFileSync(path.join(WF_DIR, file), 'utf8'));
    for (const [job, spec] of Object.entries(doc?.jobs || {})) {
      const steps = spec.steps || [];
      const pushStep = steps.find((s) => /x-access-token:\$\{?GH_TOKEN/.test(runOf(s)));
      if (!pushStep) continue;
      const checkout = steps.find((s) => String(s.uses || '').startsWith('actions/checkout'));
      pushers.push({ file, job, id: `${file}::${job}`, pushStep, checkout });
    }
  }

  await t.test('the push sites are found at all', () => {
    // Anti-vacuity: a rename of the URL shape would empty this list and pass
    // every assertion below in silence.
    assert.ok(pushers.length >= 3, `expected >=3 credential-URL push sites, found ${pushers.length}`);
  });

  await t.test('every credential push either keeps its identity or is a separate worktree', () => {
    for (const { id, checkout, pushStep } of pushers) {
      if (SEPARATE_WORKTREE[id]) {
        // A SANITY CHECK ON THE LABEL, NOT A PROOF — and the difference is worth
        // being blunt about, because an earlier version of this file claimed the
        // stronger thing. Whether a `git push` runs inside the checkout or inside a
        // repository the script built for itself is a property of shell execution,
        // and no string match over the block decides it. Two mutations demonstrate
        // the gap: point `work=` at `$GITHUB_WORKSPACE` while keeping `git init`,
        // or delete one of two `cd`s — both leave the push in the checkout and both
        // satisfy any pattern that has only the text to go on.
        //
        // So this asserts only that the entry still LOOKS like what it says, and the
        // real control is that the list is two entries long, both justified in
        // prose, and adding a third is a diff a reviewer has to agree with. Read
        // the run block when you touch one.
        assert.match(
          runOf(pushStep),
          /mktemp -d|git init/,
          `${id} is exempted as pushing from a repository it builds itself, and the step no ` +
            'longer builds one at all — re-read it before keeping the exemption',
        );
        continue;
      }
      assert.ok(checkout, `${id} pushes with an embedded credential but never checks out`);
      const persist = checkout.with?.['persist-credentials'];
      assert.equal(
        persist,
        false,
        `${id} pushes as $GH_TOKEN, but its actions/checkout persists the repo token into ` +
          'git config — the extraheader overrides the URL credentials, the push is attributed ' +
          'to github-actions[bot], and the resulting event starts no CI. Set ' +
          'persist-credentials: false.',
      );
    }
  });

  await t.test('the separate-worktree exemptions are not stale', () => {
    const live = new Set(pushers.map((p) => p.id));
    for (const id of Object.keys(SEPARATE_WORKTREE)) {
      assert.ok(live.has(id), `${id} is exempted but no longer pushes with a credential URL — drop it`);
    }
  });

  await t.test('the two PR-opening automations push as the PAT, not the repo token', () => {
    // The whole point of the exercise: these two reach main THROUGH a PR that
    // must start `ci`. GITHUB_TOKEN cannot.
    for (const file of ['sync-backlog.yml', 'release.yml']) {
      const p = pushers.find((x) => x.file === file);
      assert.ok(p, `${file} no longer pushes with a credential URL`);
      const env = { ...(p.pushStep.env || {}) };
      assert.match(
        String(env.GH_TOKEN || ''),
        /AUTOMATION_PAT/,
        `${file} pushes with something other than AUTOMATION_PAT — a branch pushed with the ` +
          'repo token raises an event that starts no workflow, so the required check never reports',
      );
    }
  });
});
