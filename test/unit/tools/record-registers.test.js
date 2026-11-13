/**
 * The host's registers as slide-record fields (tools/lib/record-registers.js, record note §4.2, step 3):
 * `{finish=ledger}` writes the class words `_class: finish finish-ledger` does, every value maps to a word the
 * register owns, and a slide written either way renders the same `<section>`.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { RESTORE, recordRegisters } = require('../../../tools/lib/record-registers.js');
const { readRecord } = require('../../../lib/core/meta-door.mjs');
const { HOST_REGISTERS } = require('../../../lib/core/meta-keys.mjs');
const { createEngine } = require('../../../lib/engine');

describe('record registers', () => {
  test('every restore word belongs to its register’s token set', () => {
    for (const r of recordRegisters()) {
      if (!r.tokens) continue;
      for (const words of Object.values(r.values)) for (const w of words.split(' ')) assert.ok(r.tokens.includes(w), `${r.key}: ${w}`);
    }
    // finish has no token list; its restore word is the documented opt-out.
    assert.equal(RESTORE['finish:none'], 'no-finish');
  });

  test('the generated table is the derived one (npm run build is current)', () => {
    assert.deepEqual(
      HOST_REGISTERS.map((r) => ({ key: r.key, values: { ...r.values } })),
      recordRegisters().map(({ key, values }) => ({ key, values })),
    );
  });

  test('a register field reads to its class words; a bad value is reported, never applied', () => {
    assert.equal(readRecord(' {layout=cards, finish=ledger, headline=left} ').d.class, 'cards finish finish-ledger head-left');
    const bad = readRecord(' {rule=bogus} ');
    assert.equal(bad.d.class, undefined);
    assert.equal(bad.diagnostics[0].code, 'meta-field-value');
  });

  test('a record and the `_class` comment it replaces render the same section', () => {
    const engine = createEngine();
    const head = '---\ntheme: indaco\nfinish: ledger\n---\n\n';
    const body = '\n\n# Title\n\n- A\n  - a\n- B\n  - b\n';
    for (const r of recordRegisters()) {
      for (const [name, words] of Object.entries(r.values)) {
        const a = engine.render(`${head}<!-- _class: cards ${words} -->${body}`).html;
        const b = engine.render(`${head}<!-- {layout=cards, ${r.key}=${name}} -->${body}`).html;
        assert.equal(b, a, `${r.key}=${name}`);
      }
    }
  });
});
