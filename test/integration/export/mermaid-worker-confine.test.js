// The Mermaid worker's own Chromium page (lib/plugins/mermaid/shared/render-worker.js) follows the same rule as the
// CLI's main page: a `file:` picture whose REAL path is outside the deck folder is answered with the stand-in and
// named on stderr (media note §4.11). The diagram is a flowchart image node, the one way a fence makes Chrome open a file.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../../..');
const WORKER = path.join(ROOT, 'lib/plugins/mermaid/shared/render-worker.js');

test('a flowchart image node naming a file outside the deck is refused; one inside the deck is not', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mmd-confine-'));
  try {
    const deck = path.join(base, 'deck');
    const outside = path.join(base, 'outside');
    fs.mkdirSync(deck);
    fs.mkdirSync(outside);
    // A TALL picture (1:3): the stand-in is 16:9, so a node's drawn width tells which one Chromium loaded.
    const tall = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="120" viewBox="0 0 40 120"><rect width="40" height="120" fill="#b00"/></svg>';
    fs.writeFileSync(path.join(outside, 'secret.svg'), tall);
    fs.writeFileSync(path.join(deck, 'inside.svg'), tall);
    const node = (id, file) => `${id}@{ img: "${pathToFileURL(file).href}", label: "${id}", pos: "b", w: 80, h: 60, constraint: "on" }`;
    const definition = `flowchart LR\n ${node('A', path.join(outside, 'secret.svg'))}\n ${node('B', path.join(deck, 'inside.svg'))}\n A --> B`;
    const outFile = path.join(base, 'out.json');
    const jobFile = path.join(base, 'job.json');
    fs.writeFileSync(jobFile, JSON.stringify({ pkgRoot: ROOT, chromePath: process.env.CHROME_PATH || undefined, backgroundColor: 'transparent', svgId: 'x', outFile, confineRoots: [deck], diagrams: [{ definition, config: {} }] }));
    const r = spawnSync(process.execPath, [WORKER, jobFile], { encoding: 'utf8', timeout: 120000 });
    assert.equal(r.status, 0, r.stderr);
    const result = JSON.parse(fs.readFileSync(outFile, 'utf8')).results[0];
    assert.equal(result.ok, true);
    // Node A (outside) drew the 16:9 stand-in at the node's height; node B (inside) drew the real 1:3 picture.
    const widths = [...result.svg.matchAll(/<image[^>]*?\bwidth="([\d.]+)"/g)].map((m) => Number(m[1]));
    assert.equal(widths.length, 2, `two image nodes: ${widths}`);
    assert.ok(widths[0] > 100, `the outside picture is the stand-in (width ${widths[0]})`);
    assert.ok(widths[1] < 40, `the inside picture is the real one (width ${widths[1]})`);
    assert.match(r.stderr, /refused file:\/\/\/.*secret\.svg/);
    assert.doesNotMatch(r.stderr, /inside\.svg/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

// A folder named `Board (final)` holding `it's.svg`: `pathToFileURL` leaves `(`, `)` and `'` as they are, and the
// locked page's re-addressing must take the whole address (the checker: the first cut stopped at `(` and drew the
// stand-in). The drawn SVG carries no `file:` address, as the old page's never did.
test('a picture in a folder with parentheses and an apostrophe loads, and its local path never reaches the SVG', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mmd-paren-'));
  try {
    const deck = path.join(base, 'Board (final)');
    fs.mkdirSync(deck);
    const tall = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="120" viewBox="0 0 40 120"><rect width="40" height="120" fill="#b00"/></svg>';
    fs.writeFileSync(path.join(deck, "it's.svg"), tall);
    const definition = `flowchart LR\n A@{ img: "${pathToFileURL(path.join(deck, "it's.svg")).href}", label: "A", pos: "b", w: 80, h: 60, constraint: "on" }\n A --> B`;
    const outFile = path.join(base, 'out.json');
    const jobFile = path.join(base, 'job.json');
    fs.writeFileSync(jobFile, JSON.stringify({ pkgRoot: ROOT, chromePath: process.env.CHROME_PATH || undefined, backgroundColor: 'transparent', svgId: 'x', outFile, confineRoots: [deck], diagrams: [{ definition, config: {} }] }));
    const r = spawnSync(process.execPath, [WORKER, jobFile], { encoding: 'utf8', timeout: 120000 });
    assert.equal(r.status, 0, r.stderr);
    const { svg } = JSON.parse(fs.readFileSync(outFile, 'utf8')).results[0];
    const width = Number(/<image[^>]*?\bwidth="([\d.]+)"/.exec(svg)?.[1]);
    assert.ok(width < 40, `the real 1:3 picture drew (width ${width}), not the 16:9 stand-in`);
    assert.doesNotMatch(svg, /file:|lattice\.invalid/, 'an address reached the SVG');
    assert.doesNotMatch(r.stderr, /refused/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

// The worker's page is the LOCKED page (threat-model note 2026-10-16 §6 row 14): its own origin, a strict CSP, the code
// sandbox's browser. A diagram that names a web picture reaches nothing; the control fetches the same address from an
// ordinary page and is heard, so the zero is the page's wall and not a listener that never answers.
test('a diagram that names a web picture reaches no listener from the locked page; an ordinary page does', async () => {
  const http = require('node:http');
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    res.writeHead(200, { 'content-type': 'image/svg+xml' });
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const at = `http://127.0.0.1:${server.address().port}`;
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mmd-locked-'));
  try {
    const outFile = path.join(base, 'out.json');
    const jobFile = path.join(base, 'job.json');
    const definition = `flowchart LR\n A@{ img: "${at}/locked.svg", label: "A", pos: "b", w: 80, h: 60 }\n A --> B`;
    fs.writeFileSync(jobFile, JSON.stringify({ pkgRoot: ROOT, chromePath: process.env.CHROME_PATH || undefined, backgroundColor: 'transparent', svgId: 'x', outFile, confineRoots: [base], diagrams: [{ definition, config: {} }] }));
    const r = spawnSync(process.execPath, [WORKER, jobFile], { encoding: 'utf8', timeout: 120000 });
    assert.equal(r.status, 0, r.stderr);
    // Whether Mermaid draws a node whose picture never loads is its own business (the export swaps a web picture for
    // the stand-in before the worker sees it, lib/core/remote-ref.js); what matters here is where the request went.
    const out = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    assert.ok(['on', 'off', 'unmeasured'].includes(out.layer), `the worker reports the OS layer it ran at: ${out.layer}`);
    await new Promise((res) => setTimeout(res, 500));
    assert.deepEqual(hits, [], 'the locked page reached the listener');
    // The control: the same address from an ordinary page.
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage();
      await page.setContent(`<img src="${at}/control.svg">`, { waitUntil: 'load' });
    } finally {
      await browser.close();
    }
    assert.deepEqual(hits, ['/control.svg'], 'the control did not reach the listener, so the zero above proves nothing');
  } finally {
    server.close();
    fs.rmSync(base, { recursive: true, force: true });
  }
});
