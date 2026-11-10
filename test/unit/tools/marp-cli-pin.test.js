// The marp-cli the Export-to-Marp suites render with (test/helpers/marp-cli.js) is the marp-cli the export bundle and the
// copy-and-go kit tell a recipient to run: one exact version, the same in both places. Checked here too, where it needs no
// install, so a bump of either one alone fails on every machine.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pinnedVersion } = require('../../helpers/marp-cli.js');
const { MARP_CLI_VERSION } = require('../../../lib/export/marp-bundle.js');

test('the committed marp-cli pin IS the version recipients are told to run', () => {
  assert.match(MARP_CLI_VERSION, /^\d+\.\d+\.\d+$/, 'an exact version, never a range');
  assert.equal(pinnedVersion(), MARP_CLI_VERSION);
});

test('every place a recipient reads it names that exact version', () => {
  const { readme, packageJson } = require('../../../lib/export/marp-bundle.js');
  const pkg = packageJson('deck');
  assert.equal(pkg.dependencies['@marp-team/marp-cli'], MARP_CLI_VERSION);
  assert.ok(readme({ name: 'deck', palette: 'cuoio', themes: ['cuoio'], agent: false }).includes(`@marp-team/marp-cli@${MARP_CLI_VERSION} `));
  const kitReadme = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', '..', 'dist', 'marp-kit', 'README.md'), 'utf8');
  assert.ok(kitReadme.includes(`@marp-team/marp-cli@${MARP_CLI_VERSION} `), 'the kit README');
  assert.ok(!/marp-cli@[\^~]|marp-cli@\d+ /.test(kitReadme), 'no range and no bare major in the kit README');
});
