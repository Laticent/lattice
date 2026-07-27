/**
 * Unit: lib/layout/ai.js — the Component Studio AI tier's pure pieces.
 *
 * The model only PROPOSES; this layer shapes the reply into a gate-ready draft
 * (slugged name, enum-snapped axes, the one safe text fix) and detects a decline.
 * The deterministic gate (gateComponent) disposes — so the make-or-break test is
 * that the WORKED EXAMPLES we teach the model are themselves gate-clean (teaching
 * the model from gate-failing CSS would be self-defeating).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { ASK_SYSTEM, askComponentMessages, askRepairMessages, askDesignRefineMessages, askComponentRefineMessages, coerceRefinement, coerceComponent, rankSimilar, auditComponentDesign, addScopePrefix, MAX_CSS_BYTES } = require('../../../lib/layout/ai.js');
const { gateComponent, findUnscopedSelectors } = require('../../../lib/layout/gate.js');
const { JSDOM } = require('jsdom');
const { FAMILY_NAMES } = require('../../../lib/adaptive/families.js');

// Every family selector the canon teaches must actually MATCH a stamped slide.
// The gate only proves a selector is SCOPED, not that it fires — a leading
// `:where([data-family=…]) section.x` is perfectly scoped and matches nothing,
// because the engine stamps `data-family` ON the section, so the leading form is
// a descendant combinator looking for an ancestor that does not exist. That is
// the #1218 failure mode reproduced in the AI canon, and only a match test
// catches it.
function matchesInStampedSlide(selector, family, sectionClass) {
  const dom = new JSDOM(
    `<section class="${sectionClass}" data-family="${family}">` +
    '<div class="cell-stage"><ul><li><strong>a</strong><ul><li>b</li></ul></li></ul></div></section>');
  const doc = dom.window.document;
  return [...doc.querySelectorAll('*')].some((el) => el.matches(selector));
}

describe('component-ai — prompt', () => {
  test('askComponentMessages carries the canon, the output contract, and a worked example', () => {
    const sys = askComponentMessages('a grid of capability cards').at(0).content;
    assert.match(sys, /cell-stage/, 'teaches the root');
    assert.match(sys, /margin/i, 'teaches the no-margin rule');
    assert.match(sys, /--fs-/, 'teaches the type tokens');
    assert.match(sys, /WORKED EXAMPLE/, 'includes a worked example');
    assert.match(sys, /"decline"/, 'documents the decline contract');
    assert.equal(askComponentMessages('x').at(-1).content, 'x');
  });

  test('askComponentMessages threads dedup near-neighbors when present', () => {
    const msgs = askComponentMessages('a roster', { similar: [{ name: 'actors', bucket: 'inventory', description: 'Roster of responsibilities.' }] });
    assert.ok(msgs.some(m => m.role === 'assistant' && /actors/.test(m.content)), 'near-neighbors are threaded for reuse');
  });
});

describe('component-ai — coerce', () => {
  const GOOD = {
    name: 'Verdict Grid!',
    description: 'A grid of verdict cards.',
    function: 'inventory', form: 'grid', substance: 'structure', bucket: 'inventory',
    tags: ['cards', 'verdict', 'grid'],
    css: 'section.verdict-grid > .cell-stage { display:flex; gap:var(--sp-md); }\nsection.verdict-grid li { color:var(--text-body); font-size:var(--fs-body); }',
    skeleton: '<!-- _class: verdict-grid -->\n\n## Verdicts\n\n- Ship it\n  - All gates green.',
  };

  test('shapes a clean reply: slugged name, enum-snapped axes, adapt/capacity, ok', () => {
    const r = coerceComponent({ ...GOOD, adapt: { mode: 'native' }, capacity: { sweet: 4, soft: 6, hard: 8 } });
    assert.equal(r.ok, true);
    assert.equal(r.decline, null);
    assert.equal(r.manifest.name, 'verdict-grid', 'name is a valid slug');
    assert.equal(r.manifest.bucket, 'inventory');
    assert.deepEqual(r.manifest.tags, ['cards', 'verdict', 'grid']);
    assert.equal(r.manifest.adapt.mode, 'native', 'adapt captured');
    assert.deepEqual(r.manifest.capacity, { sweet: 4, soft: 6, hard: 8 }, 'capacity captured');
  });

  test('captures a density block, snapping the axis to an item/row the counter measures', () => {
    const r = coerceComponent({ ...GOOD, density: { axis: 'item', soft: 6, hard: 12 } });
    assert.deepEqual(r.manifest.density, { axis: 'item', soft: 6, hard: 12 }, 'density captured');
    // col/cell/line aren't measured per-element — snap to the default `item`.
    const snapped = coerceComponent({ ...GOOD, density: { axis: 'cell', soft: 4, hard: 8 } });
    assert.equal(snapped.manifest.density.axis, 'item', 'unmeasured axis snaps to item');
    const rowAxis = coerceComponent({ ...GOOD, density: { axis: 'row', soft: 4, hard: 8 } });
    assert.equal(rowAxis.manifest.density.axis, 'row', 'a table row axis is preserved');
    // A one-sided budget is meaningless + schema-invalid (both required) — drop it.
    assert.equal(coerceComponent({ ...GOOD, density: { axis: 'item', soft: 6 } }).manifest.density, null, 'partial density (no hard) drops to null');
    assert.equal(coerceComponent({ ...GOOD, density: { soft: 'x', hard: 12 } }).manifest.density, null, 'non-numeric soft drops to null');
  });

  test('defaults adapt to native and capacity/density to null when the model omits them', () => {
    const r = coerceComponent(GOOD);
    assert.equal(r.manifest.adapt.mode, 'native');
    assert.equal(r.manifest.capacity, null);
    assert.equal(r.manifest.density, null);
  });

  test('clamps tags to the gate ceiling (≤ 5) so a 6-tag reply can still pass', () => {
    const r = coerceComponent({ ...GOOD, tags: ['a', 'b', 'c', 'd', 'e', 'f'] });
    assert.equal(r.manifest.tags.length, 5);
  });

  test('snaps an unknown axis to a safe default rather than failing', () => {
    const r = coerceComponent({ ...GOOD, form: 'nonsense', substance: 'series' });
    assert.equal(r.manifest.form, 'panel'); // unknown form → default
    assert.equal(r.manifest.substance, 'structure'); // transform-bearing substance → CSS-only default
  });

  test('parses a JSON string (incl. prose-wrapped) and an empty reply is not ok', () => {
    assert.equal(coerceComponent(JSON.stringify(GOOD)).ok, true);
    assert.equal(coerceComponent('Here you go:\n```json\n' + JSON.stringify(GOOD) + '\n```').ok, true);
    assert.equal(coerceComponent('{}').ok, false);
    assert.equal(coerceComponent('not json').ok, false);
  });

  test('detects a decline and routes it (never a fake component)', () => {
    const r = coerceComponent({ decline: true, reason: 'A bar chart needs a transform.', route: 'chart', suggestion: 'use the chart bucket' });
    assert.equal(r.ok, false);
    assert.equal(r.manifest, null);
    assert.equal(r.decline.route, 'chart');
    assert.match(r.decline.reason, /transform/);
  });

  test('applies the ONE safe fix: inline `- **Title.** body` → nested card form (#5)', () => {
    const r = coerceComponent({ ...GOOD, skeleton: '<!-- _class: verdict-grid -->\n\n## T\n\n- **Ship it.** All gates green.' });
    assert.ok(r.fixes.includes('card-nesting'));
    assert.match(r.skeleton, /- Ship it\n {2}- All gates green\./);
    assert.doesNotMatch(r.skeleton, /\*\*/);
  });
});

