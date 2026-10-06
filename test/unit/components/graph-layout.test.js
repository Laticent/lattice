/**
 * Unit: the chart family's shared graph layout + elbow router
 * (Trama's kernel, @laticent/trama: docs/src/lib/trama/kernel.ts).
 *
 * What is pinned, and why each one:
 *
 *   1. SERIALIZATION — the kernel ships to the browser as `fn.toString()` source, so a
 *      reference to anything outside its body breaks every export that embeds it. Only
 *      this test notices: it rebuilds the kernel from its own source text, with no
 *      closure, and demands the same geometry.
 *   2. DETERMINISM — the same model gives byte-identical geometry, run after run.
 *   3. THE GALLERY — six charts that each once showed a routing defect (a line through a
 *      title, a label on a shape, two lines sharing a run, a jog folding back into its
 *      box). Every `measureQuality` count must read zero on every one.
 *   4. THE RATCHET — 1,000 seeded random charts. The hard counts (a line through a
 *      shape, overlapping shapes, a label off its own line) must be zero on all of
 *      them; the soft counts may miss on at most SOFT_MISS_BUDGET charts. Lower the
 *      budget when the router improves; never raise it to land a change.
 *   5. THE RULES the router implements, checked as geometry rather than as counts.
 *   6. WHAT REVIEW FOUND: the adversarial review's reproductions, each held to its rule.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

require('../../../lib/core/dagre-layout.js');
const { graphLayoutKernel } = require('@laticent/trama');
const { parseFlowchart, outlineFromMarkdown } = require('../../../lib/core/flowchart-grammar');

const dagre = globalThis.__latticeDagre;
const K = graphLayoutKernel();
const STAGE = { w: 1072, h: 440 };
// 4, not the 2 it was: `sharedRuns` now counts two runs within 6 units (it was 4), because
// the demo deck showed two lines 4.5 units apart reading as one. Measured on this corpus with
// the same router, the old 4-unit rule still reads 2 misses; the stricter rule reads 4. The
// ruler moved, not the router. Then 1: the crossing pass cleared three more. Then 0: the
// route solver seats each label as part of its route's cost.
const SOFT_MISS_BUDGET = 0;
// The wider corpus below: 7 of its 600 charts missed a soft count (mostly two labels
// crowding on a group's lines) when the corpus was added; 0 with the route solver.
const WIDE_SOFT_BUDGET = 0;
// Line crossings on the 1,000-chart corpus: 923 before the router's crossing solver, 230
// with it, 195 once it also ran a second order (freest lines first, keep each line's sides
// and ports, allow a straight drop) and kept whichever run crossed less. Then the router
// stopped drawing lines that fold back through their own start or end box
// (`linesThroughEnds`, now a hard zero; 37 on this corpus and 33 on the one below, across
// auto, lr and tb) and lines that graze a stranger's box (24 -> 7), and fanning shapes got
// one fan each (routeFans): 182. Every chart that gained a crossing lost a fold or a graze
// for it. Side balance (flank exits) and the end-run pass took it to 181 with no chart
// worse. Then the route solver (one cost for every line, rip-up and reroute, see the
// decision note §7) replaced the pass stack: 16, and its review round (a relax phase, an
// order for each side's ends that crosses nothing) took it to 10. A crossing is a cost, not a defect, so this
// is a ceiling to ratchet down. State chart v2 raised it to 39, on purpose: the solver had
// been buying those crossings with JOINS, one line's corner or end lying on an unrelated line
// (a T that reads as a transition that is not there). Measured on this corpus, main left 132
// joins on 40 of the 1,000 charts; joins are now a never-rule (`sharesRun`, and counted in
// `sharedRuns`), so none remain, and the 29 extra crossings are clean X's a reader can follow.
// Then 31: a direction whose routed layout crosses is laid out again with dagre's two other
// rankers, and the one that crosses least is kept within 3% of the type (`reranked`).
const CROSSING_BUDGET = 31;
// The wrap corpus below: 100 state machines laid out on the reading-order grid alone (no
// dagre, as a chain ships). 42 crossings when it was added, with every line count's even
// split; 24 once a picked grid that crosses also tries moving one line break by one shape, and
// the other direction, and keeps either only if it routes with no crossing and no fault
// (decision note 2026-10-06-trama-crossing-aware-wrap.md).
const WRAP_CROSSING_BUDGET = 24;
// The same corpus with `order: 'graph'` (the charts' `rearrange` modifier, an author's opt-in):
// 12 when it was added. Used as the order of every candidate instead, the graph's order crossed
// MORE (the same generator's 200 charts, grid only: 50 -> 74), so it only ever stands in for a
// pick that crosses.
const WRAP_GRAPH_BUDGET = 12;

/** The probe's sizing: a stand-in for the painter's measurement, fixed so tests are exact. */
function model(src) {
  const o = outlineFromMarkdown(src);
  const m = parseFlowchart(o.items, { key: o.key });
  const sizes = {};
  for (const s of m.shapes) sizes[s.id] = { w: Math.max(96, s.name.length * 8.2 + 34), h: s.shape === 'diamond' ? 70 : s.shape === 'cylinder' ? 50 : 42 };
  const labelSizes = {};
  m.edges.forEach((e, i) => {
    if (e.label) labelSizes[i] = { w: e.label.length * 7.8 + 12, h: 16 };
  });
  const groupTitleSizes = {};
  for (const g of m.groups) groupTitleSizes[g.id] = { w: g.name.length * 8.4 + 4, h: 14 };
  return { m, sizes, opts: { labelSizes, groupTitleSizes, stage: STAGE } };
}

const run = (src, kernel = K, extra = {}) => {
  const { m, sizes, opts } = model(src);
  return { m, geo: kernel.layout(m, sizes, { ...opts, ...extra }, dagre) };
};

