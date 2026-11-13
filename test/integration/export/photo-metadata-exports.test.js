/**
 * Integration: a photo leaves every CLI export without its metadata (EXIF, a phone's location, XMP, text chunks,
 * comments), through the image library's cleaner, the one the Studio's intake and the `.lattice` packer use
 * (`@laticent/lastra` `cleanerFor`). Before this, a plain `lattice deck.md deck.pdf` embedded an upright camera JPEG's
 * own bytes, GPS and comment included, whenever the image policy did not re-encode it, and `--player` did the same.
 *
 *   PDF      the embedded JPEG is the CLEANED file, byte for byte (so the pixels are the photo's own); the original
 *            bytes, the camera name, the comment and a PNG's text chunk are nowhere in the file
 *   PLAYER   the same, for the `data:` URI the player bakes
 *   REFUSED  a file the cleaner cannot parse is never shipped as it is: the PDF keeps it in the slide's photo (pixels
 *            only), the player shows the drawn stand-in and names it
 *   MARP     `npm run export:marp` copies the cleaned file into the bundle, and leaves out (naming it) one it refuses
 *   FORMS    a `data:image/…` address in any letter case or with parameters (`;name=x.jpg`), and a JPEG inside an SVG
 *            (the player bakes the SVG; the Marp bundle copies it), are cleaned the same way
 *
 * Each runs on the source CLI and on the shipped bin. Slow tier: four CLI renders per CLI, one Marp export.
 */
const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { cleanJpeg, cleanPng } = require('@laticent/lastra');

const ROOT = path.join(__dirname, '..', '..', '..');
const CLIS = [['source', path.join(ROOT, 'lattice.js')], ['shipped bin', path.join(ROOT, 'dist', 'lattice.js')]];
const TIMEOUT = 300000;
const F = path.join(ROOT, 'test', 'fixtures', 'lattice-input');
const JPEG = fs.readFileSync(path.join(F, 'upright-secret.jpg'));
const PNG = fs.readFileSync(path.join(F, 'text.png'));
const GARBAGE = fs.readFileSync(path.join(F, 'garbage.jpg'));
const CLEAN_JPEG = Buffer.from(cleanJpeg(new Uint8Array(JPEG)));
// The dirty JPEG cut before its end marker: a browser still draws it, the cleaner refuses it (it is cut short).
const CUT = JPEG.subarray(0, JPEG.length - 2);
const CLEAN_PNG = Buffer.from(cleanPng(new Uint8Array(PNG)));
const SECRETS = ['SECRET_CAMERA_MAKE', 'SECRET_JPEG_COMMENT', 'secret-place'];
const made = [];
const tmp = (p) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `pm-int-${p}-`));
  made.push(d);
  return d;
};
after(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

/** A deck folder with the dirty JPEG, the PNG with a text chunk and the damaged file in assets/. */
function deckDir() {
  const dir = tmp('deck');
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'cam.jpg'), JPEG);
  fs.writeFileSync(path.join(dir, 'assets', 'note.png'), PNG);
  fs.writeFileSync(path.join(dir, 'assets', 'junk.jpg'), GARBAGE);
  fs.writeFileSync(path.join(dir, 'assets', 'cut.jpg'), CUT);
  fs.writeFileSync(path.join(dir, 'deck.md'), '---\ntheme: indaco\n---\n\n## Camera\n\n![cam](asset:cam)\n\n---\n\n## Note\n\n![note](asset:note)\n\n---\n\n## Junk\n\n![junk](asset:junk)\n\n---\n\n## Cut\n\n![cut](asset:cut)\n');
  return dir;
}

