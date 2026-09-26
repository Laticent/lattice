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
 * gap of another line; a second `rescueRoutes` re-draws any line still through a shape;
 * `rescueRoutes(routes, 'keep' | 'plain')` is the crossing solver, which moves a line that crosses
 * others onto whichever clean elbow crosses fewest; `seatLabels` places the labels; group
 * titles take the first slot in their band that no line or label crosses. `measureQuality` counts what is left, and
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
    // A shape that three or more lines leave (or enter) along the flow grows across it,
    // so routeFans can give every line its own port 12 units apart: six lines off a box
    // 42 tall were squeezed 5 units apart, and the passes after that turned the crowd
    // into detours (the demo deck's line-vocabulary slide).
    const PORT = 12;
    const outs = new Map(), ins = new Map();
    let grew = false;
    for (const e of model.edges || []) {
      if (e.style?.loose || e.from === e.to) continue;
      const [a, b] = e.back ? [e.to, e.from] : [e.from, e.to];
      outs.set(a, (outs.get(a) || 0) + 1);
      ins.set(b, (ins.get(b) || 0) + 1);
    }
    for (const s of shapes) {
      const z = sizes[s.id] || { w: 96, h: 40 };
      const k = Math.max(outs.get(s.id) || 0, ins.get(s.id) || 0);
      const need = opts.grow !== false && k >= 3 ? (k - 1) * PORT + 16 : 0; // routeFans keeps 8 clear at each end
      let w = z.w, h = z.h;
      if (dir === 'LR') h = Math.max(h, need); else w = Math.max(w, need);
      if (w !== z.w || h !== z.h) {
        grew = true;
        if (s.shape === 'circle') w = h = Math.max(w, h);
      }
      g.setNode(key.get(s.id), { width: Q(w), height: Q(h) });
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
      routes.push({ index: rec.i, from: e.from, to: e.to, points: pts, labelAt, labelSize: rec.label, back: !!e.back, loose: rec.loose, heavy: !!e.heavy });
    }

    // Ports: several ends on one side of one box spread out along that side, ordered by
    // where their other end sits, so no two lines share a final run.
    rescueRoutes(routes);
    spreadPorts(routes, { ...nodes, ...gboxes });
    for (const r of routes) r.points = simplify(r.points.map((p) => ({ x: R1(p.x), y: R1(p.y) })));
    turnOutsideForeignGroups(routes);
    straightenJogs(routes, { ...nodes, ...gboxes });
    orderFanLanes(routes);
    separateSharedRuns(routes);
    // Again, last: spreading ports slides a line's first run along its side, and that can
    // carry it into a neighbor. A route still crossing a shape here is re-drawn.
    rescueRoutes(routes);
    // The solver: lines that cross others try every clean elbow and keep one that crosses fewer.
    // Moving lines one at a time is order-sensitive, so the solver runs twice: freest
    // lines first with a cost on changing sides (what reads best on an org chart), and
    // authored order without that cost (what the corpus measured first). The fewer
    // crossings wins.
    const before = routes.map((r) => ({ points: r.points, labelAt: r.labelAt }));
    // A tie on crossings goes to the drawing that is shorter and turns less, counting a
    // box side a line switched to (from where it left the passes above) as 60 units.
    const sideAt = (q, id) => {
      const b = nodes[id] || gboxes[id];
      if (!b) return -1;
      const d = [Math.abs(q.x - b.x), Math.abs(q.x - b.x - b.w), Math.abs(q.y - b.y), Math.abs(q.y - b.y - b.h)];
      return d.indexOf(Math.min(...d));
    };
    const cost = () => routes.reduce((sum, r, i) => {
      const p = r.points, w = before[i].points;
      let c = 24 * (p.length - 2);
      for (let j = 1; j < p.length; j++) c += Math.abs(p[j].x - p[j - 1].x) + Math.abs(p[j].y - p[j - 1].y);
      if (sideAt(p[0], r.from) !== sideAt(w[0], r.from)) c += 60;
      if (sideAt(p[p.length - 1], r.to) !== sideAt(w[w.length - 1], r.to)) c += 60;
      return sum + c;
    }, 0);
    rescueRoutes(routes, 'keep');
    const kept = routes.map((r) => ({ points: r.points, labelAt: r.labelAt }));
    const keptX = countCrossings(routes), keptC = cost();
    routes.forEach((r, i) => { Object.assign(r, before[i]); });
    rescueRoutes(routes, 'plain');
    const plainX = countCrossings(routes);
    if (keptX < plainX || (keptX === plainX && keptC < cost())) routes.forEach((r, i) => { Object.assign(r, kept[i]); });
    levelFans(routes);
    routeFans(routes);
    lengthenEnds(routes);
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
    const titles = placeTitles(routes);
    return { dir: lr ? 'lr' : 'tb', width, height, nodes, groups: gboxes, titles, routes, quality: measureQuality(nodes, gboxes, routes, titles), crossings: countCrossings(routes), grew, tidy: { crowded: crowded(routes), grazes: grazes(routes) } };

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
          // A label rides the turn run, so a labeled run keeps half the label clear.
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
        // Two labeled horizontal runs side by side keep a label's height apart (spreadPorts).
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

    function placeTitles(rs) {
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
          if (!rs.some((r) => pathHits(r.points, box) || (r.labelAt && r.labelSize && overlaps(labelBox(r), box)))) { pick = x; break; }
        }
        titles[gr.id] = { x: R1(pick), y: R1(y), w: R1(z.w), h: R1(z.h) };
      }
      return titles;
    }

    // A group neither end of a line belongs to, entered or ridden along its border.
    function lineageOf(id) {
      const out = new Set([id]);
      let q = id;
      for (;;) {
        const x = groups.find((gr) => gr.id === q) || shapes.find((sh) => sh.id === q);
        q = x?.parent;
        if (!q) return out;
        out.add(q);
      }
    }
    function foreign(rs) {
      let n = 0;
      for (const r of rs) {
        const mine = new Set([...lineageOf(r.from), ...lineageOf(r.to)]);
        for (const g of groups) {
          const b = gboxes[g.id];
          if (b && !mine.has(g.id) && pathHits(r.points, { x: b.x - 6, y: b.y - 6, w: b.w + 12, h: b.h + 12 })) n++;
        }
      }
      return n;
    }
    // The guard a late pass keeps its change behind: no quality, crossing or foreign-group
    // count may get worse.
    // A run passing within 5 units of a stranger's box (the box grown by 6, less pathHits'
    // 1-unit inset), without entering it, reads as touching it.
    function grazes(rs) {
      let n = 0;
      for (const r of rs) {
        for (const [id, b] of Object.entries(nodes)) {
          if (id === r.from || id === r.to) continue;
          if (pathHits(r.points, { x: b.x - 6, y: b.y - 6, w: b.w + 12, h: b.h + 12 }) && !pathHits(r.points, b)) n++;
        }
      }
      return n;
    }
    // Two line ends on one side of a box closer than 10 units read as one port, or as a
    // doubled line (a fan into Mitigate once landed 7 units from another line's end).
    function crowded(rs) {
      const ends = [];
      for (const r of rs) if (r.points.length > 1) ends.push(r.points[0], r.points[r.points.length - 1]);
      let n = 0;
      for (let i = 0; i < ends.length; i++) {
        for (let j = i + 1; j < ends.length; j++) {
          const a = ends[i], b = ends[j];
          const d = Math.abs(a.x - b.x) < 0.5 ? Math.abs(a.y - b.y) : Math.abs(a.y - b.y) < 0.5 ? Math.abs(a.x - b.x) : Infinity;
          // Pairs from one route (its own two ends) are skipped; ends that coincide exactly
          // are the worst case, two lines on one port, and count.
          if ((i >> 1) !== (j >> 1) && d < 10) n++;
        }
      }
      return n;
    }
    // Titles are placed last, in each group's top band, at the first slot no line crosses;
    // a line that newly runs through that band can leave the title nowhere clean.
    function bands(rs) {
      const tsz = opts.groupTitleSizes || {};
      let n = 0;
      for (const g of groups) {
        const b = gboxes[g.id];
        if (!b) continue;
        const band = { x: b.x, y: b.y + 6, w: b.w, h: (tsz[g.id] || { h: 14 }).h };
        for (const r of rs) if (pathHits(r.points, band)) n++;
      }
      return n;
    }
    function score(rs) { return { q: measureQuality(nodes, gboxes, rs, {}), x: countCrossings(rs), g: foreign(rs), z: grazes(rs), c: crowded(rs), t: bands(rs) }; }
    function noWorse(a, b) { return b.x <= a.x && b.g <= a.g && b.z <= a.z && b.c <= a.c && b.t <= a.t && Object.keys(a.q).every((k) => b.q[k] <= a.q[k]); }

    /**
     * A shape whose lines all leave one side for shapes wholly beyond it draws them as one
     * fan: ports spread along that side in the order of their targets, each line straight
     * across when its target spans its port and otherwise on its own lane in the gap,
     * nested so none crosses another (a line bending away from the middle turns sooner the
     * further out it heads), and each entering its target's near side. The passes above
     * work one line at a time and could not reach this: six lines leaving one box doubled
     * back, left by the far side, or shared a port. A line drawn straight lands at its
     * own port on the target; an elbowed one keeps the port it had. Kept only if nothing
     * gets worse.
     */
    function routeFans(rs) {
      const aLo = (b) => (lr ? b.x : b.y), aHi = (b) => (lr ? b.x + b.w : b.y + b.h);
      const cLo = (b) => (lr ? b.y : b.x), cHi = (b) => (lr ? b.y + b.h : b.x + b.w);
      const cMid = (b) => (cLo(b) + cHi(b)) / 2;
      const sides = new Map();
      for (const r of rs) {
        // A `:loose` line stays out of the layout, and out of its ends' fans with it.
        if (r.loose || r.from === r.to || r.points.length < 2) continue;
        for (const at of ['start', 'end']) {
          const id = at === 'start' ? r.from : r.to, oid = at === 'start' ? r.to : r.from;
          const N = nodes[id], O = nodes[oid] || gboxes[oid];
          if (!N || !O) continue;
          const side = aLo(O) > aHi(N) + 24 ? 1 : aHi(O) < aLo(N) - 24 ? -1 : 0;
          if (!side) continue;
          const k = `${id}|${side}`;
          if (!sides.has(k)) sides.set(k, { N, id, side, list: [] });
          sides.get(k).list.push({ r, at, O, oid });
        }
      }
      // Scored with the labels seated and the titles placed as they will be, since a fan
      // line's new run can leave its label or a title nowhere clean; then the labels go
      // back for the real seating.
      const seated = () => {
        const keep = rs.map((r) => r.labelAt);
        seatLabels(rs, nodes, gboxes);
        const sc = score(rs);
        sc.q = measureQuality(nodes, gboxes, rs, placeTitles(rs));
        rs.forEach((r, i) => { r.labelAt = keep[i]; });
        return sc;
      };
      for (const { N, id, side, list } of sides.values()) {
        if (new Set(list.map((it) => it.oid)).size < list.length) continue;
        // The far end keeps the port it already has on the target's near side: spreadPorts
        // chose it with every other end on that side in view, and the centre may be a
        // neighbour's (a fan into Mitigate landed 7 units from another line's end there).
        const farC = (it) => {
          const q = it.at === 'start' ? it.r.points[it.r.points.length - 1] : it.r.points[0];
          const far = side > 0 ? aLo(it.O) : aHi(it.O);
          return Math.abs(A(q) - far) < 0.5 && C(q) > cLo(it.O) + 4 && C(q) < cHi(it.O) - 4 ? C(q) : cMid(it.O);
        };
        for (const it of list) it.end = farC(it);
        list.sort((u, v) => u.end - v.end || u.r.index - v.r.index);
        const was = list.map((it) => ({ points: it.r.points, labelAt: it.r.labelAt }));
        const before = seated();
        // First the balanced fan, then (if the guard refuses it) every line on the flow side.
        // A lone line is not a fan: it keeps its route (its other end's fan may draw it).
        if (list.length < 2) continue;
        for (const flanks of [true, false]) {
          if (tryFan(N, id, side, list, flanks) && noWorse(before, seated())) break;
          list.forEach((it, i) => { Object.assign(it.r, was[i]); });
        }
      }

      /**
       * Draw one side's fan. With `flanks`, a line whose target lies wholly beyond a flank
       * of the source (above or below it in lr, left or right of it in tb) leaves by that
       * flank, from its middle when it is alone there, and turns once into its target's
       * near side: an org chart's two children hang from their parent's left and right
       * middles, and a fan of six splits over three sides instead of crowding one. On each
       * flank the line heading furthest out takes the port furthest back, so the flank's
       * lines nest. The rest keep the flow side as a nested fan. Returns false when the
       * shape has no room for its ports or lanes, or a label no run to sit on.
       */
      function tryFan(N, id, side, list, flanks) {
        const aMid = (aLo(N) + aHi(N)) / 2;
        const lowF = [], highF = [], front = [];
        // A flank line enters its target at the port it has when that port lies beyond the
        // flank, else at the target's middle (Planning's port sat under Finance's span, its
        // middle beyond it). `it.flankEnd` is where; the front keeps `it.end`.
        // Where on its target a flank line lands: the port it has, else the target's middle,
        // else the point nearest the middle that clears the flank by 8; null if the target
        // does not reach 16 past the flank.
        const landing = (it, low) => {
          const ok = (c) => (low ? c <= cLo(N) - 8 : c >= cHi(N) + 8) && c >= cLo(it.O) + 8 && c <= cHi(it.O) - 8;
          if (ok(it.end)) return it.end;
          if (ok(cMid(it.O))) return cMid(it.O);
          const c = low ? cLo(N) - 8 : cHi(N) + 8;
          return ok(c) ? c : null;
        };
        for (const it of list) {
          it.flankEnd = null;
          if (!flanks) continue;
          if (cMid(it.O) < cLo(N)) it.flankEnd = landing(it, true);
          else if (cMid(it.O) > cHi(N)) it.flankEnd = landing(it, false);
          if (it.flankEnd != null) (cMid(it.O) < cLo(N) ? lowF : highF).push(it);
        }
        // Symmetry: when one side of a fan flanks, the outermost line on the other side does
        // too if its target reaches past that flank, even with its middle just inside (an
        // org chart's Platform sat 8 units inside Technology's edge, Security just outside).
        if (flanks) {
          for (const [have, want, low] of [[highF, lowF, true], [lowF, highF, false]]) {
            if (!have.length || want.length) continue;
            const side2 = list.filter((it) => it.flankEnd == null && (low ? cMid(it.O) < cMid(N) : cMid(it.O) > cMid(N)));
            if (!side2.length) continue;
            const out = side2.reduce((a, b) => ((low ? cMid(b.O) < cMid(a.O) : cMid(b.O) > cMid(a.O)) ? b : a));
            // A target spanning the source's middle is straight ahead, never a flank.
            if (cLo(out.O) < cMid(N) && cHi(out.O) > cMid(N)) continue;
            const c = landing(out, low);
            if (c != null) { out.flankEnd = c; want.push(out); }
          }
        }
        for (const it of list) if (it.flankEnd == null) front.push(it);
        if (flanks && !lowF.length && !highF.length) return false;
        const draw = (it, pts) => {
          const q = it.at === 'end' ? pts.slice().reverse() : pts;
          it.r.points = q;
          if (it.r.labelAt) it.r.labelAt = onLongestRun(q);
        };
        const far = (it) => (side > 0 ? aLo(it.O) : aHi(it.O));
        // Flanks: furthest out first, on the port furthest back from the flow side.
        for (const [fl, edge, out] of [[lowF, cLo(N), -1], [highF, cHi(N), 1]]) {
          if (!fl.length) continue;
          fl.sort((u, v) => (v.flankEnd - u.flankEnd) * out);
          const m = fl.length;
          const span = Math.min(aHi(N) - aLo(N) - 16, (m - 1) * 14);
          if (m > 1 && span < (m - 1) * 8) return false;
          fl.forEach((it, k) => {
            const a = m === 1 ? aMid : aMid - side * span / 2 + side * (k * span) / (m - 1);
            draw(it, [P(a, edge), P(a, it.flankEnd), P(far(it), it.flankEnd)]);
          });
        }
        const n = front.length;
        if (n) {
          const span = n > 1 ? Math.min(cHi(N) - cLo(N) - 16, (n - 1) * 14) : 0;
          if (n > 1 && span < (n - 1) * 8) return false;
          const port = front.map((_, i) => (n === 1 ? cMid(N) : cMid(N) - span / 2 + (i * span) / (n - 1)));
          const base = side > 0 ? aHi(N) : aLo(N);
          const near = side > 0 ? Math.min(...front.map((it) => aLo(it.O))) : Math.max(...front.map((it) => aHi(it.O)));
          const gap = Math.abs(near - base);
          const straight = front.map((it, i) => port[i] >= cLo(it.O) + 8 && port[i] <= cHi(it.O) - 8);
          const up = front.map((_, i) => i).filter((i) => !straight[i] && front[i].end < port[i]);
          const down = front.map((_, i) => i).filter((i) => !straight[i] && front[i].end > port[i]).reverse();
          const lanes = Math.max(up.length, down.length);
          // The lanes' window along the flow: clear of the source by 16, of each target by
          // 16, and outside any group border a line crosses. A group holding the source but
          // not a target is left before the first lane; one holding a target but not the
          // source is entered after the last. Group padding is 14, so without this a line
          // leaving its group jogged 2 units inside it and ran along the border.
          const dist = (x) => side * (x - base);
          let lo = 16, hi = gap - 16;
          const fromLine = lineageOf(id);
          for (const g of groups) {
            const b = gboxes[g.id];
            if (!b) continue;
            if (fromLine.has(g.id) && front.some((it) => !lineageOf(it.oid).has(g.id))) lo = Math.max(lo, dist(side > 0 ? aHi(b) : aLo(b)) + 8);
            for (const it of front) if (lineageOf(it.oid).has(g.id) && !fromLine.has(g.id)) hi = Math.min(hi, dist(side > 0 ? aLo(b) : aHi(b)) - 8);
          }
          if (lanes && lo > hi) return false;
          const step = lanes > 1 ? Math.min(10, (hi - lo) / (lanes - 1)) : 0;
          if (lanes > 1 && step < 8) return false;
          const laneAt = (j) => base + side * (lo + j * step);
          // A lone front line with nothing to fan against keeps the route it has.
          if (n > 1 || lowF.length || highF.length) {
            front.forEach((it, i) => { if (straight[i]) draw(it, [P(base, port[i]), P(far(it), port[i])]); });
            const elbow = (i, lane) => draw(front[i], [P(base, port[i]), P(lane, port[i]), P(lane, front[i].end), P(far(front[i]), front[i].end)]);
            up.forEach((i, j) => { elbow(i, laneAt(j)); });
            down.forEach((i, j) => { elbow(i, laneAt(j)); });
          }
        }
        // A labeled line needs a run long enough to hold its label.
        return list.every((it) => {
          if (!it.r.labelSize) return true;
          const p = it.r.points, need = (lr ? it.r.labelSize.w : it.r.labelSize.h) + 12;
          return p.slice(1).some((q, j) => Math.abs(q.x - p[j].x) + Math.abs(q.y - p[j].y) >= need);
        });
      }
    }

    /**
     * An arrowhead needs a run to sit on: a line that turns a few units before its target
     * draws its head on the corner (BI dashboards on the demo's data-flow slide: a 7-unit
     * run). Each end whose last run is shorter than 14 slides the run before it back until
     * it is 14; with only one bend, the line's other end slides along its own side instead.
     * A jog under 12 just before the end is straightened instead, by moving the end along
     * its target's side. Kept per line only if nothing gets worse.
     */
    function lengthenEnds(rs) {
      const MIN = 14;
      const len = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      const fix = (pts, farBox, farBoxEnd) => {
        const n = pts.length;
        if (n < 3) return null;
        const q1 = pts[n - 2], q2 = pts[n - 1], L = len(q1, q2);
        const dx = Math.sign(q2.x - q1.x), dy = Math.sign(q2.y - q1.y), k = MIN - L;
        // A jog under 12 before the end is a kink, not a route: straighten it by moving the
        // end along the target's side to the run before, if the side has room there.
        if (n >= 4 && len(pts[n - 3], pts[n - 2]) < 12 && farBoxEnd) {
          const b = farBoxEnd, horiz = dy === 0;
          const c = horiz ? pts[n - 3].y : pts[n - 3].x;
          if (horiz ? c >= b.y + 8 && c <= b.y + b.h - 8 : c >= b.x + 8 && c <= b.x + b.w - 8) {
            const end = horiz ? { x: q2.x, y: c } : { x: c, y: q2.y };
            return [...pts.slice(0, n - 3), end];
          }
        }
        if (L >= MIN - 0.05) return null;
        const shift = (q) => ({ x: R1(q.x - dx * k), y: R1(q.y - dy * k) });
        const out = pts.slice();
        if (n >= 4) {
          // The run before the lane shortens by k; it must not fold back.
          if (len(pts[n - 4], pts[n - 3]) - k < 8) return null;
          out[n - 3] = shift(pts[n - 3]);
          out[n - 2] = shift(pts[n - 2]);
        } else {
          // One bend: slide the other end along its own side, if the side has room.
          const b = farBox;
          if (!b) return null;
          const q0 = shift(pts[0]);
          // On a top or bottom side only x moves, on a left or right side only y.
          const onH = Math.abs(pts[0].y - b.y) < 0.5 || Math.abs(pts[0].y - b.y - b.h) < 0.5;
          if (onH ? q0.x < b.x + 8 || q0.x > b.x + b.w - 8 : q0.y < b.y + 8 || q0.y > b.y + b.h - 8) return null;
          out[0] = q0;
          out[1] = shift(pts[1]);
        }
        return out;
      };
      for (const r of rs) {
        if (r.from === r.to || r.points.length < 3) continue;
        for (const at of ['end', 'start']) {
          const pts = at === 'end' ? r.points : r.points.slice().reverse();
          const other = at === 'end' ? r.from : r.to, own = at === 'end' ? r.to : r.from;
          const next = fix(pts, nodes[other] || gboxes[other], nodes[own]);
          if (!next) continue;
          const before = score(rs), was = { points: r.points, labelAt: r.labelAt };
          r.points = at === 'end' ? next : next.reverse();
          if (r.labelAt && !onPath(r.points, r.labelAt)) r.labelAt = onLongestRun(r.points);
          if (!noWorse(before, score(rs))) Object.assign(r, was);
        }
      }
    }

    /**
     * A fan that splits both ways from one side of a shape turns at matching heights, so
     * an org chart's two children hang symmetrically. The lane allocator treated two jogs
     * that only touched at their shared port as overlapping and pushed the second a lane
     * further out; once ports spread they no longer touch, and nothing put it back. Here
     * the side with fewer lines takes the other side's lanes, in the same turn order.
     * Kept only if no quality count and no crossing count gets worse.
     */
    function levelFans(rs) {
      const fans = new Map();
      for (const r of rs) {
        const p = r.points;
        if (p.length !== 4) continue;
        const firstAlong = lr ? Math.abs(p[0].y - p[1].y) < 0.05 : Math.abs(p[0].x - p[1].x) < 0.05;
        const jogAcross = lr ? Math.abs(p[1].x - p[2].x) < 0.05 : Math.abs(p[1].y - p[2].y) < 0.05;
        if (!firstAlong || !jogAcross) continue;
        const k = `${r.from}|${Math.sign(A(p[1]) - A(p[0])) || 1}`;
        if (!fans.has(k)) fans.set(k, []);
        fans.get(k).push(r);
      }
      for (const list of fans.values()) {
        const sides = [-1, 1].map((d) => list.filter((r) => Math.sign(C(r.points[2]) - C(r.points[1])) === d)
          // Turn order: the port nearest the far end turns first (orderFanLanes' rule).
          .sort((u, v) => (C(u.points[0]) - C(v.points[0])) * -d));
        if (!sides[0].length || !sides[1].length) continue;
        const flow = Math.sign(A(list[0].points[1]) - A(list[0].points[0])) || 1;
        const lanesOf = (sub) => sub.map((r) => A(r.points[1])).sort((u, v) => (u - v) * flow);
        const before = score(rs);
        const was = list.map((r) => r.points);
        // The larger side's lanes first; on a tie, the lanes nearer the source.
        const tries = sides[0].length === sides[1].length
          ? [0, 1].sort((a, b) => (lanesOf(sides[a])[0] - lanesOf(sides[b])[0]) * flow)
          : [sides[0].length > sides[1].length ? 0 : 1];
        for (const src of tries) {
          const lanes = lanesOf(sides[src]);
          const other = sides[1 - src];
          other.forEach((r, i) => {
            const pts = r.points.slice();
            pts[1] = P(lanes[i], C(pts[1]));
            pts[2] = P(lanes[i], C(pts[2]));
            r.points = pts;
          });
          if (noWorse(before, score(rs))) {
            for (const r of other) if (r.labelAt && !onPath(r.points, r.labelAt)) r.labelAt = onLongestRun(r.points);
            break;
          }
          list.forEach((r, i) => { r.points = was[i]; });
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
      const labeled = rs.filter((r) => r.labelAt && r.labelSize);
      const home = new Map(labeled.map((r) => [r, r.labelAt]));
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
      for (const r of labeled) { seat(r, seated); seated.push(labelBox(r)); }
      for (let round = 0; round < 2; round++) {
        for (const r of labeled) seat(r, labeled.filter((o) => o !== r).map(labelBox));
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

    /**
     * A route that crosses a shape it does not connect is re-drawn from scratch. It
     * happens where dagre's path was laid out between REPRESENTATIVE members: a line
     * to or from a group is routed from the group's first member and trimmed at its
     * border, so a target placed beside or below the group leaves a trimmed route that
     * runs through whatever sits in between. The candidates are the four elbow shapes
     * between the two boxes' facing sides; the shortest that crosses nothing wins, and
     * a route with no clean candidate keeps what it had.
     */
    function rescueRoutes(rs, uncross) {
      const PAD = 8, AROUND = 18, GRAZE = 5;
      const boxOf = (id) => nodes[id] || gboxes[id];
      const hitsOf = (pts, r) => {
        let n = 0;
        // Every shape counts, the line's own two as well: a route that leaves its box and
        // folds back through it (or through its target before arriving) is as broken as one
        // through a stranger. A self-loop hooks outside its box and is never rescued here.
        // A stranger's box also counts when the line merely grazes it, within about 4 units
        // (GRAZE less pathHits' inset): a run 3 units under a box reads as touching it (the
        // demo's release train, `fails` under Test). The late passes' guard holds a true 5
        // (grazes()); a 5 here too left one chart 7 crossings worse for want of candidates.
        for (const [id, b] of Object.entries(nodes)) {
          const own = id === r.from || id === r.to;
          if (pathHits(pts, own ? b : { x: b.x - GRAZE, y: b.y - GRAZE, w: b.w + 2 * GRAZE, h: b.h + 2 * GRAZE })) n++;
        }
        return n;
      };
      const realHits = (pts) => Object.values(nodes).some((b) => pathHits(pts, b));
      const len = (pts) => pts.slice(1).reduce((a, q, j) => a + Math.abs(q.x - pts[j].x) + Math.abs(q.y - pts[j].y), 0);
      const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
      const crossOf = (pts, r) => {
        let n = 0;
        for (const o of rs) if (o !== r) n += crossings(pts, o.points);
        return n;
      };
      // A labeled line needs one run long enough to carry its label, or seatLabels has
      // nowhere clean to put it.
      // A move must not carry a line into a group neither end belongs to (or along its
      // border), nor into a group's title band: those passes ran before this one and
      // nothing after it repairs them. Counted, so a line already inside stays allowed.
      const tsz = opts.groupTitleSizes || {};
      const parentOf = new Map([...groups, ...shapes].map((x) => [x.id, x.parent || null]));
      const lineage = (id) => { const out = new Set([id]); let q = parentOf.get(id); while (q) { out.add(q); q = parentOf.get(q); } return out; };
      const intrusions = (pts, r) => {
        const mine = new Set([...lineage(r.from), ...lineage(r.to)]);
        let n = 0;
        for (const g of groups) {
          const b = gboxes[g.id];
          if (!b) continue;
          if (!mine.has(g.id) && pathHits(pts, { x: b.x - 6, y: b.y - 6, w: b.w + 12, h: b.h + 12 })) n++;
          if (pathHits(pts, { x: b.x, y: b.y + 6, w: b.w, h: (tsz[g.id] || { h: 14 }).h })) n++;
        }
        return n;
      };
      // How close this line's ends sit to another line's ends along one side of a box (the
      // same x on a left or right side, the same y on a top or bottom one). A move may not
      // bring two ends closer than 14 units, the port spacing routeFans draws, unless they
      // already were closer, in which case it may not tighten them further.
      const tightest = (pts, r) => {
        let d = Infinity;
        for (const o of rs) {
          if (o === r) continue;
          for (const e of [o.points[0], o.points[o.points.length - 1]]) {
            for (const q of [pts[0], pts[pts.length - 1]]) {
              if (Math.abs(e.x - q.x) < 0.5) d = Math.min(d, Math.abs(e.y - q.y));
              else if (Math.abs(e.y - q.y) < 0.5) d = Math.min(d, Math.abs(e.x - q.x));
            }
          }
        }
        return d;
      };
      const crowds = (pts, r, floor) => tightest(pts, r) < floor;
      // A turn pair closer than a few units reads as a kink in the line, not a route.
      const jogs = (pts) => pts.slice(2, -1).some((q, j) => Math.abs(q.x - pts[j + 1].x) + Math.abs(q.y - pts[j + 1].y) < 10);
      const roomFor = (pts, r) => {
        if (!r.labelSize) return true;
        const need = Math.max(r.labelSize.w, r.labelSize.h) + 12;
        // ...and a run that crosses no group border, or the label straddles one.
        const inG = (q, b) => q.x > b.x && q.x < b.x + b.w && q.y > b.y && q.y < b.y + b.h;
        const clean = (a, c) => groups.every((g) => !gboxes[g.id] || inG(a, gboxes[g.id]) === inG(c, gboxes[g.id]));
        return pts.slice(1).some((q, j) => Math.abs(q.x - pts[j].x) + Math.abs(q.y - pts[j].y) >= need && clean(pts[j], q));
      };
    // A run within 6 units of another line's, for more than 10, reads as one line.
    const sharedOf = (pts, r) => {
        let n = 0;
        for (const o of rs) {
          if (o === r) continue;
          for (let j = 1; j < pts.length; j++) for (let k = 1; k < o.points.length; k++) {
            const a = pts[j - 1], b = pts[j], c = o.points[k - 1], d = o.points[k];
            const h1 = Math.abs(a.y - b.y) < 0.05, h2 = Math.abs(c.y - d.y) < 0.05;
            if (h1 !== h2 || Math.abs(h1 ? a.y - c.y : a.x - c.x) >= 6) continue;
            const lo = Math.max(Math.min(h1 ? a.x : a.y, h1 ? b.x : b.y), Math.min(h1 ? c.x : c.y, h1 ? d.x : d.y));
            const hi = Math.min(Math.max(h1 ? a.x : a.y, h1 ? b.x : b.y), Math.max(h1 ? c.x : c.y, h1 ? d.x : d.y));
            if (hi - lo > 10) n++;
          }
        }
        return n;
      };
      // What each line had before the solver moved it, so a move made moot can be undone.
      const home = new Map(uncross ? rs.map((r) => [r, r.points]) : []);
      // The freest lines move first (loose, then plain, then main path), so a line the
      // author pinned down is not the one that gives way to a line that could have moved.
      const rank = (r) => (r.loose ? 0 : r.heavy ? 2 : 1);
      const order = uncross === 'keep' ? rs.slice().sort((a, b) => rank(a) - rank(b)) : rs;
      for (let round = 0; round < (uncross ? 3 : 1); round++) {
      let improved = false;
      for (const r of order) {
        if ((r.loose && !uncross) || r.from === r.to || r.points.length < 2) continue;
        const S = boxOf(r.from), T = boxOf(r.to);
        if (!S || !T) continue;
        const curHits = hitsOf(r.points, r);
        // A graze with no real hit: the rescue weighs crossings too, and may not add one.
        const grazeOnly = !uncross && curHits > 0 && !realHits(r.points);
        const curCross = uncross ? crossOf(r.points, r) : 0;
        const curIn = uncross && curCross ? intrusions(r.points, r) : 0;
        // The closest a move may bring this line's ends to another's: 14, or tighter only
        // where the current route already is.
        const floor = uncross === 'keep' && curCross ? Math.min(14, tightest(r.points, r)) : 0;
        if (uncross ? curHits || !curCross : !curHits) continue;
        const cands = [];
        // In the solver, a line may also keep the ports it already has: they were spread
        // along each side so no two ends meet, and a centered end can land on a neighbor's.
        const p0 = r.points[0], pN = r.points[r.points.length - 1];
        // A port is kept only on the side it sits on: a top/bottom port supplies an x, a
        // left/right one a y, and never a corner.
        const sideOf = (q, b) => [Math.abs(q.x - b.x), Math.abs(q.x - b.x - b.w), Math.abs(q.y - b.y), Math.abs(q.y - b.y - b.h)].reduce((m, d, i, a) => (d < a[m] ? i : m), 0);
        const onLR = (q, b) => (Math.abs(q.x - b.x) < 0.5 || Math.abs(q.x - b.x - b.w) < 0.5) && q.y > b.y + 0.5 && q.y < b.y + b.h - 0.5;
        const onTB = (q, b) => (Math.abs(q.y - b.y) < 0.5 || Math.abs(q.y - b.y - b.h) < 0.5) && q.x > b.x + 0.5 && q.x < b.x + b.w - 0.5;
        const keepSX = uncross === 'keep' && onTB(p0, S) ? [p0.x] : [], keepSY = uncross === 'keep' && onLR(p0, S) ? [p0.y] : [];
        const keepX = uncross === 'keep' && onTB(pN, T) ? [pN.x] : [], keepY = uncross === 'keep' && onLR(pN, T) ? [pN.y] : [];
        // Boxes that overlap across the gap can be joined by one straight run.
        if (uncross === 'keep') {
          const Sr0 = S.x + S.w, Tr0 = T.x + T.w, Sb0 = S.y + S.h, Tb0 = T.y + T.h;
          const x0 = Math.max(S.x, T.x) + PAD, x1 = Math.min(Sr0, Tr0) - PAD;
          if (x0 <= x1) {
            const [ya, yb] = Sb0 <= T.y ? [Sb0, T.y] : Tb0 <= S.y ? [S.y, Tb0] : [null, null];
            if (ya != null) for (const x of [(x0 + x1) / 2, clamp(p0.x, x0, x1), clamp(pN.x, x0, x1)]) cands.push([{ x, y: ya }, { x, y: yb }]);
          }
          const y0 = Math.max(S.y, T.y) + PAD, y1 = Math.min(Sb0, Tb0) - PAD;
          if (y0 <= y1) {
            const [xa, xb] = Sr0 <= T.x ? [Sr0, T.x] : Tr0 <= S.x ? [S.x, Tr0] : [null, null];
            if (xa != null) for (const y of [(y0 + y1) / 2, clamp(p0.y, y0, y1), clamp(pN.y, y0, y1)]) cands.push([{ x: xa, y }, { x: xb, y }]);
          }
        }
        for (const off of [0, 12, -12, 24]) {
        const sy = clamp(T.cy + off, S.y + PAD, S.y + S.h - PAD), ty = clamp(S.cy + off, T.y + PAD, T.y + T.h - PAD);
        const sx = clamp(T.cx + off, S.x + PAD, S.x + S.w - PAD), tx = clamp(S.cx + off, T.x + PAD, T.x + T.w - PAD);
        const around = AROUND + Math.abs(off);
        const Sr = S.x + S.w, Sb = S.y + S.h, Tr = T.x + T.w, Tb = T.y + T.h;
        // Horizontal out, horizontal in (a Z, or a U around both boxes).
        for (const [x0, x1, mid] of [
          [Sr, T.x, (Sr + T.x) / 2], [S.x, Tr, (S.x + Tr) / 2],
          [Sr, Tr, Math.max(Sr, Tr) + around], [S.x, T.x, Math.min(S.x, T.x) - around],
        ]) {
          const outR = x0 === Sr, inL = x1 === T.x;
          if (outR ? mid <= x0 : mid >= x0) continue;
          if (inL ? mid >= x1 : mid <= x1) continue;
          for (const y1 of [ty, T.cy, ...keepY]) for (const y0 of [sy, ...keepSY]) cands.push([{ x: x0, y: y0 }, { x: mid, y: y0 }, { x: mid, y: y1 }, { x: x1, y: y1 }]);
        }
        // Vertical out, vertical in.
        for (const [y0, y1, mid] of [
          [Sb, T.y, (Sb + T.y) / 2], [S.y, Tb, (S.y + Tb) / 2],
          [Sb, Tb, Math.max(Sb, Tb) + around], [S.y, T.y, Math.min(S.y, T.y) - around],
        ]) {
          const outB = y0 === Sb, inT = y1 === T.y;
          if (outB ? mid <= y0 : mid >= y0) continue;
          if (inT ? mid >= y1 : mid <= y1) continue;
          for (const x1 of [tx, T.cx, ...keepX]) for (const x0 of [sx, ...keepSX]) cands.push([{ x: x0, y: y0 }, { x: x0, y: mid }, { x: x1, y: mid }, { x: x1, y: y1 }]);
        }
        // L shapes: out one axis, in the other.
        for (const x0 of [Sr, S.x]) {
          const y1 = sy < T.y ? T.y : sy > Tb ? Tb : null;
          if (y1 === null) continue;
          const x1 = clamp(x0 === Sr ? Math.max(Sr + PAD, T.x + PAD) : Math.min(S.x - PAD, Tr - PAD), T.x + PAD, Tr - PAD);
          if (x0 === Sr ? x1 <= Sr : x1 >= S.x) continue;
          cands.push([{ x: x0, y: sy }, { x: x1, y: sy }, { x: x1, y: y1 }]);
        }
        for (const y0 of [Sb, S.y]) {
          const x1 = sx < T.x ? T.x : sx > Tr ? Tr : null;
          if (x1 === null) continue;
          const y1 = clamp(y0 === Sb ? Math.max(Sb + PAD, T.y + PAD) : Math.min(S.y - PAD, Tb - PAD), T.y + PAD, Tb - PAD);
          if (y0 === Sb ? y1 <= Sb : y1 >= S.y) continue;
          cands.push([{ x: sx, y: y0 }, { x: sx, y: y1 }, { x: x1, y: y1 }]);
        }
        }
        const shared = (pts) => sharedOf(pts, r);
        let best = null, bestScore = Infinity, bestCross = Infinity;
        for (const c of cands) {
          const pts = simplify(c);
          if (hitsOf(pts, r)) continue;
          if (uncross && (!roomFor(pts, r) || jogs(pts) || intrusions(pts, r) > curIn || (floor && crowds(pts, r, floor)))) continue;
          const x = uncross || grazeOnly ? crossOf(pts, r) : 0;
          // Leaving or entering by a different side than the line already does costs a
          // turn's worth and more: an org chart's child hung off its parent's flank reads
          // as a different relation, however short the route.
          const turned = uncross === 'keep' ? (sideOf(pts[0], S) !== sideOf(p0, S)) + (sideOf(pts[pts.length - 1], T) !== sideOf(pN, T)) : 0;
          // Every mode prefers a route with a clean run for its label (the solver requires
          // one): the shape rescue once unfolded lines onto runs that left the label
          // straddling a group border.
          const cramped = roomFor(pts, r) ? 0 : 200;
          const score = 300 * x + len(pts) + 24 * (pts.length - 2) + 400 * shared(pts) + 60 * turned + cramped;
          if (score < bestScore) { best = pts; bestScore = score; bestCross = x; }
        }
        if (!best) continue;
        // A line that only grazes a box (no real hit) is a soft fault; it may not be traded
        // for another soft fault, a run shared with a neighbour, or for any crossing (one
        // chart traded a graze for seven).
        if (grazeOnly && (shared(best) > shared(r.points) || bestCross > crossOf(r.points, r))) continue;
        // Uncrossing is a trade: take a detour only when it strictly removes crossings, and
        // never one that more than doubles the line (a long way round reads worse than a crossing).
        // A main-path line may change course but not wander: it keeps within a few units of its
        // length and one extra turn, so the lighter lines around it give way instead.
        const detour = r.heavy ? len(best) > len(r.points) + 24 || best.length > r.points.length + 1 : len(best) > 2 * len(r.points) + 120;
        if (uncross && (bestCross >= curCross || shared(best) > shared(r.points) || detour)) continue;
        r.points = best;
        if (r.labelAt) r.labelAt = onLongestRun(best);
        improved = true;
      }
      if (!improved) break;
      }
      // Lines move one at a time, so a line that gave way to another may find that other
      // moved later and its own detour now buys nothing (the demo's org chart: Planning left
      // Finance by its side to dodge the advisory line, which then went under the row).
      // Such a line goes home when home is now no worse on anything the solver weighs.
      if (uncross === 'keep') {
        for (const r of rs) {
          const was = home.get(r);
          if (!was || was === r.points) continue;
          if (hitsOf(was, r) || crossOf(was, r) > crossOf(r.points, r) || sharedOf(was, r) > sharedOf(r.points, r) || intrusions(was, r) > intrusions(r.points, r) || crowds(was, r, Math.min(14, tightest(r.points, r)))) continue;
          r.points = was;
          if (r.labelAt) r.labelAt = onLongestRun(was);
        }
      }
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
        // Two neighboring ends that both carry a label leave far enough apart for the
        // labels to pass each other when the lines run side by side (horizontal runs
        // only: a vertical run's label sits across it, not beside it).
        const tall = (it) => (it.r.labelSize && horizSide ? it.r.labelSize.h + 4 : 14);
        const gaps = list.slice(1).map((it, j) => Math.max(14, Math.min(tall(it), tall(list[j]))));
        const want = gaps.reduce((a, b) => a + b, 0);
        const labeled = gaps.some((gp) => gp > 14);
        const span = Math.min(labeled ? extent - 8 : extent * 0.6, want);
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
  /** How many times two orthogonal paths cross (a proper X, not a touch at an end). */
  function crossings(p, q) {
    let n = 0;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i];
      const ha = Math.abs(a.y - b.y) < 0.05;
      for (let j = 1; j < q.length; j++) {
        const c = q[j - 1], d = q[j];
        const hc = Math.abs(c.y - d.y) < 0.05;
        if (ha === hc) continue;
        const [h0, h1, hy] = ha ? [Math.min(a.x, b.x), Math.max(a.x, b.x), a.y] : [Math.min(c.x, d.x), Math.max(c.x, d.x), c.y];
        const [v0, v1, vx] = ha ? [Math.min(c.y, d.y), Math.max(c.y, d.y), c.x] : [Math.min(a.y, b.y), Math.max(a.y, b.y), a.x];
        if (vx > h0 + 0.5 && vx < h1 - 0.5 && hy > v0 + 0.5 && hy < v1 - 0.5) n++;
      }
    }
    return n;
  }
  // Crossings are a cost to minimize, not a defect to forbid: some graphs cannot be drawn
  // without one. So they sit beside the quality counts, not in them, and a test pins the total.
  function countCrossings(routes) {
    let n = 0;
    for (let i = 0; i < routes.length; i++) for (let k = i + 1; k < routes.length; k++) n += crossings(routes[i].points, routes[k].points);
    return n;
  }
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
    // A line folding back through its OWN start or end box (it leaves, turns, and re-enters)
    // is the fault the count above cannot see, since it exempts both ends. Self-loops and
    // group ends (drawn to the border from inside) are not counted.
    let linesThroughEnds = 0;
    for (const r of routes) {
      if (r.from === r.to) continue;
      const own = [nodes[r.from], nodes[r.to]].filter(Boolean);
      let hit = false;
      for (const b of own) for (let j = 1; j < r.points.length && !hit; j++) hit = segHits(r.points[j - 1], r.points[j], b);
      if (hit) linesThroughEnds++;
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
    // Half a unit of slack both ways: a label that only touches the border (289.79999 against
    // a border at 289.8) is outside the group, not across it.
    let labelsAcrossBorders = 0;
    for (const lb of lbs) for (const b of Object.values(gboxes)) {
      const within = lb.x >= b.x - 0.5 && lb.y >= b.y - 0.5 && lb.x + lb.w <= b.x + b.w + 0.5 && lb.y + lb.h <= b.y + b.h + 0.5;
      if (overlaps(lb, { x: b.x + 0.5, y: b.y + 0.5, w: b.w - 1, h: b.h - 1 }) && !within) labelsAcrossBorders++;
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
    return { linesThroughShapes, linesThroughEnds, labelCollisions, shapeOverlaps, labelsOffLine, linesThroughTitles, labelsAcrossBorders, sharedRuns };
  }

  /**
   * Lay the graph out and pick the direction: a pinned `dir` is honored; otherwise both
   * are scored by the scale they would get in the stage (`stage: {w, h}`), capped at
   * `maxScale`, and the larger wins (the state chart's fit rule, reused). Where a shape
   * grows for its fan (see layoutOnce), each direction is laid out grown and plain, and
   * the grown one is kept only by the rule at its choice below.
   */
  function layout(model, sizes, opts, dagre) {
    const dirs = opts.dir === 'lr' || opts.dir === 'tb' ? [opts.dir] : ['lr', 'tb'];
    let best = null;
    const scaled = (geo) => {
      const st = opts.stage || { w: geo.width, h: geo.height };
      const k = Math.min(opts.maxScale != null ? opts.maxScale : 1.2, st.w / Math.max(1, geo.width), st.h / Math.max(1, geo.height));
      geo.scale = Math.round(k * 1000) / 1000;
      return geo;
    };
    // Hard faults outrank soft ones: one line through a shape is worse than any number of
    // crowded labels.
    const HARD = ['linesThroughShapes', 'linesThroughEnds', 'shapeOverlaps', 'labelsOffLine'];
    const hard = (geo) => HARD.reduce((a, k) => a + (geo.quality[k] || 0), 0);
    const soft = (geo) => Object.values(geo.quality).reduce((a, b) => a + b, 0) - hard(geo);
    // [hard, soft, crossings, crowded ends, grazes], compared in that order.
    const rank = (geo) => [hard(geo), soft(geo), geo.crossings, geo.tidy.crowded, geo.tidy.grazes];
    const cmp = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
    for (const d of dirs) {
      // Growing a fanning shape moves dagre's placement too, which can cost a crossing
      // elsewhere; so each direction is laid out both ways. The grown one is kept only when
      // it is no worse on hard faults, soft faults and crossings, and either buys something
      // (fewer of any of those, or fewer crowded ends or grazes) or costs no type at all. A
      // growth that buys nothing and shrinks the type must not tip the direction choice
      // below: its 3% and that 3% used to add up.
      const grown = layoutOnce(model, sizes, { ...opts, dir: d }, dagre);
      if (!grown) return null;
      scaled(grown);
      // Nothing grew: the second run would repeat the first.
      const plain = grown.grew ? scaled(layoutOnce(model, sizes, { ...opts, dir: d, grow: false }, dagre)) : grown;
      const rg = rank(grown), rp = rank(plain);
      const noWorse = rg[0] <= rp[0] && rg[1] <= rp[1] && rg[2] <= rp[2];
      const buys = cmp(rg, rp) < 0;
      const geo = grown === plain || (noWorse && (buys ? grown.scale >= plain.scale * 0.97 : grown.scale >= plain.scale)) ? grown : plain;
      // Ties go to the first direction in preference order: a hair of difference must not
      // flip a chart between edits. Each direction is judged by the best type it can reach,
      // grown or plain, so a growth kept for its ports cannot tip the direction by the few
      // percent it cost.
      const reach = Math.max(grown.scale, plain.scale);
      if (!best || reach > best.reach * 1.03) best = { geo, reach };
    }
    return best.geo;
  }

  return { layout, layoutOnce, simplify };
}

module.exports = { graphLayoutKernel };
