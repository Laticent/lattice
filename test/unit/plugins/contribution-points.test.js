/**
 * The four contribution points the icons plugin added to the host
 * (engineering/decisions/2026-09-29-inline-icons.md § 6a): `inline` (an inline-code kind in the
 * host's dispatch table), `services` (a function other code asks the host for), `registers` (a
 * front-matter axis register declared as data) and `data` (data a plugin's kernels read only
 * through lib/plugins/plugin-data.js). Each failure arm is proven on SYNTHETIC plugins, as
 * resolve.test.js proves the older points; the in-tree wiring is pinned at the end.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { resolvePlugins, INLINE_TAGS, HOST_REGISTERS } = require('../../../lib/plugins/resolve');

const INLINE_FNS = ['resolve', 'html', 'element', 'diagnose'];

/** A minimal plugin with only the new points. */
function plugin(name, contributes, exports = {}) {
  return {
    folder: name,
    manifest: { type: 'plugin', format: 1, name, api: 1, title: name, description: name, contributes },
    exports: {
      inline: Object.keys(contributes.inline || {}),
      inlineFns: Object.fromEntries(Object.keys(contributes.inline || {}).map((k) => [k, INLINE_FNS])),
      services: contributes.services || [],
      hasData: contributes.data === true,
      detect: true,
      ...exports,
    },
  };
}

const errorsOf = (plugins) => resolvePlugins(plugins).errors;
const expectError = (plugins, pattern) => {
  const errors = errorsOf(plugins);
  assert.ok(errors.some((e) => pattern.test(e)), `expected ${pattern}; got:\n${errors.join('\n') || '(none)'}`);
};

describe('contributes.inline', () => {
  test('a well-formed kind resolves', () => {
    assert.deepEqual(errorsOf([plugin('glyphs', { inline: { glyph: { sigil: '^' } } })]), []);
  });
  test('the sigil must be a Segno tag, and the spark keeps `~`', () => {
    expectError([plugin('a', { inline: { k: { sigil: '@' } } })], /"@", which is not a Segno tag character/);
    expectError([plugin('a', { inline: { k: { sigil: '~' } } })], /claims the sigil "~", which the host's spark already claims/);
  });
  test('two plugins cannot share a sigil or a kind name, nor take the host\'s', () => {
    expectError([plugin('a', { inline: { k: { sigil: '^' } } }), plugin('b', { inline: { j: { sigil: '^' } } })], /claims the sigil "\^", which plugin "a" \(k\) already claims/);
    expectError([plugin('a', { inline: { pill: { sigil: '^' } } })], /inline kind "pill", which the host already owns/);
  });
  test('the module must export every kind, with all four functions, and nothing undeclared', () => {
    expectError([plugin('a', { inline: { k: { sigil: '^' } } }, { inline: [] })], /declares inline kind "k" but its a\.inline\.js exports none/);
    expectError([plugin('a', { inline: { k: { sigil: '^' } } }, { inlineFns: { k: ['resolve', 'html'] } })], /inline kind "k" exports no element\(\)/);
    expectError([plugin('a', { services: ['x'] }, { inline: ['stray'] })], /exports inline kind "stray" that its manifest does not declare/);
  });
  test('an inline kind needs a detect, so a browser can fetch what it draws', () => {
    expectError([plugin('a', { inline: { k: { sigil: '^' } } }, { detect: false })], /contributes an inline kind but its syntax module exports no detect/);
  });
  test('the copied tag list matches Segno\'s', () => {
    const { TAGS } = require('../../../docs/src/lib/segno/dist/read.cjs');
    if (TAGS) assert.deepEqual([...INLINE_TAGS].sort(), [...TAGS].sort());
    const src = require('node:fs').readFileSync(require.resolve('../../../docs/src/lib/segno/notation-grammar.ts'), 'utf8');
    const m = /export const TAGS = '([^']*)'/.exec(src);
    assert.ok(m, 'Segno still declares TAGS as a string literal');
    assert.deepEqual([...INLINE_TAGS].sort(), [...m[1]].sort());
  });
});

describe('contributes.services and contributes.data', () => {
  test('services are one-to-one with the module', () => {
    expectError([plugin('a', { services: ['draw'] }, { services: [] })], /declares service "draw" but its a\.services\.js exports none/);
    expectError([plugin('a', { services: ['draw'] }, { services: ['draw', 'extra'] })], /exports service "extra" that its manifest does not declare/);
  });
  test('data is declared exactly when the file exists', () => {
    expectError([plugin('a', { data: true }, { hasData: false })], /declares data but has no a\.data\.generated\.js/);
    expectError([plugin('a', { services: ['x'] }, { hasData: true })], /ships a\.data\.generated\.js but its manifest does not declare data/);
  });
});

