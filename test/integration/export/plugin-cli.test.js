/**
 * Integration: a zip plugin through the REAL CLI (plugin-system §9 decisions 10 to 14; phase E step 2).
 *
 *   ADD       `lattice packages add <folder>` gates it, installs it under plugin/<name>, and reports a
 *             subfolder instead of dropping it silently; it installs UNAPPROVED
 *   REFUSED   a deck that lists the plugin and writes its fence fails with the plugin named, its digest and
 *             `lattice packages trust plugin/<name>`, and no output file
 *   TRUST     the approval is under plugin/<name>
 *   DRAWN     the same deck then renders: the fence is drawn in the plugin's root in the HTML
 *   UNLISTED  a deck that does not list the installed plugin keeps the code block and says how to list it
 *   GATE      a plugin whose fence is a code language, or that declares render.exec, is refused at add
 *
 * Needs Chromium (the sandbox). Slow tier.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-plugin-cli-'));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-plugin-cli-work-'));
const env = { ...process.env, LATTICE_HOME: home };
const lattice = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), ...args], { env, encoding: 'utf8', cwd: work, timeout: 240000 });

const RENDER = 'function render(f){return "<ul class=\\"lp-gantt-plugin-rows\\">" + f.body.trim().split("\\n").map(function(l){return "<li>" + l.replace(/&/g,"&amp;").replace(/</g,"&lt;") + "</li>"}).join("") + "</ul>"}\nexport { render as default };\n';
function writePlugin(dir, name, { fence = 'gantt', manifest = {}, extra = {} } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.manifest.json`), JSON.stringify({ name, type: 'plugin', format: 1, api: 1, contributes: { fences: { [fence]: { body: 'text' } } }, ...manifest }));
  fs.writeFileSync(path.join(dir, `${name}.docs.md`), `# ${name}\n`);
  fs.writeFileSync(path.join(dir, `${name}.fixtures.md`), `\`\`\`${fence}\nA 1\n\`\`\`\n`);
  fs.writeFileSync(path.join(dir, `${name}.render.js`), RENDER);
  for (const [f, body] of Object.entries(extra)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), body);
  }
}
const deck = (listed) => `---\ntheme: indaco\n${listed ? 'plugins: [gantt-plugin]\n' : ''}---\n\n## Plan\n\n\`\`\`gantt\nDesign 1 < 2\nBuild 3\n\`\`\`\n`;

before(() => {
  writePlugin(path.join(work, 'gantt-plugin'), 'gantt-plugin', { extra: { 'shared/helper.js': 'export const x = 1;\n' } });
  fs.writeFileSync(path.join(work, 'listed.md'), deck(true));
  fs.writeFileSync(path.join(work, 'unlisted.md'), deck(false));
});
after(() => {
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(work, { recursive: true, force: true });
});

describe('a zip plugin through the CLI', () => {
  test('ADD installs it unapproved and reports the subfolder it left out', () => {
    const r = lattice('packages', 'add', path.join(work, 'gantt-plugin'));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /added\s+plugin\/gantt-plugin/);
    assert.match(r.stdout, /left out 1 item\(s\) below the top level \(shared\/\)/);
    assert.match(r.stdout, /not approved: a render that uses plugin\/gantt-plugin fails until you run `lattice packages trust plugin\/gantt-plugin`/);
    assert.ok(fs.existsSync(path.join(home, 'packages', 'plugin', 'gantt-plugin', 'gantt-plugin.render.js')));
  });

  test('REFUSED: a deck that lists it and writes its fence fails with the digest and the trust command, writing nothing', () => {
    const r = lattice(path.join(work, 'listed.md'), '-o', path.join(work, 'refused.html'));
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /the deck uses the plugin gantt-plugin, and you have not approved its code \(sha256 [0-9a-f]{64}\)/);
    assert.match(r.stderr, /lattice packages trust plugin\/gantt-plugin/);
    assert.equal(fs.existsSync(path.join(work, 'refused.html')), false);
  });

  test('UNLISTED: a deck that does not list it keeps the code block and says how to list it', () => {
    const r = lattice(path.join(work, 'unlisted.md'), '-o', path.join(work, 'unlisted.html'));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stderr, /the installed plugin gantt-plugin draws ```gantt blocks, and this deck does not list it.*plugins: \[gantt-plugin\]/);
    const html = fs.readFileSync(path.join(work, 'unlisted.html'), 'utf8');
    assert.doesNotMatch(html, /data-lattice-plugin="gantt-plugin"/);
    assert.match(html, /language-gantt/);
  });

  test('TRUST then DRAWN: the same deck renders and the fence is drawn in the plugin’s root', () => {
    const t = lattice('packages', 'trust', 'plugin/gantt-plugin', '--yes');
    assert.equal(t.status, 0, t.stdout + t.stderr);
    assert.match(t.stdout, /approved plugin\/gantt-plugin \(sha256 [0-9a-f]{64}\)/);
    const r = lattice(path.join(work, 'listed.md'), '-o', path.join(work, 'drawn.html'));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const html = fs.readFileSync(path.join(work, 'drawn.html'), 'utf8');
    assert.match(html, /<div data-lattice-plugin="gantt-plugin"><ul class="lp-gantt-plugin-rows"><li>Design 1 &lt; 2<\/li><li>Build 3<\/li><\/ul><\/div>/);
    assert.doesNotMatch(html, /language-gantt/);
  });

  test('CHANGED code asks again: one byte after approval is refused', () => {
    const f = path.join(home, 'packages', 'plugin', 'gantt-plugin', 'gantt-plugin.render.js');
    fs.writeFileSync(f, `// edited\n${RENDER}`);
    const r = lattice(path.join(work, 'listed.md'), '-o', path.join(work, 'changed.html'));
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /you have not approved its code/);
    fs.writeFileSync(f, RENDER);
  });

  test('GATE: a fence that is a code language, and render.exec, are refused at add', () => {
    writePlugin(path.join(work, 'py-plugin'), 'py-plugin', { fence: 'python' });
    writePlugin(path.join(work, 'exec-plugin'), 'exec-plugin', { fence: 'execfence', manifest: { render: { parity: 'equivalent', degradesTo: 'source', exec: { hydrate: 'pass' } } } });
    const a = lattice('packages', 'add', path.join(work, 'py-plugin'));
    assert.notEqual(a.status, 0);
    assert.match(a.stdout, /refused\s+py-plugin: its fence `python` is a code language Lattice highlights/);
    const b = lattice('packages', 'add', path.join(work, 'exec-plugin'));
    assert.notEqual(b.status, 0);
    assert.match(b.stdout, /refused\s+exec-plugin: it declares render\.exec/);
  });
});

// ── The inline door (2026-10-14-plugin-inline-door.md): a zip plugin's `@kind{…}` spans, through the same CLI ──
//
//   ADD        a plugin of inline kinds only installs; one that names a kind Lattice draws (`icon`) is refused
//   REFUSED    a deck that writes its span before trust fails with the digest, as a fence does
//   UNLISTED   a deck that does not list it keeps the span as code and says how to list it
//   DRAWN      after trust, the span is drawn in a <span> root, from the fields its declared slot read
//   PHRASING   output that would put a block in the line is refused, and the span stays code
describe('a zip plugin of inline kinds through the CLI', () => {
  const CHIP = 'function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")}\nfunction render(i){if(i.kind==="tag-chip"){var f=i.fields||{};return "<span class=\\"lp-chip-plugin-tag\\" data-tone=\\"" + esc(f.tone||"none") + "\\">" + esc(f.label||i.text) + "</span>"}if(i.kind==="bad-chip"){return "<div>block</div>"}return "<p>no</p>"}\nexport { render as default };\n';
  const inline = {
    'tag-chip': { slot: { label: 'a tag chip', positional: [{ name: 'label', type: 'text' }], params: { tone: { type: 'oneOf', values: ['hot', 'cold'] } } }, placeholder: { size: 'sm' } },
    'bad-chip': {},
  };
  function writeChip(dir, name, kinds) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.manifest.json`), JSON.stringify({ name, type: 'plugin', format: 1, api: 1, contributes: { inline: kinds } }));
    fs.writeFileSync(path.join(dir, `${name}.docs.md`), `# ${name}\n`);
    fs.writeFileSync(path.join(dir, `${name}.fixtures.md`), '- `@tag-chip{x}`\n');
    fs.writeFileSync(path.join(dir, `${name}.render.js`), CHIP);
  }
  const chipDeck = (listed) => `---\ntheme: indaco\n${listed ? 'plugins: [chip-plugin]\n' : ''}---\n\n## Launch\n\n- Status \`@tag-chip{Launch, hot}\` and \`@bad-chip{x}\`, with \`\\@tag-chip{kept}\`\n`;

  before(() => {
    writeChip(path.join(work, 'chip-plugin'), 'chip-plugin', inline);
    writeChip(path.join(work, 'icon-plugin'), 'icon-plugin', { icon: {} });
    fs.writeFileSync(path.join(work, 'chip-listed.md'), chipDeck(true));
    fs.writeFileSync(path.join(work, 'chip-unlisted.md'), chipDeck(false));
  });

  test('ADD: a plugin of inline kinds installs; one that takes a kind Lattice draws is refused', () => {
    const a = lattice('packages', 'add', path.join(work, 'chip-plugin'));
    assert.equal(a.status, 0, a.stdout + a.stderr);
    assert.match(a.stdout, /added\s+plugin\/chip-plugin/);
    const b = lattice('packages', 'add', path.join(work, 'icon-plugin'));
    assert.notEqual(b.status, 0);
    assert.match(b.stdout, /refused\s+icon-plugin: its inline kind `@icon\{…\}` is one Lattice already draws/);
  });

  test('REFUSED: a listed deck that writes its span fails until the code is approved', () => {
    const r = lattice(path.join(work, 'chip-listed.md'), '-o', path.join(work, 'chip-refused.html'));
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /the deck uses the plugin chip-plugin, and you have not approved its code \(sha256 [0-9a-f]{64}\)/);
  });

  test('UNLISTED: the span stays code and the warning names the kind and the line to add', () => {
    const r = lattice(path.join(work, 'chip-unlisted.md'), '-o', path.join(work, 'chip-unlisted.html'));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stderr, /the installed plugin chip-plugin draws `@bad-chip\{…\}`, `@tag-chip\{…\}` spans, and this deck does not list it.*plugins: \[chip-plugin\]/);
    const html = fs.readFileSync(path.join(work, 'chip-unlisted.html'), 'utf8');
    assert.match(html, /<code>@tag-chip\{Launch, hot\}<\/code>/);
  });

  test('TRUST then DRAWN: the span is drawn in a <span> root from its slot\'s fields; block output stays code; an escape stays literal', () => {
    const t = lattice('packages', 'trust', 'plugin/chip-plugin', '--yes');
    assert.equal(t.status, 0, t.stdout + t.stderr);
    assert.match(t.stdout, /`@tag-chip\{…\}` span/, 'the prompt names what it draws');
    const r = lattice(path.join(work, 'chip-listed.md'), '-o', path.join(work, 'chip-drawn.html'));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const html = fs.readFileSync(path.join(work, 'chip-drawn.html'), 'utf8');
    assert.match(html, /Status <span data-lattice-plugin="chip-plugin" data-kind="tag-chip"><span class="lp-chip-plugin-tag" data-tone="hot">Launch<\/span><\/span> and/);
    // A renderer that returns a block for a span: refused by the phrasing check, the span keeps its code, and the CLI says so.
    assert.match(html, /<code>@bad-chip\{x\}<\/code>/);
    assert.match(r.stderr, /chip-plugin did not draw 1 span \(on slide 1\); each stays code: the renderer returned a <div>/);
    assert.match(html, /<code data-lat-escaped="">@tag-chip\{kept\}<\/code>/, 'the escaped span is the author\'s literal, backslash off');
  });
});
