/**
 * dependency-cruiser config for tools/structure.js: the import graph of lib/, the CLI, the docs
 * site and tools/, with no rules of its own (structure.js applies the layer rules itself, by part).
 * Tests, end-to-end specs and built output are left out: they are not part of the structure.
 */
module.exports = {
  forbidden: [],
  options: {
    doNotFollow: { path: ['node_modules', '/dist/', '^docs/src/playground/.*\\.generated\\.'] },
    exclude: {
      path: [
        '^(node_modules|dist|\\.scratch|coverage|examples|exemplars|themes)/',
        '^docs/(node_modules|dist|public|\\.astro)/',
        '\\.(test|spec)\\.[cm]?[jt]sx?$',
        '/e2e/',
        '^docs/src/test/',
        '^test/',
        '/vendor/',
      ],
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tools/structure.tsconfig.json' },
    enhancedResolveOptions: {
      conditionNames: ['@laticent/source', 'import', 'require', 'node', 'default'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
    },
    progress: { type: 'none' },
  },
};
