/**
 * The Export-to-Marp bundle and the code plugin — real marp-cli: a shell command list is colored the
 * way Lattice colors it, and a block that asks to be formatted ships formatted, with no record line.
 *
 * marp-core highlights with its OWN highlight.js, whose stock bash knows POSIX built-ins and nothing
 * a command list is made of: `npm`, `docker`, `kubectl` and every flag came out as plain text (0
 * tokens, observed on marp-cli 4.5.0). The bundle's `marp.config.cjs` now rebuilds bash on that
 * instance from the code plugin's shell grammar (lib/core/marp-bundle-html.js `ownShell`;
 * engineering/decisions/2026-10-15-code-plugin.md, defect 9). This renders a bundle with marp-cli
 * and reads the tokens back, with the config and without it, so the test proves both that the
 * config is what colors the block and that stock Marp still does not.
 *
 * Local runs skip when marp-cli cannot be fetched; CI fails instead (marp-kit-render.test.js
 * explains why a self-skipping gate is not a gate).
 */

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { npxSync } = require('../../helpers/npx-lock');

const ROOT = path.join(__dirname, '..', '..', '..');
const { MARP_CLI_RANGE } = require(path.join(ROOT, 'lib', 'core', 'marp-bundle.js'));
const EXPORT_CLI = path.join(ROOT, 'tools', 'export-marp.js');
const OUT = path.join(ROOT, '.scratch', 'marp-bundle-shell-grammar');
const TIMEOUT = 300000;

const DECK = `---
theme: indaco
---

# Ship it

\`\`\`bash
npm install @laticent/lattice
docker compose up -d --build
kubectl apply -f k8s/ --namespace prod
\`\`\`

---

# Formatted

\`@code{format, numbers}\`
\`\`\`ts
const a={b:1}
\`\`\`
`;

function marp(args, cwd, timeout = TIMEOUT) {
  const env = { ...process.env, npm_config_ignore_scripts: 'true', CHROME_NO_SANDBOX: '1' };
  return npxSync(['-y', `@marp-team/marp-cli@${MARP_CLI_RANGE}`, '--no-stdin', ...args], { cwd, encoding: 'utf8', env, timeout });
}

/** The bash block's highlighted body, from a rendered HTML file. */
function bashBlock(file) {
  const m = /<code class="language-bash">([\s\S]*?)<\/code>/.exec(fs.readFileSync(file, 'utf8'));
  assert.ok(m, `${path.basename(file)} has no bash block`);
  return m[1];
}

describe('Export-to-Marp colors a shell command list — real marp-cli', () => {
  let skip = null;
  let withConfig = '';
  let stock = '';
  let exported = '';

  before(() => {
    const probe = marp(['--version'], ROOT, 90000);
    if (probe.status !== 0) {
      const reason = `could not fetch marp-cli (exit ${probe.status}): ${String(probe.stderr || '').slice(0, 300)}`;
      if (process.env.CI) throw new Error(`[marp-bundle-shell-grammar] ${reason}`);
      skip = reason;
      return;
    }
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'deck.md'), DECK);
    const r = spawnSync(process.execPath, [EXPORT_CLI, path.join(OUT, 'deck.md'), path.join(OUT, 'out'), '--no-agent'], { cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT });
    assert.equal(r.status, 0, `export-marp failed:\n${r.stdout}\n${r.stderr}`);
    const bundle = path.join(OUT, 'out', 'deck');
    exported = fs.readFileSync(path.join(bundle, 'deck.md'), 'utf8');
    const a = marp(['deck.md', '--config-file', 'marp.config.cjs', '-o', 'with-config.html'], bundle);
    assert.equal(a.status, 0, `marp failed:\n${a.stdout}\n${a.stderr}`);
    // An empty config file: marp-cli reads no config from the bundle, so this is stock Marp.
    fs.writeFileSync(path.join(bundle, 'empty.config.cjs'), 'module.exports = {};\n');
    const b = marp(['deck.md', '--config-file', 'empty.config.cjs', '-o', 'stock.html'], bundle);
    assert.equal(b.status, 0, `marp failed:\n${b.stdout}\n${b.stderr}`);
    withConfig = bashBlock(path.join(bundle, 'with-config.html'));
    stock = bashBlock(path.join(bundle, 'stock.html'));
  });

  test('the bundle colors each command as a built-in and each flag as a parameter', (t) => {
    if (skip) return t.skip(skip);
    for (const cmd of ['npm', 'docker', 'kubectl']) {
      assert.match(withConfig, new RegExp(`<span class="hljs-built_in">${cmd}</span>`), cmd);
    }
    for (const flag of ['-d', '--build', '-f', '--namespace']) {
      assert.match(withConfig, new RegExp(`<span class="hljs-params">${flag}</span>`), flag);
    }
  });

  test('stock Marp does not, so the config is what colors the block', (t) => {
    if (skip) return t.skip(skip);
    assert.doesNotMatch(stock, /hljs-params/);
    assert.doesNotMatch(stock, /<span class="hljs-built_in">(?:npm|docker|kubectl)<\/span>/);
  });

  // Not a marp-cli question, but this file already runs the CLI export: the bundle's deck carries the
  // block formatted (the code-format bake) and no record line (withoutCodeRecords), since Marp reads neither.
  test('the exported deck carries the formatted block and no record line', (t) => {
    if (skip) return t.skip(skip);
    assert.match(exported, /```ts\nconst a = \{ b: 1 \};\n```/);
    assert.doesNotMatch(exported, /@code\{/);
  });
});
