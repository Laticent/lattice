/**
 * Unit: Trama's radial kernel (engineering/decisions/2026-10-05-trama-radial-layout.md).
 * It lays out circles, bands and label boxes and knows nothing of what they mean, so these
 * tests drive it with plain numbers. Hub-spoke's own suite (test/unit/components/
 * hub-spoke.test.js) holds the chart's invariants through the kernel; this one holds the
 * kernel's contract on its own.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { radialLayoutKernel } = require('@laticent/trama');

const K = radialLayoutKernel();
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('trama radial — the build under test', () => {
  test('dist/ is newer than every Trama source, so these tests run the code on disk', () => {
    // Engine callers load the BUILT dist/, which is not committed. After an edit to a .ts
    // file without `npm run trama-lib:build`, every test here would run the old kernel and
    // could pass.
    const dir = path.join(__dirname, '../../../docs/src/lib/trama');
    const built = fs.statSync(path.join(dir, 'dist/index.cjs')).mtimeMs;
    const stale = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && fs.statSync(path.join(dir, f)).mtimeMs > built);
    assert.deepEqual(stale, [], 'run `npm run trama-lib:build`: dist/ is older than these sources');
  });
});

describe('trama radial — what it knows', () => {
  test('no chart vocabulary in the kernel code: it arranges circles, never hubs or flows', () => {
    // The owner's rule: Trama knows HOW to arrange boxes, never what they mean. Comments may
    // name the first adapter; code may not borrow its words. TypeScript's own scanner reads
    // the tokens, so a comment marker inside a string cannot hide code, and every identifier
    // and string is split into words (`hubCount`, `HUB_R`, `leaf-gap`) before the check. It
    // catches words, not policy: a constant tuned for one chart passes it.
    const ts = require('typescript');
    const src = fs.readFileSync(path.join(__dirname, '../../../docs/src/lib/trama/radial.ts'), 'utf8');
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, src);
    const K = ts.SyntaxKind;
    const texts = [];
    for (let t = scanner.scan(); t !== K.EndOfFileToken; t = scanner.scan()) {
      if (t === K.Identifier || t === K.StringLiteral || t === K.NoSubstitutionTemplateLiteral || t === K.TemplateHead) texts.push(scanner.getTokenValue());
      else if (t === K.CloseBraceToken) {
        // Inside a template, `}` resumes the literal; rescan to read its text.
        const r = scanner.reScanTemplateToken(false);
        if (r === K.TemplateMiddle || r === K.TemplateTail) texts.push(scanner.getTokenValue());
      }
    }
    const words = texts.flatMap((t) => t.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z]+/)).map((w) => w.toLowerCase()).filter(Boolean);
    const borrowed = /^(hubs?|spokes?|branch(es)?|lea(f|ves)|twigs?|flows?|status(es)?|alarms?|satellites?)$/;
    assert.deepEqual(words.filter((w) => borrowed.test(w)), []);
  });
});

describe('trama radial — ring', () => {
  test('places n points, split into a right and a left wing, the same way every call', () => {
    for (const n of [1, 2, 3, 4, 7, 12]) {
      const pts = K.ring(n, 200, 80);
      assert.equal(pts.length, n);
      const right = pts.filter((p) => p[0] > 0).length;
      assert.ok(right >= Math.floor(n / 2), `n=${n}: ${right} on the right`);
      assert.deepEqual(K.ring(n, 200, 80), pts);
    }
  });

  test('every point of a wide ring lies on its ellipse', () => {
    for (const p of K.ring(8, 200, 80)) {
      const e = (p[0] / 200) ** 2 + (p[1] / 80) ** 2;
      assert.ok(Math.abs(e - 1) < 1e-9, `off the ellipse by ${e - 1}`);
    }
  });
});

describe('trama radial — star', () => {
  const spec = (over = {}) => ({
    n: 6, W: 544, half: 96, pad: 4, tall: false, cone: K.conesFor(6, false)[0], minNeck: 24,
    rs0: 18, rsMin: 9, labelW: [60, 60, 60, 60, 60, 60], halo: [0, 0, 4.4, 0, 0, 0],
    floor: (i) => 24 + (i === 2 ? 4.4 : 0),
    radiiAt: (rs) => Array.from({ length: 6 }, () => ({ r: rs, clamped: false })),
    centerAt: (rs) => rs * 2,
    centerCeil: (r) => Math.max(...r) * 3,
    ...over,
  });

  test('a roomy star settles clean: every band keeps its floor and no two circles crowd', () => {
    const s = spec();
    const { T, Rh, bad } = K.solveStar(s);
    assert.deepEqual(bad, []);
    T.pts.forEach((p, i) => {
      assert.ok(Math.hypot(p[0], p[1]) - Rh - T.r[i] >= s.floor(i), `node ${i} under its floor`);
      for (let j = i + 1; j < T.pts.length; j++) assert.ok(dist(p, T.pts[j]) > T.r[i] + T.r[j], `${i} and ${j} overlap`);
    });
    assert.ok(Rh <= s.centerCeil(T.r), 'the center grew past its ceiling');
  });

  test('a star that cannot fit says which floors it broke, rather than shrinking past rsMin', () => {
    const s = spec({ half: 20, rsMin: 12 });
    const { rsMax, bad } = K.solveStar(s);
    assert.ok(bad.length > 0);
    assert.equal(rsMax, 12);
  });
});

describe('trama radial — labels', () => {
  const scene = (stageW) => {
    const nodes = [[-120, 0], [120, -40], [120, 40]].map(([x, y], i) => ({ id: `n${i}`, cx: x, cy: y, r: 12, side: x > 0 ? 1 : -1, prio: Math.abs(y), lb: { w: 50, h: 12 } }));
    const obstacles = [{ kind: 'circle', x: 0, y: 0, r: 30, self: 'center' }];
    for (const it of nodes) {
      obstacles.push({ kind: 'seg', x0: 0, y0: 0, x1: it.cx, y1: it.cy, w: 8, self2: it.id });
      obstacles.push({ kind: 'circle', x: it.cx, y: it.cy, r: it.r, node: it.id });
    }
    return { nodes, obstacles, stage: { l: -stageW / 2, r: stageW / 2, t: -90, b: 90 } };
  };

  test('places every label clear of every circle, band and other label', () => {
    const { nodes, obstacles, stage } = scene(420);
    const { placed, unresolved } = K.placeLabels(nodes, obstacles, stage);
    assert.equal(unresolved, 0);
    for (const p of placed) {
      for (const o of obstacles) if (o.kind === 'circle') assert.ok(!K.rectHitsCircle(p.R, o), `${p.it.id} touches a circle`);
      for (const q of placed) if (q !== p) assert.ok(!K.rectHitsRect(p.R, q.R), `${p.it.id} touches ${q.it.id}`);
      assert.ok(p.R.l >= stage.l && p.R.r <= stage.r, `${p.it.id} leaves the stage`);
    }
  });

  test('reports a label it cannot place instead of hiding it', () => {
    const { nodes, obstacles, stage } = scene(250);
    const { unresolved } = K.placeLabels(nodes, obstacles, stage);
    assert.ok(unresolved > 0);
  });

  test('refuses input it would otherwise report as cleanly placed', () => {
    const { nodes, obstacles, stage } = scene(420);
    assert.throws(() => K.placeLabels(nodes, obstacles, { ...stage, colR: 150 }), /colL/);
    assert.throws(() => K.placeLabels([{ ...nodes[0], lb: { w: Number.NaN, h: 12 } }], obstacles, stage), /n0/);
    assert.throws(() => K.bandPath(5, 5, 2, 5, 5, 2, 4), /distinct/);
  });

  test('passes a host\'s own fields through on each placed item', () => {
    const { nodes, obstacles, stage } = scene(420);
    const tagged = nodes.map((n, i) => ({ ...n, mine: i }));
    const { placed } = K.placeLabels(tagged, obstacles, stage);
    assert.deepEqual(placed.map((p) => p.it.mine).sort(), [0, 1, 2]);
  });
});

describe('trama radial — two rings', () => {
  const spec = {
    counts: [2, 3, 2], gaps: 1.2, rIn: 13, rOut: 7,
    haloIn: [0, 0, 0], haloOut: [[0, 0], [0, 0, 0], [0, 0]],
    floorIn: [18, 18, 18], floorOut: [[8, 8], [8, 8, 8], [8, 8]], gapIn: 6, gapOut: 2,
  };

  test('finds a clean arrangement and carries the chosen rung\'s own fields', () => {
    const rings = K.twoRings(spec);
    const ladder = [{ R: 34, tag: 'big' }, { R: 28, tag: 'mid' }, { R: 22, tag: 'small' }];
    const { G } = rings.search(0.5, 230, 85, ladder, [[0.52, 0.62], [0.58, 0.66]], ['arc', 'angle']);
    assert.deepEqual(G.bad, []);
    assert.ok(['big', 'mid', 'small'].includes(G.tag));
    G.geo.forEach((g, i) => {
      assert.equal(g.children.length, spec.counts[i]);
      assert.ok(Math.hypot(g.x, g.y) - G.R - spec.rIn >= spec.floorIn[i] - 0.01, `inner node ${i} under its floor`);
      for (const c of g.children) assert.ok(Math.hypot(c.x - g.x, c.y - g.y) - spec.rIn - spec.rOut >= 8 - 0.01, `a child of ${i} under its floor`);
    });
  });

  test('splits the groups into two wings as close to half as it can', () => {
    assert.equal(K.twoRings(spec).cut, 2);
    assert.equal(K.twoRings({ ...spec, counts: [5], haloIn: [0], haloOut: [[0, 0, 0, 0, 0]], floorIn: [18], floorOut: [[8, 8, 8, 8, 8]] }).cut, 1);
  });
});

describe('trama radial — bands and heads', () => {
  test('a head toward the end circle sits setBack off it, and one toward the start likewise', () => {
    const heads = K.bandHeads(0, 0, 20, 100, 0, 10, 8, true, true, 0.6);
    assert.deepEqual(heads.map((h) => h.to), ['end', 'start']);
    const tip = (d) => d.match(/^M([-\d.]+),([-\d.]+)/).slice(1).map(Number);
    assert.deepEqual(tip(heads[0].d), [89.4, 0]);
    assert.deepEqual(tip(heads[1].d), [20.6, 0]);
  });
});