/** Every picture a player carries, decoded (base64 or percent-encoded), the pictures inside an SVG included. */
function bakedPictures(text, depth = 0) {
  const out = [];
  for (const m of text.matchAll(/data:image\/[^,]*,/gi)) {
    const open = text[m.index - 1];
    const rest = text.slice(m.index + m[0].length);
    const body = rest.slice(0, open === '"' || open === "'" ? rest.indexOf(open) : rest.search(/[\s"'<>)]|$/));
    const bytes = /;base64/i.test(m[0]) ? Buffer.from(decodeURIComponent(body).replace(/\s+/g, ''), 'base64') : Buffer.from(unescape(body), 'latin1');
    out.push(bytes);
    if (depth < 4 && bytes.includes('<svg')) out.push(...bakedPictures(bytes.toString('utf8'), depth + 1));
  }
  return out;
}
const B64 = JPEG.toString('base64');
/** An author's SVG carrying the dirty JPEG. */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><image href="data:image/jpeg;base64,${B64}" width="320" height="200"/></svg>`;

/** A deck that writes its pictures as raw `data:` addresses a browser draws, and one SVG carrying a JPEG. */
function formsDir() {
  const dir = tmp('forms');
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'vec.svg'), SVG);
  fs.writeFileSync(
    path.join(dir, 'deck.md'),
    `---\ntheme: indaco\n---\n\n## Params\n\n<img src="data:image/jpeg;name=x.jpg;base64,${B64}">\n\n---\n\n## Upper\n\n<img src="DATA:IMAGE/JPEG;BASE64,${B64}">\n\n---\n\n## SVG\n\n![v](assets/vec.svg)\n`,
  );
  return dir;
}

test('the fixtures carry what the exports must not', () => {
  for (const s of ['SECRET_CAMERA_MAKE', 'SECRET_JPEG_COMMENT']) assert.ok(JPEG.includes(s), s);
  assert.ok(PNG.includes('secret-place'));
  assert.ok(!CLEAN_JPEG.equals(JPEG) && !CLEAN_PNG.equals(PNG), 'cleaning changes both');
  assert.equal(cleanJpeg(new Uint8Array(CUT)), null, 'the cleaner refuses the cut JPEG');
  for (const s of SECRETS) assert.ok(!CLEAN_JPEG.includes(s) && !CLEAN_PNG.includes(s), s);
});

for (const [label, bin] of CLIS) {
  const cli = (args) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, LATTICE_HOME: tmp('home') } });

  describe(`photos leave a CLI export without their metadata (${label})`, () => {
    test('PDF: the embedded JPEG is the cleaned file; no secret and no refused file reaches the PDF', { timeout: TIMEOUT }, () => {
      const dir = deckDir();
      const pdf = path.join(dir, 'deck.pdf');
      const r = cli([path.join(dir, 'deck.md'), pdf, '--images', 'original']);
      assert.equal(r.status, 0, r.stderr);
      const bytes = fs.readFileSync(pdf);
      assert.ok(bytes.includes(CLEAN_JPEG), 'the cleaned JPEG is embedded as its own file');
      assert.ok(!bytes.includes(JPEG), 'the camera original is not');
      for (const s of SECRETS) assert.ok(!bytes.includes(s), `${s} is not in the PDF`);
      assert.ok(!bytes.includes(GARBAGE) && !bytes.includes(CUT), 'a file the cleaner refuses is not embedded as it is');
    });

    test('player: the baked pictures are the cleaned files; a refused one is the stand-in, named', { timeout: TIMEOUT }, () => {
      const dir = deckDir();
      const html = path.join(dir, 'deck.html');
      const r = cli([path.join(dir, 'deck.md'), html, '--player', '--images', 'original']);
      assert.equal(r.status, 0, r.stderr);
      const text = fs.readFileSync(html, 'utf8');
      const uris = [...text.matchAll(/data:image\/(?:jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)/g)].map((m) => Buffer.from(m[1], 'base64'));
      assert.ok(uris.some((b) => b.equals(CLEAN_JPEG)), 'the cleaned JPEG is baked');
      assert.ok(uris.some((b) => b.equals(CLEAN_PNG)), 'the cleaned PNG is baked');
      for (const b of uris) {
        assert.ok(!b.equals(JPEG) && !b.equals(PNG) && !b.equals(GARBAGE) && !b.equals(CUT), 'no picture ships as it was');
        for (const s of SECRETS) assert.ok(!b.includes(s), s);
      }
      assert.match(`${r.stdout}\n${r.stderr}`, /its metadata cannot be removed; not embedded/);
    });

    test('player: a data: address with parameters or in upper case, and a JPEG inside an SVG, are cleaned', { timeout: TIMEOUT }, () => {
      const dir = formsDir();
      const html = path.join(dir, 'deck.html');
      const r = cli([path.join(dir, 'deck.md'), html, '--player', '--images', 'original']);
      assert.equal(r.status, 0, r.stderr);
      const text = fs.readFileSync(html, 'utf8');
      // The deck's own source rides in the player verbatim (an owner decision); the rendered slides are what is checked.
      const rendered = withoutEnvelope(text);
      const pictures = bakedPictures(rendered);
      assert.ok(pictures.filter((b) => b.equals(CLEAN_JPEG)).length >= 3, 'both raw addresses and the SVG carry the cleaned JPEG');
      for (const b of pictures) for (const s of SECRETS) assert.ok(!b.includes(s), `${s} is not in a baked picture`);
    });
  });
}

