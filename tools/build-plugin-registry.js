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
  }
  return out;
}

/**
 * Every component's `plugins` block, and the plugins its gallery USES — found by parsing the
 * gallery with each plugin's own rules, on a fresh markdown-it per plugin. That is what lets the
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
    return found;
  };
  return discoverPackages({ root: ROOT, types: ['component'] })
    .filter((p) => p.result.pkg)
    .map((p) => {
      const { name, manifest } = p.result.pkg;
      const gallery = path.join(ROOT, p.path, `${name}.gallery.md`);
      return {
        name,
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

function renderGrammar(ordered, exportsByName) {
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
    return [
      '  Object.freeze({',
      `    name: ${JSON.stringify(m.name)},`,
      `    requires: Object.freeze(${JSON.stringify(m.requires || [])}),`,
      `    optional: Object.freeze(${JSON.stringify(m.optional || [])}),`,
      `    degradesTo: ${JSON.stringify(m.render?.degradesTo || 'source')},`,
      `    diagnostics: Object.freeze(${JSON.stringify(m.contributes.diagnostics || {})}),`,
      `    syntax: Object.freeze({${syntax.length ? `\n${syntax.join('\n')}\n    ` : ''}}),`,
      `    detect: ${mod && exportsByName.get(p.manifest.name).detect ? `${mod}__detect` : 'null'},`,
      '  }),',
    ].join('\n');
  });
  return `${HEADER('The plugins\' GRAMMAR, in dependency order: manifest data + syntax rules + detect. No renderer library is reachable from here.')}
${imports.join('\n')}

export const PLUGIN_GRAMMAR = Object.freeze([
${entries.join('\n')}
]);
`;
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

/** Plugin block tokens whose body renders no inline Markdown (lint-core skips them). */
export const OPAQUE_BLOCK_TOKENS = Object.freeze(${JSON.stringify(opaque)});
`;
}

function renderRegistry(ordered, exportsByName, components) {
  const lines = ordered.map((p) => {
    const hasRender = exportsByName.get(p.manifest.name).hasRender;
    return `  ${JSON.stringify(p.manifest.name)}: ${hasRender ? `require('./${p.folder}/${p.manifest.name}.render.js').renderers` : 'Object.freeze({})'},`;
  });
  return `${HEADER('The plugins the engine installs, in dependency order: the grammar plus each plugin\'s renderers.')}
const { PLUGIN_GRAMMAR } = require('./grammar.generated.mjs');

const RENDERERS = {
${lines.join('\n')}
};

const PLUGINS = Object.freeze(PLUGIN_GRAMMAR.map((g) => Object.freeze({ ...g, renderers: RENDERERS[g.name] })));

// Components that REQUIRE a plugin, keyed by the component's slide class. The engine reads it to
// report a slide whose required plugin is switched off.
const COMPONENT_PLUGINS = Object.freeze(${JSON.stringify(Object.fromEntries(components.filter((c) => c.requires.length).map((c) => [c.name, c.requires])))});

module.exports = { PLUGINS, COMPONENT_PLUGINS };
`;
}

async function build() {
  const listed = listPlugins();
  const exportsByName = new Map();
  for (const p of listed) exportsByName.set(p.manifest.name, await readExports(p.folder, p.manifest.name, p.manifest));
  const components = componentsWithPlugins(listed, exportsByName);
  const { errors, order } = resolvePlugins(
    listed.map((p) => ({ manifest: p.manifest, folder: p.folder, exports: exportsByName.get(p.manifest.name) })),
    { components },
  );
  if (errors.length) return { errors };
  const byName = new Map(listed.map((p) => [p.manifest.name, p]));
  const ordered = order.map((n) => byName.get(n));
  return {
    errors: [],
    count: ordered.length,
    files: [
      [GRAMMAR_FILE, renderGrammar(ordered, exportsByName)],
      [REGISTRY_FILE, renderRegistry(ordered, exportsByName, components)],
      [BLOCKS_FILE, renderBlocks(ordered)],
    ],
  };
}

async function main() {
  const result = await build();
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
  if (!silent) process.stdout.write(`plugin registry: ${result.count} plugin(s) → lib/plugins/{grammar,registry,blocks}.generated.*\n`);
}

if (require.main === module) {
  main().catch((e) => {
    process.stderr.write(`plugin registry: ${e.message}\n`);
    process.exit(1);
  });
}

module.exports = { build };
