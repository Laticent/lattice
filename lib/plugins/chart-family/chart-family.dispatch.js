/**
 * The chart family's dispatch role: the table of chart kinds the host draws with, and the label-drop record a
 * kind's drawing writes.
 *
 * WHAT IS HERE, AND WHAT IS NOT. The host (lib/transformers/chart-frame.js) owns everything common to every chart:
 * the section walk, the record bridging, the chart-frame wrap (eyebrow, h2, subtitle, body, caption), the
 * idempotence guard and the kinds a render could not draw yet. This file holds only what is the plugin's own:
 * which kinds exist (each kind's manifest declares its `kernel` block, `tools/build-chart-registry.js` freezes
 * them into ./shared/chart-registry.generated.js) and the label-drop channel, the plugin's record of every label
 * its drawing declined to paint (./shared/label-drops.js). See
 * engineering/decisions/2026-11-02-slide-facts-for-kinds.md §4, §5.
 *
 * THE KIND CONTRACT:
 *
 *   transformSection(html, ctx) -> html | { html, cls } | null
 *
 *   html   — the section's inner HTML. The kind splices its figure in and returns the whole section.
 *   ctx    — { cls, classTokens, orientation, aspect, paneView, pluginsOff, textScale }. `paneView` is set only for a
 *            chart in a pane: its box in slide chart units (cartesian `viewFor`). `orientation` is the deck-wide stamp
 *            ('portrait' | 'square' | undefined for landscape) read off the section's `data-orientation`.
 *            `textScale` is the venue's chart-text factor (lib/transformers/chart-text-venue.js `chartTextScale`, 1 at laptop):
 *            a kind draws on a canvas that many times smaller in user units, its text the same size in them, so its
 *            labels hold their printed size as the venue grows (cartesian `viewFor`, svg-legend `fitKeyToPane`).
 *   return — the rewritten section HTML; `{ html, cls }` when the kind also changes the section's class list
 *            (roadmap selects `horizons` on a portrait deck); null to decline, which leaves the author's list.
 */

const { LAYOUTS, FIGURE_CLASSES, KERNELS, FORM_KINDS, PLUGIN } = require('./shared/chart-registry.generated');
const { withForm, FORM_W } = require('./shared/chart-form-state');
const { collectLabelDrops, encodeLabelDrops } = require('./shared/label-drops');
const { stepPx, withRoles, stampRoles } = require('./shared/chart-roles');
const { chartBoxAspect, BOX_FILL } = require('./shared/chart-box');
// Straight from core (a sanctioned edge, tools/structure.sanctioned.json): the dispatch is in the engine bundle, and
// reaching it through ./shared/cartesian pulled all of cartesian.js out of the lazy chart kernels into startup.
const { trialIds } = require('../../core/render-ids');

// The chart box on a 1080-wide page: 972px wide at portrait, square, story and mobile (measured in Chromium).
const BOX_PX = 972;

