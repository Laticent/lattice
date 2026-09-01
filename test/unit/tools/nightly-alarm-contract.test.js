/**
 * THE NIGHTLY ALARM CONTRACT.
 *
 * Six workflows watch `main` overnight and, by a contract this repo states
 * twice (`integration-nightly.yml`, `overflow-nightly.yml`), stay GREEN when
 * they find something — they file a rolling tracking issue instead. Run colour
 * therefore carries no information about these checks at all: twelve
 * consecutive `integration-nightly` runs reported success while the tier was
 * failing, and that is the contract working as designed. THE ISSUE IS THE ONLY
 * SIGNAL, which puts the whole weight of the nightly tier on it being true.
 *
 * It was not. Until this file landed, five of the six could open a rolling
 * issue and none of them could close one. An alarm that only ever fires is not
 * an alarm: after its first firing — statistically likelier a harness failure
 * than a real regression — the thread is triaged as "the flaky nightly", and a
 * genuine regression months later arrives as a comment on a dismissed thread.
 *
 * WHY A TEST AND NOT A REVIEW NOTE. Every rule below is a shape somebody
 * already got wrong, and every one of them fails SILENTLY: the workflow is
 * valid YAML, the run is green, and the damage is an issue that closed on a
 * night nothing was measured. Nothing in the tree could see that. These are
 * cheap string-level assertions over parsed YAML — they cannot prove a
 * stand-down closes for the right reason, and they are not meant to. They pin
 * the five mechanical mistakes that produced the wrong behavior.
 *
 * WHAT IT DELIBERATELY DOES NOT ASSERT: that a stand-down CLOSES. Whether a
 * measured-green night is evidence the condition is gone depends on the check.
 * An ABSOLUTE check (does the gallery paint on this commit?) is settled by one
 * green night. A DIFFERENTIAL one (perf: head vs a base ~24h old) is not — on
 * night 2 the base carries the regression too and the diff comes back clean on
 * a still-broken site. So `perf-nightly`'s `watch` job comments and never
 * closes, on purpose. Requiring a close would have forced a wrong condition
 * into the one job that must not have one.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const WF_DIR = path.join(__dirname, '..', '..', '..', '.github', 'workflows');

/**
 * Shell comment lines, stripped. These workflows document the bugs they fixed
 * BY QUOTING THEM — `perf-nightly.yml` spells out the `--search "in:title …"`
 * form in prose precisely to say never to use it. A naive substring scan reads
 * the warning as the offense and fails the file that carries the fix.
 */
const code = (run) =>
  String(run || '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n');

/** Every job that files a rolling issue, as `{ file, job, filing, standDown }`. */
function alarmJobs() {
  const out = [];
  for (const file of fs.readdirSync(WF_DIR).filter((f) => f.endsWith('.yml'))) {
    const doc = YAML.parse(fs.readFileSync(path.join(WF_DIR, file), 'utf8'));
    for (const [job, spec] of Object.entries(doc.jobs || {})) {
      const steps = spec.steps || [];
      const filing = steps.find((s) => code(s.run).includes('gh issue create'));
      if (!filing) continue;
      const standDown = steps.find((s) => /Stand down|Comment on the rolling issue/.test(s.name || ''));
      out.push({ file, job, filing, standDown });
    }
  }
  return out;
}

/** The `gh issue list …` lookup a step uses, whitespace-normalized. */
function lookup(step) {
  const m = code(step?.run).match(/ISSUE=\$\(gh issue list[\s\S]*?\)\n/);
  return m ? m[0].replace(/\s+/g, ' ').trim() : null;
}

