/**
 * THE NIGHTLY ALARM CONTRACT.
 *
 * Six workflows watch `main` overnight and, by a contract this repo states
 * twice (`integration-nightly.yml`, `overflow-nightly.yml`), stay GREEN when
 * they find something — they file a rolling tracking issue instead. Run color
 * therefore carries no information about these checks: twelve consecutive
 * `integration-nightly` runs reported success while the tier was failing, and
 * that is the contract working as designed. THE ISSUE IS THE ONLY SIGNAL,
 * which puts the whole weight of the nightly tier on it being true.
 *
 * It was not. Until 2026-09-01 five of the six could open a rolling issue and
 * none could act on a recovery. An alarm that only ever fires is not an alarm:
 * after its first firing — likelier a harness failure than a real regression —
 * the thread reads as "the flaky nightly", and a genuine regression months
 * later arrives as a comment nobody reopens.
 *
 * WHY A TEST AND NOT A REVIEW NOTE. Every rule below is a shape somebody
 * already got wrong, and every one of them fails SILENTLY: the workflow is
 * valid YAML, the run is green, and the damage is a thread closed on a night
 * nothing was measured. Nothing else in the tree can see that.
 *
 * AN EARLIER VERSION OF THIS FILE WAS ITSELF THE PROBLEM IT DESCRIBES, and
 * the corrections are why three of these assertions look the way they do:
 *
 *  · Its lookup comparison read the raw shell text, which contains the
 *    VARIABLE `$MARKER` rather than its value — so the two sides were equal by
 *    construction for every job in the family and the assertion could not fail.
 *    Pointing a job's stand-down at a SIBLING'S marker passed. The markers are
 *    now RESOLVED from their assignments before anything is compared.
 *  · Its outcome check asked only that `outcome == 'success'` appeared
 *    SOMEWHERE in the `if:`. Reducing integration's six-arm guard to one arm
 *    passed. It now requires that every step whose OUTPUT the condition reads
 *    also has its OUTCOME guarded — the pairing is the rule, not the presence
 *    of the words.
 *  · Its `!= 'true'` ban matched one exact spelling, so removing a space
 *    evaded it. The condition is normalized first.
 *
 * WHAT IT DELIBERATELY DOES NOT ASSERT is nothing: the CLOSE/COMMENT posture
 * of every job is pinned below, because that judgment is the one most likely
 * to be got wrong quietly — and was.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..', '..', '..');
const WF_DIR = path.join(REPO, '.github', 'workflows');

/**
 * A stand-down may CLOSE its thread only when a green night is real evidence
 * the condition cleared. That is true only of a check scored against the
 * commit in front of it. It is NOT true of a check scored against a COMMITTED
 * BASELINE, because blessing the baseline turns the check green without fixing
 * anything, and the run cannot tell the two apart — the re-bless would BE the
 * trigger. It is not true of a DIFFERENTIAL check either: a head-vs-base-24h
 * comparison comes back clean on night 2 because the base carries the
 * regression too.
 *
 * Both lists are exhaustive over the family and are checked for staleness in
 * both directions, so a new alarm cannot join without someone deciding which
 * it is.
 */
const CLOSES = {
  'preview-e2e-nightly.yml::e2e':
    'absolute — the gallery paints on this commit or it does not; there is no baseline to bless',
  'modulepreload-coverage-nightly.yml::check':
    'absolute — islands under docs/src/pages/ against the ENTRIES list, both in the tree, and ' +
    'adding the missing entry IS the fix rather than a bless',
  'perf-nightly.yml::engine-perf':
    'differential, and closes NARROWLY because of it — only a thread whose body says the ' +
    'previous firing was a HARNESS failure (NOTHING WAS COMPARED). A false alarm is settled ' +
    'by one clean measurement; a real regression is not, and that one stays open. The body ' +
    'is the discriminator — read from the LATEST firing (the last comment, falling back to the ' +
    'body only for a thread with none), never the create-time body, which describes the FIRST ' +
    'firing forever. Its sibling `watch` job emits no such marker, which is why ' +
    'that one may not close at all',
};

