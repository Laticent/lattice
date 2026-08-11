/**
 * Unit: the token contract classifier (#1595).
 *
 * WHY THIS EXISTS. `SANCTIONED_FALLBACK_READS` records what a `var()` fallback
 * lands on; it cannot check whether that target carries the same CONTRACT. The
 * defect the whole line of work exists to prevent — `--cat-N-ink` degrading onto
 * `--cat-N-mark`, a value repaired to the 3:1 graphical floor and then painted as
 * 4.5:1 label text — is precisely a contract mismatch.
 *
 * The contract is read off the token's NAME, because HARD RULE #11 already makes
 * role-based names canonical. That choice only works if two things hold, and both
 * are pinned here:
 *
 *   1. the classifier covers the real vocabulary — every token in a live fallback
 *      chain classifies, with no silent "no floor" default;
 *   2. a name that declares no role returns null rather than passing.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  TEXT_FLOOR, GRAPHICAL_FLOOR, NO_FLOOR, NOT_A_COLOR,
  SANCTIONED_TOKEN_CONTRACTS, contractOf, contractDrop,
} = require('../../../lib/tokens/contracts.js');

describe('contractOf — the floor is read off the role-based name', () => {
  const cases = [
    // ink: 4.5:1
    ['cat-1-ink', TEXT_FLOOR, 'ink'],
    ['code-inline-fg', TEXT_FLOOR, 'ink'],
    ['text-muted', TEXT_FLOOR, 'ink'],
    ['on-accent', TEXT_FLOOR, 'ink'],
    ['on-dark-primary', TEXT_FLOOR, 'ink'],
    ['cat-on-fill', TEXT_FLOOR, 'ink'],       // `on-` wins over the `-fill` suffix
    ['text-heading', TEXT_FLOOR, 'ink'],
    ['accent-soft-body', TEXT_FLOOR, 'ink'],
    // graphical: 3:1
    ['cat-1-mark', GRAPHICAL_FLOOR, 'graphical'],
    ['border', GRAPHICAL_FLOOR, 'graphical'],
    ['diagram-stroke', GRAPHICAL_FLOOR, 'graphical'],
    ['diagram-line', GRAPHICAL_FLOOR, 'graphical'],
    // area: nothing is measured against it
    ['bg', NO_FLOOR, 'area'],
    ['bg-alt', NO_FLOOR, 'area'],
    ['cat-1-fill', NO_FLOOR, 'area'],
    ['cat-1-texture', NO_FLOOR, 'area'],
    ['accent', NO_FLOOR, 'area'],
    ['decision-accent-deep', NO_FLOOR, 'area'],
    ['spectrum-solid', NO_FLOOR, 'area'],
    ['code-bg', NO_FLOOR, 'area'],
    // not a color at all
    ['font-body', NOT_A_COLOR, 'metric'],
    ['fs-lede', NOT_A_COLOR, 'metric'],
    ['frame-inset-y', NOT_A_COLOR, 'metric'],
  ];
  for (const [name, floor, role] of cases) {
    test(`--${name} → ${role} (${floor === null ? 'not a color' : `${floor}:1`})`, () => {
      const got = contractOf(name);
      assert.ok(got, `--${name} must classify`);
      assert.equal(got.floor, floor);
      assert.equal(got.role, role);
    });
  }

  test('the leading `--` is optional', () => {
    assert.deepEqual(contractOf('--cat-1-ink'), contractOf('cat-1-ink'));
  });

  test('a name that declares no role returns null — never a silent "no floor"', () => {
    // This is the property the whole design rests on. A classifier that defaulted
    // unmatched names to `area` would let the next --cat-N-ink through.
    for (const name of ['zzz-whatsit', 'some-color', 'thing']) {
      assert.equal(contractOf(name), null, `--${name} must not classify`);
    }
  });

  test('an explicitly sanctioned token classifies, and says so', () => {
    const got = contractOf('marp-slide-footer-color');
    assert.equal(got.floor, TEXT_FLOOR);
    assert.equal(got.sanctioned, true);
  });

  test('every SANCTIONED_TOKEN_CONTRACTS entry carries a floor, a role and a reason', () => {
    for (const s of SANCTIONED_TOKEN_CONTRACTS) {
      assert.ok(s.token, 'token');
      assert.ok([TEXT_FLOOR, GRAPHICAL_FLOOR, NO_FLOOR].includes(s.floor), `${s.token}: a real floor`);
      assert.ok(['ink', 'graphical', 'area'].includes(s.role), `${s.token}: a real role`);
      assert.ok(s.why && s.why.length > 30, `${s.token}: a substantive reason`);
    }
  });
});

describe('contractDrop — does the fallback land on a weaker contract?', () => {
  test('the archetype: ink → mark is a drop', () => {
    const d = contractDrop('cat-1-ink', 'cat-1-mark');
    assert.equal(d.from, TEXT_FLOOR);
    assert.equal(d.to, GRAPHICAL_FLOOR);
    assert.equal(d.fromRole, 'ink');
    assert.equal(d.toRole, 'graphical');
  });

  test('ink → accent is a drop — --accent carries no floor against anything', () => {
    assert.ok(contractDrop('panel-label-ink', 'accent'));
  });

  test('ink → a surface is a drop, and it is the sharpest one', () => {
    // A label falling back to its own background is the one value guaranteed not
    // to contrast with it.
    assert.ok(contractDrop('mood-ink', 'mood-bg'));
  });

  test('mark → text is NOT a drop — a 4.5:1 value also clears 3:1', () => {
    assert.equal(contractDrop('cat-4-mark', 'text-heading'), null);
  });

  test('same role is never a drop', () => {
    assert.equal(contractDrop('cat-1-texture', 'cat-1-fill'), null);
    assert.equal(contractDrop('spectrum-solid', 'accent'), null);
    assert.equal(contractDrop('text-secondary', 'text-body'), null);
  });

  test('two non-colors are not comparable and not a drop', () => {
    assert.equal(contractDrop('font-mono', 'font-body'), null);
  });

  test('an unclassifiable side is reported, not silently passed', () => {
    assert.deepEqual(contractDrop('cat-1-ink', 'zzz-whatsit'), { unclassified: ['zzz-whatsit'] });
    assert.deepEqual(contractDrop('zzz-whatsit', 'cat-1-ink'), { unclassified: ['zzz-whatsit'] });
    assert.deepEqual(contractDrop('aaa-thing', 'zzz-whatsit'), { unclassified: ['aaa-thing', 'zzz-whatsit'] });
  });
});

describe('checkFallbackContracts — the gate, and that it can fail', () => {
  const {
    ledgerContractProblems, checkFallbackContracts, KNOWN_CONTRACT_DROPS,
  } = require('../../../tools/check-ownership.js');

  describe('arm 1 — the ledger, budget 0', () => {
    const problems = (rows) => ledgerContractProblems(rows);

    test('the LIVE ledger is clean — this arm is satisfiable today', () => {
      assert.deepEqual(ledgerContractProblems(), []);
    });

    test('CANARY — a row re-pointed at a weaker contract is named', () => {
      const p = problems([{ token: 'cat-1-ink', fallback: 'cat-1-mark', why: 'x' }]);
      assert.equal(p.length, 1);
      assert.match(p[0], /WEAKER contract/);
    });

    test('CANARY — a ROLE CHANGE is named even when the floor goes UP', () => {
      // texture (area, no floor) → mark (graphical, 3:1) is safe for contrast and
      // wrong for the chip. A floor-only comparison would accept it.
      const p = problems([{ token: 'cat-1-texture', fallback: 'cat-1-mark', why: 'x' }]);
      assert.equal(p.length, 1);
      assert.match(p[0], /ROLE CHANGE/);
    });

    test('CANARY — an unclassifiable target is named, not passed', () => {
      assert.match(problems([{ token: 'cat-1-texture', fallback: 'zzz-whatsit', why: 'x' }])[0], /no declared role/);
    });

    test('the real rows pass', () => {
      assert.deepEqual(problems([
        { token: 'cat-1-texture', fallback: 'cat-1-fill', why: 'x' },
        { token: 'spectrum-solid', fallback: 'accent', why: 'x' },
      ]), []);
    });
  });

  describe('arm 2 — the pinned backlog', () => {
    test('the live tree matches KNOWN_CONTRACT_DROPS exactly, both ways', () => {
      const errors = [];
      checkFallbackContracts(errors);
      assert.deepEqual(errors, []);
    });

    test('the pinned set is non-empty and unique — a gate over nothing is a claim', () => {
      assert.ok(KNOWN_CONTRACT_DROPS.length > 0);
      assert.equal(new Set(KNOWN_CONTRACT_DROPS).size, KNOWN_CONTRACT_DROPS.length);
    });

    test('every pinned entry reads as `--a → --b`', () => {
      for (const k of KNOWN_CONTRACT_DROPS) assert.match(k, /^--[\w-]+ → --[\w-]+$/);
    });

    test('CANARY — the gate is wired into run(), not just exported', () => {
      const src = require('node:fs').readFileSync(
        require('node:path').join(__dirname, '..', '..', '..', 'tools', 'check-ownership.js'), 'utf8');
      assert.match(src, /\n {2}checkFallbackContracts\(errors\);/);
    });
  });
});

describe('the classifier covers the live vocabulary', () => {
  // The design's load-bearing claim is "the name already declares the role". If a
  // real token in a real fallback chain does not classify, that claim is false for
  // that token and the gate would be blind to it. Driven against the repo, not a
  // fixture — a fixture cannot go stale in the direction that matters.
  const { fallbackHops } = require('../../../tools/check-ownership.js');

  test('every token in a live var() fallback chain classifies', () => {
    const hops = fallbackHops();
    assert.ok(hops.length > 50, `expected hundreds of token-hop fallbacks in lib/, found ${hops.length}`);
    const unclassified = new Set();
    for (const h of hops) {
      if (!contractOf(h.token)) unclassified.add(`--${h.token} (${h.where})`);
      if (!contractOf(h.target)) unclassified.add(`--${h.target} (${h.where})`);
    }
    assert.deepEqual([...unclassified], [],
      'a token in a live fallback chain declares no role — rename it (HARD RULE #11) or add it to '
      + 'SANCTIONED_TOKEN_CONTRACTS with its floor');
  });
});