const GALLERY = {
  incident: `- Alert fires \`pill\`
  - => Auto-triage => Severity?
- Severity? \`diamond\`
  - =SEV1=> Page on-call
  - -SEV2-> Open ticket
  - -SEV3-> Backlog \`dotted\`
- Page on-call \`fail\`
  - =ack=> Mitigate
  - -no ack 5m-> Escalate to lead
- Escalate to lead \`at-risk\`
  - -retry-> Page on-call
- Open ticket
  - -> Mitigate
- Mitigate
  - => Postmortem
- Backlog \`muted\`
- Postmortem \`doc\``,
  flat: `- Alert fires \`pill\` => Auto-triage => Severity?
- Severity? \`diamond\`
  - =SEV1=> Page on-call
  - -SEV2-> Open ticket -> Mitigate
  - -SEV3-> Backlog \`dotted\`
- Page on-call \`fail\` =ack=> Mitigate => Postmortem
  > Pages the secondary after 5 minutes.
- Platform \`c2\`
  - Storefront => Payments
  - Payments -screens-> Fraud checks
  - -ships via-> Carriers`,
  org: `- Chief executive \`c1\`
  - -- Finance & Technology & Operations
- Finance
  - -- Controller & Planning
- Technology
  - -- Platform & Product engineering & Security
- Operations
  - -- Support & Logistics
- Security \`c4\`
  - -advises-> Finance \`{dotted, loose}\``,
  dataflow: `- Sources \`c1\`
  - Web events \`io\`
  - Mobile events \`io\`
  - Billing DB \`cylinder\`
  - => Ingest queue
- Pipeline \`c2\`
  - Ingest queue
    - => Stream processor
  - Stream processor
    - -enrich-> Feature store
    - => Warehouse
  - Feature store \`cylinder\`
  - Warehouse \`cylinder\`
    - -> BI dashboards
    - -nightly-> ML training
- BI dashboards \`doc\`
- ML training
  - -models-> Feature store`,
  system: `- Customers \`c1\`
  - Shopper \`circle\`
    - -browses-> Storefront
  - Merchant \`circle\`
    - -lists items-> Storefront
- Platform \`c2\`
  - Storefront
    - => Payments
  - Payments
    - -screens-> Fraud checks
    - <-> Card networks
  - Fraud checks \`diamond\`
  - -ships via-> Carriers
- Partners \`c3\`
  - Card networks \`square\`
  - Carriers \`square\`
- Regulators \`doc\``,
  // Two labeled lines in opposite directions between the same pair, on a short run:
  // neither label can clear the other alone, so the seating must move both.
  crowded: `- Golf -lab3-> Delta
- Delta -lab8-> Golf
- Alpha -lab0-> Fox
- Gamma -lab2-> Beta
- Delta -> Echo
- Beta -> Golf
- Beta -lab6-> Golf
- Echo -lab7-> Gamma`,
};

const ZERO = { linesThroughShapes: 0, linesThroughEnds: 0, labelCollisions: 0, shapeOverlaps: 0, labelsOffLine: 0, linesThroughTitles: 0, labelsAcrossBorders: 0, sharedRuns: 0, endsOffBox: 0, titlesUnderShapes: 0 };

describe('graph-layout — serialization', () => {
  test('the kernel rebuilt from its own source text gives identical geometry', () => {
    const rebuilt = new Function(`return (${graphLayoutKernel.toString()})`)()();
    for (const src of Object.values(GALLERY)) {
      assert.deepEqual(run(src, rebuilt).geo, run(src).geo);
    }
  });

  test('without dagre the layout degrades to null, never throws', () => {
    const { m, sizes, opts } = model(GALLERY.incident);
    assert.equal(K.layout(m, sizes, opts, undefined), null);
    assert.equal(K.layout(m, sizes, opts, {}), null);
  });
});

describe('graph-layout — determinism', () => {
  test('the same model lays out byte-identically, run after run', () => {
    // A fresh kernel each run: the kernel caches its results, and a cache hit would prove
    // nothing about determinism.
    for (const src of Object.values(GALLERY)) {
      const a = JSON.stringify(run(src, graphLayoutKernel()).geo);
      for (let i = 0; i < 3; i++) assert.equal(JSON.stringify(run(src, graphLayoutKernel()).geo), a);
    }
  });

  test('a cached layout equals a fresh one, and editing it cannot change the next', () => {
    const k = graphLayoutKernel();
    for (const src of Object.values(GALLERY)) {
      const fresh = JSON.stringify(run(src, graphLayoutKernel()).geo);
      const first = run(src, k).geo;
      first.routes[0].points[0].x += 1000; // a painter adjusting a point
      assert.equal(JSON.stringify(run(src, k).geo), fresh);
    }
  });

  test('an empty chart lays out to an empty, finite box', () => {
    const geo = K.layout({ shapes: [], groups: [], edges: [] }, {}, { stage: STAGE }, dagre);
    assert.ok(geo);
    assert.equal(geo.routes.length, 0);
    assert.ok(Number.isFinite(geo.width) && Number.isFinite(geo.height));
  });
});

// A KNOWN miss, named and explained, never a silent tolerance. Each entry must still
// miss exactly as recorded, so the list cannot outlive its cause.
// Empty since the route solver: 'flat · tb' once seated a label across a group's border.
const KNOWN = {};

describe('graph-layout — the gallery reads zero on every quality count', () => {
  for (const [name, src] of Object.entries(GALLERY)) {
    for (const dir of ['lr', 'tb']) {
      test(`${name} · ${dir}`, () => {
        assert.deepEqual(run(src, K, { dir }).geo.quality, { ...ZERO, ...KNOWN[`${name} · ${dir}`] });
      });
    }
  }

  test('each gallery chart in its OWN direction reads zero, known misses included', () => {
    for (const src of Object.values(GALLERY)) assert.deepEqual(run(src).geo.quality, ZERO);
  });
});

