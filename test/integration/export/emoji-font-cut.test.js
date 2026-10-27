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

// `system-emoji` is honored in a picture format too: the PDF's pictures leave our emoji font out and draw this computer's, so the file
// differs from the one `exact-emoji` writes. (Before, a PDF ignored the emoji tier and the two files were byte-identical.)
test('a PDF draws different emoji pixels under system-emoji than under exact-emoji', () => {
  const deck = path.join(tmp, 'pdf.md');
  fs.writeFileSync(deck, DECK);
  const pdf = (tier) => {
    const out = path.join(tmp, `pdf-${tier}.pdf`);
    const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), deck, out, '--quiet', '--fonts', `${tier}-emoji`], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
    assert.equal(r.status, 0, r.stderr);
    return fs.readFileSync(out);
  };
  assert.ok(!pdf('exact').equals(pdf('system')), 'system-emoji changes the PDF');
  assert.ok(pdf('exact').equals(pdf('full')), 'exact, used and full draw the same picture: no emoji font file rides in a PDF');
});

// An editable Office file never embeds the emoji font, and the emoji tier does not change it. Noto Color Emoji is COLR v1, and LibreOffice 24.2 draws
// NOTHING for an emoji set in an embedded COLR v1 face (even with a system emoji font installed), so an emoji stays in its text run and the reader's
// own emoji font draws it. The text tiers still apply.
test('an editable .pptx embeds no emoji font under any emoji tier, and the text tier still decides the text faces', async () => {
  const JSZip = require('jszip');
  const deck = path.join(tmp, 'office.md');
  fs.writeFileSync(deck, DECK);
  const fonts = async (fontsArg) => {
    const out = path.join(tmp, `office-${fontsArg.replace(/\W+/g, '-')}.pptx`);
    const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), deck, out, '--quiet', '--editable', '--fonts', fontsArg], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
    assert.equal(r.status, 0, r.stderr);
    const zip = await JSZip.loadAsync(fs.readFileSync(out));
    const names = Object.keys(zip.files).filter((n) => /^ppt\/fonts\//.test(n));
    let bytes = 0;
    for (const n of names) bytes += (await zip.files[n].async('uint8array')).length;
    return { count: names.length, bytes };
  };
  const base = await fonts('used system-emoji');
  for (const tier of ['exact-emoji', 'used-emoji', 'full-emoji']) {
    const got = await fonts(`used ${tier}`);
    assert.deepEqual(got, base, `${tier}: the same fonts as system-emoji, so no emoji face rides in the file`);
  }
  const none = await fonts('system');
  assert.equal(none.count, 0, 'system text embeds nothing');
  const exact = await fonts('exact');
  assert.ok(exact.bytes < base.bytes, 'exact text is cut to the characters shown');
});
