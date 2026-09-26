/**
 * Unit: the chart family's shared graph layout + elbow router
 * (lib/components/chart/_chart-family/graph-layout.js).
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
 *   5. THE RULES the passes implement, checked as geometry rather than as counts.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

require('../../../lib/core/dagre-layout.js');
const { graphLayoutKernel } = require('../../../lib/components/chart/_chart-family/graph-layout.js');
const { parseFlowchart, outlineFromMarkdown } = require('../../../lib/core/flowchart-grammar');

const dagre = globalThis.__latticeDagre;
const K = graphLayoutKernel();
const STAGE = { w: 1072, h: 440 };
// 4, not the 2 it was: `sharedRuns` now counts two runs within 6 units (it was 4), because
// the demo deck showed two lines 4.5 units apart reading as one. Measured on this corpus with
// the same router, the old 4-unit rule still reads 2 misses; the stricter rule reads 4. The
// ruler moved, not the router. Then 1: the crossing pass cleared three more.
const SOFT_MISS_BUDGET = 1;
// The wider corpus below: 7 of its 600 charts miss a soft count (mostly two labels crowding
// on a group's lines), measured when the corpus was added. Lower it as the router improves.
const WIDE_SOFT_BUDGET = 7;
// Line crossings on the 1,000-chart corpus: 923 before the router's crossing solver, 230
// with it, 195 once it also ran a second order (freest lines first, keep each line's sides
// and ports, allow a straight drop) and kept whichever run crossed less. Then the router
// stopped drawing lines that fold back through their own start or end box
// (`linesThroughEnds`, now a hard zero; 22 across three directions before) and lines that
// graze a stranger's box within 5 units (24 -> 8), and fanning shapes grew to give each
// line its own port (routeFans): 180. Nine charts pay a crossing for a fold or a graze
// removed; one flips direction on the type-size rule and reads 0 -> 2. A crossing is a
// cost, not a defect, so this is a ceiling to ratchet down, never a zero.
const CROSSING_BUDGET = 180;

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
  incident: `- Alert fires \`:pill\`
  - => Auto-triage => Severity?
- Severity? \`:diamond\`
  - =SEV1=> Page on-call
  - -SEV2-> Open ticket
  - -SEV3-> Backlog \`:dotted\`
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
- Postmortem \`:doc\``,
  flat: `- Alert fires \`:pill\` => Auto-triage => Severity?
- Severity? \`:diamond\`
  - =SEV1=> Page on-call
  - -SEV2-> Open ticket -> Mitigate
  - -SEV3-> Backlog \`:dotted\`
- Page on-call \`fail\` =ack=> Mitigate => Postmortem
  > Pages the secondary after 5 minutes.
- Platform \`:c2\`
  - Storefront => Payments
  - Payments -screens-> Fraud checks
  - -ships via-> Carriers`,
  org: `- Chief executive \`:c1\`
  - -- Finance & Technology & Operations
- Finance
  - -- Controller & Planning
- Technology
  - -- Platform & Product engineering & Security
- Operations
  - -- Support & Logistics
- Security \`:c4\`
  - -advises-> Finance \`:dotted:loose\``,
  dataflow: `- Sources \`:c1\`
  - Web events \`:io\`
  - Mobile events \`:io\`
  - Billing DB \`:cylinder\`
  - => Ingest queue
- Pipeline \`:c2\`
  - Ingest queue
    - => Stream processor
  - Stream processor
    - -enrich-> Feature store
    - => Warehouse
  - Feature store \`:cylinder\`
  - Warehouse \`:cylinder\`
    - -> BI dashboards
    - -nightly-> ML training
- BI dashboards \`:doc\`
- ML training
  - -models-> Feature store`,
  system: `- Customers \`:c1\`
  - Shopper \`:circle\`
    - -browses-> Storefront
  - Merchant \`:circle\`
    - -lists items-> Storefront
- Platform \`:c2\`
  - Storefront
    - => Payments
  - Payments
    - -screens-> Fraud checks
    - <-> Card networks
  - Fraud checks \`:diamond\`
  - -ships via-> Carriers
- Partners \`:c3\`
  - Card networks \`:square\`
  - Carriers \`:square\`
- Regulators \`:doc\``,
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

const ZERO = { linesThroughShapes: 0, linesThroughEnds: 0, labelCollisions: 0, shapeOverlaps: 0, labelsOffLine: 0, linesThroughTitles: 0, labelsAcrossBorders: 0, sharedRuns: 0 };

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
    for (const src of Object.values(GALLERY)) {
      const a = JSON.stringify(run(src).geo);
      for (let i = 0; i < 3; i++) assert.equal(JSON.stringify(run(src).geo), a);
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
const KNOWN = {
  // A group's line to a shape placed BESIDE the group: dagre reserved the label's room
  // along the representative member's rank, and the trim at the group's border leaves
  // a run shorter than the label, so it straddles the border. The fix is to reserve that
  // room in the layout itself (decision note §12, "Group lines beside their group").
  // This chart's own direction is lr, where it reads zero; only a forced tb misses.
  'flat · tb': { labelsAcrossBorders: 1 },
};

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
    const HARD = ['linesThroughShapes', 'linesThroughEnds', 'shapeOverlaps', 'labelsOffLine'];
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
          lines.push('- Grp One `:c2`');
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
          lines.push('- One `:c2`');
          for (const x of ns.slice(0, 3)) lines.push(`  - ${x}`);
          groups.push('One');
          for (const x of ns.slice(3)) lines.push(`- ${x}`);
        } else if (kind < 0.66) {
          lines.push('- Outer `:c3`', `  - ${ns[0]}`, '  - Inner `:c5`');
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
        for (const k of ['linesThroughShapes', 'linesThroughEnds', 'shapeOverlaps', 'labelsOffLine']) assert.equal(q[k], 0, `${k} on seed ${seed0} chart ${t}:\n${src}`);
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
  test('a shape that many lines leave fans them from one side, each on its own port', () => {
    // The owner's report on the demo deck's line-vocabulary slide: six lines off one box
    // 42 units tall were squeezed 5 units apart; two shared a port, two doubled back into
    // their target's far side and one left by the source's back.
    const src = '- Service\n  - => Main database\n  - -reads-> Cache\n  - -> Search index\n  - -> Audit log\n  - -> Legacy API\n  - <-> Partner API';
    const geo = run(src, K, { dir: 'lr' }).geo;
    const s = geo.nodes.service;
    const starts = geo.routes.map((r) => r.points[0]);
    for (const p of starts) assert.equal(p.x, s.x + s.w, 'every line leaves the side that faces its target');
    const ys = starts.map((p) => p.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 12, `ports ${ys.join(', ')}`);
    for (const r of geo.routes) {
      const t = geo.nodes[r.to], end = r.points[r.points.length - 1];
      assert.equal(end.x, t.x, `${r.to} is entered from its near side`);
    }
    assert.equal(geo.crossings, 0);
  });

  test('a fan with several children a side mirrors itself', () => {
    for (const n of [4, 6]) {
      const kids = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Echo', 'Fox'].slice(0, n).join(' & ');
      const { routes } = run(`- Ops\n  - -- ${kids}`, K, { dir: 'tb' }).geo;
      const turns = routes.slice().sort((a, b) => a.points[a.points.length - 1].x - b.points[b.points.length - 1].x).map((r) => r.points[1].y);
      assert.deepEqual(turns, turns.slice().reverse(), `turns ${turns.join(', ')}`);
    }
  });

  test('a fan that splits both ways turns at one height, so an org chart hangs symmetrically', () => {
    // The owner's report on the demo deck: Operations' two children dropped 15 and 23
    // units before turning, because two jogs that only touched at their shared port
    // were treated as overlapping.
    for (const dir of ['tb', 'lr']) {
      const { routes } = run('- Operations\n  - -- Support & Logistics', K, { dir }).geo;
      assert.equal(routes.length, 2);
      const turn = (r) => (dir === 'tb' ? r.points[1].y : r.points[1].x);
      assert.equal(turn(routes[0]), turn(routes[1]), JSON.stringify(routes.map((r) => r.points)));
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
