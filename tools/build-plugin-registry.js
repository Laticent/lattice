#!/usr/bin/env node
/**
 * Freezes the in-tree plugins (lib/plugins/) into the registries every render path reads,
 * after the resolver checks them (engineering/decisions/2026-09-27-plugin-system.md §1, §4.5).
 *
 *   lib/plugins/grammar.generated.mjs   ESM. Each plugin's manifest data plus its syntax module's
 *                                        rules and `detect`. KaTeX-free by construction: it
 *                                        imports only `<name>.syntax.mjs`, so the boundary parser
 *                                        and the docs site's pre-scan can import it.
 *   lib/plugins/registry.generated.js   CommonJS. The grammar plus each plugin's
 *                                        `<name>.render.js` — what the engine installs.
 *   lib/plugins/blocks.generated.mjs    ESM. The BLOCK rules only, as a fixed install sequence
 *                                        in the resolver's order, for the boundary parser. That
 *                                        parser ships in the Studio's startup JavaScript twice
 *                                        (its own chunk and the lint bundle's copy), so it takes
 *                                        a few named imports and a straight-line installer
 *                                        rather than the generic host and every plugin's data.
 *                                        test/unit/plugins/resolve.test.js holds it to the host.
 *   lib/plugins/hydrate.generated.js    CommonJS. Each plugin's browser half (`<name>.hydrate.js`)
 *                                        and the library it waits for — what the runtime bundles
 *                                        and lib/plugins/hydrate-script.js serializes for the CLI.
 *   lib/plugins/passes.generated.js     CommonJS. Each plugin whose browser half is a document PASS
 *                                        (`render.exec.hydrate: "pass"` — Mermaid's): its
 *                                        `createPass` and fence names, what the runtime drives.
 *                                        Never serialized, so the module may require.
 *   lib/plugins/styles.generated.js     CommonJS. The plugins' stylesheets, in dependency order,
 *                                        for tools/build-css.js's plugin slot.
 *   lib/plugins/extension-points.generated.json   JSON. Each slot a plugin offers (phase F: the
 *                                        chart family's \`kernel\`), keyed by the component block
 *                                        that fills it: its plugin and slot, the bucket that
 *                                        fills it, and the filler module's role and entry — what
 *                                        the component loader, tools/build-chart-registry.js and
 *                                        tools/check-ownership.js read instead of a hand-kept
 *                                        bucket list.
 *   lib/plugins/inline.generated.js     CommonJS. Each plugin's inline-code kinds (`<name>.inline.js`),
 *                                        the rows lib/core/inline-code-directives.js appends to its own.
 *   lib/plugins/services.generated.js   CommonJS. Each plugin's services (`<name>.services.js`), for
 *                                        lib/plugins/services.js.
 *   lib/plugins/registers.generated.js  CommonJS, data only. Each plugin's front-matter registers, for
 *                                        lib/core/register-factory.js.
 *   lib/plugins/data.generated.js       CommonJS. Each plugin's data as a LAZY loader, which the
 *                                        engine registers with lib/plugins/plugin-data.js.
 *   lib/plugins/data-probe.generated.mjs  ESM. Each data plugin's `detect` and on-demand file, for a
 *                                        browser surface that fetches the data before rendering.
 *
 * GENERATED, NOT SCANNED AT RUN TIME, for the reason the chart registry is: a bundler cannot
 * follow `require(templateLiteral)`, and the runtime should pay nothing to find its plugins. Both
 * files are committed and are a function of the manifests alone, so `--check` can hold them to
 * the tree.
 *
 * Before writing, `lib/plugins/resolve.js` checks the whole set — schema-valid manifests (the
 * shared `build:check` schema gate covers that), the manifest and modules agreeing one-to-one,
 * dependencies present and acyclic, anchors that name host rules, trigger and token claims that
 * do not collide, components that exist — and a failure names the plugin and exits non-zero.
 *
 *   node tools/build-plugin-registry.js            write all three files
 *   node tools/build-plugin-registry.js --check    freshness + resolver gate
 *   node tools/build-plugin-registry.js --root <dir>   resolve another tree (tests)
 */


const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { resolvePlugins } = require('../lib/plugins/resolve');

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const silent = argv.includes('--silent') || check;
const rootArg = argv.indexOf('--root');
const ROOT = rootArg >= 0 ? path.resolve(argv[rootArg + 1]) : path.resolve(__dirname, '..');
const PLUGINS_DIR = path.join(ROOT, 'lib', 'plugins');
const GRAMMAR_FILE = path.join(PLUGINS_DIR, 'grammar.generated.mjs');
const REGISTRY_FILE = path.join(PLUGINS_DIR, 'registry.generated.js');
const BLOCKS_FILE = path.join(PLUGINS_DIR, 'blocks.generated.mjs');
const HYDRATE_FILE = path.join(PLUGINS_DIR, 'hydrate.generated.js');
const PASSES_FILE = path.join(PLUGINS_DIR, 'passes.generated.js');
const STYLES_FILE = path.join(PLUGINS_DIR, 'styles.generated.js');
const BAKE_FILE = path.join(PLUGINS_DIR, 'bake.generated.js');
const DRAWN_FILE = path.join(PLUGINS_DIR, 'drawn.generated.mjs');
const DRAWN_LIBRARY_FILE = path.join(PLUGINS_DIR, 'drawn-library.generated.mjs');
const EXTENSION_POINTS_FILE = path.join(PLUGINS_DIR, 'extension-points.generated.json');
const INLINE_FILE = path.join(PLUGINS_DIR, 'inline.generated.js');
const SERVICES_FILE = path.join(PLUGINS_DIR, 'services.generated.js');
const REGISTERS_FILE = path.join(PLUGINS_DIR, 'registers.generated.js');
const DATA_FILE = path.join(PLUGINS_DIR, 'data.generated.js');
const DATA_PROBE_FILE = path.join(PLUGINS_DIR, 'data-probe.generated.mjs');

