/**
 * lib/core/rough-ink-dom.js — the DOM half of the sketch finish's drawn lines.
 *
 * Two pure, self-contained functions, deliberately split so the two render
 * paths can share one implementation without sharing one runtime:
 *
 *   measureRoughInk(structures, scale?)  → plans   (reads laid-out DOM)
 *   paintRoughInk(paints)                → void    (writes one SVG per section)
 *
 * Between them sits `pathsForPlan` from lib/core/rough-ink.js, which is where
 * rough.js actually runs. That split is the whole point:
 *
 *   · `lattice-emulator.js` MEASURES in the Chromium page, ships the plans
 *     back to Node as plain JSON, GENERATES there (rough.js is a normal
 *     `require`, DOM-free), and PAINTS back in the page. Rough.js never
 *     enters the export's browser context — nothing to inject, nothing to
 *     bundle, and one less 28KB script per render.
 *   · `lib/runtime/index.js` does all three in one tick, with rough.js
 *     bundled in (esbuild picks up the ESM build).
 *
 * Both call the same three functions in the same order, so a line's shape
 * cannot drift between the Playground and the exported PDF (HARD RULE #1).
 *
 * NEITHER FUNCTION MAY CLOSE OVER MODULE SCOPE. Both are injected into the
 * export page via `.toString()`, the idiom `lib/core/font-settle.js` and
 * `lib/core/overflow-probe.js` already use. A helper captured from this file
 * would be `undefined` in the page and the failure is silent — an empty plan
 * list reads exactly like "this deck has no sketch slides". Everything they
 * need arrives as an argument.
 *
 * WHY MARKUP IS BUILT NODE-BY-NODE (HARD RULE #22)
 * ------------------------------------------------
 * `paintRoughInk` writes into the same live document a preview frame renders,
 * so it is a runtime markup sink. It uses `createElementNS` + `appendChild`
 * and `setAttribute` exclusively — never `innerHTML`, never
 * `insertAdjacentHTML`. That is the shape `checkRuntimeMarkupSinks`'s docblock
 * calls "legitimate and SAFER, but also unmonitored", so it adds no entry to
 * SANCTIONED_RUNTIME_MARKUP_SINKS. The provenance is worth stating anyway,
 * because the census exists precisely so nobody has to guess: every value
 * written here is OURS — path `d` strings from rough.js over numbers we
 * measured, and a color read back out of computed style. No author string,
 * no deck content, and no third-party markup reaches this function.
 *
 * engineering/decisions/2026-08-18-rough-ink.md
 */

/**
 * Measure every enrolled structure on the page.
 *
 * ENROLLMENT IS CSS-DRIVEN. The selector list is only a cheap prefilter; what
 * actually decides whether a structure is drawn is a non-empty
 * `--rough-ink-stroke` on it. That indirection is load-bearing for the
 * masthead, whose rule is drawn by the BAND under `rule-full` but by a
 * separate `<hr class="masthead-rule">` under `rule-short` / `rule-accent`
 * and by nothing at all under `rule-none` (base.accent-finish.css). Asking
 * the cascade "is there a rule here, and what color" keeps that four-way
 * answer in the one file that already owns it, instead of re-deriving it in
 * JS from `border-bottom-style` — which cannot work anyway, because by the
 * time this re-runs the border has been made transparent (see below).
 *
 * THE BORDERS ARE MADE TRANSPARENT, NOT REMOVED. `base.sketch.css` hides the
 * replaced lines with `border-color: transparent`, never `border: none`.
 * A removed border changes the box model, so the structure would RESIZE the
 * instant the ink was applied and every measurement behind the overlay would
 * be one border-width stale. Transparent keeps the geometry identical and
 * makes this function re-runnable.
 *
 * @param {Array<{id:string, kind:string, sel:string}>} structures
 *        ROUGH_INK_STRUCTURES from lib/core/rough-ink.js, passed in.
 * @returns {Array<object>} plans, each `{key, kind, sectionIndex, x, y, w, h,
 *        hLines, vLines, stroke, strokeWidth}` — see `pathsForPlan`.
 */