describe('component-ai — the worked examples are gate-clean (make-or-break)', () => {
  // The exact card-grid example the system prompt teaches. If this ever fails the
  // gate, the model is being taught from non-native CSS — a self-defeating bug.
  const CARDS = {
    css: [
      'section.capability-cards > .cell-stage { display:flex; flex-direction:column; }',
      'section.capability-cards > .cell-stage > ul {',
      '  display:flex; flex-wrap:wrap; gap:var(--sp-md); flex:1; min-height:0;',
      '  list-style:none; padding:0; margin:0;',
      '}',
      'section.capability-cards > .cell-stage > ul > li {',
      '  box-sizing:border-box; width:calc(50% - var(--sp-md) / 2);',
      '  background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius-md);',
      '  padding:var(--sp-sm) var(--sp-md);',
      '  font-size:var(--fs-body); font-weight:700; color:var(--text-heading); line-height:var(--lh-snug);',
      '}',
      'section.capability-cards.capability-cards:where([data-family="square"], [data-family="tall"], [data-family="strip"])',
      '  > .cell-stage > ul > li { width:100%; }',
    ].join('\n'),
    manifest: {
      name: 'capability-cards', function: 'inventory', form: 'grid', substance: 'structure', bucket: 'inventory',
      tags: ['cards', 'grid', 'capabilities'], description: 'A 2-up grid of capability cards.',
      skeleton: '<!-- _class: capability-cards -->\n\n## What the platform does\n\n- Ingests any source\n  - CSV, API, or stream.',
    },
  };

  test('worked example A (card grid) passes gateComponent — no hex, scoped, no margin, fs-token', () => {
    const r = gateComponent(CARDS);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
  });

  // Example B (ledger) and C (reuse) — the canon's other two worked examples. Each
  // must be gate-clean for the same reason as A: the model learns from them.
  const LEDGER = {
    css: [
      'section.owner-ledger > .cell-stage { display:flex; flex-direction:column; }',
      'section.owner-ledger > .cell-stage > ul { display:flex; flex-direction:column; gap:var(--sp-xs); flex:1; min-height:0; list-style:none; padding:0; margin:0; }',
      'section.owner-ledger > .cell-stage > ul > li { display:flex; flex-wrap:wrap; align-items:center; column-gap:var(--sp-md); flex:1; min-height:0; background:var(--bg-alt); border:1px solid var(--border); border-left:3px solid var(--accent); border-radius:var(--radius-md); padding:var(--sp-sm) var(--sp-lg); }',
      'section.owner-ledger > .cell-stage > ul > li > strong { flex:1 1 auto; font-size:var(--fs-body); font-weight:700; color:var(--text-heading); }',
      'section.owner-ledger > .cell-stage > ul > li > code { flex:0 0 auto; font-size:var(--fs-meta); color:var(--text-body); }',
      'section.owner-ledger > .cell-stage > ul > li > ul { flex:0 0 100%; list-style:none; padding:0; margin:0; font-size:var(--fs-body-compact); color:var(--text-body); }',
    ].join('\n'),
    manifest: { name: 'owner-ledger', function: 'inventory', form: 'ledger', substance: 'structure', bucket: 'inventory', tags: ['ownership', 'roster', 'ledger'], description: 'A roster of responsibilities.', skeleton: '<!-- _class: owner-ledger -->\n\n## Who owns what\n\n- Signal custody `Data lead`\n  - Owns intake quality.' },
  };
  const REUSE = {
    css: [
      'section.status-cards > .cell-stage { display:flex; flex-direction:column; }',
      'section.status-cards > .cell-stage > ul { display:flex; flex-wrap:wrap; gap:var(--sp-md); flex:1; min-height:0; list-style:none; padding:0; margin:0; }',
      'section.status-cards > .cell-stage > ul > li { box-sizing:border-box; width:calc(50% - var(--sp-md) / 2); background:var(--bg-alt); border:1px solid var(--border); border-left:3px solid var(--text-muted); border-radius:var(--radius-md); padding:var(--sp-sm) var(--sp-md); font-size:var(--fs-body); font-weight:700; color:var(--text-heading); }',
      'section.status-cards > .cell-stage > ul > li.pass { border-left-color:var(--pass); }',
      'section.status-cards > .cell-stage > ul > li.warn { border-left-color:var(--warn); }',
      'section.status-cards > .cell-stage > ul > li.fail { border-left-color:var(--fail); }',
      'section.status-cards.status-cards:where([data-family="square"], [data-family="tall"], [data-family="strip"]) > .cell-stage > ul > li { width:100%; }',
    ].join('\n'),
    manifest: { name: 'status-cards', function: 'inventory', form: 'grid', substance: 'structure', bucket: 'inventory', tags: ['cards', 'status', 'grid'], description: 'Status-tagged capability cards.', skeleton: '<!-- _class: status-cards -->\n\n## Capability status\n\n- Ingest pipeline\n- Scoring engine\n- Audit trail' },
  };
  test('worked example B (ledger) passes gateComponent', () => {
    assert.equal(gateComponent(LEDGER).ok, true, JSON.stringify(gateComponent(LEDGER).errors));
  });
  test('worked example C (reuse) passes gateComponent', () => {
    assert.equal(gateComponent(REUSE).ok, true, JSON.stringify(gateComponent(REUSE).errors));
  });

  // Example D — the two-column comparison added after the §10 widening found the
  // model reached for `margin` on a two-column layout. This teaches grid + gap.
  const COMPARE = {
    css: [
      'section.build-buy > .cell-stage > ul { display:grid; grid-template-columns:1fr 1fr; gap:var(--sp-lg); align-content:start; flex:1; min-height:0; list-style:none; padding:0; margin:0; }',
      'section.build-buy > .cell-stage > ul > li { background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius-md); padding:var(--sp-md); font-size:var(--fs-message); font-weight:700; color:var(--text-heading); }',
      'section.build-buy > .cell-stage > ul > li > ul { list-style:none; padding:var(--sp-sm) 0 0 0; margin:0; display:flex; flex-direction:column; gap:var(--sp-xs); font-size:var(--fs-body); font-weight:400; color:var(--text-body); }',
      'section.build-buy.build-buy:where([data-family="tall"], [data-family="strip"]) > .cell-stage > ul { grid-template-columns:1fr; }',
    ].join('\n'),
    manifest: { name: 'build-buy', function: 'comparison', form: 'split', substance: 'structure', bucket: 'comparison', tags: ['comparison', 'two-column', 'tradeoff'], description: 'Two options side by side.', skeleton: '<!-- _class: build-buy -->\n\n## Build vs buy\n\n- Build\n  - Full control\n- Buy\n  - Faster' },
  };
  test('worked example D (two-column comparison) passes gateComponent — grid + gap, no margin', () => {
    assert.equal(gateComponent(COMPARE).ok, true, JSON.stringify(gateComponent(COMPARE).errors));
  });

  describe('component-ai — the canon\'s family reflow actually fires', () => {
    // Pull the family selectors straight out of the worked examples so the test
    // tracks whatever the canon currently teaches, not a copy of it.
    // A selector may wrap across lines, so match from the end of the previous rule
    // (or the start of the sheet) up to the `{` — selectors never contain braces.
    const FAMILY_RULE = /(?:^|\})\s*([^{}]*\[data-family=[^{}]*?)\s*\{/g;
    const cases = [
      { css: CARDS.css, cls: 'capability-cards' },
      { css: REUSE.css, cls: 'status-cards' },
      { css: COMPARE.css, cls: 'build-buy' },
    ];
    for (const { css, cls } of cases) {
      test(`${cls}: every taught family selector matches a stamped slide`, () => {
        const selectors = [...css.matchAll(FAMILY_RULE)].map((m) => m[1].replace(/\s+/g, ' ').trim());
        assert.ok(selectors.length > 0, `${cls} teaches no family rule`);
        for (const sel of selectors) {
          const families = FAMILY_NAMES.filter((f) => sel.includes(`[data-family="${f}"]`));
          assert.ok(families.length > 0, `${sel} names no canonical family`);
          for (const fam of families) {
            assert.ok(
              matchesInStampedSlide(sel, fam, cls),
              `taught selector never matches on a data-family="${fam}" slide:\n  ${sel}`,
            );
          }
        }
      });
    }
  });

  // Example E — the MATRIX-as-table example. A real GFM table in the skeleton
  // (a `<table>` styled via thead th/td), proving tables are first-class and the
  // pure-markdown skeleton (no raw HTML) is gate-clean.
  const TABLE = {
    css: [
      'section.plan-matrix > .cell-stage { display:flex; flex-direction:column; }',
      'section.plan-matrix table { width:100%; border-collapse:collapse; table-layout:auto; flex:1; font-size:var(--fs-meta); }',
      'section.plan-matrix thead th { text-align:left; padding:var(--sp-xs) var(--sp-sm); font-size:var(--fs-meta); font-weight:700; color:var(--text-label); border-bottom:2px solid var(--border); }',
      'section.plan-matrix tbody td { padding:var(--sp-xs) var(--sp-sm); border-bottom:1px solid var(--border); color:var(--text-body); }',
      'section.plan-matrix tbody td:first-child { font-weight:600; color:var(--text-heading); }',
    ].join('\n'),
    manifest: {
      name: 'plan-matrix', function: 'comparison', form: 'matrix', substance: 'structure', bucket: 'comparison',
      tags: ['comparison', 'table', 'matrix', 'pricing'], description: 'A feature matrix — features down rows, plans across columns.',
      skeleton: '<!-- _class: plan-matrix -->\n\n## Plans at a glance\n\n| Feature | Starter | Team |\n| --- | --- | --- |\n| Seats | 3 | 25 |\n| SSO | — | Yes |',
    },
  };
  test('worked example E (matrix table) passes gateComponent — native table, token-styled, pure-markdown skeleton', () => {
    assert.equal(gateComponent(TABLE).ok, true, JSON.stringify(gateComponent(TABLE).errors));
  });

  // Example F — the TERMINAL/CONSOLE panel, added after a real generation came back
  // with a wall of #00ff00 hex + a stray margin (the "hacker-green" failure mode). It
  // teaches the token INVERSION for a dark panel + the state tokens for status, so the
  // model has a concrete gate-clean instance to copy instead of reaching for hex.
  const TERMINAL = {
    css: [
      'section.status-console > .cell-stage {',
      '  display:flex; flex-direction:column; gap:var(--sp-sm);',
      '  background:var(--text-heading); color:var(--bg);',
      '  border:1px solid var(--border); border-radius:var(--radius-md); padding:var(--sp-md);',
      '  font-family:ui-monospace, monospace;',
      '}',
      'section.status-console > .cell-stage > ul { display:flex; flex-direction:column; gap:var(--sp-xs); flex:1; min-height:0; list-style:none; padding:0; margin:0; }',
      'section.status-console > .cell-stage > ul > li { display:flex; align-items:center; gap:var(--sp-sm); padding:var(--sp-xs) var(--sp-sm); border-bottom:1px solid color-mix(in srgb, var(--bg) 20%, transparent); font-size:var(--fs-body-compact); color:var(--bg); }',
      'section.status-console > .cell-stage > ul > li > code { padding:0 var(--sp-2xs); border:1px solid var(--pass); border-radius:var(--radius-sm); font-size:var(--fs-meta); color:var(--pass); }',
    ].join('\n'),
    manifest: {
      name: 'status-console', function: 'inventory', form: 'panel', substance: 'structure', bucket: 'inventory',
      tags: ['console', 'status', 'terminal'], description: 'A dark diagnostic console — systems each with a status chip.',
      skeleton: '<!-- _class: status-console -->\n\n`Starbase diagnostic`\n\n## System status\n\n- Warp core `NOMINAL`\n  - Dilithium levels at 94%',
    },
  };
  test('worked example F (terminal console) passes gateComponent — INVERTED tokens, ZERO hex, no margin', () => {
    assert.equal(gateComponent(TERMINAL).ok, true, JSON.stringify(gateComponent(TERMINAL).errors));
  });

  // Prevention content must not silently vanish: the prompt carries the terminal
  // example + the trailing HARD CONSTRAINTS restatement (the recency backstop for the
  // rules models miss — hex, margin). These are what keep the failure mode from
  // recurring, so lock their presence.
  test('ASK_SYSTEM carries the terminal example and the trailing HARD CONSTRAINTS block', () => {
    assert.match(ASK_SYSTEM, /status-console/);
    assert.match(ASK_SYSTEM, /INVERT the tokens/);
    assert.match(ASK_SYSTEM, /HARD CONSTRAINTS/);
    assert.match(ASK_SYSTEM, /ZERO hex/);
    // The HARD CONSTRAINTS block sits at the VERY END (recency) — after the output contract.
    assert.ok(ASK_SYSTEM.lastIndexOf('HARD CONSTRAINTS') > ASK_SYSTEM.indexOf('OUTPUT CONTRACT'));
  });
});

describe('component-ai — silent gate-repair prompt (askRepairMessages)', () => {
  const dirtyDraft = {
    name: 'neon', description: 'A neon terminal.', function: 'inventory', form: 'panel', substance: 'structure',
    bucket: 'inventory', tags: ['neon', 'terminal', 'status'], adapt: { mode: 'native' },
    capacity: { sweet: 1, soft: 1, hard: 1 }, density: null,
    css: 'section.neon > .cell-stage { color:#00ff00; margin:4px; }', skeleton: '<!-- _class: neon -->\n\n## X\n\ntext',
  };
  const findings = [
    { rule: 'no-hex', level: 'error', line: 1, message: 'hex literal "#00ff00" — use a palette token instead.' },
    { rule: 'no-margin', level: 'error', line: 1, message: 'margin "4px" — space with gap/padding instead.' },
  ];

  test('builds a system+user pair that carries the remediation and the exact findings', () => {
    const msgs = askRepairMessages(dirtyDraft, findings);
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].role, 'system');
    // The system turn teaches the token map + margin rule (so the model can actually fix it).
    assert.match(msgs[0].content, /no-hex/);
    assert.match(msgs[0].content, /INVERTS the tokens/);
    assert.match(msgs[0].content, /margin is BANNED/);
    // The user turn carries the draft JSON + the specific violations to fix.
    assert.equal(msgs[1].role, 'user');
    assert.match(msgs[1].content, /"css"\s*:/);
    assert.match(msgs[1].content, /no-hex \(line 1\)/);
    assert.match(msgs[1].content, /no-margin \(line 1\)/);
    // Round-trips the draft so the model edits IN PLACE, not from scratch.
    assert.match(msgs[1].content, /#00ff00/);
    assert.match(msgs[1].content, /status-console|neon/);
  });

  test('tolerates an empty findings list and a junk draft without throwing', () => {
    assert.doesNotThrow(() => askRepairMessages(dirtyDraft, []));
    assert.doesNotThrow(() => askRepairMessages(null, null));
    assert.match(askRepairMessages(dirtyDraft, []).at(-1).content, /no specific findings/);
  });
});

