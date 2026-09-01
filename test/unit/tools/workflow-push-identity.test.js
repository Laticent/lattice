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
 * Jobs that push with an embedded credential URL from a working tree that is
 * NOT the `actions/checkout` one, so the extraheader cannot reach them. Each
 * builds its own repository in a temp directory — a `git clone` into `mktemp
 * -d`, or a `git init` plus `git remote add` — which has its own git config.
 * Checked for staleness, so an entry that stops doing that is an error.
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
        // Verify the exemption's own claim rather than trusting the label.
        const run = runOf(pushStep);
        assert.ok(
          /mktemp -d/.test(run) || /git remote add/.test(run),
          `${id} is exempted as pushing from a separate worktree, but no longer builds one — ` +
            'it now pushes from the checkout, where the extraheader overrides its credentials',
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