// THE BOX ON A PHONE PAGE, in page px, for a kind on the chart form kernel: the chart body under a one-line title,
// less what the slide sets above and below the chart. Every figure is measured in Chromium off the chart galleries and
// examples/chart-form-kernel.md (2026-11-10): the body is 1900, 1484 (taken as 1474: under, never over), 926 and 795px at mobile, story, 4:5 and square;
// an eyebrow line takes 33px (25px at square); each title line past the first 92px (58px at square), a title wrapping
// past about 48 characters (44 at square); a subtitle or a caption 46px plus 57px a line, about 50 characters a line
// (95 at square). Within 1% of the real box on every slide measured, against 4-11% for the shares it replaces.
const BODY_PX = Object.freeze([[9 / 19.5, 1900], [0.5625, 1474], [0.8, 926], [1, 795]]);
function formBoxPx(html, aspect, leadPx) {
  const pts = BODY_PX;
  let base = pts[pts.length - 1][1];
  if (aspect <= pts[0][0]) base = pts[0][1];
  else {
    for (let i = 1; i < pts.length; i++) {
      if (aspect <= pts[i][0]) {
        const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i];
        base = y0 + (y1 - y0) * ((aspect - x0) / (x1 - x0));
        break;
      }
    }
  }
  const sq = aspect >= 0.9;
  const textOf = (frag) => {
    let n = 0; let inTag = false;
    for (const ch of frag) { if (ch === '<') inTag = true; else if (ch === '>') inTag = false; else if (!inTag) n++; }
    return n;
  };
  const h2 = html.indexOf('<h2');
  const h2End = html.indexOf('</h2>');
  let px = base - leadPx;
  // An eyebrow: a code line before the title. Not the axis spec a quadrant or a scatter lifts off the slide (`[{...}]`).
  const before = h2 >= 0 ? html.slice(0, h2) : '';
  const code = before.lastIndexOf('<code');
  if (code >= 0) {
    const text = before.slice(before.indexOf('>', code) + 1, before.indexOf('</code>', code)).trim();
    if (text && text[0] !== '[' && text[0] !== '{') px -= sq ? 25 : 33;
  }
  if (h2 >= 0 && h2End > h2) {
    const lines = Math.ceil(textOf(html.slice(html.indexOf('>', h2) + 1, h2End)) / (sq ? 44 : 48));
    px -= Math.min(2, Math.max(0, lines - 1)) * (sq ? 58 : 92);
  }
  // A paragraph of words (a subtitle before the chart, a caption after it), but not a lifted `@callout` line.
  const para = (frag) => {
    const at = frag.indexOf('<p');
    if (at < 0) return 0;
    const inner = frag.slice(frag.indexOf('>', at) + 1, frag.indexOf('</p>', at));
    if (inner.includes('@callout')) return 0;
    const lines = Math.max(1, Math.ceil(textOf(inner) / (sq ? 95 : 50)));
    return 46 + 57 * lines;
  };
  const head = html.slice(Math.max(0, h2End));
  const chartAt = Math.min(...['<ul', '<ol', '<table'].map((t) => (head.indexOf(t) < 0 ? head.length : head.indexOf(t))));
  const lastClose = Math.max(...['</ul>', '</ol>', '</table>'].map((t) => head.lastIndexOf(t)));
  // The subtitle is the first paragraph before the chart outside a code block (whose own height is `leadPx`).
  let lead = head.slice(0, chartAt);
  for (let at = lead.indexOf('<pre'); at >= 0; at = lead.indexOf('<pre')) {
    const end = lead.indexOf('</pre>', at);
    lead = lead.slice(0, at) + (end < 0 ? '' : lead.slice(end + 6));
  }
  px -= para(lead);
  if (lastClose > 0) px -= para(head.slice(lastClose));
  return px;
}

/**
 * Draw one section with `kind`, bracketing the label-drop record around the whole drawing: every mechanism that
 * declines to paint a name (`placeLabels`' hide-overlap, the category gap-cull) runs somewhere under this call,
 * so opening the record here catches all of them and any future one without a second wiring point.
 *
 * @returns {{ built: string|{html: string, cls: string}|null, drops: string }} `drops` is the encoded record for
 *   the host's `data-label-drops` attribute, '' when nothing was dropped.
 */
