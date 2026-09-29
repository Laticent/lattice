/**
 * lib/plugins/hydrate-script.js — the CLI export page's copy of the plugin host's browser half.
 *
 * The emulator's page runs WITHOUT `lattice-runtime.js` (its overflow watcher would paint into the
 * print), so the host (host-browser.mjs) and each used plugin's `hydrate` reach it as ONE inline
 * script, serialized from the very functions the runtime bundles — which is why both are
 * self-contained, and why tools/build-plugin-registry.js refuses a hydrate module that requires or
 * imports. The plugin's library is the emulator's to inject, INLINE ahead of this
 * (`payloadScript`), so an exported `--html` / `--fluid` page draws its figures on any machine.
 *
 * Node-only. `test/unit/plugins/hydrate-host.test.js` runs the script it returns.
 */

const fs = require('node:fs');
const { fromBase64 } = require('../core/base64-utf8');
const { inlineScript } = require('../packages/code-door-core.mjs');
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

/**
 * A hydrator's library as an INLINE `<script>` (the given opening tag, e.g. the engine's marked
 * one), or '' when it has none or it is not installed.
 *
 * Inline, not `<script src="file://…/node_modules/…">`: the PDF is captured on the exporting
 * machine, where that path resolves, but `--html` and `--fluid` hand the page itself to a reader,
 * and on any other machine the path is gone — every plot showed its JSON config instead.
 * `inlineScript` writes the `<` of `</script`, `<script` and `<!--` as `\x3C`, so library text
 * cannot end the element early; a trailing `sourceMappingURL` comment is dropped, because the map
 * it names sits beside the library on the exporting machine only.
 * @param {{ payload?: { from: string } }} h
 * @param {string} openTag
 */
function payloadScript(h, openTag) {
  const abs = payloadPath(h);
  if (!abs) return '';
  const code = fs.readFileSync(abs, 'utf8').replace(/\n\/\/# sourceMappingURL=[^\n]*\s*$/, '\n');
  return `${openTag}\n${inlineScript(code)}\n</script>`;
}

module.exports = { usedHydrators, hydrateScript, settleBarrierScript, settleBudget, payloadPath, payloadScript };
