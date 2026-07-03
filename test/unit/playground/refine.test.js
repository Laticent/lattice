/**
 * Unit: refine actions' pure helpers — the prompt builder + output cleaner.
 * The model rewrite can't run in CI; these prove what it's asked to do and that
 * whatever it returns is sanitised before the engine applies it. The DOM apply
 * path (gating + replaceSelection) is verified headless with a MockBackend.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

async function load() {
  return import('../../../docs/src/components/studio/ai/refine.js');
}

describe('buildRefinePrompt', () => {
  test('returns a system brief + the user text, and varies by action', async () => {
    const { buildRefinePrompt } = await load();
    const polish = buildRefinePrompt('polish', 'Our revenue grew.');
    assert.equal(polish[0].role, 'system');
    assert.match(polish[0].content, /ONLY the rewritten text/);
    assert.match(polish[0].content, /tighten and clarify/);
    assert.equal(polish[1].content, 'Our revenue grew.');
    const shorten = buildRefinePrompt('shorten', 'x');
    assert.match(shorten[0].content, /Shorten/);
  });

  test('forbids inventing facts and preserves structure in every action', async () => {
    const { buildRefinePrompt, REFINE_ACTIONS } = await load();
    for (const a of REFINE_ACTIONS) {
      const sys = buildRefinePrompt(a.id, 'text')[0].content;
      assert.match(sys, /Never invent facts/);
      assert.match(sys, /markdown structure/);
    }
  });

  test('an unknown action falls back to the first (polish)', async () => {
    const { buildRefinePrompt } = await load();
    assert.match(buildRefinePrompt('bogus', 't')[0].content, /tighten and clarify/);
  });
});

describe('cleanRewrite', () => {
  test('strips a code fence the model may wrap around the rewrite', async () => {
    const { cleanRewrite } = await load();
    assert.equal(cleanRewrite('```\nRevenue grew 40%.\n```', 'orig'), 'Revenue grew 40%.');
    assert.equal(cleanRewrite('```md\n- A\n- B\n```', 'orig'), '- A\n- B');
  });

  test('strips wrapping quotes and trims', async () => {
    const { cleanRewrite } = await load();
    assert.equal(cleanRewrite('"Tighter line."', 'orig'), 'Tighter line.');
    assert.equal(cleanRewrite('  spaced  ', 'orig'), 'spaced');
  });

  test('falls back when the model returns nothing usable', async () => {
    const { cleanRewrite } = await load();
    assert.equal(cleanRewrite('', 'orig'), 'orig');
    assert.equal(cleanRewrite(null, 'orig'), 'orig');
    assert.equal(cleanRewrite('   ', 'orig'), 'orig');
  });
});
