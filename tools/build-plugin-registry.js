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

function componentNames() {
  // The package spine's filesystem walk, not `loadAll`: `loadAll` reaches the boundary parser,
  // which imports the grammar this tool writes — a registry that could not be regenerated once
  // broken. The walk reads manifests and nothing else.
  const { discoverPackages } = require(path.join(ROOT, 'lib', 'packages', 'fs.js'));
  return discoverPackages({ root: ROOT, types: ['component'] })
    .map((p) => p.result.pkg?.name)
    .filter(Boolean);
}

const HEADER = (what) => `// GENERATED by tools/build-plugin-registry.js from lib/plugins/*/*.manifest.json — do not edit.
// ${what}
// Contract: engineering/decisions/2026-09-27-plugin-system.md. Regenerate: npm run build.
`;

const ident = (name) => `p_${name.replace(/-/g, '_')}`;

function renderGrammar(ordered, exportsByName) {
  const imports = ordered
    .filter((p) => exportsByName.get(p.manifest.name).hasSyntax)
    .map((p) => {
      // Sorted, as the repo's formatter sorts named imports.
      const names = [...Object.keys(p.manifest.contributes.syntax || {}), 'detect'].sort();
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
      `    components: Object.freeze(${JSON.stringify(m.contributes.components || [])}),`,
      `    diagnostics: Object.freeze(${JSON.stringify(m.contributes.diagnostics || {})}),`,
      `    syntax: Object.freeze({${syntax.length ? `\n${syntax.join('\n')}\n    ` : ''}}),`,
      `    detect: ${mod ? `${mod}__detect` : 'null'},`,
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

function renderRegistry(ordered, exportsByName) {
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

module.exports = { PLUGINS };
`;
}

async function build() {
  const listed = listPlugins();
  const exportsByName = new Map();
  for (const p of listed) exportsByName.set(p.manifest.name, await readExports(p.folder, p.manifest.name, p.manifest));
  const { errors, order } = resolvePlugins(
    listed.map((p) => ({ manifest: p.manifest, folder: p.folder, exports: exportsByName.get(p.manifest.name) })),
    { componentNames: componentNames() },
  );
  if (errors.length) return { errors };
  const byName = new Map(listed.map((p) => [p.manifest.name, p]));
  const ordered = order.map((n) => byName.get(n));
  return {
    errors: [],
    count: ordered.length,
    files: [
      [GRAMMAR_FILE, renderGrammar(ordered, exportsByName)],
      [REGISTRY_FILE, renderRegistry(ordered, exportsByName)],
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
