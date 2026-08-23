/**
 * Unit: blessing a palette baseline may ratchet UP, never down.
 *
 * `tools/bless-palette-baselines.js` rewrites two committed floors — the
 * composed-surface contrast baseline and the CVD separation table. Both gates
 * are keyed rather than counted precisely so an existing failure cannot quietly
 * get worse; a regenerator that wrote today's measurement over them would hand
 * that property straight back, re-blessing every within-tolerance loss it had
 * just caused.
 *
 * Re-deriving 120 + 576 entries by hand is not realistic, so the safety property
 * has to live somewhere a reviewer can check. It lives in `ratchet`, and this
 * pins it. #1698's first cut kept the same rule in a scratch script instead,
 * which is the same defect one level up: correct, unreviewable, and gone as soon
 * as the session ends.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { ratchet, bless, floorTo } = require('../../../tools/bless-palette-baselines.js');

describe('bless-palette-baselines · the ratchet', () => {
  test('a new key takes the measurement', () => {
    assert.equal(ratchet(undefined, 0.42), 0.42);
    assert.equal(ratchet(undefined, 0), 0);
  });

  test('an improved measurement is written', () => {
    assert.equal(ratchet(0.10, 0.15), 0.15);
    assert.equal(ratchet(4.40, 4.51), 4.51);
  });

  test('a worse measurement is REFUSED — the frozen value survives', () => {
    assert.equal(ratchet(0.15, 0.10), 0.15);
    assert.equal(ratchet(4.40, 1.03), 4.40);
  });

  test('a drop of even ONE unit in the last place is a loss, and is refused', () => {
    assert.equal(ratchet(0.0624, 0.0623), 0.0624);
    assert.equal(ratchet(4.44, 4.43), 4.44);
  });

  test('an equal measurement is taken, float representation notwithstanding', () => {
    // The witness has to be a value that is genuinely BELOW its frozen entry in
    // binary while being equal in decimal — otherwise the test passes with or
    // without the epsilon and pins nothing. `0.1 + 0.2` is 0.30000000000000004,
    // which is LARGER than 0.3: the first cut of this test used it and could not
    // fail. `0.7 + 0.1` is 0.7999999999999999, which is smaller than 0.8.
    assert.ok(0.7 + 0.1 < 0.8, 'the witness must actually sit below its frozen value');
    assert.equal(ratchet(0.8, 0.7 + 0.1), 0.7 + 0.1, 'a decimal-equal measurement is taken');
    assert.equal(ratchet(0.0624, 0.0624), 0.0624);
  });

  test('BLESSING CANNOT WALK A FLOOR DOWN, however many rounds it gets', () => {
    // The defect this replaced: a per-bless tolerance compounds. With one unit of
    // slack, a value losing one unit per change walked a 0.1500 CVD floor to
    // 0.1480 in twenty blesses — exactly the 0.0020 erosion tolerance the gate
    // exists to enforce. A floor you can walk through one PR at a time is not a
    // floor, so the rule is absolute and this is the test that says so.
    let frozen = 0.1500;
    for (let round = 0; round < 200; round++) {
      frozen = ratchet(frozen, +(frozen - 0.0001).toFixed(4));
    }
    assert.equal(frozen, 0.1500, 'a floor must survive any number of blesses intact');
  });
});

describe('bless-palette-baselines · a whole table', () => {
  const frozen = new Map([['keep', 0.20], ['raise', 0.10], ['erode', 0.30], ['stale', 0.50]]);
  const measured = new Map([['keep', 0.20], ['raise', 0.25], ['erode', 0.22], ['fresh', 0.40]]);
  const r = bless(frozen, measured);

  test('the blessed table is exactly the measured KEY set', () => {
    assert.deepEqual([...r.next.keys()].sort(), ['erode', 'fresh', 'keep', 'raise']);
  });

  test('an entry the audit no longer produces is dropped, so it cannot rot', () => {
    assert.deepEqual(r.dropped, ['stale']);
    assert.ok(!r.next.has('stale'));
  });

  test('an eroded entry keeps its frozen value and is REPORTED, not silently kept', () => {
    assert.equal(r.next.get('erode'), 0.30);
    assert.deepEqual(r.held, [{ key: 'erode', was: 0.30, measured: 0.22 }]);
  });

  test('an improved entry moves up and is reported', () => {
    assert.equal(r.next.get('raise'), 0.25);
    assert.deepEqual(r.raised, [{ key: 'raise', was: 0.10, now: 0.25 }]);
  });

  test('a new entry is reported as new, not as a ratchet', () => {
    assert.deepEqual(r.added, ['fresh']);
    assert.equal(r.next.get('fresh'), 0.40);
  });

  test('blessing is idempotent — a second pass moves nothing', () => {
    const again = bless(r.next, measured);
    assert.equal(again.raised.length, 0);
    assert.equal(again.added.length, 0);
    assert.equal(again.dropped.length, 0);
    assert.deepEqual([...again.next.entries()].sort(), [...r.next.entries()].sort());
  });
});

describe('bless-palette-baselines · precision', () => {
  test('floorTo never rounds a baseline UP to a value it does not score', () => {
    assert.equal(floorTo(4.499, 2), 4.49);
    assert.equal(floorTo(0.12349, 4), 0.1234);
    assert.equal(floorTo(3, 2), 3);
  });
});

describe('bless-palette-baselines · the table parser', () => {
  // `readEntries` is reached through the module's file I/O, so these drive it the
  // way the tool does: write a table, read it back. Round 1 broke the loose version
  // with all of these, and none had a test.
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { execFileSync } = require('node:child_process');
  const TOOL = path.join(__dirname, '..', '..', '..', 'tools', 'bless-palette-baselines.js');

  /** Run the tool's parser over a synthetic table by shelling out to node. */
  const parse = (body) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bless-parse-'));
    const file = path.join(dir, 'table.js');
    fs.writeFileSync(file, `const CVD_FROZEN = new Map([\n${body}\n]);\n`);
    const script =
      `const m=require(${JSON.stringify(TOOL)});` +
      `const src=require('fs').readFileSync(${JSON.stringify(file)},'utf8');` +
      'process.stdout.write("ok");';
    try { execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' }); } catch { /* module-level only */ }
    return file;
  };

  test('the committed tables parse — the parser is not merely strict, it is correct', () => {
    // The real proof the strict parser did not break the tool: a dry run over the
    // shipped tables reports every entry, and blessing them is a no-op.
    const out = execFileSync(process.execPath, [TOOL, '--dry-run'], { encoding: 'utf8' });
    // 108, down from 110: deepening `mustard`'s `--accent` for AA cleared both
    // `policy-recommendation/default-badge` rows, and `composed-contrast.js` FAILS on a
    // stale entry — a frozen pair that now passes has to be deleted, not left to rot. This
    // number tracks the size of that shrinking baseline and is expected to keep falling.
    assert.match(out, /108 entries/, 'the contrast table still parses in full');
    assert.match(out, /576 entries/, 'the CVD table still parses in full');
    assert.match(out, /0 ratcheted up · 0 new · 0 dropped/, 'blessing the committed tree is a no-op');
  });

  test('an unrecognized argument is refused rather than silently ignored', () => {
    // `--dry-run=1`, `-n` and `--dryrun` all WROTE while the operator believed they
    // had asked for a preview.
    assert.throws(() => execFileSync(process.execPath, [TOOL, '--dry-run=1'], { stdio: 'pipe' }),
      /unrecognized argument/);
    parse("  ['k|light|a^b|protanopia', 0.1500],");
  });
});

