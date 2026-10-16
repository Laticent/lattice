/**
 * lib/conformance — the contract registry: every `kinds/<kind>.contract.js`, found by listing the
 * folder, so a new contract is run the day its file exists and cannot be forgotten off a list.
 * Design: engineering/decisions/2026-10-15-conformance-harness.md §6.
 */
const fs = require('node:fs');
const path = require('node:path');

const KINDS_DIR = path.join(__dirname, 'kinds');

/** Every contract, sorted by kind. */
function loadContracts() {
  return fs.readdirSync(KINDS_DIR)
    .filter((f) => f.endsWith('.contract.js'))
    .sort()
    .map((f) => require(path.join(KINDS_DIR, f)));
}

module.exports = { loadContracts, KINDS_DIR, ...require('./run'), ...require('./ledger'), ...require('./contract') };