function run(kind, html, ctx) {
  const draw = () => KERNELS[kind].transformSection(html, ctx);
  // THE TEXT LADDER (./shared/chart-roles.js): a whole-slide chart on a 1080-wide page (portrait, square, story,
  // mobile) is read on a phone, so its text roles take the ladder's sizes. The chart draws once in a trial to learn
  // the page px one of its units prints at, then with the roles at that scale, then once more at the scale the
  // roled drawing prints at; the drawing carries the sizes to the stylesheet. Elsewhere it draws as before.
  if (ctx && !ctx.paneView && ctx.aspect > 0 && ctx.aspect <= 1) {
    const px = stepPx();
    // A SUBTITLE (the first paragraph between the title and the chart, as chart-frame.js `liftChartSubtitle` reads
    // it) makes the real box shorter than the table, which is measured under a one-line title (chart-box.js BOX_FILL).
    const head = html.slice(Math.max(0, html.indexOf('</h2>')));
    const body = Math.min(...['<ul', '<ol', '<table'].map((t) => (head.indexOf(t) < 0 ? head.length : head.indexOf(t))));
    // A CAPTION (a paragraph after the chart's list or table) and a TITLE that wraps take height too. The shares are
    // measured at mobile in Chromium: a subtitle line 10.4% of the box, a caption 10.7%, a second title line 6.9%;
    // a title wraps past about 48 characters at these sizes.
    const lastClose = Math.max(...['</ul>', '</ol>', '</table>'].map((t) => head.lastIndexOf(t)));
    const caption = lastClose > 0 && head.slice(lastClose).includes('<p');
    const h2At = html.indexOf('<h2');
    // The title's text length: characters outside tags, entities left as they are (an estimate of its lines).
    let titleLen = 0;
    if (h2At >= 0) {
      let inTag = false;
      for (const ch of html.slice(html.indexOf('>', h2At) + 1, Math.max(h2At, html.indexOf('</h2>')))) {
        if (ch === '<') inTag = true;
        else if (ch === '>') inTag = false;
        else if (!inTag) titleLen++;
      }
    }
    const titleLines = Math.max(1, Math.ceil(titleLen / 48));
    // A CODE BLOCK before the chart (a lead block, chart-frame.js) takes its own height: 206px for one line on a
    // 1080-wide page, measured in Chromium (examples/chart-lead-blocks.md at mobile), and a code line more per line.
    let leadPx = 0;
    for (let at = head.indexOf('<pre'); at >= 0 && at < body; at = head.indexOf('<pre', at + 4)) {
      const end = head.indexOf('</pre>', at);
      const lines = end > at ? head.slice(at, end).split('\n').filter((l) => l.trim()).length : 1;
      leadPx += 206 + 53 * Math.max(0, lines - 1);
    }
    const boxH = (BOX_PX / chartBoxAspect(ctx.aspect)) *
      (1 - (head.slice(0, body).includes('<p') ? 0.104 : 0) - (caption ? 0.107 : 0) - 0.069 * Math.min(2, titleLines - 1)) - leadPx;
    // The chart's own drawing is the LARGEST viewBox in what the kind returned: a kind can draw small icons before it.
    const scaleOf = (out) => {
      const html = typeof out === 'string' ? out : (out && out.html) || '';
      let best = null;
      for (const m of html.matchAll(/viewBox="-?[\d.]+ -?[\d.]+ ([\d.]+) ([\d.]+)"/g)) {
        const [w, h] = [Number(m[1]), Number(m[2])];
        // A swatch or an icon is not the drawing; a kind with no viewBox of its own (flowchart, state-chart: sized
        // in cqi already) draws as before.
        if (w >= 80 && (!best || w * h > best[0] * best[1])) best = [w, h];
      }
      if (!best) return 0;
      // SMALL MULTIPLES (the same drawing, repeated): each is one cell of a two-column grid on a phone page
      // (chart-family.styles.css § THE PHONE LADDER), so it is measured at a cell's width and a row's height.
      const n = (html.match(new RegExp(`viewBox="-?[\\d.]+ -?[\\d.]+ ${best[0]} ${best[1]}"`, 'g')) || []).length;
      const cols = n >= 2 ? 2 : 1;
      const rows = Math.ceil(n / cols) || 1;
      // Less the grid's gaps (`--sp-lg` across, `--sp-md` down: 62px and 41px on a 1080 page, measured).
      return Math.min((BOX_PX - 62 * (cols - 1)) / cols / best[0], (boxH - 41 * (rows - 1)) / rows / best[1]);
    };
    const box = { w: BOX_PX, h: boxH };
    // A KIND ON THE CHART FORM KERNEL (./shared/chart-form.js) draws ONCE: on a canvas the shape of its box, at a
    // scale known before it draws (FORM_W units across the box), with every piece placed inside that canvas. Its
    // text prints at its role size by construction, so there is no scale to solve for. A drawing that still comes
    // out larger than its box (a path the kind has not moved yet, such as authored notes) falls through to the
    // solve below, which sizes it as before.
    if (FORM_KINDS.has(kind)) {
      const unitPx = BOX_PX / FORM_W;
      const formH = formBoxPx(html, ctx.aspect, leadPx);
      const boxU = { w: FORM_W, h: formH / unitPx };
      box.h = formH;
      /** Draw on a canvas of `canvas` units; the drawing's own viewBox and whether the kernel placed it whole. */
      const drawOn = (canvas, final) => {
        const go = () => collectLabelDrops(() => withRoles(px, unitPx, () => withForm(canvas, draw), box));
        const { value, drops } = final ? go() : trialIds(go);
        const drawn = typeof value === 'string' ? value : value?.html || '';
        // The chart's own drawing is its largest viewBox (a swatch or an icon is not the drawing).
        let vb = null;
        for (const m of drawn.matchAll(/viewBox="-?[\d.]+ -?[\d.]+ ([\d.]+) ([\d.]+)"/g)) {
          const [w, h] = [Number(m[1]), Number(m[2])];
          if (w >= 80 && (!vb || w * h > vb[0] * vb[1])) vb = [w, h];
        }
        const fits = !vb || (vb[0] <= boxU.w + 0.5 && vb[1] <= boxU.h + 0.5);
        return { value, drops, vb, placed: drawn.includes('data-chart-form'), fits };
      };
      // A drawing the kernel placed says so (`data-chart-form`): one over capacity is taller than its box on purpose and
      // the page scales it, so it is kept as drawn. A path the kernel does not place yet (authored notes, which a kind
      // lays beside or under its finished plot) can come out larger than the box: the canvas it was given shrinks by the
      // overshoot, at the same scale, and it is drawn again, up to four times, so its text still prints at its role size.
      // How much the page would scale a drawing of viewBox `vb` into the box: 1 when it fits.
      const scaleOf = (g) => (g.vb ? Math.min(1, boxU.w / g.vb[0], boxU.h / g.vb[1]) : 1);
      let canvas = boxU;
      let got = drawOn(canvas, false);
      let best = { canvas, scale: scaleOf(got) };
      for (let pass = 0; pass < 6 && got.value != null && got.vb && !got.placed && !got.fits; pass++) {
        canvas = {
          w: got.vb[0] > boxU.w ? Math.floor(canvas.w * (boxU.w / got.vb[0])) : canvas.w,
          h: got.vb[1] > boxU.h ? Math.floor(canvas.h - (got.vb[1] - boxU.h) - 1) : canvas.h,
        };
        if (canvas.w < FORM_W * 0.5 || canvas.h < boxU.h * 0.4) break;
        got = drawOn(canvas, false);
        if (scaleOf(got) > best.scale + 1e-6) best = { canvas, scale: scaleOf(got) };
      }
      // The canvas whose drawing the page scales least (1: it fits).
      canvas = best.canvas;
      // Drawn for real on the last canvas tried. One that still does not fit is over capacity, like a drawing the
      // kernel marks `over`: the page scales it to its box, which no kind on the kernel leaves to the solve below.
      const { value, drops } = drawOn(canvas, true);
      const stamp = (h) => stampRoles(h, px, unitPx);
      const built = value == null ? value : typeof value === 'string' ? stamp(value) : { ...value, html: stamp(value.html) };
      return { built, drops: drops.length ? encodeLabelDrops(drops) : '' };
    }
    const trial = (unitPx) => trialIds(() => collectLabelDrops(() => (unitPx ? withRoles(px, unitPx, draw, box) : draw())).value);
    // THE SCALE IS A FIXED POINT: the roled drawing's size depends on the scale its text is sized for (bigger text,
    // bigger drawing, smaller scale), so solve u = scaleOf(draw at u). Plain repetition crept toward it and stopped
    // 3-25% short (a 13pt key printed at 12.6pt, a map's names lost a quarter), so this is a secant solve, falling
    // back to the last scale a drawing actually printed at.
    let unitPx = scaleOf(trial(0));
    if (unitPx > 0) {
      let [u0, f0] = [unitPx, scaleOf(trial(unitPx))];
      let [u1, f1] = [f0, f0 > 0 ? scaleOf(trial(f0)) : 0];
      // The scale whose drawing prints its text LARGEST (printed size goes as f/u), kept in case there is no fixed
      // point: a layout that overfills its box at every scale has none, and the solve would drift toward zero.
      let best = f0 > 0 ? { u: u0, r: f0 / u0 } : null;
      const keep = (u, f) => { if (f > 0 && (!best || f / u > best.r)) best = { u, r: f / u }; };
      keep(u1, f1);
      for (let pass = 0; pass < 6 && f1 > 0 && Math.abs(f1 - u1) / u1 >= 0.005; pass++) {
        const [g0, g1] = [f0 - u0, f1 - u1];
        let u2 = g1 !== g0 ? u1 - (g1 * (u1 - u0)) / (g1 - g0) : f1;
        if (!(u2 > 0) || u2 < Math.min(u1, f1) / 2 || u2 > Math.max(u1, f1) * 2) u2 = f1;
        [u0, f0, u1] = [u1, f1, u2];
        f1 = scaleOf(trial(u1));
        keep(u1, f1);
      }
      // The solved scale when it held; otherwise the one that printed largest.
      unitPx = f1 > 0 && Math.abs(f1 - u1) / u1 < 0.005 ? u1 : best ? best.u : f0;
      const { value, drops } = collectLabelDrops(() => withRoles(px, unitPx, draw, box));
      const stamp = (h) => stampRoles(h, px, unitPx);
      const built = value == null ? value : typeof value === 'string' ? stamp(value) : { ...value, html: stamp(value.html) };
      return { built, drops: drops.length ? encodeLabelDrops(drops) : '' };
    }
  }
  const { value: built, drops } = collectLabelDrops(draw);
  return { built, drops: drops.length ? encodeLabelDrops(drops) : '' };
}

/**
 * The width over height of the box a portrait chart is scored in at a slide's `aspect`: the measured chart box
 * (shared/chart-box.js `chartBoxAspect`) with the tall canvas's margin taken off its height (`BOX_FILL`), the room a
 * subtitle takes. The chart frame scores a drawing in it (lib/transformers/chart-frame.js `printsAsLarge`) without
 * reaching into this plugin's folder.
 * @param {number} aspect  the slide's width over height
 */
function boxAspect(aspect) {
  return chartBoxAspect(aspect) / BOX_FILL;
}

module.exports = {
  boxAspect,
  CHART_LAYOUTS: LAYOUTS,
  CHART_PLUGIN: PLUGIN,
  FIGURE_CLASSES,
  KERNELS,
  run,
};