describe('component-ai — design self-refine (the effort dial)', () => {
  const draft = {
    name: 'kpi-trio', description: 'Three KPIs.', function: 'statement', form: 'canvas', substance: 'structure',
    bucket: 'statement', tags: ['kpi', 'stat', 'metric'], adapt: { mode: 'native' }, capacity: { sweet: 3, soft: 3, hard: 3 },
    density: null, css: 'section.kpi-trio > .cell-stage { display:flex; }', skeleton: '<!-- _class: kpi-trio -->\n\n## Numbers\n\n- 100\n- 200',
  };

  test('askDesignRefineMessages carries the rubric + the draft, and asks for a rating', () => {
    const msgs = askDesignRefineMessages(draft);
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].role, 'system');
    assert.match(msgs[0].content, /RUBRIC/);
    assert.match(msgs[0].content, /HIERARCHY/);
    assert.match(msgs[0].content, /"rating"/);
    // The effort-regression guard: the prompt asks for a baselineRating (the model's score
    // of the ORIGINAL) on the same scale, so a round must STRICTLY beat it to win.
    assert.match(msgs[0].content, /"baselineRating"/);
    assert.match(msgs[0].content, /SAME scale/);
    assert.match(msgs[0].content, /KEEP THE COMPONENT'S IDENTITY/);
    // The system turn must still forbid gate-breaking (a refinement can't introduce hex/margin).
    assert.match(msgs[0].content, /ZERO\s*\n?\s*hex|ZERO hex/);
    assert.match(msgs[0].content, /NO `margin`/);
    assert.match(msgs[1].content, /"css"\s*:/);
    assert.match(msgs[1].content, /kpi-trio/);
  });

  test('coerceRefinement returns the component + a clamped integer rating (default 5)', () => {
    const base = { ...draft, css: 'section.kpi-trio > .cell-stage { color:var(--accent); }' };
    assert.equal(coerceRefinement({ ...base, rating: 8 }).rating, 8);
    assert.equal(coerceRefinement({ ...base, rating: 15 }).rating, 10); // clamped high
    assert.equal(coerceRefinement({ ...base, rating: 0 }).rating, 1); // clamped low
    assert.equal(coerceRefinement({ ...base, rating: 7.6 }).rating, 8); // rounded
    assert.equal(coerceRefinement({ ...base }).rating, 5); // missing → neutral default
    assert.equal(coerceRefinement({ ...base, rating: 'nope' }).rating, 5); // garbled → default
    // It still carries the coerced component (name/css), so the caller can gate it.
    assert.equal(coerceRefinement({ ...base, rating: 8 }).manifest.name, 'kpi-trio');
    assert.ok(coerceRefinement({ ...base, rating: 8 }).ok);
  });

  test('coerceRefinement parses baselineRating (clamped), null when absent — the regression bar', () => {
    const base = { ...draft, css: 'section.kpi-trio > .cell-stage { color:var(--accent); }' };
    assert.equal(coerceRefinement({ ...base, rating: 8, baselineRating: 6 }).baselineRating, 6);
    assert.equal(coerceRefinement({ ...base, baselineRating: 99 }).baselineRating, 10); // clamped high
    assert.equal(coerceRefinement({ ...base, baselineRating: -3 }).baselineRating, 1); // clamped low
    assert.equal(coerceRefinement({ ...base, baselineRating: 6.7 }).baselineRating, 7); // rounded
    // Absent/garbled → null (NOT a default): the caller must not accidentally get a bar it
    // never earned, so a model that omits it falls back to the ungraded behavior.
    assert.equal(coerceRefinement({ ...base }).baselineRating, null);
    assert.equal(coerceRefinement({ ...base, baselineRating: 'nope' }).baselineRating, null);
  });

  test('coerceRefinement tolerates junk without throwing', () => {
    assert.doesNotThrow(() => coerceRefinement(null));
    assert.doesNotThrow(() => coerceRefinement('not json'));
    assert.equal(coerceRefinement(null).rating, 5);
    assert.equal(coerceRefinement(null).baselineRating, null);
  });
});

