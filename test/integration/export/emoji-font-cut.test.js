// The emoji font is cut to the deck's own emoji in every HTML the CLI writes, from the PUBLISHED bundle (dist/lattice.js, the npm bin)
// as well as from source: the bundle once lost the color wasm (its __dirname is dist/) and silently shipped all the slices, 2 MB more.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BUNDLE = path.join(ROOT, 'dist', 'lattice.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-emoji-cut-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// A rocket as text, a party popper only as an entity, and a flag: three emoji in three slices.
const DECK = '# Launch \u{1F680}\n\nParty &#127881; and \u{1F1EB}\u{1F1F7}\n';

/** Total base64 bytes of the Noto Color Emoji faces a file embeds, and how many faces. */
function emojiFaces(html) {
  const faces = [...html.matchAll(/@font-face\s*\{[^}]*Noto Color Emoji[^}]*\}/g)].map((m) => m[0]);
  return { count: faces.length, bytes: faces.reduce((n, f) => n + (f.match(/base64,([A-Za-z0-9+/=]+)/)?.[1].length || 0), 0) };
}

function render(entry, args, name) {
  const deck = path.join(tmp, `${name}.md`);
  fs.writeFileSync(deck, DECK);
  const out = path.join(tmp, `${name}.html`);
  const r = spawnSync(process.execPath, [entry, deck, out, '--quiet', ...args], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  assert.equal(r.status, 0, r.stderr);
  return fs.readFileSync(out, 'utf8');
}

for (const [label, entry] of [['source', path.join(ROOT, 'lattice.js')], ['the published bundle', BUNDLE]]) {
  for (const [kind, args] of [['player', ['--player']], ['plain html', []], ['--read', ['--read']]]) {
    test(`${label}: ${kind} carries a few KB of emoji font, not whole slices`, () => {
      assert.ok(fs.existsSync(entry), `${entry} is missing: run \`npm run build\``);
      const f = emojiFaces(render(entry, args, `${label.replace(/\W+/g, '-')}-${kind.replace(/\W+/g, '-')}`));
      assert.ok(f.count > 0, 'the deck draws emoji from our own font');
      assert.ok(f.bytes < 120000, `${f.bytes} base64 bytes of emoji font; whole slices would be about 2,000,000`);
    });
  }
}
