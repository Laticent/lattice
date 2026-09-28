/**
 * lib/plugins/hydrate-script.js — the CLI export page's copy of the plugin host's browser half.
 *
 * The emulator's page runs WITHOUT `lattice-runtime.js` (its overflow watcher would paint into the
 * print), so the host (host-browser.mjs) and each used plugin's `hydrate` reach it as ONE inline
 * script, serialized from the very functions the runtime bundles — which is why both are
 * self-contained, and why tools/build-plugin-registry.js refuses a hydrate module that requires or
 * imports. The plugin's library is the emulator's to inject, as a `<script src>` ahead of this.
 *
 * Node-only. `test/unit/plugins/hydrate-host.test.js` runs the script it returns.
 */

const { fromBase64 } = require('../core/base64-utf8');
const { installHydrateHost, releaseFigure, PENDING_FIGURES } = require('./host-browser.mjs');
const { HYDRATORS } = require('./hydrate.generated.js');

/**
 * The plugins with a browser half that `html` uses — by the host's own placeholder marker, which
 * is what the engine writes (lib/plugins/host.js `hydrateAttrs`).
 * @param {string | string[]} html  the rendered slides
 */
function usedHydrators(html) {
  const text = Array.isArray(html) ? html.join('\n') : String(html);
  return HYDRATORS.filter((h) => text.includes(`data-lattice-hydrate="${h.name}"`));
}

/**
 * The inline script body (no `<script>` tag) that hydrates `hydrators` on DOMContentLoaded, or at
 * once if the document has already parsed. Empty for an empty list.
 */
function hydrateScript(hydrators) {
  if (!hydrators.length) return '';
  const entries = hydrators.map((h) => `{ name: ${JSON.stringify(h.name)}, budgetMs: ${h.budgetMs}, payload: ${JSON.stringify(h.payload)}, hydrate: ${h.hydrate.toString()} }`);
  return `(function(){
  var fromBase64 = ${fromBase64.toString()};
  var releaseFigure = ${releaseFigure.toString()};
  var installHydrateHost = ${installHydrateHost.toString()};
  var host = installHydrateHost(window, [${entries.join(', ')}], { fromBase64: fromBase64, releaseFigure: releaseFigure });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', host.run);
  else host.run();
})();`;
}

/**
 * THE SETTLE BARRIER, as a page expression: resolves once no placeholder is pending, or after
 * `budgetMs`, when it closes every one still pending (`unavailable` + `final`, the author's
 * source shown) and resolves to how many it closed. Every capture on the CLI page — PDF, PNG,
 * PPTX, and the `--player` / `--read` bake — evaluates it before it reads the page, so an
 * asynchronous hydrate is never captured half drawn (engineering/decisions/2026-09-27-plugin-system.md §4.7).
 * @param {number} budgetMs
 * @returns {string} an expression for `page.evaluate`
 */
function settleBarrierScript(budgetMs) {
  return `(async function(budget){
  var releaseFigure = ${releaseFigure.toString()};
  var fromBase64 = ${fromBase64.toString()};
  var PENDING = ${JSON.stringify(PENDING_FIGURES)};
  var start = Date.now();
  while (document.querySelector(PENDING) && Date.now() - start < budget) {
    await new Promise(function(r){ setTimeout(r, 25); });
  }
  var left = Array.prototype.slice.call(document.querySelectorAll(PENDING));
  left.forEach(function(el){ releaseFigure(el, fromBase64, true); });
  return left.length;
})(${Number(budgetMs)})`;
}

/** The barrier's budget for a set of hydrators: the longest a hydrate may run, plus a second for the library's own load. */
function settleBudget(hydrators) {
  return Math.max(0, ...hydrators.map((h) => h.budgetMs)) + 1000;
}

/** The absolute path of a hydrator's library, resolved from its `npm:` spec; '' when absent. */
function payloadPath(h) {
  if (!h.payload) return '';
  try {
    return require.resolve(h.payload.from.replace(/^npm:/, ''));
  } catch (_e) {
    return '';
  }
}

module.exports = { usedHydrators, hydrateScript, settleBarrierScript, settleBudget, payloadPath };