describe('component-ai — manual refine (askComponentRefineMessages)', () => {
  const draft = {
    name: 'kpi-trio', description: 'Three KPIs.', function: 'statement', form: 'canvas', substance: 'structure',
    bucket: 'statement', tags: ['kpi', 'stat', 'metric'], adapt: { mode: 'native' }, capacity: { sweet: 3, soft: 3, hard: 3 },
    density: null, css: 'section.kpi-trio > .cell-stage { color:var(--text-body); }', skeleton: '<!-- _class: kpi-trio -->\n\n## Numbers\n\n- 100\n- 200',
  };

  test('carries the current draft + the author instruction, and preserves the gate rules', () => {
    const msgs = askComponentRefineMessages(draft, 'make the numbers bigger');
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].role, 'system');
    // The system turn preserves the component's identity + forbids gate-breaking.
    assert.match(msgs[0].content, /REFINING/);
    assert.match(msgs[0].content, /keep EVERYTHING else/i);
    assert.match(msgs[0].content, /ZERO hex/);
    assert.match(msgs[0].content, /NO `margin`/);
    // The user turn carries the draft JSON + the exact instruction.
    assert.equal(msgs[1].role, 'user');
    assert.match(msgs[1].content, /"css"\s*:/);
    assert.match(msgs[1].content, /kpi-trio/);
    assert.match(msgs[1].content, /Change to apply: make the numbers bigger/);
  });

  test('falls back to a generic nudge for an empty instruction; tolerates a junk draft', () => {
    assert.match(askComponentRefineMessages(draft, '').at(-1).content, /Change to apply: Improve it\./);
    assert.doesNotThrow(() => askComponentRefineMessages(null, null));
  });
});

