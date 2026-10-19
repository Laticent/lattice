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