describe('graph-layout — seeded random charts (ratchet)', () => {
  test(`1,000 charts: hard counts zero; soft misses ≤ ${SOFT_MISS_BUDGET}; crossings ≤ ${CROSSING_BUDGET}`, () => {
    const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Echo', 'Fox', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima'];
    const HARD = ['linesThroughShapes', 'linesThroughEnds', 'shapeOverlaps', 'labelsOffLine', 'endsOffBox'];
    let soft = 0, crossed = 0;
    for (const seed0 of [1, 7, 99, 5]) {
      let seed = seed0;
      const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      for (let t = 0; t < 250; t++) {
        const n = 4 + Math.floor(rnd() * 8);
        const ns = names.slice(0, n);
        const lines = [];
        const grouped = rnd() < 0.5;
        if (grouped) {
          lines.push('- Grp One `c2`');
          for (const x of ns.slice(0, 3)) lines.push(`  - ${x}`);
        }
        for (const x of ns.slice(grouped ? 3 : 0)) lines.push(`- ${x}`);
        const e = 1 + Math.floor(rnd() * n * 1.3);
        for (let i = 0; i < e; i++) {
          const a = ns[Math.floor(rnd() * n)];
          const b = ns[Math.floor(rnd() * n)];
          if (a === b) continue;
          const arrow = rnd() < 0.4 ? `-lab${i}->` : rnd() < 0.5 ? '=>' : '->';
          lines.push(`- ${a} ${arrow} ${b}`);
        }
        const src = lines.join('\n');
        const geo = run(src).geo;
        const q = geo.quality;
        for (const k of HARD) assert.equal(q[k], 0, `${k} on seed ${seed0} chart ${t}:\n${src}`);
        if (Object.values(q).some((v) => v > 0)) soft++;
        crossed += geo.crossings;
      }
    }
    assert.ok(soft <= SOFT_MISS_BUDGET, `${soft} charts missed a soft count (budget ${SOFT_MISS_BUDGET})`);
    assert.ok(crossed <= CROSSING_BUDGET, `${crossed} line crossings (budget ${CROSSING_BUDGET})`);
  });
});