describe('contributes.registers', () => {
  const axes = { frame: ['framed', 'bare'], look: ['pigment', 'etching'] };
  test('a register resolves; a host key or a second owner fails', () => {
    assert.deepEqual(errorsOf([plugin('a', { registers: { badge: { axes } } })]), []);
    expectError([plugin('a', { registers: { spark: { axes } } })], /declares register "spark", which the host already owns/);
    expectError([plugin('a', { registers: { badge: { axes } } }), plugin('b', { registers: { badge: { axes } } })], /register "badge", which plugin "a" already owns/);
  });
  test('a word on two axes fails', () => {
    expectError([plugin('a', { registers: { badge: { axes: { frame: ['bare', 'x'], look: ['bare', 'y'] } } } })], /lists "bare" on both "frame" and "look"/);
  });
  test('every first-party axis register is on the host list', () => {
    assert.ok(HOST_REGISTERS.includes('spark'));
  });
});

describe('the register factory builds a plugin register as it builds spark:', () => {
  const { makeRegister } = require('../../../lib/core/register-factory');
  const { axisRegisterTokenAxis, axisRegisterClassesFromFrontMatter, PLUGIN_AXIS_REGISTERS } = require('../../../lib/core/axis-registers');
  test('words to classes, axis by axis, first word wins', () => {
    const r = makeRegister('badge', [{ axis: 'frame', names: ['framed', 'bare'] }, { axis: 'look', names: ['ink', 'tint'] }]);
    assert.deepEqual(r.classes('tint bare framed'), ['badge-bare', 'badge-tint']);
    assert.deepEqual(r.parse('bare nope bare').unknown, ['nope']);
    assert.equal(r.tokenAxis('badge-tint'), 'look');
    assert.equal(r.classesFromFrontMatter('badge: [bare, ink]\nx: 1').join(' '), 'badge-bare badge-ink');
  });
  test('the icons plugin\'s `icon:` register is built, and its axes never collide with spark\'s', () => {
    const icon = PLUGIN_AXIS_REGISTERS.find((r) => r.key === 'icon');
    assert.ok(icon, 'the icons manifest declares `icon:`');
    assert.equal(icon.plugin, 'icons');
    assert.deepEqual(axisRegisterClassesFromFrontMatter('spark: bare\nicon: etching rounded'), ['spark-bare', 'icon-etching', 'icon-rounded']);
    assert.equal(axisRegisterTokenAxis('icon-bare'), 'icon:frame');
    assert.equal(axisRegisterTokenAxis('spark-bare'), 'spark:frame');
  });
});

describe('services and plugin data at run time', () => {
  test('a service is handed out by name, and withheld when its plugin is off', () => {
    const { service } = require('../../../lib/plugins/services');
    assert.equal(typeof service('icons', 'drawHtml'), 'function');
    assert.equal(service('icons', 'drawHtml', new Set(['icons'])), null);
    assert.equal(service('icons', 'nope'), null);
    assert.equal(service('nope', 'drawHtml'), null);
    assert.equal(service('icons', 'constructor'), null, 'an Object member is not a service');
  });
  test('plugin data loads lazily, prefers a page global, and does not cache a miss', () => {
    // A fresh module instance, so this test owns its registry.
    const id = require.resolve('../../../lib/plugins/plugin-data');
    delete require.cache[id];
    const { provideData, pluginData } = require(id);
    let loads = 0;
    provideData('fake', () => { loads++; return { ok: 1 }; });
    assert.equal(loads, 0, 'registering loads nothing');
    assert.deepEqual(pluginData('fake'), { ok: 1 });
    pluginData('fake');
    assert.equal(loads, 1, 'loaded once');
    assert.equal(pluginData('absent'), null);
    globalThis.__latticePluginData = { absent: { late: true } };
    try {
      assert.deepEqual(pluginData('absent'), { late: true }, 'a miss is not cached, so data that arrives later is found');
    } finally {
      delete globalThis.__latticePluginData;
      delete require.cache[id];
    }
  });
  test('a Node render of a deck with no icon never loads the drawings', () => {
    const { execFileSync } = require('node:child_process');
    const out = execFileSync(process.execPath, ['-e', `
      const { createEngine } = require('./lib/engine');
      createEngine().render('---\\nmarp: true\\n---\\n\\n## A\\n\\n- \`{LIVE}\` \`~{1 2 3}\` \`[x]\`\\n');
      const loaded = Object.keys(require.cache).some((k) => k.endsWith('icons.data.generated.js'));
      createEngine().render('---\\nmarp: true\\n---\\n\\nA \`^{database}\`.\\n');
      const after = Object.keys(require.cache).some((k) => k.endsWith('icons.data.generated.js'));
      process.stdout.write(JSON.stringify({ loaded, after }));
    `], { cwd: require('node:path').join(__dirname, '../../..') }).toString();
    assert.deepEqual(JSON.parse(out), { loaded: false, after: true });
  });
});