describe('component-ai — skeleton is pure markdown (no raw HTML; HARD RULE #22 generation-time complement)', () => {
  // A valid base: the table example minus its skeleton, so each case swaps only the skeleton.
  const base = {
    css: 'section.t > .cell-stage > ul { list-style:none; padding:0; margin:0; }',
    manifest: {
      name: 't', function: 'inventory', form: 'stack', substance: 'structure', bucket: 'inventory',
      tags: ['a', 'b', 'c'], description: 'A list.',
    },
  };
  const withSkel = skeleton => ({ ...base, manifest: { ...base.manifest, skeleton } });
  const errs = skeleton => gateComponent(withSkel(skeleton)).errors.map(e => e.rule);

  test('a clean pure-markdown skeleton (list + comment note) passes', () => {
    const r = gateComponent(withSkel('<!-- _class: t -->\n<!-- present slowly -->\n\n## X\n\n- One\n- Two'));
    assert.equal(r.ok, true, JSON.stringify(r.errors));
  });
  test('a <script> tag is rejected', () => {
    assert.ok(errs('<!-- _class: t -->\n\n## X\n\n<script>steal()</script>').includes('skeleton-html'));
  });
  test('a <style> tag is rejected', () => {
    assert.ok(errs('<!-- _class: t -->\n\n## X\n\n<style>body{}</style>').includes('skeleton-html'));
  });
  test('benign tags (<div>/<span>/<br>) are rejected too — pure markdown only', () => {
    assert.ok(errs('<!-- _class: t -->\n\n## X\n\n<div>a</div><br>').includes('skeleton-html'));
  });
  test('an on*= handler / javascript: URL is rejected', () => {
    assert.ok(errs('<!-- _class: t -->\n\n## X\n\n[x](javascript:alert(1))').includes('skeleton-script'));
    assert.ok(errs('<!-- _class: t -->\n\n## X\n\n<img src=x onerror=alert(1)>').length > 0);
  });
  test('a tag SHOWN inside a code fence or inline span is allowed (it is escaped text)', () => {
    assert.equal(gateComponent(withSkel('<!-- _class: t -->\n\n## X\n\n```html\n<script>ok</script>\n```')).ok, true);
    assert.equal(gateComponent(withSkel('<!-- _class: t -->\n\n## X\n\n- Use `<br>` here')).ok, true);
  });
  test('prose with a "less than" comparison is NOT flagged (no space-glued tag)', () => {
    assert.equal(gateComponent(withSkel('<!-- _class: t -->\n\n## X\n\n- revenue < budget this year\n- a < b and c > d')).ok, true);
  });
  test('a benign URL or email autolink is allowed (valid markdown, renders to <a>)', () => {
    assert.equal(gateComponent(withSkel('<!-- _class: t -->\n\n## X\n\n- See <https://example.com/p?q=1>\n- Mail <a@b.com>')).ok, true);
  });
  test('a javascript: autolink is still caught by the scheme rule', () => {
    assert.ok(errs('<!-- _class: t -->\n\n## X\n\n- <javascript:alert(1)>').includes('skeleton-script'));
  });
  // Maker-checker found these two HIGH bypasses — regression-locked here.
  test('a <script> hidden via code-wrapped comment delimiters is still caught (strip code before comments)', () => {
    assert.ok(errs('<!-- _class: t -->\n\n## X\n\n`<!--` <script>alert(1)</script> `-->`').includes('skeleton-html'));
  });
  test('an entity-encoded javascript: scheme is caught (decode entities before the scheme scan)', () => {
    assert.ok(errs('<!-- _class: t -->\n\n## X\n\n[click](&#106;avascript:alert(1))').includes('skeleton-script'));
    assert.ok(errs('<!-- _class: t -->\n\n## X\n\n[click](javascript&colon;alert(1))').includes('skeleton-script'));
  });
  test('an entity-encoded < is escaped text, not a live tag — NOT flagged', () => {
    assert.equal(gateComponent(withSkel('<!-- _class: t -->\n\n## X\n\n- List &lt;int&gt; and 5 &lt; 10')).ok, true);
  });
});

