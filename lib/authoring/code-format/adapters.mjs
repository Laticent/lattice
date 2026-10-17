/**
 * lib/authoring/code-format/adapters.mjs — which formatter formats which language, loaded only when
 * a block in that language is formatted (engineering/decisions/2026-10-15-code-plugin.md §6, the
 * owner's pick: Prettier first, ruff for Python, sql-formatter for SQL).
 *
 * Each adapter is a dynamic `import()`, so a bundler splits it into its own chunk
 * (tools/build-code-format.js) and Node loads only the one it needs. The packages are
 * `optionalDependencies`, pinned exactly: an install without them still renders every deck, and
 * `formatBlock` says which package a block needs. test/unit/authoring/code-format.test.js holds a
 * golden output per adapter, so a release that changes formatting arrives as a reviewed diff.
 *
 * `format(code, opts)` resolves to the formatted text or throws; every adapter here parses its
 * input and refuses what it cannot read (the bake-off disqualified the ones that do not). Width is a
 * target, not a limit: no formatter breaks a long string.
 *
 * `env.wasmUrl(file)` locates a WebAssembly file in a browser; Node initializes from the package.
 */

import record from '../../plugins/code/shared/record.js';
import table from './languages.js';

/** Fence language (lower-case, as the code plugin reads it) → adapter id (shared with the linter). */
export const LANGUAGES = table.LANGUAGES;

/**
 * The SQL dialect when a block names none. PostgreSQL, not sql-formatter's generic `sql`: the generic
 * dialect splits Postgres syntax it does not know (`B'0101'` becomes `B '0101'`, and a nested
 * comment's closing star-slash gains a space), which changes what the code means. Postgres is the
 * dialect a deck most often shows; `dialect=` names another.
 */
export const DEFAULT_SQL_DIALECT = 'postgresql';

/** The default print width, in columns: what a code panel on a 16:9 slide shows at the code type step. */
export const DEFAULT_WIDTH = 60;

/** The PHP version the PHP formatter targets: the newest the pinned plugin knows. */
export const PHP_VERSION = '8.5';

/** How many columns a tab counts for when a formatter measures a line: the record's own rule, so the
 *  formatter, the panel (`tab-size`) and the line-width lint read one function. */
const { tabColumns } = record;

/**
 * `indent=` and `quotes=` as Prettier options. Only what the record names: a block that names neither
 * keeps each plugin's own default (2 spaces, 4 for PHP; double quotes). `singleQuote` changes only
 * languages with a choice of quote; JSON keeps its double quotes, which its grammar requires.
 */
const prettierStyle = (opts) => ({
  ...(opts.indent ? { useTabs: opts.indent === 'tab', tabWidth: tabColumns(opts.indent) } : {}),
  ...(opts.quotes ? { singleQuote: opts.quotes === 'single' } : {}),
});

const prettier = async (parser, plugins, code, opts, extra = {}) => {
  const { format } = await import('prettier/standalone');
  const loaded = await Promise.all(plugins.map((load) => load()));
  return format(code, {
    parser,
    plugins: loaded.map((m) => m.default ?? m),
    printWidth: opts.width ?? DEFAULT_WIDTH,
    // HTML and Markdown would otherwise try to format the CSS and JavaScript they embed, which needs
    // those plugins too; formatting only the outer language keeps each download to its own plugin.
    embeddedLanguageFormatting: 'off',
    ...prettierStyle(opts),
    ...extra,
  });
};

const babel = () => import('prettier/plugins/babel');
const estree = () => import('prettier/plugins/estree');

