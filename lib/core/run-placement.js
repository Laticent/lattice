/**
 * lib/core/run-placement.js
 *
 * A split run's body pages share ONE placement, so turning a page never moves the content
 * (owner, 2026-11-06, engineering/decisions/2026-11-06-unified-align.md decision 6).
 *
 * The split pages of one slide each center their members by default (base.modifiers.css
 * `--split-place`). Centered page by page, a page holding three milestones begins lower than
 * one holding five, so the content jumps as the reader flips: 57px to 125px on the export check
 * deck. CSS cannot fix it: it has no "max over sibling pages". So this pass MEASURES each body
 * page's content height, takes the run's tallest, and gives every page of the run the top that
 * places THAT page: `(room − tallest) / 2` under `middle`, `room − tallest` under `bottom`. The
 * run keeps the centered look, the tallest page sits exactly where it did, and every other page
 * starts on the same line. `top` needs nothing, and `spread` and `fill` place by distributing
 * space, so they are left alone.
 *
 * It writes, on each body page's section, as inline style:
 *   --run-offset: <the offset>px;
 *   --run-pad: <the stage's own top padding plus the offset>px;
 * and the `data-run-offset` attribute; base.modifiers.css sets the stage's top padding to
 * `--run-pad` and starts the stage at the top. The content height is measured
 * from the first in-flow child's top to the last one's bottom, which a padding change does not
 * alter, and the stage's own padding is read less the offset already written. So the pass
 * converges in one step, and a second run computes the same values and writes nothing. That
 * matters: the runtime calls this from a MutationObserver that also watches `style`.
 *
 * Pure and self-contained (no closure over module scope), so `.toString()` can inject it into
 * the export page (lattice.js, which strips the runtime): one source of truth with
 * lib/runtime/index.js (HARD RULE #1), the lib/core/card-tag-equalize.js pattern.
 */
function settleRunPlacement(doc) {
  const num = (v) => Number.parseFloat(v) || 0;
  const round = (n) => Math.round(n * 10) / 10;
  const pages = [...doc.querySelectorAll('section.form.lat-split-native[data-split-role="body"]')];
  const runs = new Map();
  for (const s of pages) {
    const id = s.getAttribute('data-lattice-slide') || '';
    const run = id.split('.')[0];
    if (!run) continue;
    if (!runs.has(run)) runs.set(run, []);
    runs.get(run).push(s);
  }
  // The word that places this page up and down, as base.modifiers.css reads it: the stamped
  // `data-align` (its coda variant when the page ends in a coda), else the slide's class, else
  // `middle`, the split page's default.
  const placeOf = (s) => {
    const coda = s.getAttribute('data-align-coda');
    if (coda && s.querySelector(':scope > .cell-coda')) return coda;
    const stamped = s.getAttribute('data-align');
    if (stamped) return stamped;
    const cls = s.classList;
    for (const w of ['top', 'bottom', 'spread', 'fill', 'middle']) if (cls.contains(`align-${w}`)) return w;
    return 'middle';
  };
  let writes = 0;
  const put = (s, offset, padTop) => {
    const next = offset > 0.5 ? `${round(offset)}px` : '';
    const was = s.style.getPropertyValue('--run-offset').trim();
    if (was === next) return;
    if (next) {
      s.style.setProperty('--run-offset', next);
      s.style.setProperty('--run-pad', `${round(padTop + offset)}px`);
      s.setAttribute('data-run-offset', '');
    } else {
      s.style.removeProperty('--run-offset');
      s.style.removeProperty('--run-pad');
      s.removeAttribute('data-run-offset');
    }
    writes += 1;
  };
  for (const run of runs.values()) {
    const facts = run.map((s) => {
      const stage = s.querySelector(':scope > .cell-stage');
      if (!stage) return null;
      const cs = getComputedStyle(stage);
      if (cs.display !== 'flex' || !/^column/.test(cs.flexDirection)) return null;
      const kids = [...stage.children].filter((k) => {
        const kc = getComputedStyle(k);
        return kc.display !== 'none' && kc.position !== 'absolute' && kc.position !== 'fixed';
      });
      if (!kids.length) return null;
      const written = num(s.style.getPropertyValue('--run-offset'));
      const padTop = num(cs.paddingTop) - written;
      const room = stage.clientHeight - num(cs.paddingTop) - num(cs.paddingBottom) + written;
      const top = Math.min(...kids.map((k) => k.getBoundingClientRect().top));
      const bottom = Math.max(...kids.map((k) => k.getBoundingClientRect().bottom));
      // Visual px to layout px: a scaled preview reports rects at its scale.
      const scale = stage.getBoundingClientRect().height / (stage.offsetHeight || 1) || 1;
      return { s, place: placeOf(s), padTop, room, height: (bottom - top) / scale };
    });
    // One run, one placement: a page that cannot be measured, or a run whose pages disagree on
    // the word, keeps each page's own CSS placement.
    const ok = facts.every(Boolean) && facts.length > 1 && facts.every((f) => f.place === facts[0].place);
    const place = ok ? facts[0].place : null;
    if (!ok || (place !== 'middle' && place !== 'bottom')) {
      for (const s of run) put(s, 0, 0);
      continue;
    }
    const tallest = Math.max(...facts.map((f) => f.height));
    const room = Math.min(...facts.map((f) => f.room));
    const spare = Math.max(0, room - tallest);
    const offset = place === 'bottom' ? spare : spare / 2;
    for (const f of facts) put(f.s, offset, f.padTop);
  }
  return writes;
}

module.exports = { settleRunPlacement, SETTLE_RUN_PLACEMENT_SRC: settleRunPlacement.toString() };