describe('graph-layout — the reading-order grid (wrap ratchet)', () => {
  // The 1,000-chart corpus above never wraps: half its charts hold a group, which the grid
  // cannot, and the rest fit on one line. So the grid's crossings are counted here, on charts
  // shaped like the state machines that do wrap: a spine with labeled steps, side states that
  // leave one anchor and come back to it, and the odd skip or retry.
  test(`100 state machines on the grid: hard counts zero; crossings ≤ ${WRAP_CROSSING_BUDGET}`, () => {
    const words = ['Draft', 'Review', 'Approved', 'Queued', 'Running', 'Blocked', 'Paused', 'Failed', 'Retrying', 'Shipped', 'Closed', 'Archived', 'Triage', 'Staging'];
    const HARD = ['linesThroughShapes', 'linesThroughEnds', 'shapeOverlaps', 'labelsOffLine', 'endsOffBox'];
    let crossed = 0, wrapped = 0, crossedByGraph = 0;
    for (const seed0 of [3, 17]) {
      let seed = seed0;
      const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      for (let t = 0; t < 50; t++) {
        const k = 6 + Math.floor(rnd() * 8);
        const shapes = [{ id: 'start', name: '', parent: null, shape: 'start' }];
        for (let i = 0; i < k; i++) shapes.push({ id: `s${i}`, name: words[i], parent: null, shape: 'box' });
        shapes.push({ id: 'end', name: '', parent: null, shape: 'end' });
        const edges = [{ from: 'start', to: 's0', dir: 'out', style: {} }];
        const side = new Set();
        for (let j = 0; j < Math.floor(rnd() * 3); j++) side.add(1 + Math.floor(rnd() * (k - 2)));
        const spine = [...Array(k).keys()].filter((i) => !side.has(i));
        for (let i = 1; i < spine.length; i++) edges.push({ from: `s${spine[i - 1]}`, to: `s${spine[i]}`, dir: 'out', style: {}, label: rnd() < 0.6 ? `e${i}` : undefined });
        edges.push({ from: `s${spine[spine.length - 1]}`, to: 'end', dir: 'out', style: {} });
        for (const sd of side) {
          const a = spine[Math.floor(rnd() * spine.length)];
          edges.push({ from: `s${a}`, to: `s${sd}`, dir: 'out', style: {}, label: 'side' });
          edges.push({ from: `s${sd}`, to: `s${a}`, dir: 'out', style: {}, label: 'back', back: a < sd ? true : undefined });
        }
        for (let j = Math.floor(rnd() * 3); j > 0; j--) {
          const a = Math.floor(rnd() * k), b = Math.floor(rnd() * k);
          if (a === b) continue;
          edges.push({ from: `s${a}`, to: `s${b}`, dir: 'out', style: {}, label: b < a ? 'retry' : 'skip', back: b < a ? true : undefined });
        }
        const sizes = Object.create(null);
        for (const x of shapes) sizes[x.id] = x.shape === 'start' ? { w: 14, h: 14 } : x.shape === 'end' ? { w: 20, h: 20 } : { w: 9 * x.name.length + 46, h: 40 };
        const labelSizes = Object.create(null);
        edges.forEach((e, i) => { if (e.label) labelSizes[i] = { w: 7 * e.label.length + 12, h: 16 }; });
        const stage = t % 2 ? { w: 1072, h: 440 } : { w: 620, h: 900 };
        const geo = K.layout({ shapes, groups: [], edges }, sizes, { wrap: true, labelSizes, stage, maxScale: 1.25 }, null);
        for (const h of HARD) assert.equal(geo.quality[h] || 0, 0, `${h} on seed ${seed0} chart ${t}`);
        crossed += geo.crossings;
        if ((geo.lines || 1) > 1) wrapped++;
        // `order: 'graph'` (the `rearrange` modifier) on the same chart: it only replaces a pick
        // with one that has fewer faults, then fewer crossings, so never more faults, and never
        // more crossings at the same faults. (Across faults it may: the checker found a 19-state
        // machine, no dagre, that traded two lines through shapes for 9 more crossings, which
        // is the kernel's ranking everywhere: a line through a shape outranks any crossings.)
        const byGraph = K.layout({ shapes, groups: [], edges }, sizes, { wrap: true, labelSizes, stage, maxScale: 1.25, order: 'graph' }, null);
        for (const h of HARD) assert.equal(byGraph.quality[h] || 0, 0, `${h} with order graph on seed ${seed0} chart ${t}`);
        const faults = (g) => Object.values(g.quality).reduce((a, b) => a + b, 0);
        assert.ok(faults(byGraph) <= faults(geo), `order graph added a fault on seed ${seed0} chart ${t}`);
        if (faults(byGraph) === faults(geo)) assert.ok(byGraph.crossings <= geo.crossings, `order graph crossed more at equal faults on seed ${seed0} chart ${t}: ${byGraph.crossings} > ${geo.crossings}`);
        crossedByGraph += byGraph.crossings;
      }
    }
    assert.ok(wrapped >= 90, `${wrapped} of 100 wrapped: the corpus must exercise the grid`);
    assert.ok(crossed <= WRAP_CROSSING_BUDGET, `${crossed} line crossings (budget ${WRAP_CROSSING_BUDGET})`);
    assert.ok(crossedByGraph <= WRAP_GRAPH_BUDGET, `${crossedByGraph} line crossings with order graph (budget ${WRAP_GRAPH_BUDGET})`);
  });

  // The stress deck's ten-step pipeline: Blocked is written last but leaves In Progress.
  const PIPELINE = (() => {
    const names = ['Intake', 'Triage', 'Assigned', 'In Progress', 'Code Review', 'QA', 'Staging', 'Released', 'Blocked', 'Closed'];
    const shapes = [{ id: 'start', name: '', parent: null, shape: 'start' }, ...names.map((n) => ({ id: n, name: n, parent: null, shape: 'box' })), { id: 'end', name: '', parent: null, shape: 'end' }];
    const E = (from, to, label, back) => ({ from, to, dir: 'out', style: {}, label, back });
    const edges = [E('start', 'Intake'), E('Intake', 'Triage'), E('Triage', 'Assigned'), E('Assigned', 'In Progress'), E('In Progress', 'Code Review'),
      E('In Progress', 'Blocked', 'block'), E('Code Review', 'QA'), E('Code Review', 'In Progress', 'reject', true), E('QA', 'Staging'),
      E('QA', 'In Progress', 'fail', true), E('Staging', 'Released'), E('Released', 'Closed'), E('Blocked', 'In Progress', 'unblock', true), E('Closed', 'end')];
    const sizes = Object.create(null);
    for (const x of shapes) sizes[x.id] = x.shape === 'start' ? { w: 14, h: 14 } : x.shape === 'end' ? { w: 20, h: 20 } : { w: 9 * x.name.length + 46, h: 40 };
    const labelSizes = Object.create(null);
    edges.forEach((e, i) => { if (e.label) labelSizes[i] = { w: 7 * e.label.length + 12, h: 16 }; });
    return { model: { shapes, groups: [], edges }, sizes, opts: { wrap: true, labelSizes, stage: { w: 1072, h: 440 }, maxScale: 1.25 } };
  })();

  test('rearrange: a side state written last moves beside the state it leaves, and the crossings go', () => {
    const { model, sizes, opts } = PIPELINE;
    const text = K.layout(model, sizes, opts, null);
    const graph = K.layout(model, sizes, { ...opts, order: 'graph' }, null);
    assert.ok(text.crossings > 0, 'the written order still crosses, so this test still means something');
    assert.equal(graph.crossings, 0);
    assert.equal(text.seq, undefined, 'the default never reorders');
    assert.ok(graph.seq, 'the rearranged drawing names its order');
    const at = (id) => graph.seq.indexOf(id);
    assert.equal(at('Blocked'), at('Code Review') + 1, `Blocked beside Code Review: ${graph.seq.join(' > ')}`);
    // The live pin replays the pick: its lines, direction, breaks and order, in one routing.
    const k = graphLayoutKernel();
    const pinned = k.layout(model, sizes, { ...opts, order: 'graph', wrap: false, dir: graph.dir, grid: graph.lines, grow: false, seq: graph.seq, ...(graph.breaks ? { breaks: graph.breaks } : {}) }, null);
    assert.deepEqual(JSON.parse(JSON.stringify(pinned.nodes)), JSON.parse(JSON.stringify(graph.nodes)));
    assert.equal(k.stats.routed, 1);
  });

  test('rearrange leaves a chain alone, byte for byte', () => {
    const shapes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map((id) => ({ id, name: `State ${id}`, parent: null, shape: 'box' }));
    const edges = shapes.slice(1).map((x, i) => ({ from: shapes[i].id, to: x.id, dir: 'out', style: {}, label: 'go' }));
    const sizes = Object.create(null);
    for (const x of shapes) sizes[x.id] = { w: 110, h: 40 };
    const labelSizes = Object.create(null);
    edges.forEach((_e, i) => { labelSizes[i] = { w: 24, h: 14 }; });
    const opts = { wrap: true, labelSizes, stage: { w: 1152, h: 480 } };
    assert.deepEqual(JSON.parse(JSON.stringify(K.layout({ shapes, groups: [], edges }, sizes, { ...opts, order: 'graph' }, null))),
      JSON.parse(JSON.stringify(K.layout({ shapes, groups: [], edges }, sizes, opts, null))));
  });

  test('a seq that does not name every shape once is refused, not half-placed', () => {
    const { model, sizes, opts } = PIPELINE;
    const ids = model.shapes.map((x) => x.id);
    for (const seq of [ids.slice(1), [...ids, ids[0]], [...ids.slice(0, -1), 'nobody']]) {
      assert.equal(K.layoutOnce(model, sizes, { ...opts, dir: 'lr', grid: 3, grow: false, seq }, null), null);
    }
  });

  test('a long machine pays a bounded amount of work for the near-even splits (work counts)', () => {
    // The first build listed every split within one shape of even and bounded each: 686,011
    // splits for 38 shapes, 45 s for a 36-state chain, the same drawing at the end. One break
    // moved by one shape is at most 2 x (lines - 1) splits. Work counts, not milliseconds, so a
    // busy runner cannot move them: before the splits this chain read routed 1, bounded 18.
    const n = 36;
    const shapes = Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `State ${i}`, parent: null, shape: 'box' }));
    const edges = shapes.slice(1).map((sh, i) => ({ from: shapes[i].id, to: sh.id, dir: 'out', style: {}, label: 'go' }));
    for (let i = 5; i < n; i += 5) edges.push({ from: `s${i}`, to: `s${i - 4}`, dir: 'out', style: {}, label: 'reset', back: true });
    for (let i = 2; i + 3 < n; i += 7) edges.push({ from: `s${i}`, to: `s${i + 3}`, dir: 'out', style: {}, label: 'skip' });
    const sizes = Object.create(null);
    for (const x of shapes) sizes[x.id] = { w: 110, h: 40 };
    const labelSizes = Object.create(null);
    edges.forEach((e, i) => { labelSizes[i] = { w: 7 * e.label.length + 12, h: 16 }; });
    const k = graphLayoutKernel();
    const geo = k.layout({ shapes, groups: [], edges }, sizes, { wrap: true, labelSizes, stage: { w: 1152, h: 480 } }, null);
    assert.ok(geo && geo.lines > 1);
    assert.ok(k.stats.routed <= 2, `routed ${k.stats.routed}`);
    assert.ok(k.stats.bounded <= 28, `bounded ${k.stats.bounded}`);
  });

  test('a grid line break moves by one shape to keep a side state off the run it would cut', () => {
    // The stress deck's wizard: every step can cancel back to Welcome. Split 3/3 it crossed
    // once; 4/2 draws it clean at the same type size.
    const ids = ['start', 'Welcome', 'Account', 'Profile', 'Payment', 'Confirm'];
    const shapes = ids.map((id) => ({ id, name: id === 'start' ? '' : id, parent: null, shape: id === 'start' ? 'start' : 'box' }));
    const E = (from, to, label, back) => ({ from, to, dir: 'out', style: {}, label, back });
    const edges = [E('start', 'Welcome'), E('Welcome', 'Account', 'next'), E('Account', 'Profile', 'next'), E('Account', 'Welcome', 'cancel', true),
      E('Profile', 'Payment', 'next'), E('Profile', 'Welcome', 'cancel', true), E('Payment', 'Confirm', 'next'), E('Payment', 'Welcome', 'cancel', true), E('Confirm', 'Welcome', 'restart', true)];
    const sizes = Object.create(null);
    for (const x of shapes) sizes[x.id] = x.shape === 'start' ? { w: 14, h: 14 } : { w: 9 * x.name.length + 46, h: 40 };
    const labelSizes = Object.create(null);
    edges.forEach((e, i) => { if (e.label) labelSizes[i] = { w: 7 * e.label.length + 12, h: 16 }; });
    const opts = { wrap: true, labelSizes, stage: { w: 1072, h: 440 }, maxScale: 1.25 };
    const even = K.layoutOnce({ shapes, groups: [], edges }, sizes, { ...opts, dir: 'lr', grid: 2, grow: false }, null);
    assert.ok(even.crossings > 0, 'the even split still crosses, so this test still means something');
    const geo = K.layout({ shapes, groups: [], edges }, sizes, opts, null);
    assert.equal(geo.lines, 2);
    assert.equal(geo.crossings, 0);
    assert.equal(geo.scale, 1.25, 'at the type cap, as the even split was');
    assert.deepEqual(geo.breaks, [4, 2], 'the geometry names its breaks, so the live pin can hold them');
    // The pipeline pins the search's pick while the author types (pipeline.ts, `held`): the
    // pinned call must draw exactly what the search drew, breaks included, and route it once.
    // A pin without its breaks drew 3/3 while typing and jumped to 4/2 at every pause.
    const k = graphLayoutKernel();
    const pinned = k.layout({ shapes, groups: [], edges }, sizes, { ...opts, wrap: false, dir: geo.dir, grid: geo.lines, grow: false, breaks: geo.breaks }, null);
    assert.deepEqual(JSON.parse(JSON.stringify(pinned.nodes)), JSON.parse(JSON.stringify(geo.nodes)));
    assert.deepEqual(JSON.parse(JSON.stringify(pinned.routes)), JSON.parse(JSON.stringify(geo.routes)));
    assert.equal(k.stats.routed, 1, 'a fixed grid is not reranked: dagre never places it');
  });
});