function measureRoughInk(structures) {
  const sections = Array.prototype.slice.call(document.querySelectorAll('section'));
  const plans = [];

  for (const spec of structures) {
    const els = document.querySelectorAll(spec.sel);

    for (let n = 0; n < els.length; n++) {
      const el = els[n];
      // `getClientRects().length === 0` is the one test that catches every way
      // an element can be absent from layout — `display:none` on it OR on any
      // ancestor, `content-visibility` skipped, a detached subtree. Checking
      // `offsetWidth` alone would draw ink for a zero-height `.masthead-rule`
      // that is `display:none` under `rule-full`.
      if (!el.getClientRects().length) continue;

      const cs = getComputedStyle(el);
      const stroke = cs.getPropertyValue('--rough-ink-stroke').trim();
      if (!stroke) continue;                       // not enrolled by the cascade

      const section = el.closest('section');
      const sectionIndex = sections.indexOf(section);
      if (sectionIndex < 0) continue;

      const srect = section.getBoundingClientRect();
      // The live preview scales whole slides with a CSS transform, which
      // getBoundingClientRect reports in SCALED coordinates — but the overlay
      // is a CHILD of the section and is laid out in the section's own
      // unscaled space. Dividing the deltas by the section's own scale factor
      // converts back. On the export path the factor is exactly 1 and this is
      // a no-op; in the Playground it is the difference between ink on the
      // lines and ink drifting further off them the further down the slide
      // you look.
      let scale = section.offsetWidth ? srect.width / section.offsetWidth : 1;
      if (!scale || !Number.isFinite(scale)) scale = 1;

      const rect = el.getBoundingClientRect();
      const w = rect.width / scale;
      const h = rect.height / scale;
      if (w < 1 || h < 1) continue;

      const widthRaw = parseFloat(cs.getPropertyValue('--rough-ink-width'));
      const plan = {
        key: spec.id + ':' + sectionIndex + ':' + n,
        kind: spec.kind,
        sectionIndex: sectionIndex,
        x: (rect.left - srect.left) / scale,
        y: (rect.top - srect.top) / scale,
        w: w,
        h: h,
        hLines: [],
        vLines: [],
        stroke: stroke,
        strokeWidth: Number.isFinite(widthRaw) && widthRaw > 0 ? widthRaw : 2,
      };

      if (spec.kind === 'mid') {
        // The box IS the rule (an `<hr>`, 7px tall under the finish), so the
        // ink goes down its centerline rather than on an edge.
        plan.hLines.push(h / 2);
      } else if (spec.kind === 'underline') {
        // The box is a BAND whose bottom border is the rule.
        plan.hLines.push(h);
      } else {
        const rows = spec.kind === 'grid'
          ? el.querySelectorAll('tr')
          : el.querySelectorAll(':scope > li');

        // Interior boundaries only: the last row's bottom edge is either the
        // frame (grid/ledger) or nothing at all (rows). Drawing it too is what
        // gave the old CSS its doubled last rule, which base.sketch.css then
        // had to special-case away with a `:last-child { display:none }`.
        for (let r = 0; r < rows.length - 1; r++) {
          plan.hLines.push((rows[r].getBoundingClientRect().bottom - rect.top) / scale);
        }

        // Column rules are OPT-IN, and no shipped component opts in — see the
        // long note on ROUGH_INK_STRUCTURES. Drawing them unasked turns a
        // horizontally-ruled comparison table into a spreadsheet, and it
        // breaks the finish's governing rule: roughen the lines the deck
        // draws, never invent one.
        if (spec.kind === 'grid' && cs.getPropertyValue('--rough-ink-cols').trim() === '1') {
          // Columns come from the row with the MOST cells, not from the union
          // over all rows. A union would invent a full-height rule wherever a
          // single colspan'd row happens to break, and an intersection would
          // erase every column the moment one full-width header row exists.
          // The widest row is the table's actual grid.
          let widest = null;
          for (const row of rows) {
            if (!widest || row.cells.length > widest.cells.length) widest = row;
          }
          if (widest) {
            for (let c = 0; c < widest.cells.length - 1; c++) {
              plan.vLines.push((widest.cells[c].getBoundingClientRect().right - rect.left) / scale);
            }
          }
        }
      }

      plans.push(plan);
    }
  }

  return plans;
}