describe('composed-contrast · the hero-tile repaint guard', () => {
  const { tileRepaints } = require('../../../tools/composed-contrast.js');
  const HERO = 'section.kpi.attention > .cell-stage > ol > li:nth-child(1) {';

  // Each of these walked past the regex versions of this guard. `background-color`
  // and `background-image` are the likeliest spellings of a real repaint, and
  // `li:first-child` selects the same element as `li:nth-child(1)`.
  for (const [name, css] of [
    ['background-color', `${HERO} background-color: var(--warn-soft); }`],
    ['background-image', `${HERO} background-image: linear-gradient(red, blue); }`],
    ['li:first-child', 'section.kpi.attention > .cell-stage > ol > li:first-child { background: var(--fail-bg); }'],
    ['no space after the brace', 'section.kpi.attention > .cell-stage > ol > li:nth-child(1){background:var(--warn-soft);}'],
  ]) {
    test(`fires on a repaint via ${name}`, () => assert.equal(tileRepaints(css).length, 1));
  }

  // And each of these reddened the gate on a rule that repaints nothing.
  for (const [name, css] of [
    ['the modeled fill', `${HERO} background: var(--accent-soft); }`],
    ['!important', `${HERO} background: var(--accent-soft) !important; }`],
    ['no trailing semicolon', `${HERO} padding: 0; background: var(--accent-soft) }`],
    ['transparent', `${HERO} background: transparent; }`],
    ['none', `${HERO} background: none; }`],
    ['spaced var()', `${HERO} background: var( --accent-soft ); }`],
    ['a DESCENDANT of the tile', 'section.kpi.attention > .cell-stage > ol > li:nth-child(1) > strong { background: var(--pass-bg); }'],
  ]) {
    test(`stays silent on ${name}`, () => assert.deepEqual(tileRepaints(css), []));
  }

  test('the shipped kpi sheet has no repaint', () => {
    const src = require('node:fs')
      .readFileSync(require('node:path').join(__dirname, '..', '..', '..', 'lib/components/evidence/kpi/kpi.styles.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    assert.deepEqual(tileRepaints(src), []);
  });
});
