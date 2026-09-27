/**
 * lib/plugins/host.js — the plugin host the ENGINE calls: it installs every active plugin's
 * grammar (host-grammar.mjs) and attaches each plugin's renderers to the tokens its rules emit.
 *
 * A plugin reaches the engine only through the `ctx` its renderers receive:
 *
 *   ctx.name     the plugin's own name
 *   ctx.options  install-time options for this plugin (math: `output`), frozen. They are fixed
 *                per engine and part of the parser memo key (lib/engine/index.js), so a memoized
 *                markdown-it instance is never reused across different options
 *   ctx.family   the deck's box family (`wide | square | tall | strip`), from the same geometry
 *                the slide pipeline stamps as `data-family`
 *   ctx.escape, ctx.escapeAttr        the host's HTML escaping, for author text
 *   ctx.encodeConfig(text)            a text payload packed for an attribute (base64 UTF-8,
 *                                     lib/core/base64-utf8.js); the browser half decodes it
 *   ctx.hydrateAttrs(text)            the placeholder contract for a plugin with a `hydrate`:
 *                                     `data-lattice-hydrate="<name>"`, the packed body, and
 *                                     `data-lattice-settle="pending"`, which every export
 *                                     capture waits on (lib/plugins/host-browser.mjs)
 *
 * THE FENCE TABLE. The host owns `md.renderer.rules.fence`, once: a fence whose name (the first
 * word of its info string) or alias a plugin declares goes to that plugin's renderer, and every
 * other fence to the renderer that was there before. It replaces the old WRAPPER CHAIN, in which
 * each fence plugin wrapped the previous `rules.fence`, so registration order decided who won
 * and nothing checked it. Names cannot collide here — the resolver fails the build on a name two
 * plugins claim, or one a code language owns. A DEPRECATED alias still renders, and the render
 * reports the rename through the plugin's declared diagnostic.
 *
 * and `env`, markdown-it's per-render object, as a renderer's third argument. A plugin keeps no
 * state in closures: `buildMd` is memoized and test/unit/engine/parser-memo.test.js pins
 * cross-render byte determinism.
 *
 * FAIL-SOFT IS THE HOST'S JOB, AT THE RENDER STEP. Every renderer runs inside `failSoft`: a
 * throw or a non-string result becomes the plugin's declared `degradesTo`, and the rest of the
 * deck renders. The TOKENIZER rules are not wrapped — a rule that throws mid-scan leaves
 * markdown-it's position half-moved, and "degrade" has no meaning there — so the plugin harness
 * feeds every rule its malformed fixtures instead
 * (engineering/decisions/2026-09-27-plugin-system.md §4.6).
 */


const { PLUGINS, COMPONENT_PLUGINS } = require('./registry.generated.js');
const { installGrammar, activePlugins } = require('./host-grammar.mjs');
const { splitSections } = require('../core/split-sections');
const { readClassAttr } = require('../core/section-walk');
const { toBase64 } = require('../core/base64-utf8');

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

/** What a renderer that failed shows instead, per the plugin's `degradesTo`. */
function fallback(degradesTo, token, kind) {
  if (degradesTo === 'hidden') return '';
  const text = escapeHtml(token.content || '');
  if (degradesTo === 'code-block') return `<pre><code>${text}</code></pre>\n`;
  return kind === 'block' ? `<p>${text}</p>\n` : text; // 'source'
}

function failSoft(render, ctx, degradesTo, kind) {
  return (tokens, idx, _options, env) => {
    const token = tokens[idx];
    try {
      const out = render(token, ctx, env);
      if (typeof out === 'string') return out;
    } catch (_e) {
      /* fall through to the declared degradation */
    }
    return fallback(degradesTo, token, kind);
  };
}

/**
 * A declared diagnostic, recorded on the render's `env` (the engine collects `env.pluginDiagnostics`
 * into `render().diagnostics`). An undeclared ID is a plugin bug, and it throws — inside a
 * renderer, which `failSoft` turns into the declared degradation, so it is loud in tests and
 * harmless in a deck.
 */
function reporterFor(name, declared) {
  return (env, id, detail) => {
    if (!Object.hasOwn(declared, id)) throw new Error(`plugin "${name}" reported undeclared diagnostic "${id}"`);
    if (!env || !Array.isArray(env.pluginDiagnostics)) return;
    const key = `${id}|${detail ?? ''}`;
    if (env.pluginDiagnostics.some((d) => d.key === key)) return;
    env.pluginDiagnostics.push({ key, id, plugin: name, message: declared[id], ...(detail === undefined ? {} : { detail: String(detail) }) });
  };
}

function ctxFor(g, options, family) {
  return Object.freeze({
    name: g.name,
    options: Object.freeze({ ...(options[g.name] || {}) }),
    family,
    escape: escapeHtml,
    escapeAttr,
    encodeConfig: toBase64,
    hydrateAttrs: (text) => `data-lattice-hydrate="${g.name}" data-lattice-config="${toBase64(text)}" data-lattice-settle="pending"`,
  });
}

