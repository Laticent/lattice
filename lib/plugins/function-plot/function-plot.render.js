/**
 * lib/plugins/function-plot/function-plot.render.js — the function-plot plugin's RENDERER.
 *
 * A ```functionplot fence becomes an empty placeholder that carries the fence body, packed, for
 * the browser half (`function-plot.hydrate.js`) to draw. The body is function-plot's own config
 * schema (https://mauriciopoppe.github.io/function-plot/), not a Lattice grammar: Lattice owns
 * the fence, the theming (`function-plot.styles.css`) and what an author sees when the plot
 * cannot draw. No parse here — a malformed config is reported where it would fail, in the
 * browser, as a visible error on the slide.
 *
 * `ctx.hydrateAttrs(body)` is the host's placeholder contract (lib/plugins/host.js): the plugin
 * name the browser host looks for, the packed body, and `data-lattice-settle="pending"`, which
 * every export capture waits on. `latticeplot` is the deprecated alias; the host routes it here
 * and reports the rename.
 */

const fences = Object.freeze({
  functionplot: (token, ctx) => `<div class="functionplot" ${ctx.hydrateAttrs(token.content)}></div>\n`,
});

module.exports = { fences };
