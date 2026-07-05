// .dependency-cruiser.cjs
//
// Structural coupling, circular-dependency, and architectural-boundary rules
// for lib/ + tools/ + the root entry points. Part of the automated quality
// assessment — see engineering/quality-assessment.md.
//
// Run via `npm run quality` (tools/quality-assessment.js), or directly:
//   npx depcruise --config .dependency-cruiser.cjs --output-type json \
//     lib tools lattice-emulator.js lib/runtime/index.js lib/playground/index.js
//
// The component-bucket list is derived from the filesystem at config-load
// time, not hardcoded — CLAUDE.md's own hand-written bucket list has already
// drifted from the live directory once (a 13th bucket, `connect`, exists on
// disk but isn't in the doc's "12 buckets" line). A static regex here would
// rot the same way.

const fs = require('node:fs');
const path = require('node:path');

const COMPONENTS_DIR = path.join(__dirname, 'lib', 'components');
const BUCKETS = fs
  .readdirSync(COMPONENTS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

const bucketGroup = `(${BUCKETS.join('|')})`;

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'A dependency cycle makes change impact impossible to reason about locally — either module can break from a change to the other.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'component-no-cross-bucket-reach',
      severity: 'error',
      comment:
        "A component may reach its OWN bucket's underscore-prefixed shared kernel " +
        '(e.g. `_qr-card`, `_chart-family` — sanctioned shared infra colocated with the ' +
        'bucket it serves, see design/design-system.md), lib/core primitives, or ' +
        "lib/transformers — never another bucket's NAMED component directly. " +
        '(Underscore-prefixed targets are exempt from this rule in either direction, ' +
        'same-bucket or cross-bucket, since they are the sanctioned shared-kernel escape hatch.)',
      from: { path: `^lib/components/${bucketGroup}/(?!_)[^/]+/` },
      to: {
        path: `^lib/components/${bucketGroup}/(?!_)[^/]+/`,
        pathNot: '^lib/components/$1/',
      },
    },
    {
      name: 'core-no-component-imports',
      severity: 'error',
      comment:
        'lib/core holds structural primitives that any component opts into (split-panels, ' +
        'resolve-palette, …) — component-agnostic by design (engineering/architecture.md). ' +
        'A core module importing FROM lib/components would invert that direction and couple ' +
        'a primitive to one component.',
      from: { path: '^lib/core/' },
      to: { path: '^lib/components/' },
    },
    {
      name: 'kernel-no-transformer-imports',
      severity: 'warn',
      comment:
        'lib/transformers/ is the registry/adapter layer that wires kernels into the render ' +
        'paths (engineering/architecture.md: "kernel co-located with its component or in ' +
        'lib/core/; adapter in lib/transformers/"). A kernel (lib/core or lib/components) ' +
        'importing FROM lib/transformers would invert that wiring.',
      from: { path: '^lib/(core|components)/' },
      to: { path: '^lib/transformers/' },
    },
    {
      name: 'foundational-no-upward-imports',
      severity: 'warn',
      comment:
        'lib/base, lib/tokens, and lib/helpers are foundational/leaf modules meant to be ' +
        'imported broadly (design/design-system.md "Shared infrastructure"), not to import ' +
        'upward from lib/engine, lib/transformers, or lib/components. Flagged as a warning, ' +
        'not an error, because this direction is synthesized from doc context rather than a ' +
        'single stated rule — triage each hit rather than treating it as an automatic defect.',
      from: { path: '^lib/(base|tokens|helpers)/' },
      to: { path: '^lib/(engine|transformers|components)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: {
      // Anchored to the repo ROOT — `lib/exemplars/` is real source (the
      // exemplar-core bundle's SRC_DIR) and must NOT be caught by the
      // top-level `exemplars/` deck folder exclusion below.
      path: '^(node_modules|dist|\\.scratch|docs|coverage|examples|exemplars|themes)/',
    },
    tsPreCompilationDeps: false,
    combinedDependencies: false,
    progress: { type: 'none' },
  },
};
