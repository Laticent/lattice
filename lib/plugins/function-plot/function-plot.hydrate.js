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
    cfg.target = el;
    cfg.width = cfg.width || Math.round(rect.width) || 480;
    cfg.height = cfg.height || Math.round(rect.height) || 320;
    // No hover tip: in a PDF or a baked page it only adds DOM mass.
    if (!cfg.tip) cfg.tip = { renderer: () => {} };
    ctx.lib(cfg);
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
