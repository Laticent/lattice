/**
 * graph-layout — the chart family's shared graph layout and elbow router: dagre places
 * the boxes, this routes the lines. First consumer: the flowchart. Written so the state
 * chart can adopt it later (engineering/decisions/2026-09-25-flowchart-authoring.md §7
 * and §14).
 *
 * ONE SELF-CONTAINED FUNCTION, ON PURPOSE. A chart's browser pass is shipped as
 * `fn.toString()` source (the state chart's `STATE_CHART_BROWSER_JS`), so it can import
 * nothing. `graphLayoutKernel` defines every helper inside itself and closes over nothing
 * outside, so a pass embeds it as source and Node tests call it directly. Keep it that
 * way: a reference to anything outside this function body breaks every export that
 * serializes it, and only the serialization test notices.
 *
 * WHY THE LINES NEVER CROSS A SHAPE. dagre routes an edge that spans several ranks
 * through one dummy node per rank it crosses, and a dummy node takes a slot in that rank's
 * order like any real node, so it never sits on one. The router keeps every horizontal run
 * (in `lr`; vertical in `tb`) on those points and puts every jog in the GAP between ranks,
 * which holds no shape. The prototype drew one elbow per edge and ignored the points,
 * which is exactly how its lines cut through shapes.
 *
 * WHY LABELS NEVER COLLIDE. A labeled edge hands dagre its label's measured box
 * (`labelpos: 'c'`), so dagre reserves a slot for it the same way. The line runs through
 * the label's center and the painter cuts the line under the label (§5 of the note):
 * the label sits ON its own line, in space no shape and no other label holds. dagre's
 * slot is only the first guess: after ports spread and jogs straighten, `seatLabels`
 * walks each line's runs and re-seats any label that touches a shape, another label or a
 * group border, grading overlap by area so two crowded labels can step apart.
 *
 * THE CLEAN-UP PASSES, IN ORDER. `spreadPorts` gives each end on one side of a box its
 * own port; `turnOutsideForeignGroups` makes a line entering a group it does not belong
 * to turn outside it, so only its last run crosses the border; `straightenJogs` removes
 * a Z a few units tall; `separateSharedRuns` moves whatever still runs within a stroke
 * gap of another line; `seatLabels` places the labels; group titles take the first slot
 * in their band that no line or label crosses. `measureQuality` counts what is left, and
 * the unit gallery holds every count to zero.
 *
 * DETERMINISM. Nodes are keyed `n0…` in authored order, never by author text: graphlib
 * enumerates integer-like keys numerically, whatever the insertion order. Back edges are
 * decided by the grammar kernel's authored-order walk and handed to dagre already
 * reversed, so dagre's own cycle breaker never chooses. Sizes are quantized to half a
 * unit before layout. dagre itself has no randomness.
 */