/**
 * The player's text without its `lattice-doc` envelope (the deck's source, carried verbatim): cut at the envelope's
 * id and the end tag after it. A test helper over our own output, not a sanitizer.
 */
function withoutEnvelope(text) {
  const id = text.indexOf('id="lattice-doc"');
  if (id < 0) return text;
  const from = text.lastIndexOf('<script', id);
  const to = text.indexOf('</script>', id);
  return to < 0 ? text.slice(0, from) : text.slice(0, from) + text.slice(to + '</script>'.length);
}

test('Marp bundle: the cleaned file is copied, a refused one is left out and named', { timeout: TIMEOUT }, () => {
  const dir = deckDir();
  // The Marp exporter localizes file paths (a Marp deck has no `asset:` names), so the deck names the files.
  fs.writeFileSync(path.join(dir, 'deck.md'), fs.readFileSync(path.join(dir, 'deck.md'), 'utf8').replace(/asset:(cam|note|junk)/g, (_, n) => `assets/${n}.${n === 'note' ? 'png' : 'jpg'}`));
  const out = path.join(tmp('marp'), 'bundle');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'export-marp.js'), path.join(dir, 'deck.md'), out], { encoding: 'utf8', timeout: TIMEOUT, cwd: ROOT });
  assert.equal(r.status, 0, r.stderr);
  const assets = path.join(out, 'deck', 'assets'); // the exporter writes <out>/<deck name>/
  assert.ok(fs.readFileSync(path.join(assets, 'cam.jpg')).equals(CLEAN_JPEG), 'the JPEG is the cleaned file');
  assert.ok(fs.readFileSync(path.join(assets, 'note.png')).equals(CLEAN_PNG), 'the PNG is the cleaned file');
  assert.equal(fs.existsSync(path.join(assets, 'junk.jpg')), false, 'the refused file is not copied');
  assert.match(r.stderr, /junk\.jpg is not copied: it does not read as a whole JPEG file, so its metadata cannot be removed/);
});

test('Marp bundle: an SVG is copied with the JPEG inside it cleaned, and is otherwise the same file', { timeout: TIMEOUT }, () => {
  const dir = formsDir();
  const out = path.join(tmp('marp'), 'bundle');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'export-marp.js'), path.join(dir, 'deck.md'), out], { encoding: 'utf8', timeout: TIMEOUT, cwd: ROOT });
  assert.equal(r.status, 0, r.stderr);
  const svg = fs.readFileSync(path.join(out, 'deck', 'assets', 'vec.svg'), 'utf8');
  assert.equal(svg, SVG.replace(B64, CLEAN_JPEG.toString('base64')));
});
