/**
 * Unit: Coach actions — the deterministic result cards behind the action chips.
 * These replace a fake chat, so they must be correct and never over-promise.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

async function load() {
  return import('../../../docs/src/components/studio/coach/coach-actions.js');
}

const assessment = {
  scorecard: { band: 'B', overall: 78 },
  findings: [
    { severity: 'error', message: 'bad class', slide: 2 },
    { severity: 'warning', message: 'label title', slide: 3 },
    { severity: 'warning', message: 'wall of text', slide: 3 },
    { severity: 'suggestion', message: 'minor nit', slide: 5 },
  ],
};

describe('topFixes', () => {
  test('ranks by severity and jumps to the worst', async () => {
    const { topFixes } = await load();
    const c = topFixes(assessment);
    assert.match(c.body[0], /bad class \(slide 2\)/);
    assert.equal(c.jump, 2);
    assert.ok(c.body.length <= 5);
  });
  test('celebrates a clean deck', async () => {
    const { topFixes } = await load();
    assert.match(topFixes({ findings: [] }).body[0], /Nothing flagged/);
  });
});

describe('weakestSlide', () => {
  test('picks the slide with the most/severest findings', async () => {
    const { weakestSlide } = await load();
    const c = weakestSlide(assessment);
    // slide 2: error(3); slide 3: warning+warning(4) → slide 3 wins.
    assert.equal(c.jump, 3);
    assert.match(c.body[0], /Slide 3/);
  });
  test('handles no slide-attributed findings', async () => {
    const { weakestSlide } = await load();
    assert.match(weakestSlide({ findings: [{ severity: 'warning', message: 'x' }] }).body[0], /No slide stands out/);
  });
});

describe('theAsk', () => {
  test('recognises a decision slide', async () => {
    const { theAsk } = await load();
    assert.match(theAsk('<!-- _class: decision -->\n# Approve X').body[0], /✓/);
  });
  test('flags ask-language without a decision slide', async () => {
    const { theAsk } = await load();
    assert.match(theAsk('# Next steps\nWe recommend hiring').body[0], /buried|may be/i);
  });
  test('flags a missing ask', async () => {
    const { theAsk } = await load();
    assert.match(theAsk('# Overview\nstuff').body[0], /No clear ask/);
  });
});

describe('pacing', () => {
  test('asks for minutes when not given', async () => {
    const { pacing } = await load();
    const c = pacing('# A\n\n---\n\n# B', undefined);
    assert.equal(c.needMinutes, true);
    assert.match(c.body[0], /talk length/);
  });
  test('judges a fast deck', async () => {
    const { pacing } = await load();
    // 20 slides, 5 min → 15s/slide → very fast.
    const src = Array.from({ length: 20 }, (_, i) => `# S${i}`).join('\n\n---\n\n');
    assert.match(pacing(src, 5).body[1], /fast/);
  });
});

describe('structureCheck + helpers', () => {
  test('countSlides drops front matter', async () => {
    const { countSlides } = await load();
    assert.equal(countSlides('---\ntheme: x\n---\n\n# A\n\n---\n\n# B'), 2);
  });
  test('reports opening / ask / close', async () => {
    const { structureCheck } = await load();
    const c = structureCheck('<!-- _class: title -->\n# Deck\n\n---\n\n<!-- _class: decision -->\n# Approve\n\n---\n\n# Thank you');
    assert.match(c.body[0], /✓ Opening/);
    assert.match(c.body[1], /✓ Clear ask/);
    assert.match(c.body[2], /✓ Closing/);
  });
});