describe('graph-layout — groups as endpoints, nested groups, self-loops (ratchet)', () => {
  // The first corpus above only ever drew ONE flat group and never ended a line at one.
  // The checker on #2385 found the router's worst cases exactly there: a line from a group
  // trimmed at its border ran through the shapes beside it. This corpus draws those.
  test(`600 charts: hard counts zero and every run orthogonal; soft misses ≤ ${WIDE_SOFT_BUDGET}`, () => {
    const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Echo', 'Fox', 'Golf', 'Hotel', 'India', 'Juliet'];
    let soft = 0;
    for (const seed0 of [11, 12, 13]) {
      let seed = seed0;
      const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      for (let t = 0; t < 200; t++) {
        const n = 4 + Math.floor(rnd() * 6);
        const ns = names.slice(0, n);
        const lines = [];
        const groups = [];
        const kind = rnd();
        if (kind < 0.33) {
          lines.push('- One `c2`');
          for (const x of ns.slice(0, 3)) lines.push(`  - ${x}`);
          groups.push('One');
          for (const x of ns.slice(3)) lines.push(`- ${x}`);
        } else if (kind < 0.66) {
          lines.push('- Outer `c3`', `  - ${ns[0]}`, '  - Inner `c5`');
          for (const x of ns.slice(1, 3)) lines.push(`    - ${x}`);
          groups.push('Outer', 'Inner');
          for (const x of ns.slice(3)) lines.push(`- ${x}`);
        } else for (const x of ns) lines.push(`- ${x}`);
        const ends = [...ns, ...groups];
        const e = 1 + Math.floor(rnd() * n * 1.3);
        for (let i = 0; i < e; i++) {
          const a = ends[Math.floor(rnd() * ends.length)];
          const b = ends[Math.floor(rnd() * ends.length)];
          const arrow = rnd() < 0.4 ? `-l${i}->` : rnd() < 0.5 ? '=>' : '->';
          lines.push(`- ${a} ${arrow} ${b}`);
        }
        const src = lines.join('\n');
        const { geo } = run(src);
        const q = geo.quality;
        for (const k of ['linesThroughShapes', 'linesThroughEnds', 'shapeOverlaps', 'labelsOffLine', 'endsOffBox']) assert.equal(q[k], 0, `${k} on seed ${seed0} chart ${t}:\n${src}`);
        for (const r of geo.routes) {
          for (let j = 1; j < r.points.length; j++) {
            const a = r.points[j - 1], b = r.points[j];
            assert.ok(Math.abs(a.x - b.x) < 0.05 || Math.abs(a.y - b.y) < 0.05, `${r.from}>${r.to} is diagonal on seed ${seed0} chart ${t}:\n${src}`);
          }
        }
        if (Object.values(q).some((v) => v > 0)) soft++;
      }
    }
    assert.ok(soft <= WIDE_SOFT_BUDGET, `${soft} charts missed a soft count (budget ${WIDE_SOFT_BUDGET})`);
  });
});