/**
 * A CLOSER MUST PROVE IT MEASURED SOMETHING, and this names the output that
 * carries the count.
 *
 * `uncovered=false` / `failed=false` is each check's evidence of health — and it
 * is equally what a run that examined NOTHING produces. That is not theoretical
 * for either job here: exactly one page in the tree hydrates a `client:only`
 * island, the coverage scan is top-level-only by design, and `src/pages/studio/`
 * already exists, so moving that one page is an ordinary refactor that empties
 * the corpus and reports zero-of-zero as health.
 *
 * A job that only COMMENTS does not need this — a wrong comment is noise, a
 * wrong close destroys the thread. `perf-nightly.yml::engine-perf` is the one
 * closer with no entry, because it does not close unconditionally: it closes
 * inside a `case` on the latest firing, and the arm below holds it to that.
 */
const MEASUREMENT_FLOOR = {
  'preview-e2e-nightly.yml::e2e': { step: 'e2e', output: 'cases' },
  'modulepreload-coverage-nightly.yml::check': { step: 'check', output: 'islands' },
};

const COMMENTS_ONLY = {
  'integration-nightly.yml::nightly':
    'baseline-scored — test/oracle/family-*.json, test/oracle/player-contrast.json and the ' +
    'committed golden PDFs, each with its own bless script',
  'overflow-nightly.yml::overflow':
    'baseline-scored — the tool calls itself a RATCHET against committed per-deck clip counts, ' +
    'and overflow:bless raises the floor',
  'studio-e2e-nightly.yml::e2e':
    'baseline-scored — visual.spec.ts asserts toHaveScreenshot against committed snapshots; ' +
    'CI also retries once, so a flaky pass reads as green',
  'studio-e2e-nightly.yml::e2e-ai':
    'a live model, so one passing night is weaker evidence than it looks',
  'perf-nightly.yml::watch':
    'differential — head against a base ~24h old, and it emits no harness-failure marker to ' +
    'discriminate on',
};

/**
 * Shell comment lines, stripped. These workflows document the bugs they fixed
 * BY QUOTING THEM — `perf-nightly.yml` spells out the `--search "in:title …"`
 * form in prose precisely to say never to use it. A naive substring scan reads
 * the warning as the offense and fails the file carrying the fix.
 */
const code = (run) =>
  String(run || '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n');

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Every SCHEDULED job that files a rolling issue. */
function alarmJobs() {
  const out = [];
  for (const file of fs.readdirSync(WF_DIR).filter((f) => f.endsWith('.yml'))) {
    const doc = YAML.parse(fs.readFileSync(path.join(WF_DIR, file), 'utf8'));
    // Scoped to the NIGHTLY family on purpose. A one-shot dispatch workflow
    // that files an issue is not a rolling alarm, and demanding a stand-down of
    // it would redden `npm test` for an unrelated change.
    if (!doc?.on?.schedule) continue;
    for (const [job, spec] of Object.entries(doc.jobs || {})) {
      const steps = spec.steps || [];
      const filing = steps.find((s) => code(s.run).includes('gh issue create'));
      if (!filing) continue;
      const standDown = steps.find((s) => /Stand down|Report .* on the rolling issue/.test(s.name || ''));
      out.push({ file, job, id: `${file}::${job}`, filing, standDown, steps });
    }
  }
  return out;
}

/** `MARKER='[x]'` / `TITLE='x'` assignments in a step, as a name→value map. */
function shellVars(step) {
  const vars = {};
  for (const m of code(step?.run).matchAll(/^\s*(MARKER|TITLE)='([^']*)'/gm)) vars[m[1]] = m[2];
  return vars;
}

/**
 * The `gh issue list …` lookup a step uses, whitespace-normalized AND WITH ITS
 * MARKER/TITLE RESOLVED. Resolving is the whole point: unresolved, every job in
 * the family shares one string and comparing them proves nothing.
 */
function lookup(step) {
  const m = code(step?.run).match(/ISSUE=\$\(gh issue list[\s\S]*?\)\n/);
  if (!m) return null;
  let text = norm(m[0]);
  for (const [k, v] of Object.entries(shellVars(step))) text = text.split(`$${k}`).join(v);
  return text;
}

/** The title the filing step would create, resolved. */
function createdTitle(step) {
  const m = code(step?.run).match(/--title "([^"]*)"/);
  if (!m) return null;
  let t = m[1];
  for (const [k, v] of Object.entries(shellVars(step))) t = t.split(`$${k}`).join(v);
  return t;
}

