/**
 * fit-grace renders: a slide that clips gets the smallest claim that makes it fit, and the claim it names really does.
 * A dense gantt with a key insight AND a caption clips at the normal frame and fits under `claim-hero` (measured
 * 2026-11-20, engineering/decisions/2026-11-20-coda-and-marp-parity.md §9); a short list fits as it is.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome');
const { plan, withClaim, deckParts } = require('../../../lib/cli/fit-grace.js');

const GANTT = `<!-- _class: gantt -->

\`[{Timeline, 2026 Q1 .. 2026 Q4, today=Q3}]\`

## General availability depends on one contested decision.

- Framework
  - Signal taxonomy \`Q1..Q2\` \`done\`
  - Scoring model v2 \`Q2..Q3\` \`live\` \`after=Signal taxonomy\`
  - Per-team weighting \`Q3..Q4\` \`at-risk\` \`after=Scoring model v2\`
- Adoption
  - Pilot onboarding \`Q1..Q2\` \`done\`
  - Org-wide rollout \`Q3..Q4\` \`after=Per-team weighting\`
  - GA \`Q4\` \`milestone\` \`after=Org-wide rollout\`

> If the weighting decision slips past October, GA moves to Q1.

GA also needs SOC 2 sign-off, expected 20 November.`;
const LIST = '<!-- _class: list -->\n\n## A short list fits.\n\n- One\n- Two';
const FM = '---\ntheme: indaco\nheader: "Header"\nfooter: "Footer"\npaginate: true\n---\n\n';

describe('fit-grace renders and checks', { skip: skipWithoutChrome(resolveChrome()) }, () => {
  const deck = `${FM}${LIST}\n\n---\n\n${GANTT}\n`;
  const p = plan(deck);

  test('only the gantt clips', () => assert.deepEqual(p.clipped, [2]));
  test('and it fits with claim-hero, not claim-quiet', () => {
    assert.deepEqual(p.perSlide, [{ slide: 2, claim: 'claim-hero', had: null }]);
    assert.equal(p.deck, null, 'one clipped slide never earns a deck-wide claim');
  });
  test('applying the suggestion leaves nothing clipping', () => {
    const { slides } = deckParts(deck);
    const fixed = `${FM}${slides[0]}\n\n---\n\n${withClaim(slides[1], 'claim-hero')}\n`;
    assert.deepEqual(plan(fixed).clipped, []);
  });
});

// A video with a key insight AND a caption: the caption sits under the card and the poster is capped to the room it
// leaves (video.styles.css). Before that cap the poster ran 40px down over the caption on both of these compositions
// (measured 2026-11-21). The QR and gallery compositions need a claim with both beats (fit-grace names it), so they
// are not pinned here.
const video = (cls) => `<!-- _class: ${cls} -->

## The video card plays beside its context.

Ninety seconds, unscripted: signup to a published deck without touching support.

\`@video{"https://www.youtube.com/watch?v=aqz-KE-bpKQ", title="Ree A., Head of Ops at Northwind"}\`

> Nobody opened a ticket to publish their first deck.

Recorded in the October pilot, one take.`;

describe('a video keeps both beats on the slide', { skip: skipWithoutChrome(resolveChrome()) }, () => {
  test('video and video companion, with a key insight and a caption, clip nothing', () => {
    assert.deepEqual(plan(`${FM}${video('video')}\n\n---\n\n${video('video companion')}\n`).clipped, []);
  });
});

// Review of #3362. Finding 2: grace answers only what the export reports, so a slide the engine split cleanly at the
// deck's own `fit:` is not named. Finding 3: a slide that takes its layout from a running `class:` keeps it in both
// the trial render and the advice.
const CARDS8 = `<!-- _class: cards-grid -->

## Eight things we learned.

${Array.from({ length: 8 }, (_, i) => `- Finding ${i + 1}\n  - A short body line that explains this finding in one sentence.`).join('\n')}`;

describe('fit-grace answers the export, not a render the author never got', { skip: skipWithoutChrome(resolveChrome()) }, () => {
  test('a slide the engine split cleanly at 9:16 is not named', () => {
    const fm = '---\ntheme: indaco\nsize: 9:16\nheader: "Header"\nfooter: "Footer"\npaginate: true\n---\n\n';
    assert.deepEqual(plan(`${fm}${CARDS8}\n`).clipped, []);
  });
  test('a gantt that takes its layout from a bare `class:` is tried as a gantt, and the advice keeps it', () => {
    const p = plan(`${FM}${GANTT.replace('<!-- _class: gantt -->', '<!-- class: gantt -->')}\n`);
    assert.deepEqual(p.clipped, [1]);
    assert.equal(p.perSlide[0].claim, 'claim-hero');
    assert.equal(p.perSlide[0].write, '<!-- _class: gantt claim-hero -->');
  });
});

// Owner decisions on #3362 (2026-11-21). D1: a deck-wide `claim: hero` is never suggested (it drops the header and
// footer on every slide). D3: the export skips grace under CI.
describe('fit-grace: owner decisions D1 and D3', { skip: skipWithoutChrome(resolveChrome()) }, () => {
  test('three gantts that fit only under hero get hero slide by slide, never deck-wide', () => {
    const p = plan(`${FM}${GANTT}\n\n---\n\n${GANTT}\n\n---\n\n${GANTT}\n`);
    assert.deepEqual(p.clipped, [1, 2, 3]);
    assert.equal(p.deck, null);
    assert.deepEqual(p.perSlide.map((s) => s.claim), ['claim-hero', 'claim-hero', 'claim-hero']);
  });
  test('the export prints grace lines, and none when CI is set', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const { spawnSync } = require('node:child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grace-ci-'));
    try {
      const deck = path.join(dir, 'deck.md');
      fs.writeFileSync(deck, `${FM}${GANTT}\n`);
      const run = (env) => spawnSync(process.execPath, [path.join(__dirname, '../../../lattice.js'), deck, path.join(dir, 'o.html')],
        { env: { ...process.env, CI: '', LATTICE_FIT_GRACE: '', ...env }, encoding: 'utf8' }).stderr + '';
      assert.match(run({}), /↳ grace: slide 1 fits with `claim-hero`/);
      assert.doesNotMatch(run({ CI: 'true' }), /↳ grace/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// The checkers on #3362. Grace's signal handler could not run while a trial blocked the event loop, and Node dropped the
// queued signal, so the export carried on and exited 0; grace now installs no handler. And a SIGTERM sent to the export
// alone did not reach its trial render, which kept rendering and wrote beside the deck after the export died; a trial
// now exits when its parent changes (`watchParent`). The kill waits for the trial process itself, so it lands mid-trial.
describe('fit-grace stops on a signal', { skip: skipWithoutChrome(resolveChrome()) }, () => {
  test('SIGTERM to the export mid-trial ends the export with SIGTERM, ends the trial, and leaves nothing behind', async () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const { spawn, execFileSync } = require('node:child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fit-grace-signal-'));
    fs.writeFileSync(path.join(dir, 'deck.md'), `${FM}${GANTT}\n`);
    const lib = path.join(__dirname, '..', '..', '..', 'lib', 'cli', 'fit-grace.js');
    const script = `const g = require(${JSON.stringify(lib)}); const fs = require('node:fs');
      g.plan(fs.readFileSync(${JSON.stringify(path.join(dir, 'deck.md'))}, 'utf8'), { dir: ${JSON.stringify(dir)} });
      console.log('finished');`;
    const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    const exited = new Promise((resolve) => child.on('exit', (c, s) => resolve([c, s])));
    // Processes whose command line names this folder: the trial renders, and the Chrome they start.
    const inDir = () => {
      try {
        return execFileSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8' }).split('\n').filter((l) => l.includes(dir));
      } catch { return []; }
    };
    // Wait for a signal, not a duration (#32): poll, bounded, until a trial runs under the export.
    const until = async (cond, what, ms = 60_000) => {
      const end = Date.now() + ms;
      while (!cond()) {
        if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
        await new Promise((r) => setImmediate(r));
        await new Promise((r) => setTimeout(r, 50)); // flaky-ok: the poll interval of a bounded wait on a condition
      }
    };
    await until(() => inDir().some((l) => l.trim().split(/\s+/)[1] === String(child.pid) && l.includes('lattice.js')), 'a trial render');
    child.kill('SIGTERM');
    const [code, signal] = await exited;
    await until(() => inDir().length === 0, 'the trial to end', 15_000);
    // The trial stopped, rather than rendering on as an orphan: it never wrote its output. (A render takes seconds and
    // the trial checks its parent every 250ms, so an orphan would have written both files by the time it ended.)
    const outputs = fs.readdirSync(dir).filter((f) => f.startsWith('.fit-grace-') && (f.endsWith('.html') || f.endsWith('.fit.json')));
    require(lib).sweepStale(dir);
    const left = fs.readdirSync(dir).filter((f) => f.startsWith('.fit-grace-'));
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(signal, 'SIGTERM', `the export exited ${code} instead of dying of SIGTERM; stdout: ${out}`);
    assert.doesNotMatch(out, /finished/);
    assert.deepEqual(outputs, [], 'the trial rendered on after the export died');
    assert.deepEqual(left, []);
  });
});