describe('component-ai — scope-prefix safe fix (§6, self-verifying)', () => {
  test('prefixes a bare selector so it stops leaking, and reports the fix', () => {
    const r = coerceComponent({
      name: 'leaky', function: 'inventory', form: 'grid', substance: 'structure', bucket: 'inventory', tags: ['a', 'b', 'c'],
      description: 'd',
      css: 'section.leaky > .cell-stage { display:flex; }\nul { color:var(--text-body); }',
      skeleton: '<!-- _class: leaky -->\n\n## T\n\n- a',
    });
    assert.ok(r.fixes.includes('scope-prefix'));
    assert.equal(findUnscopedSelectors(r.css, 'leaky').length, 0, 'the leak is scoped away');
    assert.match(r.css, /section\.leaky ul/);
  });
  test('addScopePrefix leaves an already-scoped sheet untouched', () => {
    const css = 'section.ok > .cell-stage { display:flex; }';
    const r = addScopePrefix(css, 'ok');
    assert.equal(r.fixed, false);
    assert.equal(r.css, css);
  });
  test('addScopePrefix descends into @container but never rewrites @keyframes stops', () => {
    const r = addScopePrefix('@keyframes spin { from { opacity:0 } } ul { color:var(--text-body) }', 'x');
    // the keyframe `from` is left alone; the bare ul gets scoped
    assert.match(r.css, /@keyframes spin \{ from \{ opacity:0 \} \}/);
    assert.match(r.css, /section\.x ul/);
  });
  test('a brace inside a content string can NOT corrupt the rewrite (string-aware)', () => {
    // `content:"}"` must not be mistaken for a rule close; the bare li still scopes.
    const r = addScopePrefix('section.x li::after { content:"}" } ul { color:var(--text-body) }', 'x');
    assert.match(r.css, /content:"\}"/, 'the content string is preserved verbatim');
    assert.equal(findUnscopedSelectors(r.css, 'x').length, 0);
  });
  test('a quoted attribute selector makes it BAIL (never corrupt) — gate still flags the leak', () => {
    const css = 'ul[data-state="{}"] { color:var(--text-body) }';
    const r = addScopePrefix(css, 'x');
    assert.equal(r.fixed, false, 'declines to auto-fix a quoted selector');
    assert.equal(r.css, css, 'returns the original untouched — no corruption');
  });
  test('pathologically deep at-rule nesting can NOT blow the stack — it bails safely', () => {
    // Untrusted, AI-generated CSS could nest @media absurdly deep; the rewriter (and the
    // gate walker it verifies against) must cap the recursion, not overflow the JS stack.
    const deep = `${'@media all {'.repeat(200)}ul{color:var(--text-body)}${'}'.repeat(200)}`;
    let r;
    assert.doesNotThrow(() => { r = addScopePrefix(deep, 'x'); });
    // Past the cap it declines to auto-fix (fixed:false) and returns the source untouched —
    // no corruption, and the structural gate's own regex checks still apply to the whole CSS.
    assert.equal(r.fixed, false);
    assert.equal(r.css, deep);
    // The gate's rule walker must also survive the same input without throwing.
    assert.doesNotThrow(() => findUnscopedSelectors(deep, 'x'));
  });
});

