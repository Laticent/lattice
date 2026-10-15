/**
 * lib/authoring/code-format/languages.js — the fence languages a formatter here reads, and which
 * one: data only, so the linter can say "no formatter reads go" without bundling a formatter
 * (lib/authoring/lint-core.js). ./adapters.mjs holds the formatters themselves.
 */

/** Fence language (lower-case) → adapter id. */
const LANGUAGES = Object.freeze({
  js: 'babel', javascript: 'babel', jsx: 'babel', mjs: 'babel', cjs: 'babel',
  ts: 'typescript', typescript: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  json: 'json', jsonc: 'json', json5: 'json5',
  css: 'css', scss: 'scss', less: 'less',
  html: 'html', htm: 'html', xhtml: 'html', vue: 'vue',
  md: 'markdown', markdown: 'markdown',
  yaml: 'yaml', yml: 'yaml',
  graphql: 'graphql', gql: 'graphql',
  php: 'php',
  xml: 'xml', svg: 'xml', xsd: 'xml', xsl: 'xml', plist: 'xml',
  java: 'java',
  py: 'python', python: 'python', gyp: 'python',
  sql: 'sql',
});

/** The adapter id for a fence language, or null when no formatter here reads it. */
function adapterFor(lang) {
  const key = String(lang || '').toLowerCase();
  return Object.hasOwn(LANGUAGES, key) ? LANGUAGES[key] : null;
}

module.exports = { LANGUAGES, adapterFor };
