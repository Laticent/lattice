// The Marp versions Lattice supports are a RANGE, held at both ends (MARP_SUPPORT, lib/export/marp-bundle.js; engineering/
// decisions/2026-11-10-marp-version-range.md). This holds the per-PR end and every place a recipient reads the range: the
// marp-cli the Marp suites render with (test/fixtures/marp-cli, test/helpers/marp-cli.js) is the stated FLOOR, marp-cli and
// marp-core both, and the bundle and the kit say the range and the line generated from it. Checked here too, where it needs no
// install, so a floor that moves without the pin fails on every machine.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pinnedVersion, pinnedCore } = require('../../helpers/marp-cli.js');
const { MARP_SUPPORT, marpSupportLine, readme, packageJson } = require('../../../lib/export/marp-bundle.js');

test('the committed pin IS the floor Lattice states, marp-cli and marp-core both', () => {
  assert.equal(pinnedVersion(), MARP_SUPPORT.cli.floor);
  assert.equal(pinnedCore(), MARP_SUPPORT.core.floor);
  assert.equal(MARP_SUPPORT.cli.range, `^${MARP_SUPPORT.cli.floor}`, 'the range starts at the floor CI renders on');
  assert.equal(MARP_SUPPORT.cli.major, MARP_SUPPORT.cli.floor.split('.')[0]);
});

test('every place a recipient reads it names the range, never an exact version', () => {
  assert.equal(packageJson('deck').dependencies['@marp-team/marp-cli'], MARP_SUPPORT.cli.range);
  const bundle = readme({ name: 'deck', palette: 'cuoio', themes: ['cuoio'], agent: false });
  const kit = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'dist', 'marp-kit', 'README.md'), 'utf8');
  for (const [where, text] of [['bundle README', bundle], ['kit README', kit]]) {
    // The major only: cmd.exe takes a pasted `^` as an escape character.
    assert.ok(text.includes(`npx @marp-team/marp-cli@${MARP_SUPPORT.cli.major} `), `${where}: the npx line names the major`);
    assert.ok(!/marp-cli@(?:[\^~]|\d+\.\d+)/.test(text), `${where}: no range syntax and no exact version in an npx line`);
    assert.ok(text.includes(marpSupportLine()), `${where}: the generated support line`);
  }
});

test('the support line says what CI renders and what was checked by hand, with the date', () => {
  const line = marpSupportLine();
  assert.match(line, new RegExp(`marp-cli ${MARP_SUPPORT.cli.floor.replace(/\./g, '\\.')} with marp-core ${MARP_SUPPORT.core.floor.replace(/\./g, '\\.')}`));
  for (const [ver, on] of MARP_SUPPORT.vscode.checked) {
    assert.ok(line.includes(ver), ver);
    assert.match(on, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.equal(MARP_SUPPORT.vscode.checked[0][0], MARP_SUPPORT.vscode.floor, 'the VS Code floor is one of the versions driven by hand');
});