/**
 * EVERY `run:` BLOCK IN THE FAMILY MUST PARSE AS SHELL.
 *
 * This is the arm that was missing, and its absence shipped four broken steps.
 * A find/replace that rewrote these stand-downs from closing to commenting
 * escaped three quotes wrong — `."` became `.\"`, `echo ""` became `echo \""` —
 * and every other gate stayed green: the YAML is valid, `npm run lint` does not
 * read shell inside a string, `build:check` has no opinion, and the assertions
 * below all passed because they read the `if:` condition and grep the run text
 * for `gh issue close` without ever asking whether the script RUNS.
 *
 * BASH PARSES LAZILY, which is what makes this so quiet. `MARKER=…`, the issue
 * lookup and the `[ -n … ] || exit 0` early-exit all execute fine; the `{ … }`
 * group then fails to parse and bash aborts. So on a night with NO open thread
 * the early exit fires first and the step passes — and the break only surfaces
 * on the one night the step exists for: an open alarm and a green tier.
 *
 * Checked over every run block in every workflow, not just the stand-downs: the
 * defect was in a step this file already covered, so covering only what it
 * already knew about would have missed it.
 */
function shellParses(run) {
  const r = spawnSync('bash', ['-n'], { input: String(run), encoding: 'utf8' });
  return { ok: r.status === 0, err: (r.stderr || '').trim().split('\n')[0] };
}

test('every workflow run block is valid shell', () => {
  const offenders = [];
  let checked = 0;
  for (const file of fs.readdirSync(WF_DIR).filter((f) => f.endsWith('.yml'))) {
    const doc = YAML.parse(fs.readFileSync(path.join(WF_DIR, file), 'utf8'));
    for (const [job, spec] of Object.entries(doc?.jobs || {})) {
      for (const step of spec.steps || []) {
        if (!step.run) continue;
        checked++;
        const { ok, err } = shellParses(step.run);
        if (!ok) offenders.push(`${file} / ${job} / ${step.name || '(unnamed)'}: ${err}`);
      }
    }
  }
  // Anti-vacuity: a YAML shape change that stopped finding `run:` blocks would
  // otherwise pass this silently.
  assert.ok(checked >= 50, `expected >=50 run blocks across the workflows, found ${checked}`);
  assert.deepEqual(offenders, [], `unparseable shell in ${offenders.length} run block(s)`);
});

