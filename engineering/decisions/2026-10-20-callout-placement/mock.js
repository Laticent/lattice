// In-page mock: add a callout lane to a rendered SVG chart and place its key. Exposed as window.__mock(sec, opts).
window.__mock = (sec, { lane = 'right', key = 'today', n = 3, labels } = {}) => {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = [...sec.querySelectorAll('.cell-stage svg')].find((s) => s.viewBox?.baseVal?.width > 50);
  if (!svg) return { skip: 'no svg' };
  const root = svg.querySelector(':scope > g') || svg;
  const toUser = (el) => { const r = el.getBoundingClientRect(); const m = svg.getScreenCTM().inverse(); const p1 = new DOMPoint(r.left, r.top).matrixTransform(m); const p2 = new DOMPoint(r.right, r.bottom).matrixTransform(m); return { x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y, r: p2.x, b: p2.y }; };
  const isKey = (e) => { for (let x = e; x && x !== svg; x = x.parentElement) { const c = x.getAttribute('class') || ''; if (/legend--anchored/.test(c)) return false; if (/chart-key|-key\b|-legend\b|legend-|\bkey\b/.test(c)) return true; if (x.tagName === 'rect' && /chart-spine/.test(x.getAttribute('fill') || '')) return true; } return false; };
  const LEAF = 'text, rect, path, circle, ellipse, polygon, polyline, line, image';
  const leaves = [...svg.querySelectorAll(LEAF)].filter((e) => !e.closest('defs, clipPath, mask, marker, title, desc') && e.getBoundingClientRect().width + e.getBoundingClientRect().height > 0);
  const keyLeaves = leaves.filter(isKey); const figLeaves = leaves.filter((e) => !isKey(e));
  const U = (els) => { const bs = els.map(toUser); return bs.length ? { x: Math.min(...bs.map((b) => b.x)), y: Math.min(...bs.map((b) => b.y)), r: Math.max(...bs.map((b) => b.r)), b: Math.max(...bs.map((b) => b.b)) } : null; };
  const fig = U(figLeaves); const vb = svg.viewBox.baseVal;
  // the key's own top-level groups: hoist each key leaf's outermost key ancestor under root
  const keyTops = [...new Set(keyLeaves.map((e) => { let t = e; for (let x = e; x && x !== root && x !== svg; x = x.parentElement) if (isKey(x)) t = x; return t; }))];
  const keyBox = U(keyLeaves);
  const fsEl = svg.querySelector('.chart-key-label') || [...svg.querySelectorAll('text')].find((t) => !isKey(t));
  const fs = fsEl ? parseFloat(fsEl.getAttribute('font-size') || getComputedStyle(fsEl).fontSize) || vb.height * 0.045 : vb.height * 0.045;
  const marks = [...svg.querySelectorAll('[data-mark]')].filter((m) => !isKey(m) && (m.getBoundingClientRect().width > 0 || m.getBoundingClientRect().height > 0));
  if (!marks.length) marks.push(...[...svg.querySelectorAll('.line-dot, [class*="-dot"], [class*="-point"], [class*="-node"]')].filter((m) => !isKey(m) && m.getBoundingClientRect().width > 0));
  const SH = ['circle', 'square', 'triangle', 'diamond', 'hexagon', 'star'];
  const shape = (s, cx, cy, r) => { const P = (pts) => pts.map((p) => p.map((v) => v.toFixed(2)).join(',')).join(' ');
    if (s === 'circle') return `<circle cx="${cx}" cy="${cy}" r="${r}"`;
    if (s === 'square') return `<rect x="${cx - r * 0.88}" y="${cy - r * 0.88}" width="${r * 1.76}" height="${r * 1.76}"`;
    const reg = (k, rot, rr = r) => [...Array(k)].map((_, i) => [cx + rr * Math.cos(rot + i * 2 * Math.PI / k), cy + rr * Math.sin(rot + i * 2 * Math.PI / k)]);
    if (s === 'triangle') return `<polygon points="${P(reg(3, -Math.PI / 2, r * 1.2).map(([x, y]) => [x, y + r * 0.2]))}"`;
    if (s === 'diamond') return `<polygon points="${P(reg(4, -Math.PI / 2, r * 1.06))}"`;
    if (s === 'hexagon') return `<polygon points="${P(reg(6, 0, r * 0.98))}"`;
    const pts = []; for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.55 : r * 1.12; const a = -Math.PI / 2 + i * Math.PI / 5; pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); } return `<polygon points="${P(pts)}"`; };
  const marker = (i, cx, cy, h, digit) => { const r = h / 2; const s = SH[i % 6]; const c = `c${[1, 2, 3, 4, 5, 6][i]}`;
    return `${shape(s, cx, cy, r + h * 0.12)} class="legend-knockout"/>${shape(s, cx, cy, r)} class="legend-plate" data-c="${c}" data-shape="${s}"/>` + (digit ? `<text class="legend-text legend-text--plated legend-number" data-c="${c}" x="${cx}" y="${cy + (s === 'triangle' ? r * 0.2 : 0)}" font-size="${(h / 1.84).toFixed(2)}" text-anchor="middle" dominant-baseline="central">${i + 1}</text>` : ''); };
  const LAB = labels || ['Launch week', 'Price change', 'Outage on the 14th', 'New pricing page', 'Promo', 'Recovery'];
  // targets: spread over the marks
  const tg = marks.length ? [...Array(Math.min(n, marks.length))].map((_, i) => marks[Math.floor((i + 0.5) * marks.length / Math.min(n, marks.length))]) : [];
  const tb = tg.map(toUser);
  let out = '';
  const H = fs / (1 / 1.84); // lane marker height
  if (lane !== 'none') tb.forEach((b, i) => { const h = Math.max(3.8, Math.min(H, 0.42 * Math.min(b.w, b.h))); out += marker(i, b.x + h * 0.5 + 1, b.y + h * 0.5 + 1, h, h / 1.84 >= fs * 0.5); });
  const LH = fs * 1.2; const wrap = (t, chars) => { const w = t.split(' '); const lines = []; let cur = ''; for (const x of w) { if ((cur + ' ' + x).trim().length > chars && cur) { lines.push(cur); cur = x; } else cur = (cur + ' ' + x).trim(); } lines.push(cur); return lines; };
  const text = (x, y, lines) => `<text class="legend-text legend-text--bare" font-size="${fs}" dominant-baseline="middle">${lines.map((l, k) => `<tspan x="${x}" y="${(y + k * LH).toFixed(2)}">${l}</tspan>`).join('')}</text>`;
  const gap = fs * 1.6; const ext = { x: fig.x, y: fig.y, r: fig.r, b: fig.b };
  const notes = tb.map((b, i) => ({ i, cy: b.y + b.h / 2, label: LAB[i] }));
  const _laneG = []; const rule = (x0, y0, x1, y1) => `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" style="stroke:var(--text-muted);stroke-opacity:.45;stroke-width:.6"/>`;
  const head = (x, y, t) => `<text x="${x}" y="${y}" style="font-family:var(--font-mono);font-size:${(fs * 0.78).toFixed(2)}px;letter-spacing:.14em;fill:var(--text-muted)">${t}</text>`;
  const flowKey = (x0, y0, maxR) => {
    const items = keyLeaves.filter((e) => !(e.tagName === 'rect' && /chart-spine/.test(e.getAttribute('fill') || '')));
    keyLeaves.filter((e) => /chart-spine/.test(e.getAttribute('fill') || '')).forEach((e) => { e.setAttribute('display', 'none'); });
    const bx = items.map((e) => ({ e, b: toUser(e) })); const rows = [];
    for (const it of bx.sort((a, b) => (a.b.y + a.b.b) / 2 - (b.b.y + b.b.b) / 2)) { const cy = (it.b.y + it.b.b) / 2; const r = rows.find((q) => Math.abs(q.cy - cy) < fs * 0.6); if (r) r.items.push(it); else rows.push({ cy, items: [it] }); }
    let x = x0, y = y0, rowH = 0, end = y0;
    for (const r of rows) { const L = Math.min(...r.items.map((i) => i.b.x)), R = Math.max(...r.items.map((i) => i.b.r)), T = Math.min(...r.items.map((i) => i.b.y)), B = Math.max(...r.items.map((i) => i.b.b));
      if (x > x0 && x + (R - L) > maxR) { x = x0; y += rowH + fs * 0.5; rowH = 0; }
      r.items.forEach((i) => { i.e.setAttribute('transform', `translate(${x - L} ${y - T}) ${i.e.getAttribute('transform') || ''}`); });
      x += R - L + fs * 1.4; rowH = Math.max(rowH, B - T); end = y + rowH; }
    return end;
  };
  const _keyMove = null;
  const keyW = keyBox ? keyBox.r - keyBox.x : 0, keyH = keyBox ? keyBox.b - keyBox.y : 0;
  const kOff = (dx, dy) => { for (const k of keyTops) k.setAttribute('transform', `translate(${dx} ${dy}) ${k.getAttribute('transform') || ''}`); };
  if (lane === 'right' && notes.length) {
    const x0 = (key === 'today' && keyBox && keyBox.x > fig.r - 1 ? fig.r : fig.r) + gap;
    let y = -1e9; const W = 13; let laneR = x0;
    const order = [...notes].sort((a, b) => a.cy - b.cy);
    let top = key === 'rail' ? fig.y + fs * 1.6 : fig.y;
    if (key === 'rail') out += head(x0, fig.y + fs * 0.7, 'NOTES');
    for (const nt of order) { const lines = wrap(nt.label, W); const hgt = Math.max(H, lines.length * LH); const cy = key === 'rail' ? top + hgt / 2 : Math.max(nt.cy, y + hgt / 2 + fs * 0.6, top + hgt / 2); out += marker(nt.i, x0 + H / 2, cy, H, true) + text(x0 + H + fs * 0.45, cy - (lines.length - 1) * LH / 2, lines); y = cy + hgt / 2; top = key === 'rail' ? y + fs * 0.7 : top; laneR = Math.max(laneR, x0 + H + fs * 0.45 + Math.max(...lines.map((l) => l.length)) * fs * 0.56); }
    ext.r = Math.max(ext.r, laneR); ext.b = Math.max(ext.b, y);
    if (keyBox) {
      if (key === 'today' && keyBox.x > fig.r - 1) { kOff(laneR + gap - keyBox.x, 0); out += rule(laneR + gap / 2, fig.y, laneR + gap / 2, fig.b); ext.r = laneR + gap + keyW; }
      else if (key === 'today') { /* key below today */ ext.b = Math.max(ext.b, keyBox.b); }
      if (key === 'below') { ext.b = Math.max(ext.b, flowKey(fig.x, fig.b + fs * 1.3, Math.max(fig.r, ext.r))); }
      if (key === 'rail') { const ky = y + fs * 1.0; out += rule(x0, ky, laneR, ky) + head(x0, ky + fs * 1.4, 'KEY'); kOff(x0 - keyBox.x, ky + fs * 2.0 - keyBox.y); ext.b = Math.max(ext.b, ky + fs * 2 + keyH); ext.r = Math.max(ext.r, x0 + keyW); }
    }
  }
  if (lane === 'below' && notes.length) {
    let y = fig.b + fs * 1.4; const x0 = fig.x; const W = 40;
    if (keyBox && key === 'today' && keyBox.y > fig.b - 1) { kOff(0, 0); y = keyBox.b + fs * 1.0; out += rule(fig.x, y - fs * 0.5, fig.r, y - fs * 0.5); y += fs * 0.5; }
    for (const nt of [...notes].sort((a, b) => a.i - b.i)) { const lines = wrap(nt.label, W); out += marker(nt.i, x0 + H / 2, y + H / 2, H, true) + text(x0 + H + fs * 0.45, y + H / 2, lines); y += Math.max(H, lines.length * LH) + fs * 0.45; }
    ext.b = Math.max(ext.b, y);
    if (keyBox && key === 'below') { out += rule(fig.x, y + fs * 0.2, fig.r, y + fs * 0.2); ext.b = flowKey(fig.x, y + fs * 0.9, fig.r); }
    if (keyBox && key === 'today' && keyBox.x > fig.r - 1) ext.r = Math.max(ext.r, keyBox.r);
  }
  if ((lane === 'none' || !notes.length) && keyBox) { ext.r = Math.max(ext.r, keyBox.r); ext.b = Math.max(ext.b, keyBox.b); ext.x = Math.min(ext.x, keyBox.x); ext.y = Math.min(ext.y, keyBox.y); }
  if (keyBox && lane !== 'none' && key === 'today') { ext.x = Math.min(ext.x, keyBox.x); ext.y = Math.min(ext.y, keyBox.y); }
  const g = document.createElementNS(NS, 'g'); g.innerHTML = out; root.appendChild(g);
  const pad = fs * 0.6; const _X = Math.min(vb.x, ext.x - pad), _Y = Math.min(vb.y, ext.y - pad);
  const X2 = ext.x - pad, Y2 = ext.y - pad; svg.setAttribute('viewBox', `${X2} ${Y2} ${ext.r + pad - X2} ${ext.b + pad - Y2}`);
  const _fr = svg.getBoundingClientRect(); const plot = U(figLeaves.filter((e) => e.closest('[data-mark]')));
  return { fs, n: notes.length, keyed: !!keyBox, plotPx: plot ? Math.round(svg.getScreenCTM().a * (plot.r - plot.x)) * Math.round(svg.getScreenCTM().d * (plot.b - plot.y)) : 0 };
};
