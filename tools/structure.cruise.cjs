/**
 * dependency-cruiser config for tools/structure.js: the import graph of lib/, the CLI, the docs
 * site and tools/, with no rules of its own (structure.js applies the layer rules itself, by part).
 * Tests, end-to-end specs and built output are left out: they are not part of the structure.
 */
module.exports = {
  forbidden: [],
  options: {
    // Vendored library copies are recorded as import TARGETS (so an import into a plugin's vendor/
    // folder counts) but never parsed.
    doNotFollow: { path: ['node_modules', '/dist/', '/vendor/', '^docs/src/playground/.*\\.generated\\.'] },
    exclude: {
      path: [
        '^(node_modules|dist|\\.scratch|coverage|examples|exemplars|themes)/',
        '^docs/(node_modules|dist|public|\\.astro)/',
        '\\.(test|spec)\\.[cm]?[jt]sx?$',
        '/e2e/',
        '^docs/src/test/',
        '^test/',
      ],
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tools/structure.tsconfig.json' },
    enhancedResolveOptions: {
      conditionNames: ['@laticent/source', 'import', 'require', 'node', 'default'],
      extensions: ['.ts', '.tsx', '.d.ts', '.js', '.mjs', '.cjs', '.json'],
    },
    progress: { type: 'none' },
  },
};
