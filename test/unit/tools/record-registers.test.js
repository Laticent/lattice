/**
 * The host's registers as slide-record fields (tools/lib/record-registers.js, record note §4.2, step 3):
 * `@meta{finish=ledger}` writes the class words `class="finish finish-ledger"` does, every value maps to a word the
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
    assert.equal(readRecord(' @meta{layout=cards, finish=ledger, headline-align=left} ').d.class, 'cards finish finish-ledger headline-align-left');
    const bad = readRecord(' @meta{heading-rule=bogus} ');
    assert.equal(bad.d.class, undefined);
    assert.equal(bad.diagnostics[0].code, 'meta-field-value');
  });

  test('a register field and the class words it writes render the same section', () => {
    const engine = createEngine();
    const head = '---\ntheme: indaco\nfinish: ledger\n---\n\n';
    const body = '\n\n# Title\n\n- A\n  - a\n- B\n  - b\n';
    for (const r of recordRegisters()) {
      for (const [name, words] of Object.entries(r.values)) {
        const a = engine.render(`${head}<!-- @meta{class="cards ${words}"} -->${body}`).html;
        const b = engine.render(`${head}<!-- @meta{layout=cards, ${r.key}=${name}} -->${body}`).html;
        assert.equal(b, a, `${r.key}=${name}`);
      }
    }
    // Since the cut (record note §15, slice E) the old `_class` comment sets nothing: the slide renders as if it were not there.
    const old = engine.render(`${head}<!-- _class: cards finish finish-ledger -->${body}`).html;
    assert.equal(old, engine.render(`${head}${body}`).html);
  });
});

describe('the generated table is compact', () => {
  // The table ships in the Studio's eager JS, so a value whose class is `<key>-<value>` is written 0 and
  // lib/core/meta-keys.mjs spells it out; the deep-equal above proves the door still reads every word.
  test('the generated table writes the common case `<key>-<value>` as 0', () => {
    const table = require('../../../lib/plugins/meta.generated.mjs').META_HOST_REGISTERS;
    assert.ok(table.flatMap((r) => Object.values(r.values)).some((c) => c === 0));
  });
});
