/**
 * CONSENT for code packages, pinned to the bytes (engineering/decisions/2026-09-23-portable-packages.md
 * §3.5 point 1; the contract note 2026-09-24-code-package-contract.md §9).
 *
 * A user says yes to ONE package's code, identified by the SHA-256 of its `transform.js`. The
 * answer is recorded here against that digest, so a package whose code changes (an update, a
 * hand edit in the store, a different zip under the same name) asks again: its digest no longer
 * matches what the user approved.
 *
 * WHERE: `$LATTICE_HOME/trust.json`, else `~/.lattice/trust.json`. Deliberately NOT inside the
 * package store: `lattice packages add` writes only package folders, and a zip can't carry a
 * file that grants itself consent. `--packages <dir>` changes where packages are read from for
 * one run, never where consent is kept, so pointing a render at a stranger's folder of packages
 * does not bring their approvals with it.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const VERSION = 1;
/** The OS layers an approval can be pinned to (lib/core/os-sandbox.js). */
const LAYERS = Object.freeze(['on', 'unmeasured', 'off']);

/** The consent file: `$LATTICE_HOME/trust.json`, else `~/.lattice/trust.json`. */
function trustFile({ env = process.env } = {}) {
  const home = env.LATTICE_HOME ? path.resolve(env.LATTICE_HOME) : path.join(os.homedir(), '.lattice');
  return path.join(home, 'trust.json');
}

/**
 * The SHA-256 (hex) of a code package's code: its `transform.js`, the one script a code package
 * may carry (lib/packages/gate.js refuses any other). Null for a package with no transform.
 * @param {{ files: Record<string, string|Uint8Array>, roles: Record<string, string> }} pkg
 */
function codeDigest(pkg) {
  const f = pkg?.roles?.['transform.js'];
  if (!f) return null;
  const body = pkg.files[f];
  return crypto.createHash('sha256').update(typeof body === 'string' ? body : Buffer.from(body)).digest('hex');
}

const key = (type, name) => `${type}/${name}`;

/** Every recorded approval, `{ "<type>/<name>": { sha256, at } }`. A missing or unreadable file is none. */
function readTrust(file = trustFile()) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
  const out = {};
  if (raw?.version !== VERSION || !raw.trusted || typeof raw.trusted !== 'object') return out;
  for (const [k, v] of Object.entries(raw.trusted)) {
    if (typeof v?.sha256 === 'string' && /^[0-9a-f]{64}$/.test(v.sha256)) out[k] = { sha256: v.sha256, at: String(v.at ?? ''), ...(LAYERS.includes(v.layer) ? { layer: v.layer } : {}) };
  }
  return out;
}

function writeTrust(entries, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Beside the target, then renamed over it: a write that fails part-way keeps the old approvals.
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ version: VERSION, trusted: entries }, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Has the user approved exactly this code for `<type>/<name>`? */
function isTrusted(type, name, sha256, file = trustFile()) {
  return !!sha256 && readTrust(file)[key(type, name)]?.sha256 === sha256;
}

/**
 * Record the user's yes for this code. Replaces an approval of earlier code under the same name.
 * `layer` is the OS sandbox layer the consent text showed (on, unmeasured, off), or null when it
 * could not be checked: a render that can only give the package a weaker one is refused.
 */
function grantTrust(type, name, sha256, { file = trustFile(), now = new Date(), layer = null } = {}) {
  if (!/^[0-9a-f]{64}$/.test(String(sha256))) throw new Error('grantTrust needs a SHA-256 in hex');
  const entries = readTrust(file);
  entries[key(type, name)] = { sha256, at: now.toISOString(), ...(LAYERS.includes(layer) ? { layer } : {}) };
  writeTrust(entries, file);
}

/** Withdraw an approval. Returns whether there was one. */
function revokeTrust(type, name, { file = trustFile() } = {}) {
  const entries = readTrust(file);
  if (!entries[key(type, name)]) return false;
  delete entries[key(type, name)];
  writeTrust(entries, file);
  return true;
}

module.exports = { trustFile, codeDigest, readTrust, isTrusted, grantTrust, revokeTrust };
