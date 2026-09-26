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
 * WHY THE LINES NEVER CROSS A SHAPE, EACH OTHER'S RUNS, OR A LABEL. dagre places the
 * boxes (and reserves each label's room, `labelpos: 'c'`); `solveRoutes` then draws every
 * line against ONE cost. The things a reader must never see (a line through a box, back
 * through its own ends, along another line's run) are not candidates at all; everything
 * else is priced in the owner's order on #2385: crossings, then side middles and
 * symmetry, then turns, then length. A label is part of its line's cost: each candidate is
 * charged for the best seat it offers, clear of shapes, borders, titles, other labels and
 * other lines, and every label is re-seated once the drawing is finished. Group titles
 * take the first slot in their band that no line or label crosses. `measureQuality`
 * counts what is left, and the unit gallery holds every count to zero.
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
    // so the router can give every line its own port 12 units apart: six lines off a box
    // 42 tall were once squeezed 5 units apart, and the crowd turned into detours (the demo
    // deck's line-vocabulary slide).
    const PORT = 12;
    const outs = new Map(), ins = new Map();
    let grew = false;
    for (const e of model.edges || []) {
      if (e.style?.loose || e.from === e.to) continue;
      const [a, b] = e.back ? [e.to, e.from] : [e.from, e.to];
      outs.set(a, (outs.get(a) || 0) + 1);
      ins.set(b, (ins.get(b) || 0) + 1);
    }
    // Self-loops nest at one corner of their box (top-right in lr, bottom-right in tb),
    // each 10 units outside the one before it. dagre never sees loops, so the nesting's
    // room is reserved on the box, on both sides the loops reach, and taken back off
    // after layout: `loopPad` is { r, t, b } in units, keyed by shape.
    const loopCount = {};
    for (const e of model.edges || []) if (e.from === e.to && !e.style?.loose) loopCount[e.from] = (loopCount[e.from] || 0) + 1;
    const loopPad = {};
    for (const [id, c] of Object.entries(loopCount)) {
      const j = 10 * (c - 1);
      loopPad[id] = dir === 'LR' ? { r: j, t: j, b: 0 } : { r: j, t: 0, b: j };
    }
    for (const s of shapes) {
      const z = sizes[s.id] || { w: 96, h: 40 };
      const k = Math.max(outs.get(s.id) || 0, ins.get(s.id) || 0);
      const need = opts.grow !== false && k >= 3 ? (k - 1) * PORT + 16 : 0; // the router keeps 8 clear at each corner
      let w = z.w, h = z.h;
      if (dir === 'LR') h = Math.max(h, need); else w = Math.max(w, need);
      if (w !== z.w || h !== z.h) {
        grew = true;
        if (s.shape === 'circle') w = h = Math.max(w, h);
      }
      const lp = loopPad[s.id] || { r: 0, t: 0, b: 0 };
      g.setNode(key.get(s.id), { width: Q(w) + lp.r, height: Q(h) + lp.t + lp.b });
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
    for (const s of shapes) {
      const b = box(key.get(s.id)), lp = loopPad[s.id];
      if (lp) {
        b.y += lp.t;
        b.h -= lp.t + lp.b;
        b.w -= lp.r;
        b.cx = b.x + b.w / 2;
        b.cy = b.y + b.h / 2;
      }
      nodes[s.id] = b;
    }
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
    const loopsOn = {};
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
        // Self-loop: a hook off the far corner, outside the box. A later loop on the same
        // box nests outside the one before it: its outer runs 10 units further out, its
        // ends further from the corner along both sides (spaced to stay on the box), so
        // no two loops cross or share a run.
        const n = nodes[rec.a];
        const k = (loopsOn[rec.a] = (loopsOn[rec.a] || 0) + 1) - 1, c = loopCount[rec.a] || 1;
        const o = 10 * k;
        const ey = c > 1 ? Math.min(10, Math.max(0, (lr ? n.h / 2 + 2 : n.h / 2 - 4)) / (c - 1)) * k : 0;
        const ex = c > 1 ? Math.min(10, Math.max(0, n.w / 2 - 4) / (c - 1)) * k : 0;
        const outX = n.x + n.w + 18 + o;
        if (lr) {
          const endY = n.cy - 6 + ey, outY = n.y - 14 - o;
          pts = [{ x: n.x + n.w, y: endY }, { x: outX, y: endY }, { x: outX, y: outY }, { x: n.cx - ex, y: outY }, { x: n.cx - ex, y: n.y }];
          if (rec.label) labelAt = { x: (outX + n.cx - ex) / 2, y: outY };
        } else {
          const endY = n.cy - ey, outY = n.y + n.h + 14 + o;
          pts = [{ x: n.x + n.w, y: endY }, { x: outX, y: endY }, { x: outX, y: outY }, { x: n.cx - ex, y: outY }, { x: n.cx - ex, y: n.y + n.h }];
          if (rec.label) labelAt = { x: outX, y: (endY + outY) / 2 };
        }
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

    // The solver routes every line and seats every label as one cost (solveRoutes).
    for (const r of routes) r.points = simplify(r.points.map((p) => ({ x: R1(p.x), y: R1(p.y) })));
    solveRoutes(routes, { nodes, gboxes, lineageOf, groups, lr, tips: new Set(shapes.filter((x) => x.shape === 'diamond').map((x) => x.id)), titleSizes: opts.groupTitleSizes || {}, titleInset: sp.titleInset != null ? sp.titleInset : 10 });

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

    // The shape or group and every group holding it.
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

  }

  /**
   * THE ROUTER: one objective, one search. dagre places the boxes; this draws every line.
   *
   * Every line is a sequence of runs between two PORTS, each on a side of its end box,
   * leaving and arriving square to that side for at least STUB (so a head always has a run
   * to sit on). For each line the search enumerates candidates over every sensible pair of
   * sides: straight, L, a Z or U through one lane, a route through two lanes. Lanes are the
   * free channels between boxes (and around them), with offsets so neighbors can pass.
   *
   * Each candidate is scored by ONE cost (the weights are `W`), in the owner's order
   * (#2385):
   *  - never: through any box (a stranger's box grown by HALO, so no graze either), back
   *    into its own box, or along another line's run;
   *  - then crossings and a label with no clean seat (1000 each), a run along a title
   *    band, foreign group borders, a jog shorter than 12, a label struck by a line;
   *  - then balance: ports off a side's middle (a diamond's tips most of all), crowded
   *    sides, a fan drawn lopsided;
   *  - then turns, then length, and growing the drawing past what it already spans (which
   *    shrinks the whole chart's type).
   * The phases, each keeping only what lowers the cost:
   *  1. SWEEPS. Lines are routed heaviest first, then any line still paying for a collision
   *     is ripped up and rerouted against all the others, up to four sweeps or until one
   *     changes nothing.
   *  2. SPREAD. Each side's ends move SLOT apart by the least movement (`placeAround`),
   *     around fixed ends (self-loops, and straight lines when the side also has bent
   *     ones), in the order that crosses nothing (see `heading`). A straight line whose two
   *     ends moved apart is aligned again. Moved lines are rerouted with their ports held;
   *     the last passes hold their sides too, so the spread converges. A line with no
   *     route keeps its ends slid only if that breaks no never-rule, then tries a strict
   *     search, and otherwise keeps the route it had.
   *  3. SETTLE and RELAX. An end whose neighbors have since left its side is freed again;
   *     a line that still detours is routed again against the finished drawing.
   *  4. STRAIGHTEN. A jog shorter than 12 is removed by sliding one end, or a whole side's
   *     ends together, when that loses turns and costs no more.
   *  5. SYMMETRY. A fan whose far ends sit mirrored about its parent is drawn mirrored.
   *  6. LABELS. Every label is seated again against the finished drawing.
   * A work budget (BUDGET candidate evaluations) bounds a dense chart: past it the first
   * sweep and the spread still run and the refinements stop.
   * Deterministic: fixed orders, no randomness, and a budget counted in work, not time.
   */
  function solveRoutes(rs, ctx) {
    const { nodes, gboxes, lineageOf, groups } = ctx;
    const STUB = 14, SLOT = 14, HALO = 6, NEAR = 6;
    const W = { cross: 1000, label: 1000, thru: 300, foreign: 400, band: 2500, arrive: 120, load: 20, bend: 40, kink: 300, cramped: 300, offMid: 2, sym: 120, inside: 100, hug: 40, out: 6, tipOff: 20, tipLoad: 600 };
    const lr = ctx.lr;
    const aLo = (b) => (lr ? b.x : b.y), aHi = (b) => (lr ? b.x + b.w : b.y + b.h), aMid = (b) => (lr ? b.cx : b.cy);
    // A line arrives on the side of its target that faces its source along the flow, when
    // the source lies upstream or downstream of it: a child is entered from the top in a
    // top-to-bottom chart, never from its flank. (Leaving by a flank is fine: that is the
    // owner's side balance.)
    const facing = (S, T) => (aMid(S) < aLo(T) ? (lr ? 'L' : 'T') : aMid(S) > aHi(T) ? (lr ? 'R' : 'B') : null);
    const boxOf = (id) => nodes[id] || gboxes[id];
    const NORMAL = { L: { x: -1, y: 0 }, R: { x: 1, y: 0 }, T: { x: 0, y: -1 }, B: { x: 0, y: 1 } };
    const onVertical = (side) => side === 'L' || side === 'R';
    const sideLen = (b, side) => (onVertical(side) ? b.h : b.w);
    const portAt = (b, side, off) => {
      if (side === 'L') return { x: b.x, y: b.cy + off };
      if (side === 'R') return { x: b.x + b.w, y: b.cy + off };
      if (side === 'T') return { x: b.cx + off, y: b.y };
      return { x: b.cx + off, y: b.y + b.h };
    };
    const sideOf = (q, b) => {
      const d = { L: Math.abs(q.x - b.x), R: Math.abs(q.x - b.x - b.w), T: Math.abs(q.y - b.y), B: Math.abs(q.y - b.y - b.h) };
      return Object.keys(d).reduce((m, k) => (d[k] < d[m] ? k : m));
    };
    const len = (pts) => pts.slice(1).reduce((a, q, j) => a + Math.abs(q.x - pts[j].x) + Math.abs(q.y - pts[j].y), 0);
    const grown = (b, m) => ({ x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m });
    // Each group's title band, and the room a title needs in it (placeTitles' rule: the
    // title plus 6 clear each side, between the insets).
    const bands = groups.filter((g) => gboxes[g.id]).map((g) => {
      const b = gboxes[g.id], z = ctx.titleSizes[g.id] || { w: g.name.length * 7 + 8 };
      return { x: b.x, y: b.y + 6, w: b.w, h: 14, lo: b.x + ctx.titleInset - 6, hi: b.x + b.w - ctx.titleInset + 6, need: z.w + 12 };
    });
    // Where the other lines already cut each band, gathered once per route (`cutsFor`).
    let bandCuts = null;
    const cutsOf = (band, pts, into) => {
      for (let j = 1; j < pts.length; j++) {
        const a = pts[j - 1], q = pts[j];
        if (pathHits([a, q], band)) into.push([Math.min(a.x, q.x), Math.max(a.x, q.x)]);
      }
      return into;
    };
    const cutsFor = (r) => bands.map((band) => {
      const cuts = [];
      for (const o of work) if (o !== r && port.has(o)) cutsOf(band, o.points, cuts);
      for (const o of loops) cutsOf(band, o.points, cuts);
      // placeTitles steps around labels as well as lines.
      for (const [o, lb] of labelOf) if (o !== r && overlaps(lb, band)) cuts.push([lb.x, lb.x + lb.w]);
      return cuts;
    });
    // Is there still a slot for the title once `extra` runs cross its band too?
    const titleFits = (band, extra) => slotLeft(band, cutsOf(band, extra, bandCuts[bands.indexOf(band)].slice()));
    const slotLeft = (band, cuts) => {
      cuts.sort((u, v) => u[0] - v[0]);
      let from = band.lo;
      for (const [a, q] of cuts) {
        if (a - from >= band.need) return true;
        from = Math.max(from, q);
      }
      return band.hi - from >= band.need;
    };

    // Lanes: the midline of every channel between box edges, with offsets either side, and
    // lanes just outside the whole drawing. Coordinates closer than 3 merge.
    const lanes = (edges, lo, hi) => {
      const e = [...new Set(edges.map((v) => Math.round(v * 2) / 2))].sort((a, b) => a - b);
      const out = [lo - 20, lo - 32, hi + 20, hi + 32];
      for (let i = 1; i < e.length; i++) {
        const a = e[i - 1], b = e[i];
        if (b - a < 2 * HALO + 4) continue;
        const mid = (a + b) / 2;
        for (const d of [0, -8, 8, -16, 16, -24, 24]) if (mid + d > a + HALO + 1 && mid + d < b - HALO - 1) out.push(mid + d);
      }
      for (const v of e) out.push(v - HALO - 8, v + HALO + 8);
      const u = [...new Set(out.map((v) => Math.round(v * 2) / 2))].sort((a, b) => a - b);
      return u.filter((v, i) => i === 0 || v - u[i - 1] >= 3);
    };
    const allBoxes = [...Object.values(nodes), ...Object.values(gboxes)];
    const xs = allBoxes.flatMap((b) => [b.x, b.x + b.w]), ys = allBoxes.flatMap((b) => [b.y, b.y + b.h]);
    const LX = lanes(xs, Math.min(...xs), Math.max(...xs)), LY = lanes(ys, Math.min(...ys), Math.max(...ys));

    const work = rs.filter((r) => r.from !== r.to && boxOf(r.from) && boxOf(r.to));
    // Self-loops keep their hook, drawn before this; every other line treats them as fixed
    // lines it may not run along or cross, and their ends load their sides.
    const loops = rs.filter((r) => r.from === r.to && r.points.length > 1);
    // ends[id|side] = the routes (and which end) currently on that side of that box
    const port = new Map(); // route -> { start: {side, off}, end: {side, off} }

    // Two runs within NEAR of each other, parallel, overlapping more than 10, are one line
    // to a reader. Runs that leave (or reach) the same box side are exempt until the ports
    // spread: they start at one provisional point by design.
    const sharesRun = (pts, r, o) => {
      // The exempt pairs: the two runs that touch the one side both lines use.
      const po = port.get(o), q = o.points, J = pts.length - 1, Kq = q.length - 1;
      // In strict mode (the spread's last fallback) an end the spread has locked is never
      // exempt: a run on top of it is a shared run like any other.
      const exempt = (j, k) => !!po && !(strict && ((j === 1 && (o.from === r.from ? po.start.lock : po.end.lock)) || (j === J && (o.to === r.to ? po.end.lock : po.start.lock)))) && (
        (j === 1 && ((o.from === r.from && po.start.side === cur.sS && k === 1) || (o.to === r.from && po.end.side === cur.sS && k === Kq))) ||
        (j === J && ((o.to === r.to && po.end.side === cur.sT && k === Kq) || (o.from === r.to && po.start.side === cur.sT && k === 1))));
      for (let j = 1; j < pts.length; j++) for (let k = 1; k < q.length; k++) {
        const a = pts[j - 1], b = pts[j], c = q[k - 1], d = q[k];
        const h1 = Math.abs(a.y - b.y) < 0.05, h2 = Math.abs(c.y - d.y) < 0.05;
        if (h1 !== h2 || Math.abs(h1 ? a.y - c.y : a.x - c.x) >= NEAR) continue;
        const lo = Math.max(Math.min(h1 ? a.x : a.y, h1 ? b.x : b.y), Math.min(h1 ? c.x : c.y, h1 ? d.x : d.y));
        const hi = Math.min(Math.max(h1 ? a.x : a.y, h1 ? b.x : b.y), Math.max(h1 ? c.x : c.y, h1 ? d.x : d.y));
        if (hi - lo <= 10) continue;
        if (exempt(j, k)) continue;
        return true;
      }
      return false;
    };
    let cur = null; // the side pair under evaluation, for sharesRun's exemption
    let strict = false; // see sharesRun
    let wide = false; // the two-lane search's last resort: more lanes, every side pair
    const boxes = new WeakMap(); // points array -> its bounding box
    const bboxOf = (pts) => {
      let b = boxes.get(pts);
      if (!b) {
        b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
        for (const q of pts) { b.x0 = Math.min(b.x0, q.x); b.x1 = Math.max(b.x1, q.x); b.y0 = Math.min(b.y0, q.y); b.y1 = Math.max(b.y1, q.y); }
        boxes.set(pts, b);
      }
      return b;
    };
    // Two parallel runs closer than 12 over more than 20 read as a crowded pair, though they
    // stay two lines: a soft cost, so a lane further off wins when it costs little else.
    // (Runs closer than NEAR that overlap are sharesRun's, and never allowed.)
    const hugs = (p, q) => {
      let n = 0;
      for (let j = 1; j < p.length; j++) for (let k = 1; k < q.length; k++) {
        const a = p[j - 1], b = p[j], c = q[k - 1], d = q[k];
        const h1 = Math.abs(a.y - b.y) < 0.05, h2 = Math.abs(c.y - d.y) < 0.05;
        if (h1 !== h2) continue;
        const gap = Math.abs(h1 ? a.y - c.y : a.x - c.x);
        if (gap >= 12) continue;
        const lo = Math.max(Math.min(h1 ? a.x : a.y, h1 ? b.x : b.y), Math.min(h1 ? c.x : c.y, h1 ? d.x : d.y));
        const hi = Math.min(Math.max(h1 ? a.x : a.y, h1 ? b.x : b.y), Math.max(h1 ? c.x : c.y, h1 ? d.x : d.y));
        if (gap >= NEAR && hi - lo > 20) n++;
        // Runs whose ends nearly meet, in line or a step apart, read as one line through
        // both: five hugs.
        else if (hi - lo <= 10 && hi - lo > -12) n += 5;
      }
      return n;
    };

    // The part of a candidate's cost that needs no collision test: a lower bound on the
    // whole, so candidates can be sorted by it and the search stop early.
    let loads = null; // id|side -> ends of OTHER lines there, for the line being routed
    const loadsFor = (r) => {
      const m = new Map();
      for (const o of loops) {
        const b = boxOf(o.from);
        if (!b) continue;
        for (const q of [o.points[0], o.points[o.points.length - 1]]) { const k = `${o.from}|${sideOf(q, b)}`; m.set(k, (m.get(k) || 0) + 1); }
      }
      for (const [o, p] of port) if (o !== r) {
        m.set(`${o.from}|${p.start.side}`, (m.get(`${o.from}|${p.start.side}`) || 0) + 1);
        m.set(`${o.to}|${p.end.side}`, (m.get(`${o.to}|${p.end.side}`) || 0) + 1);
      }
      return m;
    };
    // The drawing's frame: every box and group. `env` adds the other lines, per route.
    const frame = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const b of [...Object.values(nodes), ...Object.values(gboxes)]) { frame.x0 = Math.min(frame.x0, b.x); frame.y0 = Math.min(frame.y0, b.y); frame.x1 = Math.max(frame.x1, b.x + b.w); frame.y1 = Math.max(frame.y1, b.y + b.h); }
    let env = null;
    const cap = (b, side) => Math.max(1, Math.floor((sideLen(b, side) - 16) / 10) + 1);
    const cheap = (pts, r, sS, sT, offS, offT) => {
      const S = boxOf(r.from), T = boxOf(r.to);
      let c = 0;
      const face = facing(S, T);
      if (face && sT !== face) c += W.arrive;
      const nS = loads.get(`${r.from}|${sS}`) || 0, nT = loads.get(`${r.to}|${sT}`) || 0;
      // A side holds one end per 10 units of its length (less 8 clear at each corner); a
      // full side is not a candidate at all, so a crowd moves to another side.
      if (nS >= cap(S, sS) || nT >= cap(T, sT)) return Infinity;
      c += W.load * (nS + nT);
      c += W.offMid * (Math.abs(offS) + Math.abs(offT));
      // A diamond is met at its tips: an end off a tip, or a second end on one, costs far
      // more than on a box, so its lines spread over the four tips first.
      if (ctx.tips.has(r.from)) c += W.tipOff * Math.abs(offS) + W.tipLoad * nS;
      if (ctx.tips.has(r.to)) c += W.tipOff * Math.abs(offT) + W.tipLoad * nT;
      // Growing the drawing past what the boxes and the other lines already span shrinks
      // the type of the whole chart.
      if (env) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const q of pts) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; }
        c += W.out * (Math.max(0, env.x0 - x0) + Math.max(0, x1 - env.x1) + Math.max(0, env.y0 - y0) + Math.max(0, y1 - env.y1));
      }
      c += W.bend * (pts.length - 2) + len(pts);
      for (let j = 2; j < pts.length - 1; j++) if (Math.abs(pts[j].x - pts[j - 1].x) + Math.abs(pts[j].y - pts[j - 1].y) < 12) c += W.kink;
      if (r.labelSize) {
        const need = Math.max(r.labelSize.w, r.labelSize.h) + 12;
        if (!pts.slice(1).some((q, j) => Math.abs(q.x - pts[j].x) + Math.abs(q.y - pts[j].y) >= need)) c += W.cramped;
      }
      return c;
    };
    const haloed = Object.fromEntries(Object.entries(nodes).map(([id, b]) => [id, grown(b, HALO)]));
    const gHalo = Object.fromEntries(Object.entries(gboxes).map(([id, b]) => [id, grown(b, 2)]));
    // A work budget, counted in candidate evaluations so the result is the same on every
    // machine: every corpus chart and the demo deck stay far under it (17,370 at most);
    // a dense chart past it keeps its first sweep and a spread that holds sides, and skips
    // the refinements (more sweeps, two-lane routes, settle, straighten, symmetry).
    const BUDGET = 20000;
    let evals = 0;
    const over = () => evals > BUDGET;
    let mine = null; // the lineage of the line being routed
    let oneSided = []; // the groups the line enters: holding its target but not its source
    const lineage = (r) => {
      const a = lineageOf(r.from), b = lineageOf(r.to);
      mine = new Set([...a, ...b]);
      oneSided = [...b].filter((g) => gboxes[g] && g !== r.to && !a.has(g));
    };
    // A label is part of its route: each candidate is charged for the best seat it offers,
    // against the shapes, the group borders and titles, and every label already seated.
    const labelOf = new Map(); // route -> its seated label box
    const seatOf = new WeakMap(); // candidate points -> { at, c }
    const boxAt = (r, q) => ({ x: q.x - r.labelSize.w / 2, y: q.y - r.labelSize.h / 2, w: r.labelSize.w, h: r.labelSize.h });
    const seatCost = (r, box) => {
      const near = { x: box.x - 4, y: box.y - 3, w: box.w + 8, h: box.h + 6 };
      let c = 0;
      for (const id in nodes) if (overlaps(near, nodes[id])) c += overlaps(box, nodes[id]) ? W.label : 30;
      for (const id in gboxes) {
        const g = gboxes[id];
        if (overlaps(box, g) && !(box.x >= g.x && box.y >= g.y && box.x + box.w <= g.x + g.w && box.y + box.h <= g.y + g.h)) c += W.foreign;
      }
      // A title takes the first free slot along its band, so a label there costs it room,
      // not its reading: mild while a slot is left, W.band once none is.
      for (let i = 0; i < bands.length; i++) {
        const band = bands[i];
        if (!overlaps(box, band)) continue;
        const cuts = cutsFor(r)[i];
        cuts.push([box.x, box.x + box.w]);
        c += slotLeft(band, cuts) ? 100 : W.band;
      }
      for (const [o, lb] of labelOf) if (o !== r && overlaps(near, lb)) c += overlaps(box, lb) ? W.label : 60;
      // A line through a label strikes its text out, and one grazing it reads as a strike;
      // other lines keep 2 units clear of the label's box (grown by 3; pathHits insets by 1).
      // One passing within 8 crowds it: a small cost, so a roomier seat wins.
      const clear = { x: box.x - 3, y: box.y - 3, w: box.w + 6, h: box.h + 6 };
      const roomy = { x: box.x - 9, y: box.y - 9, w: box.w + 18, h: box.h + 18 };
      for (const o of [...work, ...loops]) {
        if (o === r || (!port.has(o) && o.from !== o.to)) continue;
        if (pathHits(o.points, clear)) c += W.thru + 100;
        else if (pathHits(o.points, roomy)) c += 30;
      }
      return c;
    };
    const labelSeat = (pts, r) => {
      const { w, h } = r.labelSize;
      let best = null;
      for (let j = 1; j < pts.length; j++) {
        const a = pts[j - 1], b = pts[j];
        const horiz = Math.abs(a.y - b.y) < 0.05;
        const room = horiz ? w / 2 + 6 : h / 2 + 3;
        const lo = (horiz ? Math.min(a.x, b.x) : Math.min(a.y, b.y)) + room;
        const hi = (horiz ? Math.max(a.x, b.x) : Math.max(a.y, b.y)) - room;
        if (hi < lo - 0.05) {
          // A run shorter than its label still carries it, centered and overhanging: a
          // self-loop's hook is one, and the parent seated loop labels there.
          const q = horiz ? { x: R1((a.x + b.x) / 2), y: a.y } : { x: a.x, y: R1((a.y + b.y) / 2) };
          const c = seatCost(r, boxAt(r, q)) + 1;
          if (!best || c < best.c) best = { at: q, c };
          continue;
        }
        const mid = (lo + hi) / 2, stepV = Math.max(4, (hi - lo) / 12);
        // The middle first, then outward: a clean seat nearest the run's middle wins.
        for (let k = 0; mid - k * stepV >= lo - 0.05 || mid + k * stepV <= hi + 0.05; k++) {
          for (const v of k ? [mid - k * stepV, mid + k * stepV] : [mid]) {
            if (v < lo - 0.05 || v > hi + 0.05) continue;
            const q = horiz ? { x: R1(v), y: a.y } : { x: a.x, y: R1(v) };
            const c = seatCost(r, boxAt(r, q)) + 0.01 * k;
            if (!best || c < best.c) best = { at: q, c };
          }
          if (best && best.c < 1) break;
        }
        if (best && best.c < 1) break;
      }
      return best || { at: longestRunMid(pts), c: W.label };
    };
    const commit = (r, pts) => {
      r.points = pts;
      if (!r.labelSize) return;
      const s = seatOf.get(pts) || labelSeat(pts, r);
      r.labelAt = s.at;
      labelOf.set(r, boxAt(r, s.at));
    };
    // The full cost of one candidate against every other line as it stands. Infinity = never.
    const costOf = (pts, r, sS, sT, offS, offT, base, limit) => {
      evals++;
      const S = boxOf(r.from), T = boxOf(r.to);
      for (let j = 1; j < pts.length; j++) {
        const a = pts[j - 1], b = pts[j];
        if (Math.abs(a.x - b.x) > 0.05 && Math.abs(a.y - b.y) > 0.05) return Infinity;
      }
      for (const id in nodes) {
        if (id === r.from || id === r.to) {
          if (pathHits(pts, nodes[id])) return Infinity;
          // Past its first and last runs, a line keeps its own boxes' halo too: nothing
          // may ride or circle back along its own border.
          if (pts.length > 3 && pathHits(pts.slice(1, -1), haloed[id])) return Infinity;
          continue;
        }
        if (pathHits(pts, haloed[id])) return Infinity;
      }
      if (gboxes[r.from] && pathHits(pts, S)) return Infinity;
      if (gboxes[r.to] && pathHits(pts, T)) return Infinity;
      cur = { sS, sT };
      let c = base != null ? base : cheap(pts, r, sS, sT, offS, offT);
      // Lines whose boxes stay 12 apart cannot cross, share or crowd this one: skip them.
      const bb = bboxOf(pts);
      for (const o of work) {
        if (o === r || !port.has(o)) continue;
        const ob = bboxOf(o.points);
        if (ob.x0 > bb.x1 + 12 || ob.x1 < bb.x0 - 12 || ob.y0 > bb.y1 + 12 || ob.y1 < bb.y0 - 12) continue;
        if (sharesRun(pts, r, o)) return Infinity;
        c += W.cross * crossings(pts, o.points) + W.hug * hugs(pts, o.points);
        if (limit != null && c >= limit) return c;
      }
      for (const o of loops) {
        if (sharesRun(pts, r, o)) return Infinity;
        c += W.cross * crossings(pts, o.points);
      }
      if (limit != null && c >= limit) return c;
      for (const g of groups) if (gboxes[g.id] && !mine.has(g.id) && pathHits(pts, gHalo[g.id])) c += W.foreign;
      // A line into a group its source is not in enters straight: its turns sit outside.
      // (A line leaving a group turns inside it as it must.)
      for (const gid of oneSided) {
        const gb = gboxes[gid];
        for (let j = 1; j < pts.length - 1; j++) if (pts[j].x > gb.x + 0.5 && pts[j].x < gb.x + gb.w - 0.5 && pts[j].y > gb.y + 0.5 && pts[j].y < gb.y + gb.h - 0.5) c += W.inside;
      }
      // A run ALONG a title band leaves the title no slot; one crossing it takes one spot,
      // and the title takes the first free slot of its width.
      // A line through a title band costs 60 while the title still has a slot there, and
      // W.band once it leaves none.
      for (const band of bands) {
        if (!pathHits(pts, band)) continue;
        c += titleFits(band, pts) ? 60 : W.band;
      }
      for (const [o, lb] of labelOf) if (o !== r && pathHits(pts, lb)) c += W.thru;
      if (r.labelSize && !(limit <= c)) {
        const seat = labelSeat(pts, r);
        seatOf.set(pts, seat);
        c += seat.c;
      }
      return c;
    };
    // The drawing's span without `r`: every box and every other line.
    const envFor = (r) => {
      const e = { ...frame };
      for (const o of [...work, ...loops]) {
        if (o === r || (o.from !== o.to && !port.has(o))) continue;
        const ob = bboxOf(o.points);
        e.x0 = Math.min(e.x0, ob.x0); e.x1 = Math.max(e.x1, ob.x1); e.y0 = Math.min(e.y0, ob.y0); e.y1 = Math.max(e.y1, ob.y1);
      }
      return e;
    };
    const evalFull = (pts, r, sS, sT, offS, offT) => {
      env = envFor(r);
      bandCuts = cutsFor(r);
      loads = loadsFor(r);
      lineage(r);
      return costOf(pts, r, sS, sT, offS, offT);
    };

    // Build one candidate from its ports and core points; null if it doubles back.
    const build = (pS, nS, pT, nT, core) => {
      const raw = [pS, ...core, pT];
      const pts = [];
      for (const q of raw) {
        const last = pts[pts.length - 1];
        if (last && Math.abs(last.x - q.x) < 0.05 && Math.abs(last.y - q.y) < 0.05) continue;
        pts.push({ x: R1(q.x), y: R1(q.y) });
      }
      if (pts.length < 2) return null;
      // No run may reverse the one before it, the first must leave outward, the last
      // arrive inward.
      for (let j = 2; j < pts.length; j++) {
        const ux = Math.sign(pts[j - 1].x - pts[j - 2].x), uy = Math.sign(pts[j - 1].y - pts[j - 2].y);
        const vx = Math.sign(pts[j].x - pts[j - 1].x), vy = Math.sign(pts[j].y - pts[j - 1].y);
        if (ux * vx + uy * vy < 0) return null;
      }
      const out = simplify(pts);
      const f = { x: Math.sign(out[1].x - out[0].x), y: Math.sign(out[1].y - out[0].y) };
      const l = { x: Math.sign(out[out.length - 1].x - out[out.length - 2].x), y: Math.sign(out[out.length - 1].y - out[out.length - 2].y) };
      if (f.x !== nS.x || f.y !== nS.y) return null;
      if (l.x !== -nT.x || l.y !== -nT.y) return null;
      const first = Math.abs(out[1].x - out[0].x) + Math.abs(out[1].y - out[0].y);
      const last = Math.abs(out[out.length - 1].x - out[out.length - 2].x) + Math.abs(out[out.length - 1].y - out[out.length - 2].y);
      if (first < STUB - 0.05 || last < STUB - 0.05) return null;
      return out;
    };

    // The best route for one line, given every other line; `fixed` holds its ports.
    const route = (r, fixed, hold) => {
      const S = boxOf(r.from), T = boxOf(r.to);
      env = envFor(r);
      bandCuts = cutsFor(r);
      loads = loadsFor(r);
      lineage(r);
      let best = null, bestCost = Infinity, bestPort = null;
      let cands = [];
      const tryOne = (pts, sS, sT, offS, offT) => {
        if (!pts) return;
        cands.push({ pts, sS, sT, offS, offT, lb: cheap(pts, r, sS, sT, offS, offT) });
      };
      // Evaluate the collected candidates cheapest bound first; stop once no bound can win.
      const settle = () => {
        cands.sort((u, v) => u.lb - v.lb);
        for (const k of cands) {
          if (k.lb >= bestCost) break;
          const c = costOf(k.pts, r, k.sS, k.sT, k.offS, k.offT, k.lb, bestCost);
          if (c < bestCost) { best = k.pts; bestCost = c; bestPort = { start: { side: k.sS, off: k.offS }, end: { side: k.sT, off: k.offT } }; }
        }
        cands = [];
      };
      const sides = ['R', 'B', 'L', 'T'];
      // Side pairs, cheapest possible first: a pair whose bound (distance between its
      // ports, and the arrival, crowding and turn it cannot avoid) cannot beat the best so
      // far is never built.
      const face = facing(S, T);
      const pairs = [];
      for (const sS of sides) for (const sT of sides) {
        const a = portAt(S, sS, 0), b = portAt(T, sT, 0);
        const turns = sS === sT || (onVertical(sS) !== onVertical(sT) ? 1 : 0);
        const bound = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + (face && sT !== face ? W.arrive : 0) + W.load * ((loads.get(`${r.from}|${sS}`) || 0) + (loads.get(`${r.to}|${sT}`) || 0)) + W.bend * turns;
        pairs.push({ sS, sT, bound });
      }
      pairs.sort((u, v) => u.bound - v.bound);
      const near = (L, a, b) => L.filter((v) => v > Math.min(a, b) - 120 && v < Math.max(a, b) + 120);
      const lx1 = near(LX, S.cx, T.cx), ly1 = near(LY, S.cy, T.cy);
      for (const { sS, sT, bound } of pairs) {
        if (bound >= bestCost) break;
        // A spread line keeps both its sides: only its offsets moved, so the passes converge.
        if (hold && (sS !== fixed.start.side || sT !== fixed.end.side)) continue;
        const offS = fixed && fixed.start.side === sS ? fixed.start.off : 0;
        const offT = fixed && fixed.end.side === sT ? fixed.end.off : 0;
        const pS = portAt(S, sS, offS), pT = portAt(T, sT, offT);
        const nS = NORMAL[sS], nT = NORMAL[sT];
        const qS = { x: pS.x + nS.x * STUB, y: pS.y + nS.y * STUB }, qT = { x: pT.x + nT.x * STUB, y: pT.y + nT.y * STUB };
        // A lower bound (length and the turns this pair needs) that cannot beat the best
        // skips the pair.
        tryOne(build(pS, nS, pT, nT, [qS, qT]), sS, sT, offS, offT);
        // Free ports: a straight run where the two sides overlap, and an L whose port slides
        // along its side to meet the turn, rather than a middle port that forces two more
        // turns. An end is free unless its side is shared and its port was spread there.
        {
          const freeS = !(fixed?.start.lock && fixed.start.side === sS);
          const freeT = !(fixed?.end.lock && fixed.end.side === sT);
          const hS = onVertical(sS), hT = onVertical(sT);
          const spanS = hS ? [S.y + 8, S.y + S.h - 8] : [S.x + 8, S.x + S.w - 8];
          const spanT = hT ? [T.y + 8, T.y + T.h - 8] : [T.x + 8, T.x + T.w - 8];
          const center = (bx, h) => (h ? bx.cy : bx.cx);
          const inS = (v) => v >= spanS[0] && v <= spanS[1], inT = (v) => v >= spanT[0] && v <= spanT[1];
          if (hS === hT && nS.x === -nT.x && nS.y === -nT.y && (freeS || freeT)) {
            const lo = Math.max(spanS[0], spanT[0]), hi = Math.min(spanS[1], spanT[1]);
            const mids = [];
            // Both ends free: the run halfway between the two middles, or at either middle
            // (a diamond wants its tip); one end held: the run where that end is.
            if (freeS && freeT) { if (lo <= hi) for (const v of [(center(S, hS) + center(T, hT)) / 2, center(S, hS), center(T, hT)]) mids.push(Math.min(Math.max(v, lo), hi)); }
            else if (freeT) { const v = hS ? pS.y : pS.x; if (inT(v)) mids.push(v); }
            else { const v = hT ? pT.y : pT.x; if (inS(v)) mids.push(v); }
            for (const mid of new Set(mids.map(R1))) {
              const a = portAt(S, sS, mid - center(S, hS)), bb = portAt(T, sT, mid - center(T, hT));
              tryOne(build(a, nS, bb, nT, []), sS, sT, R1(mid - center(S, hS)), R1(mid - center(T, hT)));
            }
          }
          if (hS !== hT && freeT) {
            // The turn sits on S's stub line; T's port slides along T's side to meet it.
            let c = hS ? pS.x + nS.x * Math.max(STUB, Math.abs(center(T, hT) - pS.x)) : pS.y + nS.y * Math.max(STUB, Math.abs(center(T, hT) - pS.y));
            c = Math.min(Math.max(c, spanT[0]), spanT[1]);
            // The turn may also sit on any lane along the side: the port nearest the middle
            // is not always the one that crosses nothing. The bound prunes the rest cheaply.
            const lanesT = (hT ? LY : LX).filter(inT);
            for (const v of [c, ...lanesT]) {
              if ((hS ? (v - pS.x) * nS.x : (v - pS.y) * nS.y) < STUB - 0.05) continue;
              const bb = portAt(T, sT, v - center(T, hT));
              tryOne(build(pS, nS, bb, nT, [hS ? { x: v, y: pS.y } : { x: pS.x, y: v }]), sS, sT, offS, R1(v - center(T, hT)));
            }
          }
          if (hS !== hT && freeS) {
            // ...or S's port slides along S's side to meet T's stub line.
            let d = hT ? pT.x + nT.x * Math.max(STUB, Math.abs(center(S, hS) - pT.x)) : pT.y + nT.y * Math.max(STUB, Math.abs(center(S, hS) - pT.y));
            d = Math.min(Math.max(d, spanS[0]), spanS[1]);
            const lanesS = (hS ? LY : LX).filter(inS);
            for (const v of [d, ...lanesS]) {
              if ((hT ? (v - pT.x) * nT.x : (v - pT.y) * nT.y) < STUB - 0.05) continue;
              const a = portAt(S, sS, v - center(S, hS));
              tryOne(build(a, nS, pT, nT, [hT ? { x: v, y: pT.y } : { x: pT.x, y: v }]), sS, sT, R1(v - center(S, hS)), offT);
            }
          }
        }
        // A lane outside the span of the two stub points only adds length, so the search
        // tries the lanes inside it and the three nearest either side.
        const pick = (L, a, b) => {
          const lo = Math.min(a, b), hi = Math.max(a, b);
          const inside = [], below = [], above = [];
          for (const v of L) (v < lo ? below : v > hi ? above : inside).push(v);
          // Inside, the lanes near either stub and near the middle are the ones that differ:
          // at most nine of them.
          let mid = inside;
          if (inside.length > 9) {
            const m = (lo + hi) / 2, byMid = inside.slice().sort((u, v) => Math.abs(u - m) - Math.abs(v - m));
            mid = [...new Set([...inside.slice(0, 3), ...inside.slice(-3), ...byMid.slice(0, 3)])];
          }
          return [...below.slice(-3), ...mid, ...above.slice(0, 3)];
        };
        // A lane behind a stub point would double the line back on it: never built.
        const ahead = (v, q, n, axis) => n[axis] === 0 || (v - q[axis]) * n[axis] >= -0.05;
        // A Z's length is known before it is built: a lane whose detour alone cannot beat the
        // best so far is skipped. `bound` already counts the turns the pair cannot avoid, so
        // it is the whole base: counting two more would skip lanes that collapse to an L.
        const zBase = bound;
        const detour = (v, a, b) => Math.abs(a - v) + Math.abs(v - b) - Math.abs(a - b);
        for (const x of pick(lx1, qS.x, qT.x)) if (ahead(x, qS, nS, 'x') && ahead(x, qT, nT, 'x') && zBase + detour(x, qS.x, qT.x) < bestCost) tryOne(build(pS, nS, pT, nT, [qS, { x, y: qS.y }, { x, y: qT.y }, qT]), sS, sT, offS, offT);
        for (const y of pick(ly1, qS.y, qT.y)) if (ahead(y, qS, nS, 'y') && ahead(y, qT, nT, 'y') && zBase + detour(y, qS.y, qT.y) < bestCost) tryOne(build(pS, nS, pT, nT, [qS, { x: qS.x, y }, { x: qT.x, y }, qT]), sS, sT, offS, offT);
        settle();
      }
      // Two lanes only when one lane found nothing clean.
      if (bestCost >= W.cross && !over()) {
        // The four lanes nearest each stub point, on each axis; twelve, and every side
        // pair, in the spread's last resort (`wide`), where the near ones found nothing.
        const nearest = (L, a, b) => {
          const n = wide ? 12 : 4;
          return [...new Set([...L.slice().sort((u, v) => Math.abs(u - a) - Math.abs(v - a)).slice(0, n), ...L.slice().sort((u, v) => Math.abs(u - b) - Math.abs(v - b)).slice(0, n)])];
        };
        for (const { sS, sT, bound } of (hold || wide ? pairs : pairs.slice(0, 6))) {
          if (bound >= bestCost) break;
          if (hold && (sS !== fixed.start.side || sT !== fixed.end.side)) continue;
          const offS = fixed && fixed.start.side === sS ? fixed.start.off : 0;
          const offT = fixed && fixed.end.side === sT ? fixed.end.off : 0;
          const pS = portAt(S, sS, offS), pT = portAt(T, sT, offT);
          const nS = NORMAL[sS], nT = NORMAL[sT];
          const qS = { x: pS.x + nS.x * STUB, y: pS.y + nS.y * STUB }, qT = { x: pT.x + nT.x * STUB, y: pT.y + nT.y * STUB };
          const lx = nearest(LX, qS.x, qT.x), ly = nearest(LY, qS.y, qT.y);
          for (const x of lx) for (const y of ly) {
            tryOne(build(pS, nS, pT, nT, [qS, { x, y: qS.y }, { x, y }, { x: qT.x, y }, qT]), sS, sT, offS, offT);
            tryOne(build(pS, nS, pT, nT, [qS, { x: qS.x, y }, { x, y }, { x, y: qT.y }, qT]), sS, sT, offS, offT);
          }
        }
      }
      settle();
      return best ? { pts: best, cost: bestCost, port: bestPort } : null;
    };

    const order = work.slice().sort((a, b) => (a.loose - b.loose) || (b.heavy - a.heavy) || a.index - b.index);
    const seed = new Map(work.map((r) => [r, r.points]));

    // Sweep 1 builds, later sweeps rip up and reroute, until nothing improves.
    for (let sweep = 0; sweep < 4; sweep++) {
      if (sweep >= 1 && over()) break;
      let changed = false;
      for (const r of order) {
        const had = port.get(r), was = r.points;
        // After the first sweep only a line with something to gain is rerouted: one still
        // paying for a collision.
        if (sweep >= 1 && had) {
          loads = loadsFor(r);
          lineage(r);
          const base = cheap(was, r, had.start.side, had.end.side, had.start.off, had.end.off);
            if (costOf(was, r, had.start.side, had.end.side, had.start.off, had.end.off, base) - base < 1) continue;
        }
        port.delete(r);
        const hadLabel = labelOf.get(r);
        labelOf.delete(r);
        const c0 = had ? evalFull(was, r, had.start.side, had.end.side, had.start.off, had.end.off) : Infinity;
        const got = route(r, null);
        if (got && got.cost < c0 - 0.5) { commit(r, got.pts); port.set(r, got.port); changed = true; }
        else if (had) { port.set(r, had); if (hadLabel) labelOf.set(r, hadLabel); }
        else { commit(r, seed.get(r)); port.set(r, { start: { side: sideOf(r.points[0], boxOf(r.from)), off: 0 }, end: { side: sideOf(r.points[r.points.length - 1], boxOf(r.to)), off: 0 } }); }
      }
      if (!changed) break;
    }

    // Spread: the ends on one side sit symmetrically about its middle, SLOT apart (closer
    // if the side is short), ordered by where each line heads so none crosses another.
    // The offsets of every end on one side of a box but `skip`'s, self-loops' included.
    const endsOn = (id, side, skip) => {
      const offs = [];
      for (const o of work) {
        if (o === skip || !port.has(o)) continue;
        const po = port.get(o);
        if (o.from === id && po.start.side === side) offs.push(po.start.off);
        if (o.to === id && po.end.side === side) offs.push(po.end.off);
      }
      for (const o of loops) {
        const b = boxOf(o.from);
        if (o.from !== id || !b) continue;
        for (const q of [o.points[0], o.points[o.points.length - 1]]) {
          const sd = sideOf(q, b);
          if (sd === side) offs.push(onVertical(side) ? q.y - b.cy : q.x - b.cx);
        }
      }
      return offs;
    };
    // Place ends (wants in order) on a side of half-width `half`, `step` apart from each
    // other and from the fixed offsets, moving them as little as possible. null: no fit.
    const placeAround = (wants, fixedOffs, step, half) => {
      const fx = fixedOffs.slice().sort((u, v) => u - v);
      const gaps = [];
      let lo = -half;
      for (const f of fx) { gaps.push([lo, f - step]); lo = f + step; }
      gaps.push([lo, half]);
      const n = wants.length;
      const fill = (i, j, g) => {
        const [a, b] = gaps[g], k = j - i;
        if (b - a < (k - 1) * step - 0.05) return null;
        const w = wants.slice(i, j), ps = w.slice();
        for (let t = 1; t < k; t++) ps[t] = Math.max(ps[t], ps[t - 1] + step);
        const drift = (ps.reduce((x, v) => x + v, 0) - w.reduce((x, v) => x + v, 0)) / k;
        for (let t = 0; t < k; t++) ps[t] -= drift;
        // Each end has its own window inside the gap (room for the ends before and after
        // it); clamp into it, then push forward: the set stays inside and `step` apart.
        for (let t = 0; t < k; t++) ps[t] = Math.min(Math.max(ps[t], a + t * step), b - (k - 1 - t) * step);
        for (let t = 1; t < k; t++) ps[t] = Math.max(ps[t], ps[t - 1] + step);
        return { ps, c: ps.reduce((x, v, t) => x + Math.abs(v - w[t]), 0) };
      };
      // best[i][g]: the cheapest placement of the first i ends using gaps before g.
      const G = gaps.length;
      const best = Array.from({ length: n + 1 }, () => Array(G + 1).fill(null));
      best[0][0] = { c: 0, ps: [] };
      for (let g = 0; g < G; g++) for (let i = 0; i <= n; i++) {
        const cur = best[i][g];
        if (!cur) continue;
        for (let j = i; j <= n; j++) {
          const f = j === i ? { ps: [], c: 0 } : fill(i, j, g);
          if (!f) break;
          const nx = { c: cur.c + f.c, ps: cur.ps.concat(f.ps) };
          if (!best[j][g + 1] || nx.c < best[j][g + 1].c) best[j][g + 1] = nx;
        }
      }
      return best[n][G] ? best[n][G].ps : null;
    };
    const spread = () => {
      const sides = new Map();
      for (const r of work) {
        const p = port.get(r);
        if (!p) continue;
        for (const at of ['start', 'end']) {
          const id = at === 'start' ? r.from : r.to, side = p[at].side, k = `${id}|${side}`;
          if (!sides.has(k)) sides.set(k, { id, side, list: [] });
          sides.get(k).list.push({ r, at });
        }
      }
      // A self-loop's ends hold their side too: fixed members the others spread around.
      const pins = new Map();
      for (const o of loops) {
        const b = boxOf(o.from);
        if (!b) continue;
        for (const q of [o.points[0], o.points[o.points.length - 1]]) {
          const side = sideOf(q, b);
          const k = `${o.from}|${side}`;
          if (!pins.has(k)) pins.set(k, []);
          pins.get(k).push(onVertical(side) ? q.y - b.cy : q.x - b.cx);
        }
      }
      const moved = new Set();
      for (const { id, side, list: all } of sides.values()) {
        const b = boxOf(id);
        // A straight line holds its end when the side also has bent lines to move instead:
        // spreading its port could leave the other box's side and break the straight run.
        const loopOffs = pins.get(`${id}|${side}`) || [];
        const stiffAll = all.filter((it) => it.r.points.length === 2);
        let stiff = [];
        if (stiffAll.length && stiffAll.length < all.length) {
          const offs = stiffAll.map((it) => port.get(it.r)[it.at].off).concat(loopOffs).sort((u, v) => u - v);
          const s0 = Math.min(SLOT, (sideLen(b, side) - 16) / Math.max(1, all.length + loopOffs.length - 1));
          if (offs.every((v, i) => !i || v - offs[i - 1] >= s0 - 0.05)) stiff = stiffAll;
        }
        for (const it of stiff) { const p = port.get(it.r); p[it.at] = { side, off: p[it.at].off, lock: true }; }
        const list = all.filter((it) => !stiff.includes(it)), n = list.length;
        // The order that crosses nothing: lines turning toward the side's low end, the
        // earliest turn outermost; then lines running straight off, by where they land;
        // then lines turning toward the high end, the earliest turn outermost again.
        const heading = (it) => {
          const pts = it.at === 'start' ? it.r.points : it.r.points.slice().reverse();
          const v = onVertical(side), along = (q) => (v ? q.y : q.x), out = (q) => (v ? q.x : q.y);
          if (pts.length < 3) return along(pts[pts.length - 1]) * 1e-3;
          const turn = Math.sign(along(pts[2]) - along(pts[1])), dist = Math.abs(out(pts[1]) - out(pts[0]));
          return turn < 0 ? -1e6 + dist : turn > 0 ? 1e6 - dist : along(pts[pts.length - 1]) * 1e-3;
        };
        // A lone end keeps the port the search chose for it (an L's port slides to meet its
        // turn). Several share the side around their ends' mean, SLOT apart, kept inside it.
        const fixedOffs = loopOffs.concat(stiff.map((it) => port.get(it.r)[it.at].off));
        if (!n || n + fixedOffs.length < 2) continue;
        list.sort((u, v) => heading(u) - heading(v) || u.r.index - v.r.index);
        // Each end keeps the offset the search chose; ends closer than the step are pushed
        // apart by the least amount, and the set is kept inside the side.
        const room = sideLen(b, side) - 16;
        const step = Math.min(SLOT, room / Math.max(1, n + fixedOffs.length - 1));
        const want = list.map((it) => port.get(it.r)[it.at].off);
        // The pins split the side into gaps; the movable ends, in heading order, fill them
        // left to right with the least total movement (a small exact search), each gap
        // pushed and centered. If they do not fit, the step tightens to 10; then every end
        // on the side moves, straight lines too; then the step shrinks further.
        let pos = placeAround(want, fixedOffs, step, room / 2);
        if (!pos && stiff.length) {
          for (const it of stiff) list.push(it);
          stiff.length = 0;
          list.sort((u, v) => heading(u) - heading(v) || u.r.index - v.r.index);
          want.length = 0;
          want.push(...list.map((it) => port.get(it.r)[it.at].off));
          pos = placeAround(want, loopOffs, Math.min(SLOT, room / Math.max(1, list.length + loopOffs.length - 1)), room / 2);
        }
        if (!pos) pos = placeAround(want, fixedOffs, Math.min(step, 8), room / 2);
        if (!pos) pos = placeAround(want, [], Math.min(step, room / Math.max(1, list.length - 1)), room / 2);
        list.forEach((it, i) => {
          const off = R1(pos[i]);
          const p = port.get(it.r);
          const same = Math.abs(p[it.at].off - off) < 0.05 && p[it.at].lock;
          p[it.at] = { side, off, lock: true };
          if (!same) moved.add(it.r);
        });
      }
      // A straight line between facing sides whose two ends the spread moved apart is
      // aligned again, at either end's new place, where both sides still keep their step.
      for (const r of work) {
        const p = port.get(r);
        if (!p || r.points.length !== 2 || !moved.has(r) || onVertical(p.start.side) !== onVertical(p.end.side) || p.start.side === p.end.side) continue;
        const S = boxOf(r.from), T = boxOf(r.to), v = onVertical(p.start.side);
        const cS = v ? S.cy : S.cx, cT = v ? T.cy : T.cx;
        const aS = cS + p.start.off, aT = cT + p.end.off;
        if (Math.abs(aS - aT) < 0.05) continue;
        const fits = (id, b, side, off) => {
          const room = sideLen(b, side) - 16;
          if (Math.abs(off) > room / 2 + 0.05) return false;
          const others = endsOn(id, side, r);
          const step = Math.min(SLOT, room / Math.max(1, others.length));
          return !others.some((o) => Math.abs(o - off) < step * 0.85 - 0.05);
        };
        for (const at of [aS, aT]) {
          const oS = R1(at - cS), oT = R1(at - cT);
          if (fits(r.from, S, p.start.side, oS) && fits(r.to, T, p.end.side, oT)) {
            p.start = { side: p.start.side, off: oS, lock: true };
            p.end = { side: p.end.side, off: oT, lock: true };
            break;
          }
        }
      }
      return moved;
    };
    // Where each line's ends sat when the spread last looked, to slide from on a fallback.
    const placed = new Map();
    const note = () => { for (const r of work) { const p = port.get(r); if (p) placed.set(r, { start: { ...p.start }, end: { ...p.end } }); } };
    const slideEnds = (r, want, had) => {
      let pts = r.points.map((q) => ({ ...q }));
      for (const at of ['start', 'end']) {
        const d = want[at].off - had[at].off;
        if (Math.abs(d) < 0.05) continue;
        const v = onVertical(want[at].side); // ports on a left/right side move in y
        if (pts.length === 2) {
          // A straight line gets a jog halfway, so only this end moves.
          const a = pts[0], b = pts[1];
          const m = v ? { x: (a.x + b.x) / 2 } : { y: (a.y + b.y) / 2 };
          pts = v ? [a, { x: m.x, y: a.y }, { x: m.x, y: b.y }, b] : [a, { x: a.x, y: m.y }, { x: b.x, y: m.y }, b];
        }
        const j0 = at === 'start' ? 0 : pts.length - 1, j1 = at === 'start' ? 1 : pts.length - 2;
        for (const j of [j0, j1]) pts[j] = v ? { x: pts[j].x, y: R1(pts[j].y + d) } : { x: R1(pts[j].x + d), y: pts[j].y };
      }
      return simplify(pts);
    };
    // Moving a port slides its line's first run along the side; the line is then rerouted
    // with both ports held, which also repairs anything the slide broke.
    for (let pass = 0; pass < 5; pass++) {
      note();
      const moved = spread();
      if (!moved.size) break;
      // Early passes may still move a line to another side; the last holds sides so the
      // spread converges and no port stays shared.
      const hold = pass >= 3 || over();
      for (const r of order) {
        if (!moved.has(r)) continue;
        const fixed = port.get(r);
        const was = placed.get(r) || { start: { off: 0 }, end: { off: 0 } };
        const before = { pts: r.points, label: labelOf.get(r), at: r.labelAt };
        port.delete(r);
        labelOf.delete(r);
        // A line that cannot keep its sides may still move to another one.
        const got = route(r, fixed, hold) || (hold ? route(r, fixed, false) : null);
        if (got) {
          commit(r, got.pts);
          const keep = (g, f) => (g.side === f.side && f.lock ? { ...g, off: f.off, lock: true } : g);
          port.set(r, { start: keep(got.port.start, fixed.start), end: keep(got.port.end, fixed.end) });
          continue;
        }
        // No clean route holds the spread ports: slide the line's ends to them, but only if
        // the slid line still breaks no never-rule
        const slid = slideEnds(r, fixed, was);
        lineage(r);
        loads = loadsFor(r);
        strict = wide = true;
        const free = route(r, null);
        strict = wide = false;
        const apart = (g) => ['start', 'end'].every((w) => !endsOn(w === 'start' ? r.from : r.to, g.port[w].side, r).some((v) => Math.abs(v - g.port[w].off) < NEAR));
        // (and no title left without a slot: a slid line is not searched, so it gets no
        // benefit of the doubt past one crossing)
        if (costOf(slid, r, fixed.start.side, fixed.end.side, fixed.start.off, fixed.end.off) < 2 * W.cross) {
          commit(r, slid);
          port.set(r, fixed);
        } else if (free && apart(free)) {
          // Or any route at all whose ends keep clear of every other end.
          commit(r, free.pts);
          port.set(r, { start: { ...free.port.start, lock: true }, end: { ...free.port.end, lock: true } });
        } else {
          r.points = before.pts;
          r.labelAt = before.at;
          if (before.label) labelOf.set(r, before.label);
          port.set(r, { start: { ...was.start, side: was.start.side || fixed.start.side }, end: { ...was.end, side: was.end.side || fixed.end.side } });
        }
      }
    }
    // Settle: a lock outlives its reason when a neighbor later moved to another side. An end
    // left alone on its side is free again, and its line takes the cheaper route that frees.
    for (const r of order) {
      if (over()) break;
      const had = port.get(r);
      if (!had || !(had.start.lock || had.end.lock)) continue;
      const lockS = had.start.lock && endsOn(r.from, had.start.side, r).length > 0;
      const lockT = had.end.lock && endsOn(r.to, had.end.side, r).length > 0;
      if (lockS === !!had.start.lock && lockT === !!had.end.lock) continue;
      const fixed = { start: { ...had.start, lock: lockS }, end: { ...had.end, lock: lockT } };
      const c0 = evalFull(r.points, r, had.start.side, had.end.side, had.start.off, had.end.off);
      const was = labelOf.get(r);
      port.delete(r);
      labelOf.delete(r);
      const got = route(r, fixed, true);
      if (got && got.cost < c0 - 0.5) {
        commit(r, got.pts);
        port.set(r, { start: { ...got.port.start, lock: lockS }, end: { ...got.port.end, lock: lockT } });
      } else {
        port.set(r, had);
        if (was) labelOf.set(r, was);
      }
    }
    // Relax: a line placed early may owe a detour to a neighbor that has since moved. Each
    // detouring line is routed again, freely, against the finished drawing, in strict mode (it may
    // not land on a placed end), and takes the new route only when it costs less and its
    // ends keep 10 clear of every other end on their sides.
    for (const r of order) {
      if (over()) break;
      const had = port.get(r);
      if (!had) continue;
      const c0 = evalFull(r.points, r, had.start.side, had.end.side, had.start.off, had.end.off);
      // Only a line with a detour to lose: two or more turns, or a crossing it still pays.
      if (r.points.length < 4 && c0 < W.cross) continue;
      const was = labelOf.get(r), at = r.labelAt;
      port.delete(r);
      labelOf.delete(r);
      strict = true;
      const got = route(r, null);
      strict = false;
      const clear = (w) => !endsOn(w === 'start' ? r.from : r.to, got.port[w].side, r).some((v) => Math.abs(v - got.port[w].off) < 10 - 0.05);
      if (got && got.cost < c0 - 0.5 && clear('start') && clear('end')) {
        commit(r, got.pts);
        port.set(r, { start: { ...got.port.start, lock: true }, end: { ...got.port.end, lock: true } });
      } else {
        port.set(r, had);
        r.labelAt = at;
        if (was) labelOf.set(r, was);
      }
    }
    // Straighten: a jog shorter than 12 between two runs is noise a reader stops at. Slide
    // one end along its side by the jog, keeping the step to its neighbors, when the reroute
    // loses turns and costs no more.
    for (const r of order) {
      if (over()) break;
      const pts = r.points, had = port.get(r);
      if (!had || pts.length < 4) continue;
      const jogs = [];
      for (let j = 2; j < pts.length - 1; j++) {
        const l = Math.abs(pts[j].x - pts[j - 1].x) + Math.abs(pts[j].y - pts[j - 1].y);
        if (l < 12) jogs.push({ d: pts[j].x - pts[j - 1].x + pts[j].y - pts[j - 1].y, vert: Math.abs(pts[j].x - pts[j - 1].x) < 0.05 });
      }
      if (!jogs.length) continue;
      const c0 = evalFull(pts, r, had.start.side, had.end.side, had.start.off, had.end.off);
      let best = null;
      for (const { d, vert } of jogs) for (const at of ['start', 'end']) for (const sgn of [1, -1]) {
        const e = had[at], b = boxOf(at === 'start' ? r.from : r.to);
        // A port on a left or right side moves in y, so it removes a vertical jog.
        if (onVertical(e.side) !== vert) continue;
        const off = R1(e.off + sgn * d), room = sideLen(b, e.side) - 16;
        if (Math.abs(off) > room / 2 + 0.05) continue;
        const others = endsOn(at === 'start' ? r.from : r.to, e.side, r);
        const step = Math.min(SLOT, room / Math.max(1, others.length));
        // A step short by a unit or two reads the same; a jog does not.
        if (others.some((v) => Math.abs(v - off) < step * 0.85 - 0.05)) continue;
        const fixed = { start: { ...had.start, lock: true }, end: { ...had.end, lock: true } };
        fixed[at] = { side: e.side, off, lock: true };
        port.delete(r);
        const was = labelOf.get(r);
        labelOf.delete(r);
        const got = route(r, fixed, true);
        port.set(r, had);
        if (was) labelOf.set(r, was);
        if (got && got.pts.length < pts.length && got.cost <= c0 + 0.5 && (!best || got.cost < best.got.cost)) best = { got, fixed };
      }
      if (best) { commit(r, best.got.pts); port.set(r, best.fixed); continue; }
      // Or shift every end on that side together: two lines between the same boxes spread
      // on both sides, and one end alone cannot move past its sibling.
      shift: for (const { d, vert } of jogs) for (const at of ['start', 'end']) for (const sgn of [1, -1]) {
        const e = had[at], id = at === 'start' ? r.from : r.to, b = boxOf(id);
        if (onVertical(e.side) !== vert) continue;
        const group = [];
        for (const o of work) {
          const po = port.get(o);
          if (!po) continue;
          if (o.from === id && po.start.side === e.side) group.push([o, 'start']);
          if (o.to === id && po.end.side === e.side) group.push([o, 'end']);
        }
        if (group.length < 2) continue;
        const room = sideLen(b, e.side) - 16, shift = sgn * d;
        if (group.some(([o, w]) => Math.abs(port.get(o)[w].off + shift) > room / 2 + 0.05)) continue;
        const pins = endsOn(id, e.side, null).filter((v) => !group.some(([o, w]) => Math.abs(port.get(o)[w].off - v) < 0.05));
        const step = Math.min(SLOT, room / Math.max(1, group.length + pins.length - 1));
        if (group.some(([o, w]) => pins.some((v) => Math.abs(port.get(o)[w].off + shift - v) < step * 0.85 - 0.05))) continue;
        // Reroute each member with its shifted end held, against the others as they stand.
        const saved = group.map(([o]) => ({ o, pts: o.points, port: port.get(o), label: labelOf.get(o) }));
        const olds = new Set(group.map(([o]) => o));
        let before = 0, after = 0, bendsBefore = 0, bendsAfter = 0, ok = true;
        for (const { o, pts: op, port: po } of saved) { before += evalFull(op, o, po.start.side, po.end.side, po.start.off, po.end.off); bendsBefore += op.length; }
        for (const o of olds) {
          const po = port.get(o);
          const fixed = { start: { ...po.start, lock: true }, end: { ...po.end, lock: true } };
          for (const [g, w] of group) if (g === o) fixed[w] = { ...fixed[w], off: R1(fixed[w].off + shift) };
          port.delete(o);
          labelOf.delete(o);
          const got = route(o, fixed, true);
          if (!got) { ok = false; break; }
          commit(o, got.pts);
          port.set(o, fixed);
        }
        if (ok) for (const o of olds) { const po = port.get(o); after += evalFull(o.points, o, po.start.side, po.end.side, po.start.off, po.end.off); bendsAfter += o.points.length; }
        if (ok && bendsAfter < bendsBefore && after <= before + 0.5) break shift;
        for (const { o, pts: op, port: po, label } of saved) { o.points = op; port.set(o, po); if (label) { labelOf.set(o, label); } else labelOf.delete(o); }
        for (const { o, label } of saved) if (label && o.labelSize) o.labelAt = { x: label.x + o.labelSize.w / 2, y: label.y + o.labelSize.h / 2 };
      }
    }
    // Symmetry: a fan whose far ends sit mirrored about its parent is drawn as a mirror
    // image, one half copied onto the other, when that is legal and costs under W.sym a pair
    // more than the solver's own pick (so symmetry never buys a crossing).
    const mirrorSide = (sd) => (lr ? { T: 'B', B: 'T' }[sd] || sd : { L: 'R', R: 'L' }[sd] || sd);
    const mirrorPort = (e) => ({ side: mirrorSide(e.side), off: (lr ? onVertical(e.side) : !onVertical(e.side)) ? -e.off : e.off, lock: true });
    for (const id in nodes) {
      if (over()) break;
      const P = nodes[id], axis = lr ? P.cy : P.cx;
      const fan = work.filter((r) => (r.from === id) !== (r.to === id) && port.has(r) && nodes[r.from === id ? r.to : r.from]);
      if (fan.length < 2) continue;
      const far = (r) => nodes[r.from === id ? r.to : r.from];
      const at = (r) => (lr ? far(r).cy : far(r).cx) - axis;
      const halves = [[], []], pairOf = new Map();
      let ok = true;
      for (const r of fan) {
        const X = far(r), d = at(r);
        if (Math.abs(d) < 1 || pairOf.has(r)) continue;
        const mate = fan.find((o) => o !== r && (o.from === id) === (r.from === id) && Math.abs(at(o) + d) < 1 && Math.abs((lr ? far(o).cx : far(o).cy) - (lr ? X.cx : X.cy)) < 1 && Math.abs(far(o).w - X.w) < 1 && Math.abs(far(o).h - X.h) < 1 && !pairOf.has(o));
        if (!mate) { ok = false; break; }
        pairOf.set(r, mate);
        pairOf.set(mate, r);
        halves[d < 0 ? 0 : 1].push(r);
        halves[d < 0 ? 1 : 0].push(mate);
      }
      if (!ok || !halves[0].length) continue;
      const mirrored = (r) => { const q = pairOf.get(r); return JSON.stringify(q.points.map((z) => lr ? [z.x, R1(2 * axis - z.y)] : [R1(2 * axis - z.x), z.y])) === JSON.stringify(r.points.map((z) => [z.x, z.y])); };
      if (halves[0].every(mirrored)) continue;
      const costNow = (rs) => rs.reduce((a, r) => { const po = port.get(r); return a + evalFull(r.points, r, po.start.side, po.end.side, po.start.off, po.end.off); }, 0);
      let best = null;
      for (const src of [0, 1]) {
        const from = halves[src].concat(halves[src].map((r) => pairOf.get(r)));
        const targets = from.slice(halves[src].length);
        const saved = targets.map((o) => ({ o, pts: o.points, port: port.get(o), label: labelOf.get(o), at: o.labelAt }));
        const before = costNow(fan);
        for (const t of targets) { port.delete(t); labelOf.delete(t); }
        let legal = true;
        for (const t of targets) {
          const m = pairOf.get(t), mp = port.get(m);
          const pts = m.points.map((z) => (lr ? { x: z.x, y: R1(2 * axis - z.y) } : { x: R1(2 * axis - z.x), y: z.y }));
          const np = { start: mirrorPort(mp.start), end: mirrorPort(mp.end) };
          // A mirrored end may not crowd an end already on that side.
          for (const w of ['start', 'end']) {
            const bid = w === 'start' ? t.from : t.to, b = boxOf(bid);
            const step = Math.min(SLOT, (sideLen(b, np[w].side) - 16) / 2) * 0.85;
            if (endsOn(bid, np[w].side, t).some((v) => Math.abs(v - np[w].off) < step - 0.05)) legal = false;
          }
          commit(t, pts);
          port.set(t, np);
        }
        const after = legal ? costNow(fan) : Infinity;
        if (after < Infinity && after <= before + W.sym * halves[src].length && (!best || after < best.after)) best = { src, after, state: targets.map((o) => ({ o, pts: o.points, port: port.get(o), label: labelOf.get(o), at: o.labelAt })) };
        for (const { o, pts, port: po, label, at: la } of saved) { o.points = pts; port.set(o, po); o.labelAt = la; if (label) labelOf.set(o, label); else labelOf.delete(o); }
      }
      if (best) for (const { o, pts, port: po, label, at: la } of best.state) { o.points = pts; port.set(o, po); o.labelAt = la; if (label) labelOf.set(o, label); else labelOf.delete(o); }
    }
    // Each label was seated when its line was routed, against the lines routed before it;
    // seat them all again against the finished drawing, twice so two can trade places.
    for (let round = 0; round < 2; round++) {
      for (const r of [...order, ...loops]) {
        if (!r.labelSize) continue;
        labelOf.delete(r);
        const s = labelSeat(r.points, r);
        r.labelAt = s.at;
        labelOf.set(r, boxAt(r, s.at));
      }
    }
    for (const r of work) if (r.labelAt && !onPathK(r.points, r.labelAt)) r.labelAt = longestRunMid(r.points);
  }

  function onPathK(pts, q) {
    for (let j = 1; j < pts.length; j++) {
      const a = pts[j - 1], b = pts[j];
      if (q.x >= Math.min(a.x, b.x) - 0.6 && q.x <= Math.max(a.x, b.x) + 0.6 && q.y >= Math.min(a.y, b.y) - 0.6 && q.y <= Math.max(a.y, b.y) + 0.6) return true;
    }
    return false;
  }
  function longestRunMid(pts) {
    let best = 0, at = { x: pts[0].x, y: pts[0].y };
    for (let j = 1; j < pts.length; j++) {
      const a = pts[j - 1], b = pts[j], l = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (l > best) { best = l; at = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
    }
    return at;
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
    // Every line end sits ON its box's border, within that side: an end pushed past a
    // corner leaves the arrowhead hanging in space.
    let endsOffBox = 0;
    for (const r of routes) {
      if (r.from === r.to || r.points.length < 2) continue;
      for (const [q, id] of [[r.points[0], r.from], [r.points[r.points.length - 1], r.to]]) {
        const b = nodes[id] || gboxes[id];
        if (!b) continue;
        const onX = Math.abs(q.x - b.x) < 0.6 || Math.abs(q.x - b.x - b.w) < 0.6, onY = Math.abs(q.y - b.y) < 0.6 || Math.abs(q.y - b.y - b.h) < 0.6;
        const inX = q.x >= b.x - 0.6 && q.x <= b.x + b.w + 0.6, inY = q.y >= b.y - 0.6 && q.y <= b.y + b.h + 0.6;
        if (!((onX && inY) || (onY && inX))) endsOffBox++;
      }
    }
    return { linesThroughShapes, linesThroughEnds, labelCollisions, shapeOverlaps, labelsOffLine, linesThroughTitles, labelsAcrossBorders, sharedRuns, endsOffBox };
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