/** The first word of a fence's info string — markdown-it's own reading of the language name. */
function fenceName(info) {
  return (info || '').trim().split(/\s+/, 1)[0];
}

/**
 * Take over `md.renderer.rules.fence` with ONE table: every name and alias the active plugins
 * declare → that plugin's renderer (fail-soft, like every renderer); anything else → the fence
 * renderer that was installed before. The resolver has already proven the names disjoint.
 */
function installFenceTable(md, active, byName, options, family) {
  const table = new Map();
  for (const g of active) {
    const plugin = byName.get(g.name);
    const ctx = ctxFor(g, options, family);
    const report = reporterFor(g.name, g.diagnostics);
    for (const [fence, decl] of Object.entries(g.fences)) {
      // A fence's SOURCE is a code block: a multi-line config or TeX body flattened into one
      // paragraph reads as nothing (HARD RULE #25 red team), so `source` degrades as `code-block`.
      const render = failSoft(plugin.fenceRenderers[fence], ctx, g.degradesTo === 'source' ? 'code-block' : g.degradesTo, 'block');
      table.set(fence, render);
      for (const alias of decl.aliases) {
        table.set(alias.name, alias.deprecated
          ? (tokens, idx, options_, env) => {
              report(env, `${g.name}/deprecated-alias`, `${alias.name} is now ${fence}`);
              return render(tokens, idx, options_, env);
            }
          : render);
      }
    }
  }
  if (!table.size) return;
  const previous = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options_, env, self) => {
    const own = table.get(fenceName(tokens[idx].info));
    if (own) return own(tokens, idx, options_, env);
    return previous ? previous(tokens, idx, options_, env, self) : self.renderToken(tokens, idx, options_);
  };
}

/**
 * Install every active plugin on the engine's markdown-it instance.
 * @param {import('markdown-it')} md
 * @param {{ disabled?: Iterable<string>, options?: Record<string, object>, family?: string }} [opts]
 * @returns {string[]} the names of the plugins installed, in dependency order
 */
function installPlugins(md, { disabled = [], options = {}, family = 'wide' } = {}) {
  const active = installGrammar(md, { disabled });
  const byName = new Map(PLUGINS.map((p) => [p.name, p]));
  for (const g of active) {
    const plugin = byName.get(g.name);
    const ctx = ctxFor(g, options, family);
    for (const [token, rule] of Object.entries(g.syntax)) {
      md.renderer.rules[token] = failSoft(plugin.renderers[token], ctx, g.degradesTo, rule.kind);
    }
  }
  installFenceTable(md, active, byName, options, family);
  return active.map((g) => g.name);
}

/**
 * The class tokens of every SLIDE — each top-level `<section>` of the rendered deck — read with
 * the repo's one section walker (`splitSections`, a real tag tokenizer) and its one class reader
 * (`readClassAttr`, which takes the RESOLVED `class`, never the raw `data-class` that precedes it,
 * #1358). Top-level only, so an author's own `<section class="math">` inside a slide is not a
 * slide (found by the HARD RULE #25 checker).
 *
 * The first cut was a hand-written regex with two lazy runs around a `data-form` test; CodeQL
 * flagged it as polynomial (js/polynomial-redos) and it was — 8,000 repeated attributes took
 * 299 ms, doubling the input quadrupled it — and deck text can come from a shared link. The
 * shared walker is also what the repo's gates require: a literal `indexOf('<section')` scan cannot
 * tell markup from a `<section` quoted in a comment or in `<style>` text.
 */
function slideClassTokens(html) {
  const out = [];
  for (const piece of splitSections(html)) {
    if (piece.type === 'gap') continue;
    for (const t of readClassAttr(piece.openTag).split(/\s+/)) if (t) out.push(t);
  }
  return out;
}

/**
 * The slides whose component REQUIRES a plugin that is not running — switched off
 * (`createEngine({ plugins: { disabled } })`, `math: false`) or disabled because something it
 * requires is. The slide itself still renders: the layout, and the plugin's own text fallback
 * (math shows its TeX). This is what keeps that degradation from being silent.
 *
 * Costs nothing on a normal render: with no plugin disabled every required plugin is active, so
 * it returns before reading the HTML.
 * @param {string} html  the rendered deck
 * @param {ReadonlyArray<string>} disabled
 * @returns {Array<{ id: string, component: string, plugin: string, message: string }>}
 */
function componentPluginDiagnostics(html, disabled) {
  if (!disabled.length) return [];
  const active = new Set(activePlugins(disabled).map((p) => p.name));
  const out = [];
  const seen = new Set();
  for (const cls of slideClassTokens(html)) {
    for (const plugin of COMPONENT_PLUGINS[cls] || []) {
      const key = `${cls}|${plugin}`;
      if (active.has(plugin) || seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: 'plugin/component-needs-plugin',
        component: cls,
        plugin,
        message: `The "${cls}" slide class needs the "${plugin}" plugin, which is switched off; its slides render without it.`,
      });
    }
  }
  return out;
}

module.exports = { installPlugins, failSoft, fenceName, componentPluginDiagnostics, PLUGINS, COMPONENT_PLUGINS };
