/**
 * The export step for CODE PACKAGES: bundle, minify and freeze a transform with exactly the
 * helpers it imports (portable-packages phase 6, step 2; the owner's decision of 2026-09-25 in
 * engineering/decisions/2026-09-24-code-package-contract.md §8). There is no shared toolkit: the
 * package carries its own copy of every helper, and the sandbox provides only `measure`.
 *
 * `bundleCodePackage(name)` turns one shipped component's transform into the package's
 * `transform.js`: an ES module with one default export, `transform(slide, kit) → string`, and no
 * import of any kind. `slide.html` is the slide's rendered `<section>`; the return is that section
 * rewritten, exactly as the in-repo registry pass would rewrite it. `slide.index` (the slide's
 * 0-based position in the deck) and `slide.idPrefix` (the deck render's id prefix) keep the ids a
 * chart mints in its `<defs>` the ones the deck render gives that slide: they are scoped by the
 * slide's position, so a slide transformed alone would otherwise number itself 1
 * (lib/core/render-ids.js). `slide.baseUrl` is the render's asset base, the one context field a
 * shipped adapter reads (`team-profile` resolves portrait paths against it)
 * (test/integration/export/code-package-parity.test.js runs every shipped one in the CLI's locked
 * page and compares).
 *
 * WHAT "FROZEN" MEANS. The bundle is self-contained (esbuild resolves every `require` at export
 * and the result is refused if anything is left external), minified, and pinned by the SHA-256 of
 * its text. A later fix to a helper never reaches a package already exported; that is the price
 * §8 accepted.
 *
 * ONE CHART, NOT TWENTY-TWO. A chart's registry adapter reaches every chart kernel through the
 * generated dispatch table. The export swaps that table for one naming only this chart, so the
 * package carries its own kernel and none of the others.
 *
 * THE QR CARDS. `contact`, `wifi`, `video` and the `qr` variant reach `qrcode`, whose Node entry
 * pulls `fs`. Bundling for the BROWSER platform takes the package's own `browser` field
 * (`./lib/index.js` → `./lib/browser.js`, `fs: false`), whose SVG renderer is the same pure
 * encoder the Node entry uses, so they bundle through a browser-safe path and nothing is excluded.
 *
 * esbuild is a DEVELOPMENT dependency, loaded only when this runs. No door calls it yet: every
 * door still refuses a package that carries code. How an installed CLI gets a bundler (ship the
 * shipped components prebuilt, or make esbuild a runtime dependency) is decided when the export
 * door opens; followups.d/2314-p4-code-packages.md tracks it.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const TRANSFORMERS = path.join(ROOT, 'lib', 'transformers');
const RENDER_IDS = path.join(ROOT, 'lib', 'core', 'render-ids.js');
const CHART_REGISTRY = path.join(ROOT, 'lib', 'components', 'chart', '_chart-family', 'chart-registry.generated.js');

/**
 * Every shipped transform that is not a chart, by package name, with the registry adapter the
 * in-repo render calls. A chart is found from the generated dispatch table instead.
 */
const NON_CHART_PACKAGES = Object.freeze({
  'compare-code': 'compare-code.js',
  contact: 'contact.js',
  wifi: 'wifi.js',
  video: 'video.js',
  scene: 'scene.js',
  'team-profile': 'team-profile.js',
  qr: 'qr-general.js',
});