test('nightly alarm contract', async (t) => {
  const jobs = alarmJobs();

  await t.test('the alarm family is found at all', () => {
    // Anti-vacuity: every assertion below iterates `jobs`, so an empty list
    // would pass all of them silently — the exact failure this file is about.
    assert.ok(jobs.length >= 7, `expected >=7 scheduled issue-filing jobs, found ${jobs.length}`);
    const files = new Set(jobs.map((j) => j.file));
    for (const f of [
      'perf-nightly.yml', 'preview-e2e-nightly.yml', 'integration-nightly.yml',
      'modulepreload-coverage-nightly.yml', 'overflow-nightly.yml', 'studio-e2e-nightly.yml',
    ]) {
      assert.ok(files.has(f), `${f} no longer files a rolling issue — did it move or get renamed?`);
    }
  });

  await t.test('every filing job can also act on a recovery', () => {
    for (const { id, standDown } of jobs) {
      assert.ok(standDown, `${id} files a rolling issue but can never act on a recovery`);
    }
  });

  await t.test('every job is classified as closing or commenting, and neither list is stale', () => {
    const classified = new Set([...Object.keys(CLOSES), ...Object.keys(COMMENTS_ONLY)]);
    for (const { id } of jobs) {
      assert.ok(
        classified.has(id),
        `${id} is a nightly alarm with no posture — decide whether a green night is evidence ` +
          'enough to CLOSE its thread, and say why in CLOSES or COMMENTS_ONLY',
      );
    }
    const live = new Set(jobs.map((j) => j.id));
    for (const id of classified) {
      assert.ok(live.has(id), `${id} is classified but is no longer a nightly alarm — drop it`);
    }
    for (const id of Object.keys(CLOSES)) {
      assert.ok(!COMMENTS_ONLY[id], `${id} is in both lists`);
    }
  });

  await t.test('a job closes its thread only if it is classified as able to', () => {
    // The one the first cut got wrong: four baseline-scored jobs closed on a
    // measured green, so the first night any of them fired would have been the
    // night after a bless — reporting a lowered bar as a recovery.
    for (const { id, standDown } of jobs) {
      if (!standDown) continue;
      const closes = code(standDown.run).includes('gh issue close');
      if (CLOSES[id]) {
        assert.ok(closes, `${id} is classified as able to close, but never closes — ${CLOSES[id]}`);
      } else {
        assert.ok(
          !closes,
          `${id} closes its thread, but a green night there is not evidence the condition ` +
            `cleared: ${COMMENTS_ONLY[id]}`,
        );
      }
    }
  });

  await t.test("a stand-down runs on always(), so a failing sibling step can't mute it", () => {
    // GitHub applies an implicit `success()` to any `if:` with no status
    // function, and these jobs deliberately let steps fail.
    for (const { id, standDown } of jobs) {
      if (!standDown) continue;
      assert.match(norm(standDown.if), /always\(\)/, `${id}: stand-down lacks always()`);
    }
  });

  await t.test('every step whose OUTPUT a stand-down reads has its OUTCOME guarded too', () => {
    // The pairing is the rule. An output is empty in every state where nothing
    // was measured — a cancellation, a step timeout, an earlier step that died
    // — so an output read without its outcome guard treats NOT MEASURED as
    // health. Checking that the words appear somewhere is not enough: it
    // accepted a six-arm guard reduced to one arm.
    for (const { id, standDown } of jobs) {
      if (!standDown) continue;
      const cond = norm(standDown.if);
      const read = new Set([...cond.matchAll(/steps\.([\w-]+)\.outputs\./g)].map((m) => m[1]));
      assert.ok(read.size > 0, `${id}: stand-down reads no step output at all — what is it keying on?`);
      for (const stepId of read) {
        assert.ok(
          new RegExp(`steps\\.${stepId}\\.outcome\\s*==\\s*'success'`).test(cond),
          `${id}: reads steps.${stepId}.outputs.* without guarding steps.${stepId}.outcome — ` +
            'an unmeasured night reads as green',
        );
      }
    }
  });

  await t.test('a stand-down weighs every arm the filing step weighs', () => {
    // Filing ORs its arms — ANY one red files. Standing down has to AND the
    // SAME arms, because any one still red means the condition has not cleared.
    // Checking only that each arm read is also outcome-guarded is not enough: it
    // is satisfied by a six-arm guard reduced to one, which is a stand-down that
    // reports the whole tier green on the strength of its first arm. Measured —
    // that mutation passed every other assertion in this file.
    const outputsRead = (cond) =>
      new Set([...norm(cond).matchAll(/steps\.([\w-]+)\.outputs\./g)].map((m) => m[1]));
    for (const { id, filing, standDown } of jobs) {
      if (!standDown) continue;
      const want = [...outputsRead(filing.if)].sort();
      const got = [...outputsRead(standDown.if)].sort();
      assert.ok(want.length > 0, `${id}: the filing step reads no step output — what does it key on?`);
      assert.deepEqual(
        got,
        want,
        `${id}: the filing step weighs [${want}] but the stand-down weighs [${got}] — ` +
          'an arm nobody re-checks is an arm that can stay red through a "recovery"',
      );
    }
  });

  await t.test("no stand-down compares an output with != 'true'", () => {
    // True for the empty string. Normalized first: the earlier spelling-exact
    // ban was evaded by deleting a space.
    for (const { id, standDown } of jobs) {
      if (!standDown) continue;
      assert.ok(
        !/!=\s*'true'/.test(norm(standDown.if)),
        `${id}: uses != 'true', which is satisfied by the empty output of a job that never ran`,
      );
    }
  });

  await t.test('no lookup uses the tokenizing in:title search', () => {
    // GitHub tokenizes `--search "in:title [preview-e2e]"` on the brackets and
    // the hyphen, so it matches human-authored issues and `.[0]` takes one.
    for (const { id, filing, standDown } of jobs) {
      for (const [what, step] of [['filing', filing], ['stand-down', standDown]]) {
        if (!step) continue;
        assert.ok(
          !code(step.run).includes('--search "in:title'),
          `${id}: ${what} step uses the tokenizing in:title search`,
        );
      }
    }
  });

  await t.test('the filing and stand-down steps of a job look up the SAME issue', () => {
    // Compared with markers RESOLVED. Unresolved, the two strings are identical
    // for every job in the family whatever the markers are, and pointing one
    // job's stand-down at a sibling's thread passes.
    for (const { id, filing, standDown } of jobs) {
      if (!standDown) continue;
      const a = lookup(filing);
      const b = lookup(standDown);
      assert.ok(a, `${id}: could not find the filing step's issue lookup`);
      assert.ok(b, `${id}: could not find the stand-down's issue lookup`);
      assert.ok(!a.includes('$MARKER') && !a.includes('$TITLE'), `${id}: filing marker unresolved`);
      assert.equal(b, a, `${id}: the two steps search for DIFFERENT issues`);
    }
  });

  await t.test('the issue a job CREATES is one its own lookup would find', () => {
    // A marker that does not prefix the title is a stand-down that silently
    // never finds anything, and a filing step that opens a fresh duplicate
    // every night.
    for (const { id, filing } of jobs) {
      const title = createdTitle(filing);
      const q = lookup(filing);
      assert.ok(title, `${id}: filing step creates no --title`);
      const prefix = q.match(/startswith\(\\?"([^"\\]*)/);
      const exact = q.match(/\.title == \\?"([^"\\]*)/);
      if (prefix) {
        assert.ok(title.startsWith(prefix[1]), `${id}: creates "${title}", which "${prefix[1]}" never matches`);
      } else if (exact) {
        assert.equal(title, exact[1], `${id}: creates a title its own exact lookup would miss`);
      } else {
        assert.fail(`${id}: lookup matches on neither a prefix nor an exact title`);
      }
    }
  });

  await t.test('a stand-down never acts silently — it comments, naming the run', () => {
    for (const { id, standDown } of jobs) {
      if (!standDown) continue;
      const run = code(standDown.run);
      assert.ok(run.includes('gh issue comment'), `${id}: stand-down acts without commenting`);
      assert.ok(run.includes('actions/runs/'), `${id}: comment names no run, so its evidence can't be checked`);
    }
  });

  await t.test('every step that may fail quietly is outcome-guarded by the stand-down', () => {
    // The arm above pairs an outcome guard to every step whose OUTPUT the
    // condition reads. That is not the whole rule, and the gap was real: in
    // `perf-nightly::watch`, `basecollect` is `continue-on-error: true` and is
    // referenced by OUTCOME ALONE, so deleting the single clause that separates
    // "the site is green" from "nothing was compared" passed the whole suite.
    //
    // `continue-on-error` is the precise marker for "this step may die and the
    // job carries on", which is exactly the state an output cannot describe:
    // the comparator writes `regressed=false` when it had no base to compare
    // against, and a stand-down that cannot see the death reads it as health.
    // SCOPED TO STEPS THAT RUN BEFORE THE MEASUREMENT. A continue-on-error step
    // that runs AFTER the measuring step cannot corrupt it — `preview-e2e`'s
    // `shots` publishes screenshots once the verdict is already in, and demanding
    // a guard for it would be noise. What matters is a step whose death changes
    // what the measurement MEANS, and running first is the mechanical test for
    // that: `basecollect` feeds `compare`, so its death turns "no regression"
    // into "nothing to compare against".
    let checked = 0;
    for (const { id, standDown, steps } of jobs) {
      if (!standDown) continue;
      const cond = norm(standDown.if);
      const measured = new Set([...cond.matchAll(/steps\.([\w-]+)\.outputs\./g)].map((m) => m[1]));
      const lastMeasured = Math.max(...steps.map((st, i) => (measured.has(st.id) ? i : -1)));
      for (const [i, step] of steps.entries()) {
        if (step['continue-on-error'] !== true || !step.id) continue;
        if (i > lastMeasured) continue; // runs after the verdict — cannot corrupt it
        checked++;
        assert.ok(
          new RegExp(`steps\\.${step.id}\\.outcome\\s*==\\s*'success'`).test(cond),
          `${id}: step '${step.id}' is continue-on-error and feeds the measurement, so it can die ` +
            'without reddening the job — but the stand-down never checks its outcome, and a green ' +
            'nothing then reads as a green site',
        );
      }
    }
    // Anti-vacuity: if the family stops marking its feeding steps
    // continue-on-error, this arm must fail loudly rather than pass on nothing.
    assert.ok(checked >= 1, 'no continue-on-error feeding step was checked — has the family changed shape?');
  });

  await t.test('a lookup identifies its thread by AUTHOR, not just by a title anyone can type', () => {
    // A title prefix is not an identity. Anyone who can file an issue picks the
    // title, so a lookup keyed on the title alone selects a squatted thread —
    // and these steps CLOSE what they select, stamping it "measured green".
    // Filtering on the filing identity is the fix: an outsider cannot author as
    // the bot.
    //
    // THE SPELLING IS MEASURED, NOT REASONED — and both earlier guesses were wrong.
    // `gh issue list --json author` reports `app/github-actions`. REST reports
    // `github-actions[bot]`; GraphQL's Bot.login is `github-actions`; gh's own
    // projection is a THIRD form, and no amount of reading settles which one a
    // runner sees. It was established by printing the raw object on a real runner
    // (run 33520347578). Shipping the guessed pair made all 16 lookups match
    // nothing, and the filing step created duplicate issue #2000 instead of
    // appending to the open thread it was looking at.
    //
    // Getting this wrong is ASYMMETRIC, which is why it is pinned rather than left
    // to review. A filing step that cannot find its thread duplicates nightly —
    // loud. A STAND-DOWN that cannot find its thread hits `[ -n … ] || exit 0` and
    // exits ZERO — silently dead forever, which is the exact disease this whole
    // change exists to cure.
    //
    // The other two spellings stay as exact alternates in case gh changes its
    // projection. Matching is EXACT, never startswith/endswith: `evil-github-actions`
    // is a registrable name and a prefix test would admit it.
    for (const { id, filing, standDown } of jobs) {
      for (const [what, step] of [['filing', filing], ['stand-down', standDown]]) {
        if (!step) continue;
        const lk = lookup(step);
        if (!lk) continue;
        assert.match(
          lk, /\.author\.login\s*==\s*\\?"app\/github-actions\\?"/,
          `${id}: the ${what} lookup does not accept 'app/github-actions' — the spelling gh ` +
            'ACTUALLY reports (measured, run 33520347578). Without it the lookup matches nothing: ' +
            'the filing step duplicates nightly and the stand-down goes silently dead',
        );
        const authorPart = lk.slice(lk.indexOf('.author'));
        assert.ok(
          !/startswith\(|endswith\(/.test(authorPart),
          `${id}: the ${what} lookup matches its author by prefix/suffix — 'evil-github-actions' ` +
            'is registrable, so the comparison must be exact',
        );
      }
    }
  });

  await t.test('a stand-down acts only on main, so a branch dispatch cannot close the real thread', () => {
    // Every one of these workflows is `workflow_dispatch`-able and none pins a
    // ref, so `--ref <branch>` runs the BRANCH's file against the BRANCH's code.
    // Without this guard, neutering a check on a throwaway branch and dispatching
    // closes the live alarm on main and records "Recovered … on `main@<sha>`" for
    // a sha that was never on main. The guard is also what makes that `main@`
    // literal true rather than a hardcoded lie.
    //
    // It is on the STAND-DOWN, not the whole job: dispatching from a branch must
    // still be able to RUN the checks. Filing from a branch is loud and
    // recoverable (a duplicate issue); closing is not.
    for (const { id, standDown } of jobs) {
      if (!standDown) continue;
      assert.match(
        norm(standDown.if), /github\.ref\s*==\s*'refs\/heads\/main'/,
        `${id}: the stand-down can act on a dispatch from any branch — it can close the real ` +
          'thread on evidence gathered somewhere else entirely',
      );
    }
  });

  await t.test('a closer proves it measured something before it closes', () => {
    for (const key of Object.keys(MEASUREMENT_FLOOR)) {
      assert.ok(key in CLOSES, `MEASUREMENT_FLOOR names ${key}, which is not a closing job — stale entry`);
    }
    let floors = 0;
    for (const { id, standDown } of jobs) {
      if (!standDown || !(id in CLOSES)) continue;
      const cond = norm(standDown.if);
      const floor = MEASUREMENT_FLOOR[id];
      if (floor) {
        floors++;
        assert.match(
          cond,
          new RegExp(`steps\\.${floor.step}\\.outputs\\.${floor.output}\\s*!=\\s*'0'`),
          `${id} closes its thread but does not require steps.${floor.step}.outputs.${floor.output} != '0' — ` +
            'a run that measured nothing reports the same health as a run that measured everything',
        );
      } else {
        // The escape hatch is narrow ON PURPOSE: a closer with no count floor
        // must not close unconditionally. `case`/`esac` is how the one such job
        // discriminates on the latest firing before closing.
        assert.match(
          code(standDown.run),
          /case\s+"?\$/,
          `${id} closes with neither a measurement floor in MEASUREMENT_FLOOR nor a discriminator — ` +
            'it will close on any green night, including one that measured nothing',
        );
      }
    }
    assert.ok(floors >= 2, `expected >=2 closers with a measurement floor, found ${floors}`);
  });

  await t.test('the count a closer gates on is actually EMITTED by the script it runs', () => {
    // The floor is a two-party contract and the gate above only checked the
    // consumer. Delete the `console.log(`islands=…`)` from the script and every
    // other arm stays green: the workflow's grep finds nothing, `${ISLANDS:-0}`
    // makes it 0, and the stand-down then declines FOREVER. That fails safe on
    // the close, but silent-forever is the disease this file exists to catch, so
    // the producer is pinned to the consumer here.
    const docsPkg = JSON.parse(fs.readFileSync(path.join(REPO, 'docs/package.json'), 'utf8'));
    let pinned = 0;
    for (const [id, floor] of Object.entries(MEASUREMENT_FLOOR)) {
      const job = jobs.find((j) => j.id === id);
      assert.ok(job, `MEASUREMENT_FLOOR names ${id}, which is not an alarm job any more`);
      const producer = job.steps.find((st) => st.id === floor.step);
      assert.ok(producer, `${id}: no step with id '${floor.step}'`);
      const run = code(producer.run);
      // consumer: the step must actually parse the line into the output it gates on
      assert.match(
        run, new RegExp(`\\^${floor.output}=`),
        `${id}: step '${floor.step}' never greps for a '${floor.output}=' line`,
      );
      // producer: the npm script it invokes must emit that line
      const m = run.match(/npm run ([\w:-]+)/);
      assert.ok(m, `${id}: step '${floor.step}' runs no npm script — cannot locate the producer`);
      const cmd = docsPkg.scripts?.[m[1]];
      assert.ok(cmd, `${id}: docs/package.json has no script '${m[1]}'`);
      const rel = cmd.match(/(scripts\/[\w.-]+\.mjs)/);
      assert.ok(rel, `${id}: cannot resolve a script file from '${cmd}'`);
      const src = fs.readFileSync(path.join(REPO, 'docs', rel[1]), 'utf8');
      assert.ok(
        src.includes(`${floor.output}=\${`),
        `docs/${rel[1]} no longer emits a \`${floor.output}=\` line, but ${id} gates its CLOSE on ` +
          'parsing one — the parse silently yields 0 and the stand-down is dead forever',
      );
      pinned++;
    }
    assert.ok(pinned >= 2, `expected >=2 producer/consumer pairs pinned, found ${pinned}`);
  });

  await t.test('the narrow closer discriminates on the LATEST firing, not the issue body', () => {
    // The body is written once by `gh issue create`; every firing after the first
    // is a comment. Discriminating on the body therefore reads the thread's FIRST
    // firing forever, and closes a thread whose latest firing was a real, unfixed
    // regression. No adversary needed — a harness-failure night, then a regression,
    // then one clean night does it.
    const narrow = jobs.find((j) => j.id === 'perf-nightly.yml::engine-perf');
    assert.ok(narrow?.standDown, 'perf-nightly.yml::engine-perf lost its stand-down');
    const run = code(narrow.standDown.run);
    assert.match(
      run, /--json body,comments/,
      'the narrow closer no longer reads comments — it is back to discriminating on the create-time body',
    );
    assert.match(
      run, /\.comments \| map\(\.body\) \| last/,
      'the narrow closer does not take the LAST comment as the latest firing',
    );
    assert.doesNotMatch(
      run, /case\s+"\$BODY"/,
      'the narrow closer still switches on $BODY — the create-time body is not the latest firing',
    );
  });

  await t.test('a Playwright stand-down proves tests actually RAN', () => {
    // `ai-architect.spec.ts` opens with `test.skip(!LIVE_KEY, …)`: with the
    // secret unset Playwright skips every test, prints "N skipped" and EXITS 0.
    // Outcome and output both read green while nothing was tested.
    const pw = jobs.filter((j) => j.file === 'studio-e2e-nightly.yml');
    assert.equal(pw.length, 2, 'expected the two studio-e2e jobs');
    for (const { id, standDown } of pw) {
      // The GUARD specifically — `! grep -qE …` — not merely the pattern
      // somewhere in the step. The step greps twice (once to gate, once for the
      // count), and accepting either copy passed a mutation that weakened the
      // gate and left the cosmetic one intact.
      assert.match(
        code(standDown.run),
        /!\s*grep -qE '\[1-9\]\[0-9\]\* passed'/,
        `${id}: would act on a run that skipped every test`,
      );
    }
  });
});
