/**
 * Unit: the Rehearsal planner — Practice mode's brain.
 *
 * The deterministic floor must always produce a sane plan (timing + beats), and
 * the AI merge must only ever IMPROVE the floor — never break it, never trust a
 * malformed model response. These guarantees are what let Practice ship the
 * model-on path without a model present.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

async function load() {
  return import('../../../docs/src/components/studio/present/rehearsal.js');
}

const DECK = [
  '# New deck\n<!-- _class: title -->\nBudget proposal',
  '<!-- _class: divider -->\n## Where we are',
  '<!-- _class: big-number -->\n$2.4B total revenue',
  '<!-- _class: quote -->\n"One line, felt not rushed."',
  '<!-- _class: decision -->\nApprove the FY27 budget.',
  '<!-- _class: closing -->\nThank you. Questions?',
].join('\n\n---\n\n');

describe('parseSlides', () => {
  test('splits on --- and drops front matter', async () => {
    const { parseSlides } = await load();
    const withFm = '---\ntheme: x\n---\n\n# A\n\n---\n\n# B';
    assert.equal(parseSlides(withFm).length, 2);
  });
});

describe('buildDeterministicPlan', () => {
  test('produces one slide-plan per slide with positive targets summing to the length', async () => {
    const { buildDeterministicPlan } = await load();
    const p = buildDeterministicPlan(DECK, 10);
    assert.equal(p.slides.length, 6);
    assert.equal(p.source, 'deterministic');
    const sum = p.slides.reduce((a, s) => a + s.target, 0);
    assert.ok(Math.abs(sum - 600) < 1, `targets should sum to 600s, got ${sum}`);
    assert.ok(p.slides.every((s) => s.target > 0));
  });

  test('classifies roles and assigns matching beats', async () => {
    const { buildDeterministicPlan } = await load();
    const p = buildDeterministicPlan(DECK, 10);
    assert.equal(p.slides[0].role, 'open');
    assert.equal(p.slides[1].role, 'section');
    assert.equal(p.slides[2].role, 'data');
    assert.equal(p.slides[3].role, 'quote');
    assert.equal(p.slides[4].role, 'decision');
    assert.equal(p.slides[5].role, 'close');
    // the ask is the slowest slide
    const maxTarget = Math.max(...p.slides.map((s) => s.target));
    assert.equal(p.slides[4].target, maxTarget);
    // data slide cues a pause + a look-up
    assert.ok(p.slides[2].beats.some((b) => b.kind === 'pause'));
    assert.ok(p.slides[2].beats.some((b) => b.kind === 'eye'));
  });

  test('suggests a length from spoken density', async () => {
    const { buildDeterministicPlan } = await load();
    const p = buildDeterministicPlan(DECK, 10);
    assert.ok(p.suggestMinutes >= 1);
  });
});

describe('buildDeckRead (whole-deck structural read)', () => {
  test('rides on the plan and summarises the arc', async () => {
    const { buildDeterministicPlan } = await load();
    const p = buildDeterministicPlan(DECK, 10);
    assert.ok(p.deck, 'plan carries a deck read');
    assert.match(p.deck.summary, /6 slides · 10 min/);
    assert.match(p.deck.summary, /ask \d+%/);
    assert.ok(Array.isArray(p.deck.flags));
  });

  test('flags a missing ask', async () => {
    const { buildDeckRead, buildDeterministicPlan } = await load();
    const noAsk = '<!-- _class: title -->\n# A\n\n---\n\n<!-- _class: stats -->\n## B\n\n---\n\n<!-- _class: closing -->\n## C';
    const p = buildDeterministicPlan(noAsk, 10);
    assert.ok(p.deck.flags.some((f) => /No explicit ask/.test(f.text) && f.tone === 'warn'));
    // direct call also works
    const r = buildDeckRead(p.slides, 10, 600, 5);
    assert.equal(typeof r.summary, 'string');
  });

  test('flags a tight fit (too much material for the time)', async () => {
    const { buildDeckRead } = await load();
    // open+decision+close present (so only the fit flag is raised), 1 min booked
    // against 10 min of material → tight.
    const slides = [{ role: 'open', target: 60 }, { role: 'data', target: 60 }, { role: 'decision', target: 120 }, { role: 'close', target: 60 }];
    const r = buildDeckRead(slides, 1, 300, 10);
    assert.equal(r.fit, 'tight');
    assert.ok(r.flags.some((f) => /rushing/.test(f.text)));
  });

  test('caps flags to three', async () => {
    const { buildDeckRead } = await load();
    const slides = [{ role: 'body', target: 60 }, { role: 'body', target: 60 }];
    const r = buildDeckRead(slides, 30, 120, 1); // missing ask+open+close, loose fit → many flags
    assert.ok(r.flags.length <= 3);
  });
});

describe('overBeat (pace-aware nudge)', () => {
  test('null until you linger past ~1.3x the budget, then fires', async () => {
    const { overBeat } = await load();
    assert.equal(overBeat(50, 60), null); // under budget
    assert.equal(overBeat(70, 60), null); // a little over, within 1.3x
    const b = overBeat(100, 60); // well over
    assert.ok(b && b.kind === 'over');
    assert.match(b.text, /Over time/);
  });
  test('guards a zero/garbage target', async () => {
    const { overBeat } = await load();
    assert.equal(overBeat(100, 0), null);
    assert.equal(overBeat(100, NaN), null);
  });
});

describe('mergeAiPlan', () => {
  test('overrides why/target/beats and re-normalises to the length', async () => {
    const { buildDeterministicPlan, mergeAiPlan } = await load();
    const floor = buildDeterministicPlan(DECK, 10);
    const ai = {
      slides: [
        { i: 0, why: 'Custom open rationale', target: 30, beats: [{ at: 0.1, kind: 'eye', text: 'Look up', hold: 3 }] },
        { i: 4, why: 'The ask', target: 200, beats: [{ at: 0.5, kind: 'pause', text: 'State it', hold: 4 }] },
      ],
    };
    const merged = mergeAiPlan(floor, ai);
    assert.equal(merged.source, 'ai');
    assert.equal(merged.slides[0].why, 'Custom open rationale');
    assert.equal(merged.slides[0].beats[0].kind, 'eye');
    // untouched slides keep the floor
    assert.equal(merged.slides[1].why, floor.slides[1].why);
    // still sums to the requested length
    const sum = merged.slides.reduce((a, s) => a + s.target, 0);
    assert.ok(Math.abs(sum - 600) < 1, `got ${sum}`);
  });

  test('rejects malformed beats and out-of-range values, keeping the floor sane', async () => {
    const { buildDeterministicPlan, mergeAiPlan } = await load();
    const floor = buildDeterministicPlan(DECK, 10);
    const ai = {
      slides: [
        { i: 0, why: '', target: -5, beats: [{ at: 9, kind: 'nope', text: '' }, { at: 0.5, kind: 'pause', text: 'ok', hold: 99 }] },
      ],
    };
    const merged = mergeAiPlan(floor, ai);
    // empty why → floor why kept
    assert.equal(merged.slides[0].why, floor.slides[0].why);
    // only the valid beat survives, hold clamped into range
    assert.equal(merged.slides[0].beats.length, 1);
    assert.equal(merged.slides[0].beats[0].kind, 'pause');
    assert.ok(merged.slides[0].beats[0].hold <= 8);
    assert.ok(merged.slides.every((s) => s.target > 0));
  });

  test('returns null for an empty/garbage response so the floor stands', async () => {
    const { buildDeterministicPlan, mergeAiPlan } = await load();
    const floor = buildDeterministicPlan(DECK, 10);
    assert.equal(mergeAiPlan(floor, {}), null);
    assert.equal(mergeAiPlan(floor, { slides: [] }), null);
    assert.equal(mergeAiPlan(floor, null), null);
  });

  test('does NOT mutate the floor plan (the det plan is already on screen)', async () => {
    const { buildDeterministicPlan, mergeAiPlan } = await load();
    const floor = buildDeterministicPlan(DECK, 10);
    const before = floor.slides.map((s) => s.target);
    // a skewed response forces a non-trivial re-normalisation factor
    mergeAiPlan(floor, { slides: [{ i: 0, target: 999 }] });
    const after = floor.slides.map((s) => s.target);
    assert.deepEqual(after, before, 'floor targets must be untouched by the merge');
  });
});

describe('createRehearsalPlanner (metas-based)', () => {
  test('floors instantly with no model; refined resolves null', async () => {
    const { createRehearsalPlanner, metasFromSource } = await load();
    const planner = createRehearsalPlanner({});
    const { det, refined } = planner.plan(metasFromSource(DECK), 10);
    assert.equal(det.slides.length, 6);
    assert.equal(await refined, null);
  });

  test('uses the model when a real backend is live, and caches per (metas+minutes)', async () => {
    const { createRehearsalPlanner, metasFromSource } = await load();
    const M = metasFromSource(DECK);
    let calls = 0;
    const model = {
      availability: () => ({ modelOn: true, generation: 'mock' }),
      complete: async () => { calls++; return { slides: [{ i: 0, why: 'AI open', target: 60 }] }; },
    };
    const planner = createRehearsalPlanner({ model });
    const aiPlan = await planner.plan(M, 10).refined;
    assert.equal(aiPlan.source, 'ai');
    assert.equal(aiPlan.slides[0].why, 'AI open');
    assert.equal(calls, 1);
    // same metas + minutes → served from cache, no second model call
    assert.equal(await planner.plan(M, 10).refined, aiPlan);
    assert.equal(calls, 1);
    // changed length → re-assessed
    planner.plan(M, 12);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(calls, 2);
  });

  test('a floor-only model is not called', async () => {
    const { createRehearsalPlanner, metasFromSource } = await load();
    let calls = 0;
    const model = { availability: () => ({ modelOn: true, generation: 'floor' }), complete: async () => { calls++; return {}; } };
    const planner = createRehearsalPlanner({ model });
    assert.equal(await planner.plan(metasFromSource(DECK), 10).refined, null);
    assert.equal(calls, 0);
  });

  test('the gate blocks weak tiers, budget-stops, and forwards usage', async () => {
    const { createRehearsalPlanner, metasFromSource } = await load();
    const M = metasFromSource(DECK);
    const aiResp = { slides: [{ i: 0, why: 'AI open', target: 60 }] };
    const make = (gate) => {
      let calls = 0;
      let usageSeen = null;
      const model = {
        availability: () => ({ modelOn: true, generation: 'openrouter' }),
        complete: async (opts) => { calls++; if (opts.onUsage) opts.onUsage({ cost: 0.01 }); return aiResp; },
      };
      return { planner: createRehearsalPlanner({ model, gate: gate({ markUsage: (u) => { usageSeen = u; } }) }), calls: () => calls, usage: () => usageSeen };
    };
    // capable=false → never called, floor stands
    const a = make(() => ({ capable: () => false }));
    assert.equal(await a.planner.plan(M, 10).refined, null);
    assert.equal(a.calls(), 0);
    // allow=false (budget stop) → never called
    const b = make(() => ({ capable: () => true, allow: () => false }));
    assert.equal(await b.planner.plan(M, 11).refined, null);
    assert.equal(b.calls(), 0);
    // allowed + capable → called, and usage is forwarded to onUsage
    const c = make(({ markUsage }) => ({ capable: () => true, allow: () => true, onUsage: markUsage }));
    const p = await c.planner.plan(M, 12).refined;
    assert.equal(p.source, 'ai');
    assert.equal(c.calls(), 1);
    assert.deepEqual(c.usage(), { cost: 0.01 });
  });

  test('detOnly returns the floor without ever calling the model', async () => {
    const { createRehearsalPlanner, metasFromSource } = await load();
    let calls = 0;
    const model = { availability: () => ({ modelOn: true, generation: 'openrouter' }), complete: async () => { calls++; return {}; } };
    const planner = createRehearsalPlanner({ model });
    const det = planner.detOnly(metasFromSource(DECK), 10);
    assert.equal(det.source, 'deterministic');
    assert.equal(det.slides.length, 6);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(calls, 0);
  });
});

describe('metasFromSections (engine-authoritative split — the big-deck fix)', () => {
  test('counts one slide per rendered <section>, not per source `---`', async () => {
    const { metasFromSections, buildDeterministicPlanFromSections } = await load();
    // A `split: headings` deck is ONE source block but renders as many sections;
    // the rendered list is the truth. Five sections → five slides.
    const sections = [
      '<section class="title"><h1>New deck</h1><p>Budget proposal</p></section>',
      '<section class="divider"><h2>Where we stand</h2></section>',
      '<section class="big-number"><h2>$2.4B</h2><p>Total revenue ahead of plan</p></section>',
      '<section class="decision"><h2>The ask</h2><p>Approve the FY27 budget.</p></section>',
      '<section class="closing"><h2>Thank you</h2></section>',
    ];
    const metas = metasFromSections(sections);
    assert.equal(metas.length, 5);
    assert.equal(metas[0].role, 'open');
    assert.equal(metas[1].role, 'section');
    assert.equal(metas[2].role, 'data');
    assert.equal(metas[3].role, 'decision');
    assert.equal(metas[4].role, 'close');
    assert.equal(metas[2].title, '$2.4B');
    const plan = buildDeterministicPlanFromSections(sections, 10);
    assert.equal(plan.slides.length, 5);
    const sum = plan.slides.reduce((a, s) => a + s.target, 0);
    assert.ok(Math.abs(sum - 600) < 1);
  });

  test('falls back to the first class / catalog lookup for the component', async () => {
    const { metasFromSections } = await load();
    const bucketOf = (n) => (n === 'verdict-grid' ? 'comparison' : null);
    const metas = metasFromSections(['<section class="lead-in verdict-grid tint-accent"><h2>Options</h2></section>'], { bucketOf });
    assert.equal(metas[0].comp, 'verdict-grid'); // catalog-known beats the leading non-component class
  });
});
