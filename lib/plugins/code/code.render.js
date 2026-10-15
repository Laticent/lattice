/**
 * lib/plugins/code/code.render.js — the code plugin's renderer: every fenced block no other plugin
 * claims (engineering/decisions/2026-10-15-code-plugin.md §4).
 *
 * The host hands `render` a `base(highlight)`: markdown-it's own fence rule, run with the
 * `highlight` callback given (null for plain text). Going through it keeps the markup every
 * downstream reader keys on — `<pre><code class="language-x">`, the token's attributes, the
 * escaping of an unknown language — exactly what it was before highlighting moved into a plugin.
 *
 * A fence a zip plugin owns for this render (the code door, lib/packages/code-door-fence.mjs) stays
 * plain: the door finds its block by the plain `<pre><code>` shape, so a grammar that happened to
 * know the name (`tex`, `sql`, `r`) would decide, per body and per surface, whether the plugin drew
 * it. The engine names those fences on the render's `env.plainFences`.
 */

const highlighter = require('./shared/highlighter.js');

function render(_token, _ctx, env, base) {
  const plain = env?.plainFences;
  return base((code, lang) => (plain?.has(lang) ? '' : highlighter.highlight(code, lang)));
}

const codeRenderer = Object.freeze({ highlighter, render });

module.exports = { codeRenderer };