/** Adapter id → `format(code, opts, env)`. */
export const ADAPTERS = Object.freeze({
  babel: (code, opts) => prettier('babel', [babel, estree], code, opts),
  typescript: (code, opts) => prettier('babel-ts', [babel, estree], code, opts),
  json: (code, opts) => prettier('json', [babel, estree], code, opts),
  json5: (code, opts) => prettier('json5', [babel, estree], code, opts),
  css: (code, opts) => prettier('css', [() => import('prettier/plugins/postcss')], code, opts),
  scss: (code, opts) => prettier('scss', [() => import('prettier/plugins/postcss')], code, opts),
  less: (code, opts) => prettier('less', [() => import('prettier/plugins/postcss')], code, opts),
  html: (code, opts) => prettier('html', [() => import('prettier/plugins/html')], code, opts),
  vue: (code, opts) => prettier('vue', [() => import('prettier/plugins/html')], code, opts),
  markdown: (code, opts) => prettier('markdown', [() => import('prettier/plugins/markdown')], code, opts),
  yaml: (code, opts) => prettier('yaml', [() => import('prettier/plugins/yaml')], code, opts),
  graphql: (code, opts) => prettier('graphql', [() => import('prettier/plugins/graphql')], code, opts),
  // `phpVersion` is pinned because its default, "auto", reads composer.json from the working
  // directory: the CLI's output would depend on where it ran, and a browser has no file system.
  php: (code, opts) => prettier('php', [() => import('@prettier/plugin-php/standalone')], code, opts, { phpVersion: PHP_VERSION }),
  xml: (code, opts) => prettier('xml', [() => import('@prettier/plugin-xml')], code, opts),
  java: (code, opts) => prettier('java', [() => import('prettier-plugin-java')], code, opts),
  python: async (code, opts, env) => {
    const ruff = await import('@wasm-fmt/ruff_fmt');
    // The web build needs initializing with its .wasm; the Node build has done it on import.
    // Its init takes the URL itself (ruff_fmt_web.js `initAsync(module_or_path)`), not an options object.
    if (typeof ruff.default === 'function' && env?.wasmUrl) await ruff.default(env.wasmUrl('ruff_fmt_bg.wasm'));
    return ruff.format(code, undefined, {
      line_width: opts.width ?? DEFAULT_WIDTH,
      ...(opts.indent ? { indent_style: opts.indent === 'tab' ? 'tab' : 'space', indent_width: tabColumns(opts.indent) } : {}),
      ...(opts.quotes ? { quote_style: opts.quotes } : {}),
    });
  },
  sql: async (code, opts) => {
    const { format } = await import('sql-formatter');
    // No `quotes`: in SQL a quote is meaning, not style ('text' is a string, "name" an identifier).
    return format(code, {
      language: opts.dialect || DEFAULT_SQL_DIALECT,
      expressionWidth: opts.width ?? DEFAULT_WIDTH,
      ...(opts.indent ? { useTabs: opts.indent === 'tab', tabWidth: tabColumns(opts.indent) } : {}),
    });
  },
});

/** The adapter id for a fence language, or null when no formatter here reads it. */
export const adapterFor = table.adapterFor;

/**
 * Format one block. Resolves `{ ok: true, text }` or `{ ok: false, error }`; never rejects, because a
 * formatter error costs that one block its formatting, never the rest of the deck.
 */
export async function formatBlock(job, env) {
  const id = adapterFor(job.lang);
  if (!id) return { ok: false, error: `no formatter here reads ${job.lang}` };
  try {
    const text = await ADAPTERS[id](job.code, job.opts || {}, env);
    if (typeof text !== 'string') return { ok: false, error: 'the formatter returned nothing' };
    return { ok: true, text };
  } catch (e) {
    // An optional formatter that is not installed: say which package, not a module-resolution trace.
    const missing = /Cannot find (?:package|module) '((?:@[^/']+\/)?[^/']+)/.exec(String(e?.message || ''));
    if (missing || e?.code === 'ERR_MODULE_NOT_FOUND') {
      return { ok: false, error: `its formatter is not installed (npm install ${missing ? missing[1] : 'the formatter'})` };
    }
    return { ok: false, error: String(e?.message || e).split('\n')[0] };
  }
}