describe('graph-layout — the routing rules', () => {
  // Side balance (owner's call on #2385): a line whose target lies wholly beyond a flank
  // of its source leaves by that flank, from its middle when alone there; lines to
  // targets straight ahead keep the flow side as a nested fan.
  const side = (p, b) => {
    const d = { left: Math.abs(p.x - b.x), right: Math.abs(p.x - b.x - b.w), top: Math.abs(p.y - b.y), bottom: Math.abs(p.y - b.y - b.h) };
    return Object.keys(d).reduce((m, k) => (d[k] < d[m] ? k : m));
  };

  test('a shape that many lines leave balances them over its sides, each on its own port', () => {
    // The owner's report on the line-vocabulary slide: six lines crowded one side of
    // Service (first 5 units apart, some doubling back), then all six on that one side.
    const src = '- Service\n  - => Main database\n  - -reads-> Cache\n  - -> Search index\n  - -> Audit log\n  - -> Legacy API\n  - <-> Partner API';
    const geo = run(src, K, { dir: 'lr' }).geo;
    const s = geo.nodes.service;
    const by = Object.fromEntries(geo.routes.map((r) => [r.to, side(r.points[0], s)]));
    assert.deepEqual(by, { 'main-database': 'top', cache: 'top', 'search-index': 'right', 'audit-log': 'right', 'legacy-api': 'bottom', 'partner-api': 'bottom' });
    for (const k of ['top', 'right', 'bottom']) {
      const cs = geo.routes.filter((r) => by[r.to] === k).map((r) => (k === 'right' ? r.points[0].y : r.points[0].x)).sort((a, b) => a - b);
      for (let i = 1; i < cs.length; i++) assert.ok(cs[i] - cs[i - 1] >= 12, `${k} ports ${cs.join(', ')}`);
    }
    for (const r of geo.routes) assert.equal(r.points[r.points.length - 1].x, geo.nodes[r.to].x, `${r.to} is entered from its near side`);
    assert.equal(geo.crossings, 0);
  });

  test('a fan with several children a side mirrors itself', () => {
    for (const n of [2, 4, 6]) {
      const kids = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Echo', 'Fox'].slice(0, n).join(' & ');
      const geo = run(`- Ops\n  - -- ${kids}`, K, { dir: 'tb' }).geo;
      const cx = geo.nodes.ops.cx;
      const rs = geo.routes.slice().sort((a, b) => geo.nodes[a.to].cx - geo.nodes[b.to].cx);
      rs.forEach((r, i) => {
        const m = rs[rs.length - 1 - i].points.map((q) => [Math.round(2 * cx - q.x), Math.round(q.y)]);
        assert.deepEqual(r.points.map((q) => [Math.round(q.x), Math.round(q.y)]), m, `${n} children: ${r.to} mirrors its partner`);
      });
    }
  });

  test('an org chart pair hangs from its parent\'s side middles', () => {
    // The owner's call: Controller and Planning connect to Finance's left and right middles.
    for (const dir of ['tb', 'lr']) {
      const geo = run('- Finance\n  - -- Controller & Planning', K, { dir }).geo;
      const f = geo.nodes.finance;
      const got = geo.routes.map((r) => r.points[0]).map((p) => [side(p, f), dir === 'tb' ? p.y === f.cy : p.x === f.cx]).sort();
      assert.deepEqual(got, dir === 'tb' ? [['left', true], ['right', true]] : [['bottom', true], ['top', true]], JSON.stringify(geo.routes.map((r) => r.points)));
    }
  });

  test('every route is orthogonal: each run is horizontal or vertical', () => {
    for (const src of Object.values(GALLERY)) {
      for (const r of run(src).geo.routes) {
        for (let j = 1; j < r.points.length; j++) {
          const a = r.points[j - 1], b = r.points[j];
          assert.ok(Math.abs(a.x - b.x) < 0.05 || Math.abs(a.y - b.y) < 0.05, `${r.from}>${r.to} run ${j} is diagonal`);
        }
      }
    }
  });

  test('a line into a group its source is not in turns OUTSIDE that group', () => {
    const { geo } = run(GALLERY.system, K, { dir: 'lr' });
    const partners = geo.groups.partners;
    for (const r of geo.routes.filter((x) => x.to === 'carriers' || x.to === 'card-networks')) {
      const turn = r.points[r.points.length - 2];
      assert.ok(turn.x < partners.x, `${r.from}>${r.to} turns at x=${turn.x}, inside Partners (x=${partners.x})`);
    }
  });

  test('no jog is folded back into its source box', () => {
    for (const src of Object.values(GALLERY)) {
      const { geo } = run(src);
      for (const r of geo.routes) {
        const box = geo.nodes[r.from];
        if (!box || r.points.length < 2) continue;
        const p = r.points[1];
        const inside = p.x > box.x + 0.5 && p.x < box.x + box.w - 0.5 && p.y > box.y + 0.5 && p.y < box.y + box.h - 0.5;
        assert.ok(!inside, `${r.from}>${r.to} doubles back into ${r.from}`);
      }
    }
  });

  test('a group title takes a slot in its top band that no line crosses', () => {
    const { geo } = run(GALLERY.system, K, { dir: 'lr' });
    for (const [id, t] of Object.entries(geo.titles)) {
      const g = geo.groups[id];
      assert.ok(t.x >= g.x && t.x + t.w <= g.x + g.w, `${id} title leaves its group`);
      assert.ok(t.y >= g.y && t.y + t.h <= g.y + 30, `${id} title leaves the top band`);
    }
  });
});