/**
 * Paint generated paths into one overlay SVG per section.
 *
 * ONE OVERLAY PER SECTION, not one per structure. `rough-table` wraps each
 * table in a positioned container and hangs the SVG off that; doing the same
 * here would insert a wrapper between `section.X` and its `> table` / `> ol`
 * and silently break every direct-child component selector in the engine. The
 * slide is already `position: relative` + `isolation: isolate`
 * (base.elements.css), so it is a host that costs nothing, and structure
 * coordinates were folded into the path data upstream by `shiftPath`.
 *
 * The overlay is REPLACED wholesale rather than diffed. These are a few dozen
 * short paths per slide; a diff would cost more than the rebuild and would
 * have to reason about which of two renders' seeds won.
 *
 * @param {Array<{sectionIndex:number, paths:Array<{d:string,stroke:string,strokeWidth:number}>}>} paints
 */
function paintRoughInk(paints) {
  const NS = 'http://www.w3.org/2000/svg';
  const sections = Array.prototype.slice.call(document.querySelectorAll('section'));

  // Clear every previous overlay first, including on sections that no longer
  // have any ink — a slide whose table was removed (or whose `sketch` class was
  // toggled off in the Playground) must not keep the last render's lines.
  for (const old of document.querySelectorAll('svg[data-lattice-rough-ink]')) old.remove();

  for (const paint of paints) {
    const section = sections[paint.sectionIndex];
    if (!section || !paint.paths.length) continue;

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('data-lattice-rough-ink', '');
    // A `viewBox` matching the section's own pixel box means the paths are
    // written in exactly the coordinates they were measured in — no scaling
    // step to keep in sync, and the stroke width stays true.
    svg.setAttribute('viewBox', '0 0 ' + section.offsetWidth + ' ' + section.offsetHeight);
    svg.setAttribute('width', String(section.offsetWidth));
    svg.setAttribute('height', String(section.offsetHeight));
    svg.setAttribute('fill', 'none');
    // `aria-hidden` + `pointer-events:none`: this is decoration standing in for
    // borders that were never in the accessibility tree either, and it must not
    // eat a click meant for the slide beneath it.
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    for (const spec of paint.paths) {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', spec.d);
      path.setAttribute('stroke', spec.stroke);
      path.setAttribute('stroke-width', String(spec.strokeWidth));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('fill', 'none');
      svg.appendChild(path);
    }

    section.appendChild(svg);
  }

  // NO HANDOVER FLAG IS SET HERE, deliberately. base.sketch.css switches its
  // tiled-wave fallback off with `:has(> svg[data-lattice-rough-ink])` on the
  // section — the overlay this function just appended IS the signal.
  //
  // The first version did stamp a `rough-inked` class on `<html>` and gate on
  // `:root.rough-inked`. It worked in the browser and in the PDF, and it came
  // apart in the `--player` export: the player bakes the DECK's DOM, so the
  // overlays survived and the root class did not, and `player-prune` then
  // dropped every `:root.rough-inked` rule as unused. Measured on the shipped
  // player: 14 overlays with 19 fallback wave strips drawing on top of them.
  //
  // Keying the gate on the artifact rather than on a flag means any bake that
  // carries the ink carries the gate, and there is no second thing to keep in
  // sync. Do not reintroduce a flag here.
}

/**
 * A cheap identity for a plan set, so a re-measure that found nothing new can
 * skip the repaint.
 *
 * This is not an optimization — it is a CORRECTNESS guard on the live path.
 * The runtime drives re-measures from a MutationObserver, and painting mutates
 * the DOM, so an unconditional repaint re-triggers the observer and spins a
 * permanent requestAnimationFrame loop. `patchSectionGeometry` in
 * lib/runtime/index.js carries the same guard for the same reason.
 *
 * Rounded to whole pixels: sub-pixel jitter between two measurements of an
 * unchanged layout is normal and must not read as a change.
 */
function roughInkFingerprint(plans) {
  const parts = [];
  for (const p of plans) {
    parts.push(
      p.key + '|' + p.kind + '|' + Math.round(p.x) + ',' + Math.round(p.y) +
      ',' + Math.round(p.w) + ',' + Math.round(p.h) +
      '|' + p.hLines.map(Math.round).join('.') +
      '|' + p.vLines.map(Math.round).join('.') +
      '|' + p.stroke + '|' + p.strokeWidth,
    );
  }
  return parts.join(';');
}

module.exports = {
  measureRoughInk,
  paintRoughInk,
  roughInkFingerprint,
  MEASURE_ROUGH_INK_SRC: measureRoughInk.toString(),
  PAINT_ROUGH_INK_SRC: paintRoughInk.toString(),
};
