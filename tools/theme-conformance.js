#!/usr/bin/env node
/**
 * Run the theme contract's shared test cases (spec/conformance/theme/) against the reference
 * implementation: gateThemeCss (lib/theme/gate.js) for a theme file, and themes/theme.schema.json
 * for a manifest. The cases are the shared part, written against spec/THEME-1.0.md; this file is
 * OUR adapter, and spec/conformance/theme/README.md is the format.
 *
 *   node tools/theme-conformance.js            # run every case, print a table
 *
 * Exit 1 when any case fails. The unit tier runs the same cases
 * (test/unit/spec/theme-conformance.test.js), plus a failing arm.
 */


const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CASES_DIR = path.join(ROOT, 'spec', 'conformance', 'theme');

/** Every case: a theme file (`<name>.css` + `<name>.json`) or a manifest (`<name>.manifest-case.json`). */
function listCases(dir = CASES_DIR) {
  const files = fs.readdirSync(dir).sort();
  const themes = files.filter((f) => f.endsWith('.css')).map((f) => f.slice(0, -4)).filter((n) => files.includes(`${n}.json`));
  const manifests = files.filter((f) => f.endsWith('.manifest-case.json')).map((f) => f.slice(0, -'.manifest-case.json'.length));
  return [
    ...themes.map((name) => ({ name, kind: 'theme', css: fs.readFileSync(path.join(dir, `${name}.css`), 'utf8'), ...JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8')) })),
    ...manifests.map((name) => ({ name, kind: 'manifest', ...JSON.parse(fs.readFileSync(path.join(dir, `${name}.manifest-case.json`), 'utf8')) })),
  ];
}

const uniq = (xs) => [...new Set(xs)].sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let validateManifest;
function manifestValidator() {
  if (!validateManifest) {
    const Ajv2020 = require('ajv/dist/2020').default;
    const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'themes', 'theme.schema.json'), 'utf8'));
    validateManifest = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  }
  return validateManifest;
}

/** What the reference implementation concludes about one case, in the case's own terms. */
function observe(c) {
  if (c.kind === 'manifest') return { valid: manifestValidator()(c.manifest) };
  const { gateThemeCss } = require('../lib/theme/gate.js');
  const r = gateThemeCss(c.css, { knownThemes: c.knownThemes ?? ['lattice'] });
  const of = (level) => r.findings.filter((f) => f.level === level);
  return {
    ok: r.ok,
    blocked: r.blocked,
    composes: r.composes,
    errors: uniq(of('error').map((f) => f.rule)),
    warnings: uniq(of('warning').map((f) => f.rule)),
    missing: uniq(r.findings.filter((f) => f.rule === 'token-missing').map((f) => /--([a-z0-9-]+)/.exec(f.message)?.[1])),
  };
}

/** Run one case; return the list of failures (empty = pass). Only the fields `expect` names are checked. */
function runCase(c) {
  const got = observe(c);
  return Object.entries(c.expect)
    .filter(([k, v]) => !same(got[k], v))
    .map(([k, v]) => `${k} is ${JSON.stringify(got[k])}, expected ${JSON.stringify(v)}`);
}

module.exports = { CASES_DIR, listCases, observe, runCase };

if (require.main === module) {
  const cases = listCases();
  let failed = 0;
  for (const c of cases) {
    const fails = runCase(c);
    console.log(`${fails.length ? 'FAIL' : 'pass'}  §${String(c.section).padEnd(4)} ${c.kind.padEnd(9)} ${c.name}`);
    for (const f of fails) console.log(`        ${f}`);
    if (fails.length) failed += 1;
  }
  console.log(`\n${cases.length - failed}/${cases.length} cases pass`);
  process.exit(failed ? 1 : 0);
}