describe('graph-layout — what review found (#2385)', () => {
  const DIRS = [undefined, 'lr', 'tb'];
  const hard = (q) => ({ linesThroughShapes: q.linesThroughShapes, linesThroughEnds: q.linesThroughEnds, sharedRuns: q.sharedRuns, endsOffBox: q.endsOffBox });
  const CLEAN = { linesThroughShapes: 0, linesThroughEnds: 0, sharedRuns: 0, endsOffBox: 0 };

  test('a line the spread cannot reroute keeps its old route rather than break a never-rule', () => {
    // The red team's cases: the spread's fallback slid a line's ends without a check, into
    // Delta's box (tb) and 1.5 units from another line (auto).
    const through = '- Grp0 `c2`\n  - Alpha\n- Grp1 `c3`\n  - Beta\n- Grp2 `c4`\n  - Gamma\n  - Delta\n- Echo -> Echo\n- Grp0 -x-> Gamma\n- Alpha => Grp2\n- Alpha -lab3-> Echo\n- Beta => Echo\n- Gamma -> Alpha\n- Alpha -a much longer label here-> Beta';
    const shared = '- Alpha\n- Echo `diamond`\n- Fox `circle`\n- Golf `pill`\n- Hotel `circle`\n- Kilo `pill`\n- Lima\n- Fox -> Gamma\n- Alpha -> Hotel\n- Beta -- Juliet\n- Fox -ok-> Alpha\n- Golf <- Alpha\n- Alpha => Fox\n- Alpha <- Juliet\n- Alpha -> Fox\n- Alpha -lab12-> Hotel\n- Alpha <-> India\n- Kilo -> Gamma\n- India => Beta\n- Hotel <- Kilo\n- Echo <-> Echo';
    for (const src of [through, shared]) for (const dir of DIRS) assert.deepEqual(hard(run(src, K, dir ? { dir } : {}).geo.quality), CLEAN, `${dir || 'auto'}:\n${src}`);
  });

  test('past its first and last runs, no line comes within 5 units of its own boxes', () => {
    // A5.88: the second Beta => Delta left Beta backwards and ran 1 unit inside its top border.
    const src = '- Alpha\n- Beta\n- Gamma\n- Delta\n- Echo\n- Fox\n- Golf\n- Beta => Echo\n- Delta => Echo\n- Alpha -lab3-> Golf\n- Delta -> Beta\n- Beta => Delta\n- Beta => Delta\n- Gamma => Alpha';
    for (const dir of DIRS) {
      const { geo } = run(src, K, dir ? { dir } : {});
      for (const r of geo.routes) {
        if (r.from === r.to) continue;
        for (const id of [r.from, r.to]) {
          const b = geo.nodes[id];
          if (!b) continue;
          for (let j = 2; j < r.points.length - 1; j++) {
            const a = r.points[j - 1], q = r.points[j];
            const near = Math.max(a.x, q.x) > b.x - 5 && Math.min(a.x, q.x) < b.x + b.w + 5 && Math.max(a.y, q.y) > b.y - 5 && Math.min(a.y, q.y) < b.y + b.h + 5;
            assert.ok(!near, `${dir || 'auto'}: ${r.from}>${r.to} run ${j} rides ${id}: ${JSON.stringify(r.points)}`);
          }
        }
      }
    }
  });

  test('every end sits on its box, even where a side is crowded', () => {
    // A5.80: the spread's one-sided clamp left Beta's line ending 31 units above Alpha.
    const src = '- Alpha\n- Beta\n- Gamma\n- Delta\n- Echo\n- Fox\n- Golf\n- Beta -lab0-> Alpha\n- Echo -lab1-> Gamma\n- Golf -lab3-> Alpha\n- Golf -> Alpha';
    for (const dir of DIRS) assert.equal(run(src, K, dir ? { dir } : {}).geo.quality.endsOffBox, 0, dir || 'auto');
  });

  test('three self-loops nest on their box: ends on it, no crossing, no shared run', () => {
    for (const dir of ['lr', 'tb']) {
      const { geo } = run('- Alpha\n- Beta\n- Alpha -> Beta\n- Alpha -> Alpha\n- Alpha -> Alpha\n- Alpha -> Alpha', K, { dir });
      const b = geo.nodes.alpha;
      const loops = geo.routes.filter((r) => r.from === r.to);
      assert.equal(loops.length, 3);
      for (const r of loops) {
        for (const q of [r.points[0], r.points[r.points.length - 1]]) {
          const onSide = (Math.abs(q.x - b.x - b.w) < 0.6 && q.y > b.y && q.y < b.y + b.h) || ((Math.abs(q.y - b.y) < 0.6 || Math.abs(q.y - b.y - b.h) < 0.6) && q.x > b.x && q.x < b.x + b.w);
          assert.ok(onSide, `${dir}: a loop end at ${JSON.stringify(q)} is off Alpha ${JSON.stringify(b)}`);
        }
      }
      assert.equal(geo.quality.sharedRuns, 0, dir);
      assert.equal(geo.crossings, 0, `${dir}: ${JSON.stringify(geo.routes.map((r) => r.points))}`);
    }
  });

  test('a self-loop with a long label keeps it clear of every shape', () => {
    // The checker's case: the solver seated a loop label that overhangs its hook on Poll
    // and Done; the parent seated it on the hook's outer run.
    for (const dir of ['lr', 'tb']) assert.equal(run('- Start -> Poll\n- Poll -retry later-> Poll\n- Poll -> Done', K, { dir }).geo.quality.labelCollisions, 0, dir);
  });

  test('a narrow group keeps a slot for its title when a line crosses its band', () => {
    // A269 forced to tb: a line up through the band left no slot as wide as the title.
    const src = '- Grp One `c2`\n  - Alpha\n  - Beta\n  - Gamma\n- Delta\n- Echo\n- Fox\n- Echo -> Alpha\n- Gamma -> Echo\n- Gamma -lab5-> Echo\n- Gamma => Fox\n- Alpha -> Beta';
    for (const dir of DIRS) assert.equal(run(src, K, dir ? { dir } : {}).geo.quality.linesThroughTitles, 0, dir || 'auto');
  });

  test('a diamond is met at its tips', () => {
    // The owner's call: a line into or out of a diamond ends on one of its four points,
    // and a diamond's lines spread over those points before any lands off one. The
    // incident chart's decision, and a straight line into a diamond whose middle sits
    // off the source's (the payments map's Fraud checks).
    for (const src of [GALLERY.incident, '- Payments\n- Fraud checks `diamond`\n- Card networks\n- Payments -screens-> Fraud checks\n- Payments -> Card networks']) {
      for (const dir of DIRS) {
        const { m, geo } = run(src, K, dir ? { dir } : {});
        const tips = new Set(m.shapes.filter((x) => x.shape === 'diamond').map((x) => x.id));
        for (const r of geo.routes) {
          for (const [q, id] of [[r.points[0], r.from], [r.points[r.points.length - 1], r.to]]) {
            if (!tips.has(id)) continue;
            const b = geo.nodes[id];
            const tip = [[b.x, b.cy], [b.x + b.w, b.cy], [b.cx, b.y], [b.cx, b.y + b.h]].some(([x, y]) => Math.abs(q.x - x) < 1 && Math.abs(q.y - y) < 1);
            assert.ok(tip, `${dir || 'auto'}: ${r.from}>${r.to} meets ${id} at ${JSON.stringify(q)}, off its tips`);
          }
        }
      }
    }
  });

  test('a dense chart past the work budget still draws with no line through a box', () => {
    // Eight shapes, every one of the 56 lines between them: 7.5 s before the budget. Past
    // it the refinements stop, so a few lines keep a shared run the spread could not
    // clear: 3, against the parent router's 15 (a ratchet).
    const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Echo', 'Fox', 'Golf', 'Hotel'];
    const lines = [];
    for (const a of names) for (const b of names) if (a !== b) lines.push(`- ${a} -> ${b}`);
    const q = run(lines.join('\n')).geo.quality;
    assert.deepEqual({ ...hard(q), sharedRuns: 0 }, CLEAN);
    assert.ok(q.sharedRuns <= 3, `${q.sharedRuns} shared runs`);
  });
  test('an lr group keeps room for its title above its top shape', () => {
    // The typing deck's Services slide: dagre never reads a group's padding, and in a
    // compact lr chart its top gap was less than the title's height, so Browser and
    // Inventory sat on the Edge and Delivery titles (Pricing on Commerce too, at the
    // painter's own sizes).
    const src = [
      '- Edge `c1`', '  - Browser `io`', '  - CDN', '  - Gateway',
      '- Commerce `c2`', '  - Cart', '  - Pricing', '  - Checkout', '  - Orders `cylinder`',
      '- Payments `c3`', '  - Payment API', '  - Fraud `diamond`', '  - Ledger `cylinder`',
      '- Delivery `c4`', '  - Inventory `cylinder`', '  - Shipping', '  - Email',
      '- Browser -> CDN => Gateway', '- Gateway => Cart => Checkout', '- Cart -prices-> Pricing',
      '- Checkout => Payment API', '- Payment API -screen-> Fraud', '- Fraud -ok-> Ledger',
      '- Fraud -review-> Checkout', '- Payment API => Orders', '- Orders -reserve-> Inventory',
      '- Orders => Shipping', '- Shipping -notify-> Email', '- Ledger -nightly-> Orders `dotted`',
    ].join('\n');
    const compact = { node: 20, rank: 40, edge: 10, groupPad: 10, groupPadTop: 26, lane: 7 };
    for (const spacing of [compact, undefined]) for (const dir of DIRS) {
      const { geo } = run(src, K, { ...(dir ? { dir } : {}), ...(spacing ? { spacing } : {}) });
      assert.equal(geo.quality.titlesUnderShapes, 0, `${dir || 'auto'} ${spacing ? 'compact' : 'default'}`);
      assert.equal(geo.quality.shapeOverlaps, 0);
    }
  });
  test('the title band never carries a shape outside the group level with its title', () => {
    // The checker's fuzz chart: a band moved Gamma (in Inner) down whole, level with Deep's
    // title, and the router then ran Fox -> Gamma through it.
    const src = '- Outer `c3`\n  - Alpha\n  - Inner `c5`\n    - Beta\n    - Gamma\n    - Deep `c4`\n      - Delta\n- Echo\n- Fox\n- Golf\n- Hotel\n- Echo => Echo\n- Fox -l1-> Gamma\n- Outer => Delta\n- Fox => Delta\n- Deep -l4-> Gamma\n- Fox -> Hotel\n- Delta -> Delta\n- Fox -> Fox\n- Alpha => Outer\n- Delta -> Delta';
    for (const dir of DIRS) {
      const q = run(src, K, dir ? { dir } : {}).geo.quality;
      assert.equal(q.linesThroughTitles, 0, dir || 'auto');
      assert.equal(q.titlesUnderShapes, 0, dir || 'auto');
    }
  });
});
