/**
 * lib/plugins/function-plot/function-plot.hydrate.js — the function-plot plugin's BROWSER half:
 * draw one placeholder with the function-plot library.
 *
 * ONE SOURCE FOR EVERY BROWSER SURFACE. The runtime bundle requires this file (the Studio
 * preview, the Playground, `--fluid`); the CLI export page runs it SERIALIZED, because that page
 * runs without the runtime (lib/plugins/hydrate-script.js). So this module is self-contained —
 * no require, no import, no module-level helper — and everything it needs arrives through `ctx`
 * (lib/plugins/host-browser.mjs). `tools/build-plugin-registry.js` refuses a hydrate module that
 * requires or imports anything. There used to be two copies of this function, one in the runtime
 * and one in the emulator, and they had drifted: only the runtime's marked an error settled.
 *
 * `ctx.lib` is `window.functionPlot`; the host loads it before calling (the manifest's
 * `payload`) and settles the placeholder `unavailable`, with its config as text, when it cannot.
 * A config the library rejects is shown as an error on the slide and settled `error`; returning
 * normally settles it `rendered`.
 *
 * THE VIEWBOX. function-plot draws `<svg class="function-plot" width="1152" height="320">` with
 * no viewBox. On the slide that is fine; re-hosted in a reading article (the Studio Read pane,
 * `--read`, the player's Read · Article) the host's figure rule sets `width:100%; height:auto`,
 * which shrinks the box and leaves the drawing full size inside it, clipped — measured in the
 * Studio Read pane at 390px, one corner of the plot showed. A viewBox equal to the SVG's own size
 * maps one user unit to one pixel, so the slide draws exactly as before and every host that sizes
 * the box scales the drawing with it.
 *
 * @param {HTMLElement} el   the placeholder the fence renderer emitted
 * @param {{ lib: Function, decodeConfig: (el: Element) => string, settle: (el: Element, state: string) => void }} ctx
 */
function hydrate(el, ctx) {
  try {
    const cfg = JSON.parse(ctx.decodeConfig(el));
    const rect = el.getBoundingClientRect();
    // DRAWN BY A DRAW FRAME. A page whose host offers `ctx.drawInto` (the Studio and the Playground previews,
    // lib/plugins/host-browser.mjs) never loads the library: the figure's config and size go out, and the
    // drawing, already sanitized by the host, comes back. The frame runs THIS function with a `ctx` of its own and the
    // same seed key, so the drawing is the one every other surface makes (lib/packages/draw-frame-core.mjs).
    if (typeof ctx.drawInto === 'function') {
      const plots = el.ownerDocument ? [...el.ownerDocument.querySelectorAll('[data-lattice-hydrate="function-plot"]')] : [];
      return ctx
        .drawInto(el, {
          kind: 'function-plot',
          configB64: el.getAttribute('data-lattice-config') || '',
          configText: ctx.decodeConfig(el),
          width: Math.round(Number(cfg.width)) || Math.round(rect.width) || 480,
          height: Math.round(Number(cfg.height)) || Math.round(rect.height) || 320,
          index: plots.indexOf(el),
        })
        .catch((e) => {
          const why = e && e.message ? e.message : String(e);
          el.textContent = /^functionplot error: /.test(why) ? why : `functionplot error: ${why}`;
          el.classList.add('functionplot-error');
          ctx.settle(el, 'error');
        });
    }
    cfg.target = el;
    cfg.width = cfg.width || Math.round(rect.width) || 480;
    cfg.height = cfg.height || Math.round(rect.height) || 320;
    // No hover tip: in a PDF or a baked page it only adds DOM mass.
    if (!cfg.tip) cfg.tip = { renderer: () => {} };
    // DETERMINISTIC IDS. The library names each plot's clip path and markers from Math.random()
    // and takes no id option, so every export baked new random ids and two runs of the same deck,
    // or the same deck from the CLI and the Studio, never gave the same file
    // (decisions/2026-10-16-player-as-library-audit.md §11.9). For the draw only, Math.random is
    // a small seeded generator keyed on the plot's config and its place among this page's plots,
    // which is the same in every host; a second identical plot still gets its own ids.
    const doc = el.ownerDocument;
    const plots = doc ? [...doc.querySelectorAll('[data-lattice-hydrate="function-plot"]')] : [];
    let seed = 2166136261;
    for (const ch of `${el.getAttribute('data-lattice-config') || ''}#${plots.indexOf(el)}`) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
    const random = Math.random;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    try {
      ctx.lib(cfg);
    } finally {
      Math.random = random;
    }
    const svg = el.querySelector('svg.function-plot');
    if (svg && !svg.hasAttribute('viewBox')) {
      const w = parseFloat(svg.getAttribute('width'));
      const h = parseFloat(svg.getAttribute('height'));
      if (w > 0 && h > 0) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    }
  } catch (e) {
    el.textContent = `functionplot error: ${e.message}`;
    el.classList.add('functionplot-error');
    ctx.settle(el, 'error');
  }
}

module.exports = { hydrate };