describe('component-ai — design audit (§6 adapt/capacity + §7 size cap)', () => {
  test('flags a missing adapt block and a missing capacity', () => {
    const f = auditComponentDesign({ name: 'x' }, 'section.x{}');
    assert.ok(f.some(x => x.rule === 'adapt'));
    assert.ok(f.some(x => x.rule === 'capacity'));
  });
  test('flags an incoherent capacity that does not climb (soft ≥ hard, or sweet > hard)', () => {
    assert.ok(auditComponentDesign({ adapt: { mode: 'native' }, capacity: { soft: 8, hard: 6 } }, 'section.x{}').some(x => x.rule === 'capacity' && /climb/.test(x.message)));
    assert.ok(auditComponentDesign({ adapt: { mode: 'native' }, capacity: { sweet: 9, hard: 8 } }, 'section.x{}').some(x => x.rule === 'capacity'));
  });
  test('flags an incoherent density that does not climb (soft > hard)', () => {
    const f = auditComponentDesign({ adapt: { mode: 'native' }, capacity: { sweet: 4, soft: 6, hard: 8 }, density: { axis: 'item', soft: 12, hard: 6 } }, 'section.x{}');
    assert.ok(f.some(x => x.rule === 'density' && /≤/.test(x.message)));
  });
  test('a coherent manifest with a small sheet audits clean', () => {
    const f = auditComponentDesign({ adapt: { mode: 'native' }, capacity: { sweet: 4, soft: 6, hard: 8 }, density: { axis: 'item', soft: 6, hard: 12 } }, 'section.x{ color:var(--text-body) }');
    assert.equal(f.length, 0);
  });
  test('flags an oversized stylesheet (a smuggled data: payload)', () => {
    const big = 'section.x{ background:url("data:image/png;base64,' + 'A'.repeat(MAX_CSS_BYTES) + '") }';
    const f = auditComponentDesign({ adapt: { mode: 'native' }, capacity: { sweet: 4, soft: 6, hard: 8 } }, big);
    assert.ok(f.some(x => x.rule === 'css-size' && x.level === 'error'));
  });
});

describe('component-ai — dedup ranking', () => {
  const CATALOG = [
    { name: 'actors', bucket: 'inventory', description: 'Roster of responsibilities owned by named actors.', tags: ['ownership', 'roster'] },
    { name: 'kpi', bucket: 'inventory', description: 'Key metrics as big numbers.', tags: ['metrics', 'numbers'] },
    { name: 'quote', bucket: 'statement', description: 'A pull quote.', tags: ['quote'] },
  ];

  test('ranks a roster request toward `actors`, ignores unrelated components', () => {
    const hits = rankSimilar('a roster of who owns which responsibilities', CATALOG, { limit: 3 });
    assert.equal(hits[0].name, 'actors', 'the roster component ranks first');
    assert.ok(hits.every(h => h.score > 0), 'only positive-overlap matches surface');
    assert.ok(!hits.some(h => h.name === 'quote'), 'an unrelated component does not surface');
  });

  test('an empty or no-overlap query yields no suggestions (never a false nudge)', () => {
    assert.deepEqual(rankSimilar('', CATALOG), []);
    assert.deepEqual(rankSimilar('xyzzy plugh', CATALOG), []);
  });
});