function graphLayoutKernel() {
  const Q = (v) => Math.round(v * 2) / 2;
  const R1 = (v) => Math.round(v * 10) / 10;

  /** Lay out one direction. Returns the geometry, or null without dagre. */
  function layoutOnce(model, sizes, opts, dagre) {
    if (!dagre?.layout || !dagre.Graph) return null;
    const dir = opts.dir === 'tb' ? 'TB' : 'LR';
    const lr = dir === 'LR';
    const sp = opts.spacing || {};
    const g = new dagre.Graph({ multigraph: true, compound: true });
    g.setGraph({ rankdir: dir, nodesep: sp.node != null ? sp.node : 30, ranksep: sp.rank != null ? sp.rank : 60, edgesep: sp.edge != null ? sp.edge : 14, marginx: 0, marginy: 0 });
    g.setDefaultEdgeLabel(() => ({}));

    const key = new Map(); // model id → graph key
    const idOf = new Map();
    let k = 0;
    const groups = model.groups || [];
    const shapes = model.shapes || [];
    for (const gr of groups) { const gk = `g${k++}`; key.set(gr.id, gk); idOf.set(gk, gr.id); }
    for (const s of shapes) { const nk = `n${k++}`; key.set(s.id, nk); idOf.set(nk, s.id); }
    const pad = sp.groupPad != null ? sp.groupPad : 14;
    const padTop = sp.groupPadTop != null ? sp.groupPadTop : 30;
    for (const gr of groups) g.setNode(key.get(gr.id), { paddingTop: padTop, paddingBottom: pad, paddingLeft: pad, paddingRight: pad });
    for (const s of shapes) {
      const z = sizes[s.id] || { w: 96, h: 40 };
      g.setNode(key.get(s.id), { width: Q(z.w), height: Q(z.h) });
    }
    for (const x of [...groups, ...shapes]) if (x.parent && key.has(x.parent)) g.setParent(key.get(x.id), key.get(x.parent));

    // dagre cannot attach an edge to a cluster: an edge to or from a GROUP is laid out
    // between representative members (its first member in authored order, descending
    // into nested groups) and trimmed to the group's border afterwards.
    const isGroup = new Set(groups.map((x) => x.id));
    const firstLeaf = (gid) => {
      for (const s of shapes) { let p = s.parent; while (p) { if (p === gid) return s.id; p = groups.find((x) => x.id === p)?.parent; } }
      return null;
    };
    const rep = (id) => (isGroup.has(id) ? firstLeaf(id) : id);

    const edges = model.edges || [];
    const labelSizes = opts.labelSizes || {};
    const laid = [];
    edges.forEach((e, i) => {
      const a = rep(e.from), b = rep(e.to);
      if (!a || !b) return;
      const loose = !!(e.style?.loose);
      const lb = e.label ? labelSizes[i] || { w: e.label.length * 7 + 12, h: 16 } : null;
      const attrs = { weight: e.heavy ? 4 : 1, minlen: 1 };
      if (lb) { attrs.width = Q(lb.w); attrs.height = Q(lb.h); attrs.labelpos = 'c'; }
      const rec = { i, e, a, b, loose, label: lb };
      laid.push(rec);
      if (loose || a === b) return; // loose lines and self-loops are routed after layout
      // The grammar kernel already chose the back edges (authored-order walk): hand dagre
      // the reversed edge so its own cycle breaker never has to decide.
      if (e.back) g.setEdge(key.get(b), key.get(a), attrs, `e${i}`);
      else g.setEdge(key.get(a), key.get(b), attrs, `e${i}`);
    });

    dagre.layout(g);

    const box = (gk) => { const n = g.node(gk); return { x: n.x - n.width / 2, y: n.y - n.height / 2, w: n.width, h: n.height, cx: n.x, cy: n.y }; };
    const nodes = {};
    for (const s of shapes) nodes[s.id] = box(key.get(s.id));
    const gboxes = {};
    for (const gr of groups) gboxes[gr.id] = box(key.get(gr.id));

    // Ranks: dagre gives every node in one layer the same coordinate along the rank axis.
    const along = lr ? 'cx' : 'cy';
    const extent = lr ? 'w' : 'h';
    const rankPos = [...new Set(shapes.map((s) => R1(nodes[s.id][along])))].sort((p, q) => p - q);
    const rankHalf = new Map(rankPos.map((p) => [p, 0]));
    for (const s of shapes) { const n = nodes[s.id]; const p = R1(n[along]); rankHalf.set(p, Math.max(rankHalf.get(p), n[extent] / 2)); }

    // ── routing ────────────────────────────────────────────────────────────
    const P = (a, c) => (lr ? { x: a, y: c } : { x: c, y: a }); // (along, cross) → point
    const A = (pt) => (lr ? pt.x : pt.y);
    const C = (pt) => (lr ? pt.y : pt.x);

    // The gap a vertical (cross-axis) jog may use between two along-positions.
    const gapMid = (p, q) => {
      const lo = Math.min(p, q), hi = Math.max(p, q);
      let best = (lo + hi) / 2;
      for (let r = 0; r < rankPos.length - 1; r++) {
        const right = rankPos[r] + rankHalf.get(rankPos[r]);
        const left = rankPos[r + 1] - rankHalf.get(rankPos[r + 1]);
        if (right >= lo - 0.5 && left <= hi + 0.5 && left > right) { best = (right + left) / 2; break; }
      }
      return best;
    };

    // Lanes: a jog takes the free lane nearest its gap's middle, where "free" means no
    // earlier jog runs within a stroke gap of it over an overlapping stretch. Lanes stay
    // inside the gap between the ranks' boxes, so a jog never folds back into a shape.
    const taken = [];
    const lane = (mid, c0, c1) => {
      const step = sp.lane != null ? sp.lane : 8;
      let lo = -Infinity, hi = Infinity;
      for (let r = 0; r < rankPos.length - 1; r++) {
        const right = rankPos[r] + rankHalf.get(rankPos[r]);
        const left = rankPos[r + 1] - rankHalf.get(rankPos[r + 1]);
        if (mid > right - 0.5 && mid < left + 0.5) { lo = right + 6; hi = left - 6; break; }
      }
      const a0 = Math.min(c0, c1) - 2, a1 = Math.max(c0, c1) + 2;
      const free = (v) => taken.every((t) => Math.abs(t.v - v) >= step - 0.5 || t.c1 < a0 || t.c0 > a1);
      let pick = null;
      for (let k = 0; k < 64 && pick == null; k++) {
        const v = mid + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step;
        if (v >= lo && v <= hi && free(v)) pick = v;
      }
      if (pick == null) pick = Math.min(Math.max(mid, lo), hi);
      taken.push({ v: pick, c0: a0, c1: a1 });
      return pick;
    };

    const routes = [];
    for (const rec of laid) {
      const { e } = rec;
      // Route from the REPRESENTATIVE members, along dagre's crossing-free waypoints, and
      // trim the line at a group's border afterwards (routing from the group's own box
      // would start the line on the wrong side and double back across its members).
      const src = nodes[rec.a];
      const dst = nodes[rec.b];
      let pts;
      let labelAt = null;
      if (rec.a === rec.b && !isGroup.has(e.from) && !isGroup.has(e.to)) {
        // Self-loop: a hook off the far corner, outside the box.
        const n = nodes[rec.a];
        const hx = lr ? n.x + n.w : n.x + n.w;
        const hy = n.y;
        pts = lr
          ? [{ x: n.x + n.w, y: n.cy - 6 }, { x: hx + 18, y: n.cy - 6 }, { x: hx + 18, y: hy - 14 }, { x: n.cx, y: hy - 14 }, { x: n.cx, y: n.y }]
          : [{ x: n.x + n.w, y: n.cy }, { x: n.x + n.w + 18, y: n.cy }, { x: n.x + n.w + 18, y: n.y + n.h + 14 }, { x: n.cx, y: n.y + n.h + 14 }, { x: n.cx, y: n.y + n.h }];
        if (rec.label) labelAt = lr ? { x: n.cx + (hx + 18 - n.cx) / 2, y: hy - 14 } : { x: n.x + n.w + 18, y: n.cy + (n.h / 2 + 14) / 2 };
      } else if (rec.loose) {
        pts = straightElbow(src, dst);
      } else {
        const ge = g.edge(key.get(e.back ? rec.b : rec.a), key.get(e.back ? rec.a : rec.b), `e${rec.i}`);
        const raw = ge?.points ? ge.points.map((p) => ({ x: p.x, y: p.y })) : [];
        if (e.back) raw.reverse();
        if (ge && rec.label && ge.x != null) labelAt = { x: ge.x, y: ge.y };
        pts = orthogonalize(raw, src, dst, labelAt, rec.label);
      }
      if (isGroup.has(e.from)) pts = trimAtBorder(pts, gboxes[e.from], 'start');
      if (isGroup.has(e.to)) pts = trimAtBorder(pts, gboxes[e.to], 'end');
      if (labelAt && !onPath(pts, labelAt)) labelAt = onLongestRun(pts);
      routes.push({ index: rec.i, from: e.from, to: e.to, points: pts, labelAt, labelSize: rec.label, back: !!e.back, loose: rec.loose });
    }

    // Ports: several ends on one side of one box spread out along that side, ordered by
    // where their other end sits, so no two lines share a final run.
    spreadPorts(routes, { ...nodes, ...gboxes });
    for (const r of routes) r.points = simplify(r.points.map((p) => ({ x: R1(p.x), y: R1(p.y) })));
    turnOutsideForeignGroups(routes);
    straightenJogs(routes, { ...nodes, ...gboxes });
    orderFanLanes(routes);
    separateSharedRuns(routes);
    seatLabels(routes, nodes, gboxes);

    // Bounds.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (x0, y0, x1, y1) => { minX = Math.min(minX, x0); minY = Math.min(minY, y0); maxX = Math.max(maxX, x1); maxY = Math.max(maxY, y1); };
    for (const b of Object.values(nodes)) grow(b.x, b.y, b.x + b.w, b.y + b.h);
    for (const b of Object.values(gboxes)) grow(b.x, b.y, b.x + b.w, b.y + b.h);
    for (const r of routes) {
      for (const p of r.points) grow(p.x, p.y, p.x, p.y);
      if (r.labelAt && r.labelSize) grow(r.labelAt.x - r.labelSize.w / 2, r.labelAt.y - r.labelSize.h / 2, r.labelAt.x + r.labelSize.w / 2, r.labelAt.y + r.labelSize.h / 2);
    }
    if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0; }
    const m = opts.margin != null ? opts.margin : 6;
    const dx = m - minX, dy = m - minY;
    const shift = (b) => ({ ...b, x: R1(b.x + dx), y: R1(b.y + dy), cx: R1(b.cx + dx), cy: R1(b.cy + dy), w: R1(b.w), h: R1(b.h) });
    for (const id of Object.keys(nodes)) nodes[id] = shift(nodes[id]);
    for (const id of Object.keys(gboxes)) gboxes[id] = shift(gboxes[id]);
    for (const r of routes) {
      r.points = r.points.map((p) => ({ x: R1(p.x + dx), y: R1(p.y + dy) }));
      if (r.labelAt) r.labelAt = { x: R1(r.labelAt.x + dx), y: R1(r.labelAt.y + dy) };
    }
    const width = R1(maxX - minX + 2 * m), height = R1(maxY - minY + 2 * m);
    // A group's title sits in its top padding, at the first slot along that band that
    // no line and no label crosses; the painter still cuts a line under it, but the
    // gallery holds titles to none.
    const titles = {};
    const tsz = opts.groupTitleSizes || {};
    const inset = sp.titleInset != null ? sp.titleInset : 10;
    for (const gr of groups) {
      const b = gboxes[gr.id];
      const z = tsz[gr.id] || { w: gr.name.length * 7 + 8, h: 14 };
      const y = b.y + 6;
      const first = b.x + inset, last = b.x + b.w - inset - z.w;
      let pick = first;
      for (let x = first; x <= last; x += 4) {
        const box = { x: x - 6, y, w: z.w + 12, h: z.h };
        if (!routes.some((r) => pathHits(r.points, box) || (r.labelAt && r.labelSize && overlaps(labelBox(r), box)))) { pick = x; break; }
      }
      titles[gr.id] = { x: R1(pick), y: R1(y), w: R1(z.w), h: R1(z.h) };
    }
    return { dir: lr ? 'lr' : 'tb', width, height, nodes, groups: gboxes, titles, routes, quality: measureQuality(nodes, gboxes, routes, titles) };

    // ── helpers (hoisted; they close over this call's state) ─────────────────
    function orthogonalize(raw, s, t, lab, labSize) {
      // Waypoints: the source's exit, dagre's interior points, the target's entry.
      const inner = raw.length > 2 ? raw.slice(1, -1) : [];
      const exitAlong = A({ x: s.cx, y: s.cy }) + (A({ x: t.cx, y: t.cy }) >= A({ x: s.cx, y: s.cy }) ? 1 : -1) * (lr ? s.w : s.h) / 2;
      const entryAlong = A({ x: t.cx, y: t.cy }) - (A({ x: t.cx, y: t.cy }) >= A({ x: s.cx, y: s.cy }) ? 1 : -1) * (lr ? t.w : t.h) / 2;
      const sameRank = Math.abs(A({ x: s.cx, y: s.cy }) - A({ x: t.cx, y: t.cy })) < 1;
      if (sameRank) {
        // Same rank: leave through the side facing the target on the cross axis.
        const down = C({ x: t.cx, y: t.cy }) > C({ x: s.cx, y: s.cy }) ? 1 : -1;
        const sEdge = C({ x: s.cx, y: s.cy }) + down * (lr ? s.h : s.w) / 2;
        const tEdge = C({ x: t.cx, y: t.cy }) - down * (lr ? t.h : t.w) / 2;
        return [P(A({ x: s.cx, y: s.cy }), sEdge), P(A({ x: s.cx, y: s.cy }), (sEdge + tEdge) / 2), P(A({ x: t.cx, y: t.cy }), (sEdge + tEdge) / 2), P(A({ x: t.cx, y: t.cy }), tEdge)];
      }
      const way = [P(exitAlong, C({ x: s.cx, y: s.cy }))];
      for (const p of inner) way.push(P(A(p), C(p)));
      if (lab) {
        // The label's slot is a waypoint too: the line runs through the label's center.
        const la = A(lab);
        let at = way.length;
        for (let j = 1; j < way.length; j++) if (A(way[j]) > la === A(way[0]) < la) { at = j; break; }
        if (!way.some((p) => Math.abs(A(p) - la) < 1 && Math.abs(C(p) - C(lab)) < 1)) way.splice(at, 0, P(la, C(lab)));
      }
      way.push(P(entryAlong, C({ x: t.cx, y: t.cy })));
      // A label must sit on a straight run of its own line, so the jogs either side of it
      // happen OUTSIDE the label's extent: between the previous waypoint and the label's
      // near edge, and between its far edge and the next waypoint.
      const half = lab && labSize ? (lr ? labSize.w : labSize.h) / 2 + 4 : 0;
      const isLab = (p) => lab && Math.abs(A(p) - A(lab)) < 0.5 && Math.abs(C(p) - C(lab)) < 0.5;
      const out = [way[0]];
      for (let j = 1; j < way.length; j++) {
        const a = out[out.length - 1], b = way[j];
        if (Math.abs(C(a) - C(b)) < 0.5) { out.push(P(A(b), C(a))); continue; }
        const dirSign = A(b) >= A(a) ? 1 : -1;
        let mid;
        if (isLab(b)) mid = (A(a) + (A(b) - dirSign * half)) / 2;
        else if (isLab(way[j - 1])) mid = ((A(a) + dirSign * half) + A(b)) / 2;
        else mid = gapMid(A(a), A(b));
        mid = lane(mid, C(a), C(b));
        out.push(P(mid, C(a)), P(mid, C(b)), P(A(b), C(b)));
      }
      return out;
    }

    /**
     * Cut a route where it crosses a group's border: from the start (the line leaves the
     * group there) or from the end (it enters there). Orthogonal runs cross a rectangle's
     * edge at one point, found exactly per segment.
     */
    function trimAtBorder(pts, gb, which) {
      const inRect = (p) => p.x > gb.x + 0.01 && p.x < gb.x + gb.w - 0.01 && p.y > gb.y + 0.01 && p.y < gb.y + gb.h - 0.01;
      const seq = which === 'start' ? pts : pts.slice().reverse();
      let k = 0;
      while (k < seq.length - 1 && inRect(seq[k + 1])) k++;
      if (k >= seq.length - 1) return pts;
      const a = seq[k], b = seq[k + 1];
      let cut;
      if (Math.abs(a.x - b.x) < 0.05) cut = { x: a.x, y: b.y > a.y ? gb.y + gb.h : gb.y };
      else cut = { x: b.x > a.x ? gb.x + gb.w : gb.x, y: a.y };
      const out = [cut, ...seq.slice(k + 1)];
      return which === 'start' ? out : out.reverse();
    }

    /**
     * A line entering (or leaving) a group its other end is not in turns OUTSIDE that
     * group: only its final run crosses the border. Turning inside puts the run in the
     * group's padding, where it hugs the members and leaves its label nowhere to sit.
     */
    function turnOutsideForeignGroups(rs) {
      const parentOf = new Map([...groups, ...shapes].map((x) => [x.id, x.parent || null]));
      const chain = (id) => { const out = []; let p = parentOf.get(id); while (p) { out.push(p); p = parentOf.get(p); } return out; };
      const within = (q, b) => q.x > b.x && q.x < b.x + b.w && q.y > b.y && q.y < b.y + b.h;
      const used = new Map(); // "group|side" → lanes already taken there
      for (const r of rs) {
        for (const at of ['end', 'start']) {
          const pts = at === 'end' ? r.points.slice() : r.points.slice().reverse();
          const n = pts.length;
          if (n < 3) continue;
          const near = at === 'end' ? r.to : r.from, far = at === 'end' ? r.from : r.to;
          if (isGroup.has(near)) continue;
          const farChain = new Set([far, ...chain(far)]);
          // The outermost group around this end that the other end is not inside.
          const foreign = chain(near).filter((gid) => !farChain.has(gid)).pop();
          if (!foreign) continue;
          const G = gboxes[foreign];
          const turn = pts[n - 2], before = pts[n - 3], last = pts[n - 1];
          if (!within(turn, G)) continue;
          const entryHoriz = Math.abs(turn.y - last.y) < 0.05;
          const fromLow = entryHoriz ? turn.x < last.x : turn.y < last.y;
          const side = `${foreign}|${entryHoriz ? 'h' : 'v'}${fromLow ? '-' : '+'}`;
          const taken = used.get(side) || [];
          // A label rides the turn run, so a labelled run keeps half the label clear.
          const halfLabel = r.labelSize ? (entryHoriz ? r.labelSize.w : r.labelSize.h) / 2 + 6 : 0;
          const lane = Math.max(12 + 8 * taken.length, halfLabel + 8 * taken.length);
          const v = entryHoriz ? (fromLow ? G.x - lane : G.x + G.w + lane) : (fromLow ? G.y - lane : G.y + G.h + lane);
          const set = (q) => (entryHoriz ? { x: v, y: q.y } : { x: q.x, y: v });
          // The run before the turn must keep its direction, and a run that starts on
          // the far box must still start on that box's side.
          if (n > 3) {
            const pre = pts[n - 4];
            const was = entryHoriz ? before.x - pre.x : before.y - pre.y;
            const now = entryHoriz ? v - pre.x : v - pre.y;
            if (Math.abs(was) > 0.05 && (Math.sign(was) !== Math.sign(now) || Math.abs(now) < 6)) continue;
          } else {
            const fb = nodes[far] || gboxes[far];
            if (!fb) continue;
            const lo = (entryHoriz ? fb.x : fb.y) + 6, hi = (entryHoriz ? fb.x + fb.w : fb.y + fb.h) - 6;
            if (v < lo || v > hi) continue;
          }
          const next = pts.slice();
          next[n - 3] = set(before);
          next[n - 2] = set(turn);
          const clear = Object.entries(nodes).every(([id, b]) => id === r.from || id === r.to || !pathHits(next, b));
          if (!clear) continue;
          r.points = at === 'end' ? next : next.reverse();
          if (r.labelAt && !onPath(r.points, r.labelAt)) r.labelAt = onLongestRun(r.points);
          used.set(side, [...taken, v]);
        }
      }
    }

    /**
     * A Z whose jog is a few units tall reads as a mistake, not a turn. Slide one end
     * along its box side so the run is straight, when the end stays clear of the side's
     * corners and of every other port on that side, and the straight run crosses nothing.
     */
    function straightenJogs(rs, boxes) {
      const JOG = 16, CORNER = 6, PORT_GAP = 10;
      const same = (u, v) => Math.abs(u - v) < 0.05;
      const ports = (id, horiz, edge, self) => {
        const out = [];
        for (const o of rs) {
          if (o === self || o.points.length < 2) continue;
          for (const [oid, pt] of [[o.from, o.points[0]], [o.to, o.points[o.points.length - 1]]]) {
            if (oid === id && Math.abs((horiz ? pt.x : pt.y) - edge) < 0.5) out.push({ v: horiz ? pt.y : pt.x, o });
          }
        }
        return out;
      };
      // An END point may slide only along its own box side, clear of corners and ports.
      const endFits = (id, end, horiz, v, r) => {
        const bx = boxes[id];
        if (!bx) return false;
        const lo = (horiz ? bx.y : bx.x) + CORNER, hi = (horiz ? bx.y + bx.h : bx.x + bx.w) - CORNER;
        if (v < lo || v > hi) return false;
        // Two labelled horizontal runs side by side keep a label's height apart (spreadPorts).
        const need = (o) => (horiz && r.labelSize && o.labelSize ? Math.max(PORT_GAP, Math.min(r.labelSize.h, o.labelSize.h) + 1) : PORT_GAP);
        return ports(id, horiz, horiz ? end.x : end.y, r).every((u) => Math.abs(u.v - v) >= need(u.o));
      };
      for (const r of rs) {
        let changed = true;
        for (let guard = 0; changed && guard < 8; guard++) {
          changed = false;
          const pts = r.points, n = pts.length;
          for (let j = 1; j + 2 < n && !changed; j++) {
            const p0 = pts[j - 1], p1 = pts[j], p2 = pts[j + 1], p3 = pts[j + 2];
            // Runs p0→p1 and p2→p3 are parallel; p1→p2 is the short jog between them.
            const horiz = same(p0.y, p1.y) && same(p2.y, p3.y) && same(p1.x, p2.x);
            const vert = same(p0.x, p1.x) && same(p2.x, p3.x) && same(p1.y, p2.y);
            if (!horiz && !vert) continue;
            const cr = (q) => (horiz ? q.y : q.x);
            if (Math.abs(cr(p1) - cr(p2)) >= JOG) continue;
            const set = (q, v) => (horiz ? { x: q.x, y: v } : { x: v, y: q.y });
            const tries = [
              // Move the run before the jog onto the run after it…
              { at: [j - 1, j], v: cr(p2), ok: j - 1 > 0 || endFits(r.from, p0, horiz, cr(p2), r) },
              // …or the run after the jog onto the run before it.
              { at: [j + 1, j + 2], v: cr(p1), ok: j + 2 < n - 1 || endFits(r.to, p3, horiz, cr(p1), r) },
            ];
            for (const t of tries) {
              if (!t.ok) continue;
              const next = pts.slice();
              for (const k of t.at) next[k] = set(next[k], t.v);
              const clear = Object.entries(boxes).every(([id, b]) => id === r.from || id === r.to || isGroup.has(id) || !pathHits(next, b));
              if (!clear) continue;
              r.points = simplify(next);
              if (r.labelAt && !onPath(r.points, r.labelAt)) r.labelAt = onLongestRun(r.points);
              changed = true;
              break;
            }
          }
        }
      }
    }

    /**
     * Lines leaving one side of one shape (a fan) keep their jogs in an order that
     * cannot cross. With ports stacked along the side, a line bending TOWARD the far
     * end must turn later the further its port sits from that end; take two up-going
     * lines, and the lower port's vertical run would cut the upper one's first run if
     * it turned first. So within each direction the fan's own lane coordinates are
     * handed back out in that order. Only the lanes move; ends and targets do not.
     */
    function orderFanLanes(rs) {
      const groups = new Map();
      for (const r of rs) {
        const p = r.points;
        if (p.length < 4) continue;
        // First run along the flow axis, then a jog across it.
        const firstAlong = lr ? Math.abs(p[0].y - p[1].y) < 0.05 : Math.abs(p[0].x - p[1].x) < 0.05;
        const jogAcross = lr ? Math.abs(p[1].x - p[2].x) < 0.05 : Math.abs(p[1].y - p[2].y) < 0.05;
        if (!firstAlong || !jogAcross) continue;
        const sign = Math.sign(A(p[1]) - A(p[0])) || 1;
        const k = `${r.from}|${sign}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(r);
      }
      for (const list of groups.values()) {
        if (list.length < 2) continue;
        for (const dirSign of [-1, 1]) {
          // dirSign -1: the jog heads toward smaller cross values ("up" in lr).
          const sub = list.filter((r) => Math.sign(C(r.points[2]) - C(r.points[1])) === dirSign);
          if (sub.length < 2) continue;
          const flow = Math.sign(A(sub[0].points[1]) - A(sub[0].points[0])) || 1;
          const lanes = sub.map((r) => A(r.points[1])).sort((u, v) => (u - v) * flow);
          // Toward smaller cross: the port nearest that end turns first.
          const order = sub.slice().sort((u, v) => (C(u.points[0]) - C(v.points[0])) * -dirSign);
          const was = sub.map((r) => r.points);
          order.forEach((r, i) => {
            const pts = r.points.slice();
            pts[1] = P(lanes[i], C(pts[1]));
            pts[2] = P(lanes[i], C(pts[2]));
            r.points = pts;
          });
          const bad = sub.some((r) => Object.entries(nodes).some(([id, b]) => id !== r.from && id !== r.to && pathHits(r.points, b)));
          if (bad) sub.forEach((r, i) => { r.points = was[i]; });
          else for (const r of sub) if (r.labelAt && !onPath(r.points, r.labelAt)) r.labelAt = onLongestRun(r.points);
        }
      }
    }

    /**
     * The last word on "two lines never share a run": where the passes above left two
     * runs within a stroke gap of each other, slide an INTERIOR run of one of them (its
     * ends stay on their ports) to the nearest offset that is free and crosses no shape.
     */
    function separateSharedRuns(rs) {
      const step = sp.lane != null ? sp.lane : 8;
      const segShares = (r, j) => {
        const a = r.points[j], b = r.points[j + 1];
        const horiz = Math.abs(a.y - b.y) < 0.05;
        const v = horiz ? a.y : a.x;
        const [l1, h1] = horiz ? [Math.min(a.x, b.x), Math.max(a.x, b.x)] : [Math.min(a.y, b.y), Math.max(a.y, b.y)];
        for (const o of rs) {
          if (o === r) continue;
          for (let k = 1; k < o.points.length; k++) {
            const c = o.points[k - 1], d = o.points[k];
            if ((Math.abs(c.y - d.y) < 0.05) !== horiz) continue;
            if (Math.abs((horiz ? c.y : c.x) - v) >= 6) continue;
            const [l2, h2] = horiz ? [Math.min(c.x, d.x), Math.max(c.x, d.x)] : [Math.min(c.y, d.y), Math.max(c.y, d.y)];
            if (Math.min(h1, h2) - Math.max(l1, l2) > 10) return true;
          }
        }
        return false;
      };
      const count = (r) => { let n = 0; for (let j = 0; j + 1 < r.points.length; j++) if (segShares(r, j)) n++; return n; };
      // Move run k (points k, k+1) perpendicular to itself by `by`.
      const moved = (pts, k, by) => {
        const a = pts[k], b = pts[k + 1];
        const horiz = Math.abs(a.y - b.y) < 0.05;
        const next = pts.slice();
        next[k] = horiz ? { x: a.x, y: a.y + by } : { x: a.x + by, y: a.y };
        next[k + 1] = horiz ? { x: b.x, y: b.y + by } : { x: b.x + by, y: b.y };
        return next;
      };
      for (const r of rs) {
        let have = count(r);
        for (let j = 0; have > 0 && j + 1 < r.points.length; j++) {
          if (!segShares(r, j)) continue;
          const n = r.points.length;
          // An interior run moves itself; an END run keeps its port, so the turn next to
          // it slides instead, shortening the shared stretch.
          const k = j >= 1 && j + 2 < n ? j : j === 0 && n >= 4 ? 1 : j === n - 2 && n >= 4 ? n - 3 : -1;
          if (k < 0) continue;
          for (let t = 1; t <= 16; t++) {
            const next = moved(r.points, k, (t % 2 ? 1 : -1) * Math.ceil(t / 2) * step);
            if (!Object.entries(nodes).every(([id, bx]) => id === r.from || id === r.to || !pathHits(next, bx))) continue;
            const was = r.points;
            r.points = next;
            const now = count(r);
            if (now < have) { have = now; break; }
            r.points = was;
          }
        }
        if (r.labelAt && !onPath(r.points, r.labelAt)) r.labelAt = onLongestRun(r.points);
      }
    }

    /**
     * Seat every label on a clear stretch of its own line: off every shape, off every
     * earlier label, and off other lines where it can be. The label stays centred on
     * one run so the line reads through it; candidates walk each run in 4px steps and
     * the one nearest the router's own slot wins among the cleanest.
     */
    function seatLabels(rs, boxes, groupBoxes) {
      const labelled = rs.filter((r) => r.labelAt && r.labelSize);
      const home = new Map(labelled.map((r) => [r, r.labelAt]));
      const cost = (r, q, others) => {
        const { w, h } = r.labelSize;
        const box = { x: q.x - w / 2, y: q.y - h / 2, w, h };
        const near = { x: box.x - 4, y: box.y - 3, w: box.w + 8, h: box.h + 6 };
        let c = 0;
        for (const [id, b] of Object.entries(boxes)) if (overlaps(near, b)) c += overlaps(box, b) ? (id === r.from || id === r.to ? 400 : 1000) : 120;
        // A label half in and half out of a group reads as belonging to neither.
        for (const b of Object.values(groupBoxes)) if (overlaps(box, b) && !(box.x >= b.x && box.y >= b.y && box.x + box.w <= b.x + b.w && box.y + box.h <= b.y + b.h)) c += 200;
        // Graded by overlap area, so a half-step apart scores better than none and two
        // crowded labels can walk away from each other over the rounds below.
        for (const o of others) if (overlaps(near, o)) c += overlaps(box, o) ? 1000 + area(box, o) : 150;
        for (const o of rs) if (o !== r && pathHits(o.points, box)) c += 50;
        return c;
      };
      const seat = (r, others) => {
        const { w, h } = r.labelSize;
        const start = r.labelAt, origin = home.get(r);
        let best = start, bestCost = cost(r, start, others), bestD = Math.hypot(start.x - origin.x, start.y - origin.y);
        if (bestCost === 0) return;
        for (let j = 1; j < r.points.length; j++) {
          const a = r.points[j - 1], b = r.points[j];
          const horiz = Math.abs(a.y - b.y) < 0.5;
          const room = horiz ? w / 2 + 6 : h / 2 + 3;
          const lo = (horiz ? Math.min(a.x, b.x) : Math.min(a.y, b.y)) + room;
          const hi = (horiz ? Math.max(a.x, b.x) : Math.max(a.y, b.y)) - room;
          for (let v = lo; v <= hi; v += 4) {
            const q = horiz ? { x: v, y: a.y } : { x: a.x, y: v };
            const c = cost(r, q, others), d = Math.hypot(q.x - origin.x, q.y - origin.y);
            if (c < bestCost || (c === bestCost && d < bestD)) { best = q; bestCost = c; bestD = d; }
          }
        }
        r.labelAt = { x: R1(best.x), y: R1(best.y) };
      };
      // First in authored order against the labels already seated; then, because two
      // labels crowding each other may need BOTH to move, each against all the others.
      const seated = [];
      for (const r of labelled) { seat(r, seated); seated.push(labelBox(r)); }
      for (let round = 0; round < 2; round++) {
        for (const r of labelled) seat(r, labelled.filter((o) => o !== r).map(labelBox));
      }
    }

    /** Is the point on one of the path's segments? */
    function onPath(pts, q) {
      for (let j = 1; j < pts.length; j++) {
        const a = pts[j - 1], b = pts[j];
        const inX = q.x >= Math.min(a.x, b.x) - 0.5 && q.x <= Math.max(a.x, b.x) + 0.5;
        const inY = q.y >= Math.min(a.y, b.y) - 0.5 && q.y <= Math.max(a.y, b.y) + 0.5;
        if (inX && inY && (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5)) return true;
      }
      return false;
    }

    /** The middle of the path's longest run: where a label re-seats when its slot moved. */
    function onLongestRun(pts) {
      let best = null, len = -1;
      for (let j = 1; j < pts.length; j++) {
        const a = pts[j - 1], b = pts[j];
        const l = Math.hypot(b.x - a.x, b.y - a.y);
        if (l > len) { len = l; best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
      }
      return best;
    }

    function straightElbow(s, t) {
      const forward = A({ x: t.cx, y: t.cy }) >= A({ x: s.cx, y: s.cy });
      const sA = A({ x: s.cx, y: s.cy }) + (forward ? 1 : -1) * (lr ? s.w : s.h) / 2;
      const tA = A({ x: t.cx, y: t.cy }) - (forward ? 1 : -1) * (lr ? t.w : t.h) / 2;
      const mid = lane(gapMid(sA, tA), C({ x: s.cx, y: s.cy }), C({ x: t.cx, y: t.cy }));
      return [P(sA, C({ x: s.cx, y: s.cy })), P(mid, C({ x: s.cx, y: s.cy })), P(mid, C({ x: t.cx, y: t.cy })), P(tA, C({ x: t.cx, y: t.cy }))];
    }

    function spreadPorts(rs, boxes) {
      const ends = new Map(); // "id|side" → ends meeting that side of that box
      const sideOf = (bx, p) => {
        const d = [['l', Math.abs(p.x - bx.x)], ['r', Math.abs(p.x - (bx.x + bx.w))], ['t', Math.abs(p.y - bx.y)], ['b', Math.abs(p.y - (bx.y + bx.h))]];
        d.sort((u, v) => u[1] - v[1]);
        return d[0][0];
      };
      for (const r of rs) {
        if (r.points.length < 2) continue;
        for (const at of ['start', 'end']) {
          const id = at === 'start' ? r.from : r.to;
          const bx = boxes[id];
          if (!bx) continue;
          const p = at === 'start' ? r.points[0] : r.points[r.points.length - 1];
          const other = at === 'start' ? r.points[r.points.length - 1] : r.points[0];
          const side = sideOf(bx, p);
          const kk = `${id}|${side}`;
          if (!ends.has(kk)) ends.set(kk, []);
          ends.get(kk).push({ r, at, side, other, bx });
        }
      }
      for (const list of ends.values()) {
        if (list.length < 2) continue;
        const horizSide = list[0].side === 'l' || list[0].side === 'r'; // the side is vertical, runs leave horizontally
        list.sort((u, v) => (horizSide ? u.other.y - v.other.y : u.other.x - v.other.x) || u.r.index - v.r.index);
        const bx = list[0].bx;
        const extent = horizSide ? bx.h : bx.w;
        // Two neighbouring ends that both carry a label leave far enough apart for the
        // labels to pass each other when the lines run side by side (horizontal runs
        // only: a vertical run's label sits across it, not beside it).
        const tall = (it) => (it.r.labelSize && horizSide ? it.r.labelSize.h + 4 : 14);
        const gaps = list.slice(1).map((it, j) => Math.max(14, Math.min(tall(it), tall(list[j]))));
        const want = gaps.reduce((a, b) => a + b, 0);
        const labelled = gaps.some((gp) => gp > 14);
        const span = Math.min(labelled ? extent - 8 : extent * 0.6, want);
        let c = (horizSide ? bx.cy : bx.cx) - span / 2;
        list.forEach((it, j) => {
          if (j > 0) c += (gaps[j - 1] * span) / want;
          shiftEnd(it.r, it.at, horizSide, c);
        });
      }
    }

    /**
     * Move one end of a route along its box side to cross-coordinate `c`, keeping every
     * segment orthogonal: when the run leaving the end turns at a jog, the jog moves with
     * it; otherwise a short jog is inserted in the gap just outside the box.
     */
    function shiftEnd(r, at, horizSide, c) {
      const pts = at === 'start' ? r.points : r.points.slice().reverse();
      const cross = (pt) => (horizSide ? pt.y : pt.x);
      const setCross = (pt, v) => (horizSide ? { x: pt.x, y: v } : { x: v, y: pt.y });
      const e0 = pts[0], n1 = pts[1], n2 = pts[2];
      if (Math.abs(cross(e0) - c) < 0.05) return;
      const runIsAlong = horizSide ? Math.abs(e0.y - n1.y) < 0.05 : Math.abs(e0.x - n1.x) < 0.05;
      const n1TurnsAcross = n2 && (horizSide ? Math.abs(n1.x - n2.x) < 0.05 : Math.abs(n1.y - n2.y) < 0.05);
      if (runIsAlong && n1TurnsAcross) {
        pts[0] = setCross(e0, c);
        pts[1] = setCross(n1, c);
      } else {
        // Jog 8 units outside the box, then rejoin the original run.
        const out = horizSide ? { x: e0.x + Math.sign(n1.x - e0.x || 1) * 8, y: e0.y } : { x: e0.x, y: e0.y + Math.sign(n1.y - e0.y || 1) * 8 };
        pts.splice(0, 1, setCross(e0, c), setCross(out, c), out);
      }
      if (at === 'end') { pts.reverse(); r.points = pts; }
    }
  }

  /** Drop repeated and collinear points. */
  function simplify(pts) {
    const out = [];
    for (const p of pts) {
      const last = out[out.length - 1];
      if (last && Math.abs(last.x - p.x) < 0.05 && Math.abs(last.y - p.y) < 0.05) continue;
      out.push(p);
      while (out.length >= 3) {
        const [a, b, c] = out.slice(-3);
        const col = (Math.abs(a.x - b.x) < 0.05 && Math.abs(b.x - c.x) < 0.05) || (Math.abs(a.y - b.y) < 0.05 && Math.abs(b.y - c.y) < 0.05);
        if (!col) break;
        out.splice(out.length - 2, 1);
      }
    }
    return out;
  }

  /**
   * The render check's facts: a line through a shape it does not connect, a label on a
   * shape or another label, two lines sharing a run. The gallery must read zero on all.
   */
  function overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function area(a, b) { return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); }
  function labelBox(r) { return { x: r.labelAt.x - r.labelSize.w / 2, y: r.labelAt.y - r.labelSize.h / 2, w: r.labelSize.w, h: r.labelSize.h }; }
  /** Does an orthogonal path pass through the box's interior? */
  function pathHits(pts, box) {
    for (let j = 1; j < pts.length; j++) {
      const a = pts[j - 1], b = pts[j];
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
      if (x1 > box.x + 1 && x0 < box.x + box.w - 1 && y1 > box.y + 1 && y0 < box.y + box.h - 1) return true;
    }
    return false;
  }

  function measureQuality(nodes, gboxes, routes, titles) {
    const inside = (p, b, m) => p.x > b.x + m && p.x < b.x + b.w - m && p.y > b.y + m && p.y < b.y + b.h - m;
    const segHits = (a, b, box) => {
      const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
      for (let s = 1; s < steps; s++) { const t = s / steps; if (inside({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, box, 1)) return true; }
      return false;
    };
    let linesThroughShapes = 0;
    for (const r of routes) {
      for (const [id, b] of Object.entries(nodes)) {
        if (id === r.from || id === r.to) continue;
        let hit = false;
        for (let j = 1; j < r.points.length && !hit; j++) hit = segHits(r.points[j - 1], r.points[j], b);
        if (hit) linesThroughShapes++;
      }
    }
    const lbs = routes.filter((r) => r.labelAt && r.labelSize).map((r) => ({ x: r.labelAt.x - r.labelSize.w / 2, y: r.labelAt.y - r.labelSize.h / 2, w: r.labelSize.w, h: r.labelSize.h }));
    const over = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    let labelCollisions = 0;
    for (let i = 0; i < lbs.length; i++) {
      for (const b of Object.values(nodes)) if (over(lbs[i], b)) labelCollisions++;
      for (let j = i + 1; j < lbs.length; j++) if (over(lbs[i], lbs[j])) labelCollisions++;
    }
    // A label must sit ON its own line, never beside or away from it.
    let labelsOffLine = 0;
    for (const r of routes) {
      if (!r.labelAt) continue;
      let on = false;
      for (let j = 1; j < r.points.length && !on; j++) {
        const a = r.points[j - 1], b = r.points[j];
        on = r.labelAt.x >= Math.min(a.x, b.x) - 0.6 && r.labelAt.x <= Math.max(a.x, b.x) + 0.6 && r.labelAt.y >= Math.min(a.y, b.y) - 0.6 && r.labelAt.y <= Math.max(a.y, b.y) + 0.6;
      }
      if (!on) labelsOffLine++;
    }
    // Lines under a group's title are cut by the painter; count them so the gallery can
    // be held to none, because a cut title-line still reads as an interruption.
    let linesThroughTitles = 0;
    for (const t of Object.values(titles || {})) for (const r of routes) {
      let hit = false;
      // Held to the painter's clearance: a line grazing the title's ends still crowds it.
      hit = pathHits(r.points, { x: t.x - 5, y: t.y, w: t.w + 10, h: t.h });
      if (hit) linesThroughTitles++;
    }
    // A label half in and half out of a group reads as belonging to neither.
    let labelsAcrossBorders = 0;
    for (const lb of lbs) for (const b of Object.values(gboxes)) {
      const within = lb.x >= b.x && lb.y >= b.y && lb.x + lb.w <= b.x + b.w && lb.y + lb.h <= b.y + b.h;
      if (overlaps(lb, b) && !within) labelsAcrossBorders++;
    }
    // Two lines closer than 6 units for more than a few units read as one line.
    let sharedRuns = 0;
    const segsOf = (r) => r.points.slice(1).map((b, j) => [r.points[j], b]);
    for (let i = 0; i < routes.length; i++) for (let k = i + 1; k < routes.length; k++) {
      let shared = false;
      for (const [a, b] of segsOf(routes[i])) for (const [c, d] of segsOf(routes[k])) {
        if (shared) break;
        const h1 = Math.abs(a.y - b.y) < 0.05, h2 = Math.abs(c.y - d.y) < 0.05;
        if (h1 !== h2) continue;
        const off = h1 ? Math.abs(a.y - c.y) : Math.abs(a.x - c.x);
        if (off >= 6) continue;
        const [l1, r1] = h1 ? [Math.min(a.x, b.x), Math.max(a.x, b.x)] : [Math.min(a.y, b.y), Math.max(a.y, b.y)];
        const [l2, r2] = h1 ? [Math.min(c.x, d.x), Math.max(c.x, d.x)] : [Math.min(c.y, d.y), Math.max(c.y, d.y)];
        // Lines out of one port share their first stub by design; only a longer run counts.
        if (Math.min(r1, r2) - Math.max(l1, l2) > 10) shared = true;
      }
      if (shared) sharedRuns++;
    }
    let shapeOverlaps = 0;
    const nb = Object.values(nodes);
    for (let i = 0; i < nb.length; i++) for (let j = i + 1; j < nb.length; j++) if (over(nb[i], nb[j])) shapeOverlaps++;
    return { linesThroughShapes, labelCollisions, shapeOverlaps, labelsOffLine, linesThroughTitles, labelsAcrossBorders, sharedRuns };
  }

  /**
   * Lay the graph out and pick the direction: a pinned `dir` is honored; otherwise both
   * are scored by the scale they would get in the stage (`stage: {w, h}`), capped at
   * `maxScale`, and the larger wins (the state chart's fit rule, reused).
   */
  function layout(model, sizes, opts, dagre) {
    const dirs = opts.dir === 'lr' || opts.dir === 'tb' ? [opts.dir] : ['lr', 'tb'];
    let best = null;
    for (const d of dirs) {
      const geo = layoutOnce(model, sizes, { ...opts, dir: d }, dagre);
      if (!geo) return null;
      const st = opts.stage || { w: geo.width, h: geo.height };
      const k = Math.min(opts.maxScale != null ? opts.maxScale : 1.2, st.w / Math.max(1, geo.width), st.h / Math.max(1, geo.height));
      geo.scale = Math.round(k * 1000) / 1000;
      // Ties go to the first direction in preference order: a hair of difference must not
      // flip a chart between edits.
      if (!best || geo.scale > best.scale * 1.03) best = geo;
    }
    return best;
  }

  return { layout, layoutOnce, simplify };
}

module.exports = { graphLayoutKernel };
