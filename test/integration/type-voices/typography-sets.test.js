/**
 * CURATION IS A GATE, NOT A PROMISE — every palette theme × every `typography:` set, light and
 * dark, measured on real slides by tools/type-voice-audit.mjs.
 *
 * A `typography:` set (lib/core/resolve-typography.js, lib/base/base.typography.css) bundles
 * faces, the eyebrow's voice and the chart's text voice so an author cannot pick a combination
 * that breaks the type study's rules (engineering/decisions/2026-11-09-type-hierarchy-study.md
 * §4). That holds only while every set is checked against every theme, because a theme sets
 * the inks that two of the checks read. The owner's ruling (2026-11-09-type-voices.md
 * § Decided, item 6) names the three failures:
 *
 * The bar is the owner's (item 6): ZERO axes fails. The study's rule 1 asks for two; every set
 * still has one-axis pairs (chart ticks, the source line and the quote credit against the page
 * number and footer, apart by face alone), which the audit prints and this gate does not fail.
 *
 *   1. A ZERO-AXIS content/chrome pair: a content role (the eyebrow, a chart label, the quote
 *      credit…) that differs from a chrome role (header, meta line, footer, page number) on no
 *      axis at all — face, size, weight, case or ink (rule 1).
 *   2. An INVERTED INK LADDER: the eyebrow quieter than the chrome it must stand apart from, or
 *      the body louder than the heading (§9's ladder, read where both share a slide).
 *   3. An AA MISS: a role under 4.5:1 on its worst slide, or 3:1 at 24 px and over or bold at
 *      18.66 px (WCAG 1.4.3).
 *
 * Each run renders the probe deck with the real CLI and measures it in Playwright Chromium
 * (about 3 s); the runs go out in a small pool so the matrix finishes in about a minute and a
 * half. Determinism (HARD RULE #32): no timing, no randomness — every number is a computed
 * style or a contrast ratio of the fonts the page declared loaded.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { skipUnlessCI } = require('../../helpers/chrome');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { TYPOGRAPHY_NAMES } = require('../../../lib/core/resolve-typography');

const run = promisify(execFile);
const ROOT = path.join(__dirname, '..', '..', '..');
const TOOL = path.join(ROOT, 'tools', 'type-voice-audit.mjs');

// The palette themes: a theme folder with its own stylesheet, minus the `-dark` twins (the
// `--mode dark` run covers them) and the a11y simulation themes, which are not palettes.
const THEMES = fs.readdirSync(path.join(ROOT, 'themes'))
  .filter((d) => fs.existsSync(path.join(ROOT, 'themes', d, `${d}.css`)))
  .filter((d) => !d.endsWith('-dark') && !d.startsWith('a11y-'));
const MODES = ['light', 'dark'];
const POOL = Math.max(2, Math.min(6, os.availableParallelism?.() ?? 4));

/** The WCAG floor for one measured role: 3:1 for large text (24 px, or 18.66 px bold), else 4.5:1. */
function floorFor(role) {
  return role.px >= 24 || (role.px >= 18.66 && role.weight >= 700) ? 3 : 4.5;
}

/** Every failure in one audit, as readable lines. Exported shape-free so the message names the run. */
function failuresOf(audit) {
  const out = [];
  for (const c of audit.collisions) {
    if (c.crossesChrome && c.axes.length === 0) out.push(`zero-axis pair: ${c.a} ~ ${c.b} (slide ${c.slide})`);
  }
  const byRole = new Map(audit.roles.map((r) => [r.role, r]));
  const eyebrow = byRole.get('eyebrow');
  const header = byRole.get('chrome: header');
  if (eyebrow && header && eyebrow.contrast < header.contrast) {
    out.push(`inverted ladder: eyebrow ${eyebrow.contrast}:1 is quieter than the header ${header.contrast}:1`);
  }
  const h2 = byRole.get('heading: h2');
  const body = byRole.get('body');
  if (h2 && body && h2.contrast < body.contrast) out.push(`inverted ladder: body ${body.contrast}:1 outshouts the h2 ${h2.contrast}:1`);
  for (const r of audit.roles) {
    const worst = r.minContrast ?? r.contrast;
    if (worst < floorFor(r)) out.push(`AA miss: ${r.role} ${worst}:1 on slide ${r.minContrastSlide ?? r.slide} (needs ${floorFor(r)}:1)`);
  }
  return out;
}

async function auditOne(theme, mode, typography) {
  const { stdout } = await run(process.execPath, [TOOL, '--theme', theme, '--mode', mode, '--typography', typography, '--json'], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout);
}

const distBuilt = fs.existsSync(path.join(ROOT, 'dist', 'lattice.js'));

test('every palette theme × every typography set keeps the type study\'s rules, light and dark', { skip: skipUnlessCI(!distBuilt, 'needs `npm run build` (dist/lattice.js)') }, async () => {
  const jobs = [];
  for (const theme of THEMES) for (const mode of MODES) for (const set of TYPOGRAPHY_NAMES) jobs.push({ theme, mode, set });
  assert.ok(THEMES.length >= 14, `expected the 14 palette themes, found ${THEMES.length}: ${THEMES.join(', ')}`);

  const problems = [];
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      const audit = await auditOne(job.theme, job.mode, job.set);
      // A computed font-family names the face ASKED for, not the face drawn, so a set whose woff2
      // failed to load would still pass every face check. The audit lists families with no loaded
      // face; any such family fails the run.
      for (const fam of audit.unloaded || []) problems.push(`${job.theme} · ${job.mode} · ${job.set}: no loaded face for ${fam}`);
      for (const f of failuresOf(audit)) problems.push(`${job.theme} · ${job.mode} · ${job.set}: ${f}`);
    }
  }
  await Promise.all(Array.from({ length: POOL }, worker));
  assert.deepEqual(problems, [], `${problems.length} rule break(s) across ${jobs.length} runs:\n${problems.join('\n')}`);
});

// THE ARM THAT PROVES THE GATE CAN FAIL. Put the eyebrow back in the chrome's voice (mono
// capitals at chrome size and ink, today's look before the sets) and the same check must report
// the zero-axis pair the study found, or the green above means nothing.
test('the gate fails when the eyebrow speaks in the chrome voice', { skip: skipUnlessCI(!distBuilt, 'needs `npm run build` (dist/lattice.js)') }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'type-voice-arm-'));
  const css = path.join(dir, 'mono-eyebrow.css');
  fs.writeFileSync(css, 'section p:has(> code:only-child):has(+ h2) > code { font-family: var(--font-mono) !important; font-style: normal !important; text-transform: uppercase !important; font-size: var(--chrome-fs) !important; font-weight: 500 !important; color: var(--text-muted) !important; letter-spacing: 0.08em !important; }\n');
  try {
    const { stdout } = await run(process.execPath, [TOOL, '--theme', 'indaco', '--mode', 'light', '--style', css, '--json'], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });
    const found = failuresOf(JSON.parse(stdout));
    assert.ok(found.some((f) => /^zero-axis pair: .*eyebrow/.test(f)), `expected a zero-axis eyebrow pair, got:\n${found.join('\n')}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

module.exports = { failuresOf, floorFor };
