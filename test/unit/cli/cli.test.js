/**
 * Unit: CLI behavior for the project's command-line tools.
 *
 * Tests --help / --version, friendly error paths, and exit codes by
 * spawning each tool as a subprocess and asserting on exit code,
 * stdout, and stderr. No Chromium / no Marp pipeline runs — these
 * exit before any heavy work.
 *
 * Async + `{ concurrency: true }` so the 17 subprocess spawns overlap
 * on the worker thread instead of running serially. With sync spawnSync
 * the file took ~4s and was the long pole of the unit suite; async
 * brings it to ~1s on a 4-core box.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const os     = require('os');
const fs     = require('fs');
const { spawn } = require('child_process');

describe('cli', { concurrency: true }, () => {
  const ROOT = path.join(__dirname, '..', '..', '..');
  const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
  const SCREENSHOT = path.join(ROOT, 'tools', 'screenshot-slides.js');

  function run(script, args = [], { env = {} } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script, ...args], {
        cwd: ROOT,
        env: { ...process.env, ...env },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
      child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`cli test timeout after 10s: ${script} ${args.join(' ')}`));
      }, 10000);
      child.on('close', (status) => {
        clearTimeout(timer);
        resolve({ status, stdout, stderr });
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  // ── lattice-emulator ──────────────────────────────────────────────────────

  test('emulator: --help exits 0 with usage on stdout', async () => {
    const r = await run(EMULATOR, ['--help']);
    assert.equal(r.status, 0, `expected 0, got ${r.status}; stderr: ${r.stderr}`);
    assert.match(r.stdout, /USAGE/);
    assert.match(r.stdout, /lattice-emulator/);
    assert.match(r.stdout, /EXIT CODES/);
  });

  test('emulator: -h is a synonym for --help', async () => {
    const r = await run(EMULATOR, ['-h']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /USAGE/);
  });

  test('emulator: --version exits 0 with version string', async () => {
    const r = await run(EMULATOR, ['--version']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^lattice-emulator \d+\.\d+\.\d+/);
  });

  test('emulator: -v is a synonym for --version', async () => {
    const r = await run(EMULATOR, ['-v']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^lattice-emulator \d/);
  });

  test('emulator: no args exits 1 with usage on stderr', async () => {
    const r = await run(EMULATOR);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Usage/);
    assert.equal(r.stdout, '');
  });

  test('emulator: unknown flag exits 1 with friendly error', async () => {
    const r = await run(EMULATOR, ['--bogus', 'deck.md', 'out.pdf']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unknown option: --bogus/);
    assert.doesNotMatch(r.stderr, /at .+\.js:\d+/, 'stderr should not contain a stack trace');
  });

  // Retired 2026-09-28 with `caption:` (engineering/decisions/2026-09-28-say-not-caption.md). A
  // script still passing it asked for a PRIVACY strip, so it must fail loudly and name the flag
  // that does the job now — never render the deck unstripped, never a bare "unknown option".
  test('emulator: retired --strip-captions exits 1 and names --strip-say', async () => {
    const r = await run(EMULATOR, ['deck.md', 'out.html', '--strip-captions']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--strip-captions is retired — use --strip-say/);
    assert.doesNotMatch(r.stderr, /at .+\.js:\d+/, 'stderr should not contain a stack trace');
  });

  test('emulator: --palette without value exits 1', async () => {
    const r = await run(EMULATOR, ['deck.md', 'out.pdf', '--palette']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--palette requires a value/);
  });

  test('emulator: missing source.md exits 1 with friendly message (no stack trace)', async () => {
    const r = await run(EMULATOR, ['does-not-exist.md', 'out.pdf']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /source markdown not found/);
    assert.doesNotMatch(r.stderr, /at .+\.js:\d+/);
  });

  test('emulator: missing custom CSS exits 1 with friendly message', async () => {
    const r = await run(EMULATOR, ['examples/gallery-jargon.md', 'does-not-exist.css', 'out.pdf']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /layout CSS not found/);
  });

  test('emulator: bad palette exits 1 and lists available palettes', async () => {
    const r = await run(EMULATOR, ['examples/gallery-jargon.md', 'out.pdf', 'nonesuch']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /palette not found: nonesuch/);
    assert.match(r.stderr, /available palettes:.*indaco/);
  });

  test('emulator: unknown size: directive exits 1 and lists valid sizes (fails fast, no Chrome) [#502]', async () => {
    // A typo'd size must error at CONFIG time with the valid set — not resolve
    // silently to the first declared @size (a deck rendered at the wrong
    // geometry) nor wedge the render. Exits before any puppeteer work.
    const dir  = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-size-'));
    const deck = path.join(dir, 'deck.md');
    fs.writeFileSync(deck, '---\nsize: storyy\n---\n\n# Hello\n');
    const r = await run(EMULATOR, [deck, path.join(dir, 'out.pdf')]);
    assert.equal(r.status, 1, `expected 1, got ${r.status}; stderr: ${r.stderr}`);
    assert.match(r.stderr, /unknown size: storyy/);
    assert.match(r.stderr, /available sizes:.*\bstory\b/);
    assert.doesNotMatch(r.stderr, /at .+\.js:\d+/, 'no stack trace — friendly error');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // ── screenshot-slides ─────────────────────────────────────────────────────

  test('screenshot: --help exits 0 with usage on stdout', async () => {
    const r = await run(SCREENSHOT, ['--help']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /USAGE/);
    assert.match(r.stdout, /SELECTOR FORMS/);
    assert.match(r.stdout, /EXIT CODES/);
  });

  test('screenshot: -h is a synonym for --help', async () => {
    const r = await run(SCREENSHOT, ['-h']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /USAGE/);
  });

  test('screenshot: --version exits 0 with version string', async () => {
    const r = await run(SCREENSHOT, ['--version']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^screenshot-slides \d+\.\d+\.\d+/);
  });

  test('screenshot: missing HTML exits 1 with friendly message', async () => {
    const r = await run(SCREENSHOT, ['does-not-exist.html']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /HTML not found/);
    assert.doesNotMatch(r.stderr, /at .+\.js:\d+/);
  });

  test('screenshot: bad scale exits 1 with explanation', async () => {
    const r = await run(SCREENSHOT, ['--scale', 'abc']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /scale must be a number ≥ 1/);
  });

  test('screenshot: unknown flag exits 1', async () => {
    const r = await run(SCREENSHOT, ['--bogus']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unknown option: --bogus/);
  });

  test('screenshot: --selector without value exits 1', async () => {
    const r = await run(SCREENSHOT, ['--selector']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--selector requires a value/);
  });
});
