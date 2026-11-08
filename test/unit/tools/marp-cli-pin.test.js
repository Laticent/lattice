// The pinned marp-cli the Export-to-Marp suites run (test/helpers/marp-cli.js) must sit inside the range the export
// bundle tells recipients to run. Checked here too, where it needs no install, so a range bump that leaves the pin
// behind fails on every machine.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { insideCaret, pinnedVersion } = require('../../helpers/marp-cli.js');
const { MARP_CLI_RANGE } = require('../../../lib/export/marp-bundle.js');

test('the committed marp-cli pin is an exact version inside MARP_CLI_RANGE', () => {
  assert.ok(insideCaret(pinnedVersion(), MARP_CLI_RANGE), `pin ${pinnedVersion()} vs range ${MARP_CLI_RANGE}`);
});

test('insideCaret: same major, at or above the floor, exact versions and caret ranges only', () => {
  for (const [pin, range, want] of [
    ['4.5.1', '^4.3.1', true], ['4.3.1', '^4.3.1', true], ['4.10.0', '^4.3.1', true],
    ['4.3.0', '^4.3.1', false], ['4.2.9', '^4.3.1', false], ['5.0.0', '^4.3.1', false],
    ['4.5', '^4.3.1', false], ['4.5.1', '>=4.3.1', false], ['0.3.0', '^0.2.0', false],
  ]) assert.equal(insideCaret(pin, range), want, `${pin} in ${range}`);
});