/** Every `lib/plugins/<folder>/` holding a `*.manifest.json`, `_`-prefixed folders skipped. */
function listPlugins() {
  if (!fs.existsSync(PLUGINS_DIR)) return [];
  return fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort()
    .flatMap((folder) => {
      const manifests = fs.readdirSync(path.join(PLUGINS_DIR, folder)).filter((f) => f.endsWith('.manifest.json'));
      if (manifests.length !== 1) {
        throw new Error(`lib/plugins/${folder}/ must hold exactly one *.manifest.json (found ${manifests.length})`);
      }
      const manifest = JSON.parse(fs.readFileSync(path.join(PLUGINS_DIR, folder, manifests[0]), 'utf8'));
      return [{ folder, manifest }];
    });
}

/**
 * The export keys of a plugin's role modules — what the one-to-one check compares. A syntax
 * module exports each rule under the token type it emits (so a bundler can keep one rule and
 * drop the rest); an exported function under an UNdeclared name is simply never installed, so
 * only the declared → exported direction needs checking on that side.
 */
async function readExports(folder, name, manifest) {
  const dir = path.join(PLUGINS_DIR, folder);
  const out = { rules: [], renderers: [], detect: false, hasSyntax: false, hasRender: false };
  const syntaxPath = path.join(dir, `${name}.syntax.mjs`);
  if (fs.existsSync(syntaxPath)) {
    const mod = await import(pathToFileURL(syntaxPath).href);
    out.hasSyntax = true;
    out.rules = Object.keys(manifest.contributes?.syntax || {}).filter((t) => typeof mod[t] === 'function');
    out.module = mod;
    out.detect = typeof mod.detect === 'function';
  }
  const renderPath = path.join(dir, `${name}.render.js`);
  if (fs.existsSync(renderPath)) {
    const mod = require(renderPath);
    out.hasRender = true;
    out.renderers = Object.keys(mod.renderers || {});
    out.fences = Object.keys(mod.fences || {});
  }
  const hydratePath = path.join(dir, `${name}.hydrate.js`);
  if (fs.existsSync(hydratePath)) {
    const { hydrate, createPass } = require(hydratePath);
    out.hasHydrate = typeof hydrate === 'function';
    // A PASS (`render.exec.hydrate: "pass"`) exports `createPass(ctx)` instead: the runtime bundles
    // it and never serializes it, so neither the no-import rule nor the module-scope rule below
    // applies to it (lib/plugins/resolve.js decides which rules a plugin answers to).
    out.hasPass = typeof createPass === 'function';
    out.hydrateSource = fs.readFileSync(hydratePath, 'utf8');
    // What the module holds OUTSIDE the hydrate function: its own source text (which is exactly
    // what the CLI page receives, serialized) cut out, then comments and the one export statement.
    // Anything left — a module-level const, a helper — is a free identifier on the CLI page, where
    // it throws "is not defined" and the PDF prints the error instead of the figure while the
    // runtime draws fine (the HARD RULE #25 inversion lens reproduced exactly that).
    if (out.hasHydrate) {
      out.hydrateModuleScope = out.hydrateSource
        .replace(hydrate.toString(), '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/module\.exports\s*=\s*\{\s*hydrate\s*\};?/, '')
        .replace(/(['"])use strict\1;?/, '')
        .trim();
    }
  }
  // The inline kinds and services: light modules every dispatcher bundle carries, read for their
  // keys (and each kind's four functions) so the one-to-one check can compare them.
  const inlinePath = path.join(dir, `${name}.inline.js`);
  if (fs.existsSync(inlinePath)) {
    const { inline = {} } = require(inlinePath);
    out.inline = Object.keys(inline);
    out.inlineFns = Object.fromEntries(Object.entries(inline).map(([k, row]) => [k, Object.keys(row || {}).filter((f) => typeof row[f] === 'function')]));
  }
  const servicesPath = path.join(dir, `${name}.services.js`);
  if (fs.existsSync(servicesPath)) out.services = Object.keys(require(servicesPath).services || {});
  out.hasData = fs.existsSync(path.join(dir, `${name}.data.generated.js`));
  // The highlight grammar is a pure function of highlight.js's API; read for its export.
  const highlightPath = path.join(dir, `${name}.highlight.js`);
  if (fs.existsSync(highlightPath)) out.hasHighlight = typeof require(highlightPath).highlight === 'function';
  // The bake module is Node-only and may be heavy (it drives a render worker), so it is read for
  // its export and never imported by anything the engine or a browser loads.
  const bakePath = path.join(dir, `${name}.bake.js`);
  if (fs.existsSync(bakePath)) out.hasBake = typeof require(bakePath).bake === 'function';
  const stylesPath = path.join(dir, `${name}.styles.css`);
  if (fs.existsSync(stylesPath)) {
    out.hasStyles = true;
    out.stylesSource = fs.readFileSync(stylesPath, 'utf8');
  }
  return out;
}

/**
 * The fence names a plugin may NOT claim, because a code language already owns them: every
 * highlight.js language name and alias (claiming `json`, `tex` or `graph` would hijack every code
 * block in that language). `mermaid` is not here: it is the mermaid plugin's fence (phase D), so
 * the one-owner check covers it like any other plugin's. Read from the installed highlight.js, so an upgrade that adds a language reserves it.
 */
function reservedFenceNames() {
  const hljs = require('highlight.js');
  const names = new Set();
  for (const lang of hljs.listLanguages()) {
    names.add(lang);
    for (const alias of hljs.getLanguage(lang)?.aliases || []) names.add(alias);
  }
  return names;
}

/**
 * Every slide class a FIRST-PARTY modifier group owns (lib/components/index.js MODIFIER_GROUPS, less
 * the groups a plugin register added), so a plugin register cannot stamp one. Empty when the module
 * will not load, so a broken tree still regenerates its registry.
 */
function hostClasses() {
  try {
    const { MODIFIER_GROUPS } = require(path.join(ROOT, 'lib', 'components', 'index.js'));
    return new Set(MODIFIER_GROUPS.filter((g) => !g.plugin).flatMap((g) => g.tokens || []));
  } catch {
    return new Set();
  }
}

/**
 * The fence claims the COMMITTED registry already ships: fence name or alias → plugin. The
 * resolver grandfathers these against `reservedFenceNames()`, so a highlight.js upgrade that
 * adds a language named like a shipped fence warns instead of failing every build. Read from
 * the grammar this tool last wrote — the one record of what shipped — and empty when that file
 * is missing or will not load, so a broken registry still regenerates (strictly).
 */
async function shippedFenceClaims() {
  const claims = new Map();
  if (!fs.existsSync(GRAMMAR_FILE)) return claims;
  try {
    const { PLUGIN_GRAMMAR } = await import(pathToFileURL(GRAMMAR_FILE).href);
    for (const g of PLUGIN_GRAMMAR || []) {
      for (const [fence, decl] of Object.entries(g.fences || {})) {
        for (const claim of [fence, ...(decl.aliases || []).map((a) => a.name)]) claims.set(claim, g.name);
      }
    }
  } catch {
    return new Map();
  }
  return claims;
}

/**
 * Every component's `plugins` block, and the plugins its OWN gallery (`<name>.gallery.md`) USES —
 * found by parsing that gallery with each plugin's own rules, on a fresh markdown-it per plugin. That is what lets the
 * resolver fail a component that uses a plugin without declaring it, so the declaration is a
 * checked fact rather than a promise.
 *
 * The package spine's filesystem walk finds the components, not `loadAll`: `loadAll` reaches the
 * boundary parser, which imports what this tool writes — a registry that could not be
 * regenerated once broken. For the same reason the rules are installed here directly rather
 * than through lib/plugins/host-grammar.mjs, which imports the generated grammar.
 */
function componentsWithPlugins(listed, exportsByName) {
  const MarkdownIt = require('markdown-it');
  const { discoverPackages } = require(path.join(ROOT, 'lib', 'packages', 'fs.js'));
  const parsers = listed
    .filter((p) => Object.keys(p.manifest.contributes?.syntax || {}).length && exportsByName.get(p.manifest.name).module)
    .map((p) => {
      const md = new MarkdownIt('commonmark', { html: true });
      const mod = exportsByName.get(p.manifest.name).module;
      const syntax = p.manifest.contributes.syntax;
      for (const [token, rule] of Object.entries(syntax)) {
        if (typeof mod[token] !== 'function') continue; // the resolver reports the missing rule
        const ruler = rule.kind === 'inline' ? md.inline.ruler : md.block.ruler;
        const [side, anchor] = Object.entries(rule.anchor)[0];
        ruler[side](anchor, token, mod[token]);
      }
      return { name: p.manifest.name, md, tokens: new Set(Object.keys(syntax)) };
    });
  // A plugin's FENCES count as use too: a fence token whose name (or alias) the plugin declares.
  const fenceOwners = new Map();
  for (const p of listed) {
    for (const [fence, decl] of Object.entries(p.manifest.contributes?.fences || {})) {
      fenceOwners.set(fence, p.manifest.name);
      for (const a of decl.aliases || []) fenceOwners.set(a.name, p.manifest.name);
    }
  }
  const plain = new MarkdownIt('commonmark', { html: true });
  const uses = (src) => {
    const found = [];
    for (const { name, md, tokens } of parsers) {
      let hit = false;
      const walk = (list) => {
        for (const t of list) {
          if (tokens.has(t.type)) hit = true;
          if (!hit && t.children) walk(t.children);
        }
      };
      walk(md.parse(src, {}));
      if (hit) found.push(name);
    }
    for (const t of plain.parse(src, {})) {
      const owner = t.type === 'fence' && fenceOwners.get((t.info || '').trim().split(/\s+/, 1)[0]);
      if (owner && !found.includes(owner)) found.push(owner);
    }
    return found;
  };
  return discoverPackages({ root: ROOT, types: ['component'] })
    .filter((p) => p.result.pkg)
    .map((p) => {
      const { name, manifest } = p.result.pkg;
      const gallery = path.join(ROOT, p.path, `${name}.gallery.md`);
      return {
        name,
        // The bucket as the component loader reads it, and the manifest's blocks: what the
        // resolver's extension-point arm needs to find a slot's fillers (phase F).
        bucket: typeof manifest.bucket === 'string' && manifest.bucket ? manifest.bucket : manifest.function,
        blocks: Object.keys(manifest),
        requires: manifest.plugins?.requires || [],
        optional: manifest.plugins?.optional || [],
        uses: fs.existsSync(gallery) ? uses(fs.readFileSync(gallery, 'utf8')) : [],
      };
    });
}

const HEADER = (what) => `// GENERATED by tools/build-plugin-registry.js from lib/plugins/*/*.manifest.json — do not edit.
// ${what}
// Contract: engineering/decisions/2026-09-27-plugin-system.md. Regenerate: npm run build.
`;

const ident = (name) => `p_${name.replace(/-/g, '_')}`;

function renderGrammar(ordered, exportsByName, components, fills) {
  const imports = ordered
    .filter((p) => {
      const exp = exportsByName.get(p.manifest.name);
      return exp.hasSyntax && (exp.rules.length || exp.detect);
    })
    .map((p) => {
      // Only names the module really exports: a plugin may ship a syntax module and declare no
      // syntax (so need no `detect`), and a named import of a missing export fails to LINK,
      // where the old `import * as` read undefined. Sorted, as the repo's formatter sorts them.
      const exp = exportsByName.get(p.manifest.name);
      const names = [...exp.rules, ...(exp.detect ? ['detect'] : [])].sort();
      return `import { ${names.map((n) => `${n} as ${ident(p.manifest.name)}__${n}`).join(', ')} } from './${p.folder}/${p.manifest.name}.syntax.mjs';`;
    });
  const entries = ordered.map((p) => {
    const m = p.manifest;
    const mod = exportsByName.get(p.manifest.name).hasSyntax ? ident(p.manifest.name) : null;
    const syntax = Object.entries(m.contributes.syntax || {}).map(([token, rule]) => {
      const fields = [
        `kind: ${JSON.stringify(rule.kind)}`,
        `anchor: Object.freeze(${JSON.stringify(rule.anchor)})`,
        `triggers: Object.freeze(${JSON.stringify(rule.triggers)})`,
        `opaque: ${rule.opaque === true}`,
        `run: ${mod}__${token}`,
      ];
      return `      ${token}: Object.freeze({ ${fields.join(', ')} }),`;
    });
    const fences = Object.entries(m.contributes.fences || {}).map(([fence, decl]) => {
      const aliases = (decl.aliases || []).map((a) => `Object.freeze({ name: ${JSON.stringify(a.name)}, deprecated: ${a.deprecated === true} })`);
      const as = decl.as ? `, as: ${JSON.stringify(decl.as)}` : '';
      return `      ${JSON.stringify(fence)}: Object.freeze({ body: ${JSON.stringify(decl.body)}${as}, aliases: Object.freeze([${aliases.join(', ')}]) }),`;
    });
    return [
      '  Object.freeze({',
      `    name: ${JSON.stringify(m.name)},`,
      `    title: ${JSON.stringify(m.title)},`,
      `    requires: Object.freeze(${JSON.stringify(m.requires || [])}),`,
      `    optional: Object.freeze(${JSON.stringify(m.optional || [])}),`,
      `    degradesTo: ${JSON.stringify(m.render?.degradesTo || 'source')},`,
      `    diagnostics: Object.freeze(${JSON.stringify(m.contributes.diagnostics || {})}),`,
      `    syntax: Object.freeze({${syntax.length ? `\n${syntax.join('\n')}\n    ` : ''}}),`,
      `    fences: Object.freeze({${fences.length ? `\n${fences.join('\n')}\n    ` : ''}}),`,
      `    hydrate: ${m.contributes.hydrate ? 'true' : 'false'},`,
      `    pass: ${m.render?.exec?.hydrate === 'pass'},`,
      `    detect: ${mod && exportsByName.get(p.manifest.name).detect ? `${mod}__detect` : 'null'},`,
      '  }),',
    ].join('\n');
  });
  return `${HEADER('The plugins\' GRAMMAR, in dependency order: manifest data + syntax rules + detect. No renderer library is reachable from here.')}
${imports.join('\n')}

export const PLUGIN_GRAMMAR = Object.freeze([
${entries.join('\n')}
]);

// In-tree components that REQUIRE a plugin, keyed by component name — which is the slide class an
// author writes (\`_class: math\`). A required plugin is LOADED for a deck that uses the class
// (host-grammar.mjs \`admitPlugins\`, plugin-system §9 decision 6), and the engine reports a slide
// whose required plugin is switched off. A component that FILLS a plugin's extension point (a chart
// filling the chart family's \`kernel\` slot) requires that plugin by the act, with no \`plugins\` block.
// A user component's declaration joins with the data layer (plugin-system phase E).
export const COMPONENT_PLUGINS = Object.freeze(${JSON.stringify(componentRequirements(components, fills))});
`;
}

/** Each component's required plugins: its own \`plugins.requires\`, then the plugins whose slots it fills. */
function componentRequirements(components, fills) {
  const out = {};
  for (const c of components) {
    const all = [...new Set([...c.requires, ...(fills[c.name] || [])])];
    if (all.length) out[c.name] = all;
  }
  return out;
}

/**
 * The EXTENSION POINTS, keyed by slot name: which plugin offers it, which bucket fills it, and the
 * role and entry of a filler's module. JSON, because its readers are CommonJS that a browser also
 * bundles (lib/components/index.js validates a \`kernel\` block against it) and Node tools
 * (tools/build-chart-registry.js freezes the fills; tools/check-ownership.js checks them).
 */
function renderExtensionPoints(ordered) {
  // Keyed by the BLOCK a filler declares — what every reader is asking about ("who reads a
  // component's \`kernel\` block?") — with the plugin and its own slot name inside.
  const out = {};
  for (const p of ordered) {
    for (const [slot, point] of Object.entries(p.manifest.contributes.extensionPoints || {})) {
      out[point.block || slot] = { plugin: p.manifest.name, slot, bucket: point.bucket, role: point.role, entry: point.entry };
    }
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}

/**
 * The block rules as a straight-line installer. The order is the host's (host-grammar.mjs):
 * `before` anchors in dependency order, `after` anchors in reverse, so markdown-it's insertion
 * leaves them running in dependency order. Every plugin's block rules are installed — the
 * boundary parser never disables one, because it reads the source, not a render.
 */
function renderBlocks(ordered) {
  const entries = ordered.flatMap((p) =>
    Object.entries(p.manifest.contributes.syntax || {})
      .filter(([, rule]) => rule.kind === 'block')
      .map(([token, rule]) => ({ plugin: p, token, rule })));
  // One import line per plugin, names sorted, as the repo's formatter writes them.
  const byPlugin = new Map();
  for (const { plugin, token } of entries) byPlugin.set(plugin, [...(byPlugin.get(plugin) || []), token]);
  const imports = [...byPlugin].map(([plugin, tokens]) => `import { ${tokens.sort().join(', ')} } from './${plugin.folder}/${plugin.manifest.name}.syntax.mjs';`);
  const calls = [
    ...entries.filter((e) => e.rule.anchor.before).map((e) => `  md.block.ruler.before(${JSON.stringify(e.rule.anchor.before)}, ${JSON.stringify(e.token)}, ${e.token});`),
    ...[...entries].reverse().filter((e) => e.rule.anchor.after).map((e) => `  md.block.ruler.after(${JSON.stringify(e.rule.anchor.after)}, ${JSON.stringify(e.token)}, ${e.token});`),
  ];
  const opaque = entries.filter((e) => e.rule.opaque).map((e) => e.token);
  return `${HEADER('Every plugin BLOCK rule, as the boundary parser installs it. Straight-line on purpose: it ships in the Studio\'s startup JavaScript.')}
${imports.join('\n')}${imports.length ? '\n' : ''}
/** Install every plugin block rule on \`md\`, in dependency order. */
export function installPluginBlocks(md) {
${calls.join('\n')}${calls.length ? '\n' : ''}}

/** Each plugin's block rules by name, so a host that admitted fewer plugins can switch a plugin's
 *  rules off (lib/core/boundary-parser.mjs \`setBoundaryPluginsOff\`). Only the CLI calls that today;
 *  a bundle that keeps the boundary parser's exports whole (authoring-core) carries the record too. */
export const PLUGIN_BLOCK_RULES = /* @__PURE__ */ Object.freeze({${[...byPlugin].map(([plugin, tokens]) => ` ${JSON.stringify(plugin.manifest.name)}: /* @__PURE__ */ Object.freeze(${JSON.stringify(tokens)})`).join(',')}${byPlugin.size ? ' ' : ''}});

/** Plugin block tokens whose body renders no inline Markdown (lint-core skips them). */
export const OPAQUE_BLOCK_TOKENS = Object.freeze(${JSON.stringify(opaque)});

/** Every shipped plugin's name, in dependency order — for a reader that needs only the names
 *  (lint-core's \`unknown-plugin\`), so it does not pull every plugin's grammar into a bundle. */
export const PLUGIN_NAMES = Object.freeze(${JSON.stringify(ordered.map((p) => p.manifest.name))});
`;
}

/**
 * The browser halves, in dependency order: what the runtime bundle requires and what
 * lib/plugins/hydrate-script.js serializes for the CLI export page. Requires only the hydrate
 * modules — never a renderer, whose library (KaTeX) the runtime must not carry.
 */
function renderHydrate(ordered) {
  const lines = ordered.filter((p) => p.manifest.contributes.hydrate && p.manifest.render?.exec?.hydrate !== 'pass').map((p) => {
    const m = p.manifest;
    const [payload] = Object.values(m.payload || {});
    const fields = [
      `name: ${JSON.stringify(m.name)}`,
      `hydrate: require('./${p.folder}/${m.name}.hydrate.js').hydrate`,
      `budgetMs: ${m.contributes.hydrate.budgetMs || 4000}`,
      `payload: ${payload ? `Object.freeze({ from: ${JSON.stringify(payload.from)}, file: ${JSON.stringify(payload.from.split('/').pop())}, global: ${JSON.stringify(payload.global)} })` : 'null'}`,
    ];
    return `  Object.freeze({ ${fields.join(', ')} }),`;
  });
  return `${HEADER('The plugins\' BROWSER halves, in dependency order: each hydrate function and the library it waits for.')}
const HYDRATORS = Object.freeze([${lines.length ? `\n${lines.join('\n')}\n` : ''}]);

module.exports = { HYDRATORS };
`;
}

/**
 * The document passes, in dependency order: each plugin whose browser half walks the whole
 * document (`render.exec.hydrate: "pass"` — Mermaid's diagram pass), with its fence names. What
 * lib/runtime/index.js drives; nothing else requires it, because a pass module requires the
 * kernels it shares with its bake and has no business in a Node-side or serialized path.
 */
function renderPasses(ordered) {
  const codeFences = (p) => Object.entries(p.manifest.contributes.fences || {}).filter(([, d]) => d.as === 'code').map(([f]) => f);
  const lines = ordered.filter((p) => p.manifest.render?.exec?.hydrate === 'pass').map((p) => {
    const m = p.manifest;
    return `  Object.freeze({ name: ${JSON.stringify(m.name)}, createPass: require('./${p.folder}/${m.name}.hydrate.js').createPass, fences: Object.freeze(${JSON.stringify(codeFences(p))}) }),`;
  });
  return `${HEADER('The plugins\' document PASSES, in dependency order: each pass factory and its fence names. Bundled by the runtime only.')}
const PASSES = Object.freeze([${lines.length ? `\n${lines.join('\n')}\n` : ''}]);

module.exports = { PASSES };
`;
}

/**
 * The fences a browser's RUNTIME draws from their highlighted code block (a code fence of a plugin
 * with `render.exec.hydrate: "pass"` — Mermaid). A surface that must tell "this render still
 * owes a drawing" reads this instead of naming a plugin. Plain data, so a lazily loaded view can
 * import it without the grammar behind it.
 */
function renderDrawn(ordered) {
  const drawn = ordered.filter((p) => p.manifest.render?.exec?.hydrate === 'pass');
  const codeFences = (p) => Object.entries(p.manifest.contributes.fences || {}).filter(([, d]) => d.as === 'code').map(([f]) => f);
  const fences = drawn.flatMap(codeFences);
  // Per plugin: its code fences and the library the runtime's host loads for it (`payload`), so
  // the runtime's pass for one plugin reads ITS fence names and library, and a browser surface
  // that needs the library's address derives it instead of threading a hand-named URL.
  const byPlugin = drawn.map((p) => {
    const [payload] = Object.values(p.manifest.payload || {});
    const lib = payload ? `/* @__PURE__ */ Object.freeze({ from: ${JSON.stringify(payload.from)}, file: ${JSON.stringify(payload.from.split('/').pop())}, global: ${JSON.stringify(payload.global)} })` : 'null';
    return `  ${JSON.stringify(p.manifest.name)}: /* @__PURE__ */ Object.freeze({ fences: /* @__PURE__ */ Object.freeze(${JSON.stringify(codeFences(p))}), payload: ${lib} }),`;
  });
  // The two probes lib/plugins/drawn-probe.mjs exports, written out here as LITERALS: they ship in
  // the Studio's and the Playground's startup JavaScript (docs/route-budget.json), and a literal is
  // smaller there than the map/join that would build it at run time. Fence names go into a CSS
  // selector and a RegExp unescaped, so anything but a plain name is refused rather than escaped.
  for (const f of fences) {
    if (!/^[a-z][a-z0-9-]*$/i.test(f)) throw new Error(`build-plugin-registry: runtime-drawn fence ${JSON.stringify(f)} is not a plain name`);
  }
  // No runtime-drawn fence → a selector and a pattern that match nothing, never `:is()` / `(?:)`.
  // `:not([data-lattice-off])`: a fence the engine marked as belonging to a plugin the deck did not
  // load is the author's code block, never a drawing owed (spec/LPM.md §3.2.1).
  const fenceCode = fences.length ? `:is(pre,marp-pre):not([data-lattice-off])>:is(${fences.map((f) => `code[class*="language-${f}"]`).join()})` : ':not(*)';
  const sourceFence = fences.length ? `/^[ \\t>]*(?:\`{3,}|~{3,})[^\\S\\n]*(?:${fences.join('|')})(?![\\w-])/m` : '/(?!)/';
  return `${HEADER('The code fences a browser runtime draws (render.exec.hydrate "pass"), and each such plugin\'s library. Plain data.')}
export const RUNTIME_DRAWN_FENCES = Object.freeze(${JSON.stringify(fences)});

// What the engine writes for such a fence when the deck did not load its plugin — the marked \`<pre>\`
// opening straight into its \`<code class="language-…\`, one per plugin. A markup count subtracts
// it: every marked \`<pre>\` holds exactly one fence the count saw. The whole serialization, not the
// bare attribute, so a comment or a span quoting the attribute does not zero a real fence's count.
export const RUNTIME_DRAWN_OFF = Object.freeze(${JSON.stringify(drawn.map((p) => `data-lattice-off="${p.manifest.name}"><code class="language-`))});

// A runtime-drawn fence's \`<code>\` at any state (\`[class*=]\` also matches the defanged
// \`language-<fence>-source\`), and a Markdown line that opens one. See lib/plugins/drawn-probe.mjs.
export const RUNTIME_DRAWN_FENCE_CODE = ${JSON.stringify(fenceCode)};
export const RUNTIME_DRAWN_SOURCE_FENCE = ${sourceFence};

// Pure-annotated: \`Object.freeze\` reads as a side effect, so without it a bundle that imports only
// the fence names (the Studio's startup JavaScript) would keep this unused record.
export const RUNTIME_DRAWN = /* @__PURE__ */ Object.freeze({${byPlugin.length ? `\n${byPlugin.join('\n')}\n` : ''}});
`;
}

/**
 * Each runtime-drawn plugin's library FILE NAME, and nothing else — for lib/plugins/drawn-library.mjs,
 * which a page reads only from lazily loaded code. Its own module, apart from drawn.generated.mjs,
 * because a bundler keeps a module whole in one chunk: the Studio's startup chunk carries the fence
 * names, and sharing a module with them would carry this record too (measured: ~100 bytes gz).
 */
function renderDrawnLibrary(ordered) {
  const files = {};
  for (const p of ordered.filter((q) => q.manifest.render?.exec?.hydrate === 'pass')) {
    const [payload] = Object.values(p.manifest.payload || {});
    if (payload) files[p.manifest.name] = payload.from.split('/').pop();
  }
  return `${HEADER('Each runtime-drawn plugin\'s library file name, staged beside the runtime. Plain data, for lazily loaded readers.')}
export const DRAWN_LIBRARY_FILES = Object.freeze(${JSON.stringify(files)});
`;
}

/**
 * The Node-side bakes, in dependency order: what lib/plugins/host-bake.js runs on the CLI before
 * the engine renders. Each module is required LAZILY, so a deck that uses no baking plugin never
 * loads one, and nothing a browser bundles can reach this file.
 */
function renderBake(ordered) {
  const lines = ordered.filter((p) => p.manifest.contributes.bake).map((p) => {
    const m = p.manifest;
    return `  Object.freeze({ name: ${JSON.stringify(m.name)}, exec: ${JSON.stringify(m.render.exec.bake)}, load: () => require('./${p.folder}/${m.name}.bake.js') }),`;
  });
  return `${HEADER('The plugins\' Node-side BAKES, in dependency order. Required lazily; never bundled for a browser.')}
const BAKERS = Object.freeze([${lines.length ? `\n${lines.join('\n')}\n` : ''}]);

module.exports = { BAKERS };
`;
}

/**
 * The plugins' stylesheets, in dependency order: what tools/build-css.js bundles into the plugin
 * slot of dist/lattice.css. Paths from the repo root, as build-css lists every other source.
 */
function renderStyles(ordered) {
  const files = ordered.filter((p) => p.manifest.contributes.styles).map((p) => `lib/plugins/${p.folder}/${p.manifest.name}.styles.css`);
  return `${HEADER('The plugins\' stylesheets, in dependency order, for tools/build-css.js.')}
module.exports = { PLUGIN_STYLE_SOURCES: Object.freeze(${JSON.stringify(files)}) };
`;
}

/**
 * The plugins' INLINE kinds, in dependency order: the rows lib/core/inline-code-directives.js
 * appends to its own (marks, pills, sparks). Each row's module is light by contract — no data —
 * because every bundle that dispatches inline code (the linter, the runtime) carries it.
 */
function renderInline(ordered) {
  const lines = ordered.flatMap((p) => Object.entries(p.manifest.contributes.inline || {}).map(([kind, decl]) => {
    const m = p.manifest;
    return `  Object.freeze({ name: ${JSON.stringify(kind)}, plugin: ${JSON.stringify(m.name)}, sigil: ${JSON.stringify(decl.sigil)}, ...require('./${p.folder}/${m.name}.inline.js').inline${/^[a-z_][a-z0-9_]*$/i.test(kind) ? `.${kind}` : `[${JSON.stringify(kind)}]`} }),`;
  }));
  return `${HEADER('The plugins\' INLINE-CODE kinds, in dependency order: the rows the host\'s dispatcher appends to its own.')}
const INLINE = Object.freeze([${lines.length ? `\n${lines.join('\n')}\n` : ''}]);

module.exports = { INLINE };
`;
}

/**
 * The plugins' SERVICES, keyed by plugin: the named functions lib/plugins/services.js hands a
 * caller that asks the host, never the plugin. Light modules, like the inline kinds.
 */
function renderServices(ordered) {
  const lines = ordered.filter((p) => (p.manifest.contributes.services || []).length)
    .map((p) => `  ${JSON.stringify(p.manifest.name)}: require('./${p.folder}/${p.manifest.name}.services.js').services,`);
  return `${HEADER('The plugins\' SERVICES, keyed by plugin name: what lib/plugins/services.js hands a caller.')}
const SERVICES = Object.freeze({${lines.length ? `\n${lines.join('\n')}\n` : ''}});

module.exports = { SERVICES };
`;
}

/**
 * The plugins' front-matter REGISTERS, as data: the key (which is also the class prefix) and each
 * axis's words, default first. lib/core/register-factory.js builds each into a resolver exactly as
 * it builds \`spark:\`. Plain data, so the linter and the runtime read it for free.
 */
function renderRegisters(ordered) {
  const lines = ordered.flatMap((p) => Object.entries(p.manifest.contributes.registers || {}).map(([key, decl]) => {
    const axes = Object.entries(decl.axes).map(([axis, words]) => `Object.freeze({ axis: ${JSON.stringify(axis)}, names: Object.freeze(${JSON.stringify(words)}) })`);
    return `  Object.freeze({ key: ${JSON.stringify(key)}, plugin: ${JSON.stringify(p.manifest.name)}, axes: Object.freeze([${axes.join(', ')}]) }),`;
  }));
  return `${HEADER('The plugins\' front-matter REGISTERS, as data: key (= class prefix) and axes, each axis\'s default first.')}
const PLUGIN_REGISTERS = Object.freeze([${lines.length ? `\n${lines.join('\n')}\n` : ''}]);

module.exports = { PLUGIN_REGISTERS };
`;
}

/**
 * Each plugin's DATA, as a lazy loader the engine registers with lib/plugins/plugin-data.js, so a
 * Node render loads it on first use and never otherwise. A browser bundle that carries the engine
 * aliases THIS file to lib/plugins/data-browser-stub.js, and the data arrives as its own script.
 */
function renderData(ordered) {
  const lines = ordered.filter((p) => p.manifest.contributes.data === true)
    .map((p) => `  ${JSON.stringify(p.manifest.name)}: () => require('./${p.folder}/${p.manifest.name}.data.generated.js'),`);
  return `${HEADER('Each plugin\'s DATA, as a lazy loader. Engine-only; a browser bundle aliases this file to data-browser-stub.js.')}
const DATA_LOADERS = Object.freeze({${lines.length ? `\n${lines.join('\n')}\n` : ''}});

module.exports = { DATA_LOADERS };
`;
}

/**
 * Each data plugin's usage probe and the file its data ships in, for a BROWSER surface that must
 * fetch the data before it renders (docs/src/lib/render-engine.ts). ESM, importing only each
 * plugin's `detect` — never its data — so the Studio's render path pays a few bytes for it.
 */
function renderDataProbe(ordered, exportsByName) {
  const withData = ordered.filter((p) => p.manifest.contributes.data === true);
  const imports = withData.map((p) => `import { detect as ${ident(p.manifest.name)}__detect } from './${p.folder}/${p.manifest.name}.syntax.mjs';`);
  const rows = withData.map((p) => `  Object.freeze({ name: ${JSON.stringify(p.manifest.name)}, file: ${JSON.stringify(`lattice-plugin-${p.manifest.name}.js`)}, detect: ${ident(p.manifest.name)}__detect }),`);
  for (const p of withData) {
    if (!exportsByName.get(p.manifest.name).detect) throw new Error(`build-plugin-registry: plugin "${p.manifest.name}" declares data but its syntax module exports no detect(source)`);
  }
  return `${HEADER('Each data plugin\'s usage probe and on-demand data file, for a browser surface that fetches the data before it renders.')}
${imports.join('\n')}${imports.length ? '\n' : ''}
export const DATA_PLUGINS = Object.freeze([${rows.length ? `\n${rows.join('\n')}\n` : ''}]);
`;
}

function renderRegistry(ordered, exportsByName) {
  const lines = ordered.map((p) => {
    const hasRender = exportsByName.get(p.manifest.name).hasRender;
    return `  ${JSON.stringify(p.manifest.name)}: ${hasRender ? `require('./${p.folder}/${p.manifest.name}.render.js')` : 'Object.freeze({})'},`;
  });
  // Each plugin's highlight.js grammar (`contributes.highlight`), for the host to register under its
  // code fences. Only the plugins that declare one; the others read null.
  const highlights = ordered.filter((p) => p.manifest.contributes.highlight === true)
    .map((p) => `  ${JSON.stringify(p.manifest.name)}: require('./${p.folder}/${p.manifest.name}.highlight.js').highlight,`);
  return `${HEADER('The plugins the engine installs, in dependency order: the grammar plus each plugin\'s renderers and highlight grammar.')}
const { PLUGIN_GRAMMAR, COMPONENT_PLUGINS } = require('./grammar.generated.mjs');

const RENDER_MODULES = {
${lines.join('\n')}
};

const HIGHLIGHT = {${highlights.length ? `\n${highlights.join('\n')}\n` : ''}};

const PLUGINS = Object.freeze(PLUGIN_GRAMMAR.map((g) => Object.freeze({
  ...g,
  renderers: RENDER_MODULES[g.name].renderers || Object.freeze({}),
  fenceRenderers: RENDER_MODULES[g.name].fences || Object.freeze({}),
  highlight: HIGHLIGHT[g.name] || null,
})));

module.exports = { PLUGINS, COMPONENT_PLUGINS };
`;
}

/** @param {{ reservedFences?: Set<string> }} [opts] — `reservedFences` overrides the installed highlight.js set (tests). */
async function build(opts = {}) {
  const listed = listPlugins();
  const exportsByName = new Map();
  for (const p of listed) exportsByName.set(p.manifest.name, await readExports(p.folder, p.manifest.name, p.manifest));
  const components = componentsWithPlugins(listed, exportsByName);
  // The OBJECT blocks a component manifest may carry: a slot's block must be one (a scalar such as
  // \`name\` would make every component in the bucket a filler — red team, phase F).
  const schemaProps = require(path.join(ROOT, 'lib', 'components', 'manifest.schema.json')).properties;
  const componentBlocks = new Set(Object.keys(schemaProps).filter((k) => schemaProps[k].type === 'object'));
  const { errors, warnings, order, fills } = resolvePlugins(
    listed.map((p) => ({ manifest: p.manifest, folder: p.folder, exports: exportsByName.get(p.manifest.name) })),
    { components, componentBlocks, reservedFences: opts.reservedFences || reservedFenceNames(), shippedFences: await shippedFenceClaims(), hostClasses: hostClasses() },
  );
  if (errors.length) return { errors, warnings };
  const byName = new Map(listed.map((p) => [p.manifest.name, p]));
  const ordered = order.map((n) => byName.get(n));
  return {
    errors: [],
    warnings,
    count: ordered.length,
    files: [
      [GRAMMAR_FILE, renderGrammar(ordered, exportsByName, components, fills)],
      [REGISTRY_FILE, renderRegistry(ordered, exportsByName)],
      [BLOCKS_FILE, renderBlocks(ordered)],
      [HYDRATE_FILE, renderHydrate(ordered)],
      [PASSES_FILE, renderPasses(ordered)],
      [STYLES_FILE, renderStyles(ordered)],
      [BAKE_FILE, renderBake(ordered)],
      [DRAWN_FILE, renderDrawn(ordered)],
      [DRAWN_LIBRARY_FILE, renderDrawnLibrary(ordered)],
      [EXTENSION_POINTS_FILE, renderExtensionPoints(ordered)],
      [INLINE_FILE, renderInline(ordered)],
      [SERVICES_FILE, renderServices(ordered)],
      [REGISTERS_FILE, renderRegisters(ordered)],
      [DATA_FILE, renderData(ordered)],
      [DATA_PROBE_FILE, renderDataProbe(ordered, exportsByName)],
    ],
  };
}

async function main() {
  const result = await build();
  for (const w of result.warnings || []) process.stderr.write(`plugin registry: warning: ${w}\n`);
  if (result.errors.length) {
    process.stderr.write(`plugin registry: ${result.errors.length} problem(s)\n${result.errors.map((e) => `  - ${e}`).join('\n')}\n`);
    process.exit(1);
  }
  if (check) {
    const stale = result.files.filter(([file, text]) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text);
    if (stale.length) {
      process.stderr.write(`plugin registry is stale: ${stale.map(([f]) => path.relative(ROOT, f)).join(', ')}. Run: node tools/build-plugin-registry.js\n`);
      process.exit(1);
    }
    return;
  }
  for (const [file, text] of result.files) fs.writeFileSync(file, text);
  if (!silent) process.stdout.write(`plugin registry: ${result.count} plugin(s) → lib/plugins/{grammar,registry,blocks,hydrate,passes,styles,bake,drawn,drawn-library,extension-points,inline,services,registers,data,data-probe}.generated.*\n`);
}

if (require.main === module) {
  main().catch((e) => {
    process.stderr.write(`plugin registry: ${e.message}\n`);
    process.exit(1);
  });
}

module.exports = { build, reservedFenceNames, shippedFenceClaims };