test('nightly alarm contract', async (t) => {
  const jobs = alarmJobs();

  await t.test('the alarm family is found at all', () => {
    // Anti-vacuity. Every assertion below iterates `jobs`; an empty list would
    // pass all of them silently, which is the exact failure mode this file is
    // about. The count is a floor, not a pin — a new nightly should raise it.
    assert.ok(jobs.length >= 8, `expected >=8 issue-filing jobs, found ${jobs.length}`);
    const files = new Set(jobs.map((j) => j.file));
    for (const f of [
      'perf-nightly.yml',
      'preview-e2e-nightly.yml',
      'integration-nightly.yml',
      'modulepreload-coverage-nightly.yml',
      'overflow-nightly.yml',
      'studio-e2e-nightly.yml',
    ]) {
      assert.ok(files.has(f), `${f} no longer files a rolling issue — did it move or get renamed?`);
    }
  });

  await t.test('every filing job can also stand its alarm down', () => {
    for (const { file, job, standDown } of jobs) {
      assert.ok(standDown, `${file} / ${job} files a rolling issue but can never act on a recovery`);
    }
  });

  await t.test("a stand-down runs on always(), so a failing sibling step can't mute it", () => {
    // GitHub applies an implicit `success()` to any `if:` with no status
    // function. Without `always()` the condition silently becomes
    // `success() && …`, and these jobs deliberately let steps fail — so the
    // step would be skipped in a run that had something to say.
    for (const { file, job, standDown } of jobs) {
      if (!standDown) continue; // reported by the test above; don't crash the rest
      assert.match(String(standDown.if), /always\(\)/, `${file} / ${job}: stand-down lacks always()`);
    }
  });

  await t.test('a stand-down keys on step OUTCOME, never on the output alone', () => {
    // `!= 'true'` — and a bare output test — IS TRUE FOR THE EMPTY STRING, and
    // the output is empty in every state where nothing ran: a cancellation, a
    // step timeout, an earlier step that died. Acting there reports NOT
    // MEASURED as health, which is this family's cardinal sin.
    for (const { file, job, standDown } of jobs) {
      if (!standDown) continue; // reported above
      const cond = String(standDown.if);
      assert.ok(
        cond.includes("outcome == 'success'"),
        `${file} / ${job}: stand-down has no outcome guard — an unmeasured night reads as green`,
      );
      assert.ok(
        !cond.includes("!= 'true'"),
        `${file} / ${job}: stand-down uses != 'true', which is true for the empty string`,
      );
    }
  });

  await t.test('no lookup uses the tokenizing in:title search', () => {
    // GitHub tokenizes `--search "in:title [preview-e2e]"` on the brackets and
    // the hyphen, degrading it to the bare words — which match human-authored
    // issues. `.[0]` then takes someone else's issue and appends to it nightly
    // while the rolling issue is never found.
    for (const { file, job, filing, standDown } of jobs) {
      if (!standDown) continue; // reported above
      for (const [what, step] of [['filing', filing], ['stand-down', standDown]]) {
        assert.ok(
          !code(step.run).includes('--search "in:title'),
          `${file} / ${job}: ${what} step uses the tokenizing in:title search`,
        );
      }
    }
  });

  await t.test('the filing and stand-down steps of a job look the issue up identically', () => {
    // The one that matters most. Two different searches in one job means the
    // step that files appends to one thread while the step that recovers acts
    // on another — and both look correct in isolation.
    for (const { file, job, filing, standDown } of jobs) {
      if (!standDown) continue; // reported above
      const a = lookup(filing);
      const b = lookup(standDown);
      assert.ok(a, `${file} / ${job}: could not find the filing step's issue lookup`);
      assert.ok(b, `${file} / ${job}: could not find the stand-down's issue lookup`);
      assert.equal(b, a, `${file} / ${job}: the two steps search for DIFFERENT issues`);
    }
  });

  await t.test('a stand-down never acts silently — it comments, naming the run', () => {
    // A close with no comment leaves the next reader unable to tell a recovered
    // alarm from one somebody quietly triaged away.
    for (const { file, job, standDown } of jobs) {
      if (!standDown) continue; // reported above
      const run = code(standDown.run);
      assert.ok(run.includes('gh issue comment'), `${file} / ${job}: stand-down acts without commenting`);
      assert.ok(
        run.includes('actions/runs/'),
        `${file} / ${job}: stand-down comment names no run, so its evidence can't be checked`,
      );
    }
  });

  await t.test('a Playwright stand-down proves tests actually RAN', () => {
    // `ai-architect.spec.ts` opens with `test.skip(!LIVE_KEY, …)`: with the
    // secret unset Playwright skips every test, prints "N skipped" and EXITS 0.
    // Outcome and output both say green while nothing whatsoever was tested, so
    // these two need a third condition the other jobs do not.
    const pw = jobs.filter((j) => j.file === 'studio-e2e-nightly.yml');
    assert.equal(pw.length, 2, 'expected the two studio-e2e jobs');
    for (const { file, job, standDown } of pw) {
      // Pin the GUARD specifically — `! grep -qE …` in the early-exit — not merely the
      // presence of the pattern somewhere in the step. The step greps the report twice
      // (once to gate, once to pull the count for the comment), and an assertion that
      // accepted either copy passed a mutation that weakened the gate and left the
      // cosmetic one intact. Measured: that exact mutation went uncaught.
      assert.match(
        code(standDown.run),
        /!\s*grep -qE '\[1-9\]\[0-9\]\* passed'/,
        `${file} / ${job}: stand-down would close on a run that skipped every test`,
      );
    }
  });
});