/** The chart layouts and, for each, its figure class and kernel file, read from the generated table. */
function chartKernels() {
  const { LAYOUTS, FIGURE_CLASSES } = require(CHART_REGISTRY);
  const text = fs.readFileSync(CHART_REGISTRY, 'utf8');
  const fileOf = new Map([...text.matchAll(/^const (\w+) = require\('([^']+)'\);$/gm)].map((m) => [m[1], path.resolve(path.dirname(CHART_REGISTRY), `${m[2]}.js`)]));
  const identOf = new Map([...text.matchAll(/^ {2}"([\w-]+)": \{ transformSection: (\w+)\.transformSection \},$/gm)].map((m) => [m[1], m[2]]));
  return LAYOUTS.map((layout, i) => {
    const file = fileOf.get(identOf.get(layout));
    if (!file) throw new Error(`code-bundle: no kernel file for chart "${layout}" in ${path.relative(ROOT, CHART_REGISTRY)}`);
    return { layout, figureClass: FIGURE_CLASSES[i], file };
  });
}

/** Every package the export can build from a shipped component: its name, adapter and, for a chart, its kernel. */
function codePackages() {
  const charts = chartKernels().map((k) => ({ name: k.layout, adapter: path.join(TRANSFORMERS, 'chart-family.js'), chart: k }));
  const others = Object.entries(NON_CHART_PACKAGES).map(([name, file]) => ({ name, adapter: path.join(TRANSFORMERS, file) }));
  return [...charts, ...others];
}

/** Replace the chart dispatch table with one that names only `chart`. */
function oneChartPlugin(chart) {
  return {
    name: 'lattice-one-chart',
    setup(build) {
      build.onResolve({ filter: /chart-registry\.generated$/ }, () => ({ path: 'one-chart', namespace: 'lattice-one-chart' }));
      build.onLoad({ filter: /.*/, namespace: 'lattice-one-chart' }, () => ({
        contents: `const k = require(${JSON.stringify(chart.file)});\nmodule.exports = { LAYOUTS: [${JSON.stringify(chart.layout)}], FIGURE_CLASSES: [${JSON.stringify(chart.figureClass)}], KERNELS: { ${JSON.stringify(chart.layout)}: { transformSection: k.transformSection } } };\n`,
        resolveDir: path.dirname(CHART_REGISTRY),
        loader: 'js',
      }));
    },
  };
}

/**
 * Bundle, minify and freeze one shipped component as a code package.
 * @param {string} name  a package name from `codePackages()`
 * @returns {Promise<{ name: string, code: string, sha256: string, bytes: number, inputs: string[] }>}
 *   `inputs` lists every source file frozen into it, relative to the repo.
 */
async function bundleCodePackage(name) {
  const pkg = codePackages().find((p) => p.name === name);
  if (!pkg) throw new Error(`code-bundle: "${name}" is not a shipped transform`);
  const esbuild = require('esbuild');
  const entry = [
    `import adapter from ${JSON.stringify(pkg.adapter)};`,
    `import { enterSlideIds } from ${JSON.stringify(RENDER_IDS)};`,
    'export default function transform(slide, kit) {',
    '  enterSlideIds(slide.idPrefix, slide.index);',
    '  return adapter.applyToHtml(String(slide.html), slide.baseUrl ? { baseUrl: slide.baseUrl } : {});',
    '}',
    '',
  ].join('\n');
  const result = await esbuild.build({
    stdin: { contents: entry, resolveDir: ROOT, sourcefile: `${name}.package-entry.js`, loader: 'js' },
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    charset: 'utf8',
    legalComments: 'none',
    write: false,
    metafile: true,
    logLevel: 'silent',
    plugins: pkg.chart ? [oneChartPlugin(pkg.chart)] : [],
  });
  const output = Object.values(result.metafile.outputs)[0];
  if (output.imports.length) {
    throw new Error(`code-bundle: "${name}" is not self-contained; it still imports ${output.imports.map((i) => i.path).join(', ')}`);
  }
  const code = result.outputFiles[0].text;
  return {
    name,
    code,
    sha256: crypto.createHash('sha256').update(code).digest('hex'),
    bytes: Buffer.byteLength(code),
    inputs: Object.keys(result.metafile.inputs).filter((p) => !p.startsWith('lattice-one-chart:') && !p.endsWith('.package-entry.js')).sort(),
  };
}

module.exports = { NON_CHART_PACKAGES, codePackages, bundleCodePackage };
