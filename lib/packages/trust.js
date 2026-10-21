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
 *
 * PINS (threat-model note 2026-10-16 §5.5): an npm plugin's approval is granted with `keep`, so
 * approving a second pin of one plugin keeps the first under that entry's `pins`, most recent first, up to
 * `MAX_PINS`. Two projects that pin different versions then stop replacing each other's approval at every
 * `lattice packages fetch`. A zip plugin and a component keep one approval, as before: a new one replaces it.
 * `trustOf` reads an entry for one digest; `revokeTrust` withdraws every pin of a name.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { pluginConsentText, pluginKindPins, pluginReturnFields } = require('./code-shape.mjs');

const VERSION = 1;
/** The OS layers an approval can be pinned to (lib/core/os-sandbox.js). */
const LAYERS = Object.freeze(['on', 'unmeasured', 'off']);
/** The most approvals one name keeps (the current one and its earlier pins). */
const MAX_PINS = 8;
const HEX64 = /^[0-9a-f]{64}$/;
// `at` is read only as a string: a hostile file's `{ toString: null }` must not throw on every render (the checker).
const approvalOf = (v, at = typeof v.at === 'string' ? v.at : '') => ({ sha256: v.sha256, at, ...(LAYERS.includes(v.layer) ? { layer: v.layer } : {}) });

/** The consent file: `$LATTICE_HOME/trust.json`, else `~/.lattice/trust.json`. */
function trustFile({ env = process.env } = {}) {
  const home = env.LATTICE_HOME ? path.resolve(env.LATTICE_HOME) : path.join(os.homedir(), '.lattice');
  return path.join(home, 'trust.json');
}

/**
 * The SHA-256 (hex) of a code package's code: its `transform.js`, the one script a code package
 * may carry (lib/packages/gate.js refuses any other), or a plugin's `render.js`. Null for a package
 * with neither.
 * @param {{ files: Record<string, string|Uint8Array>, roles: Record<string, string> }} pkg
 */
function codeDigest(pkg) {
  const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
  // A component's code is its `transform.js`, hashed as it is.
  const t = pkg?.roles?.['transform.js'];
  if (t) {
    const body = pkg.files[t];
    return sha(typeof body === 'string' ? body : Buffer.from(body));
  }
  // A plugin's is its `render.js`, the one fence its manifest declares, its inline kinds and its declared return fields (pluginConsentText).
  const r = pkg?.roles?.['render.js'];
  if (!r) return null;
  const fences = pkg.manifest?.contributes?.fences;
  const fence = fences && typeof fences === 'object' && !Array.isArray(fences) ? Object.keys(fences)[0] ?? '' : '';
  return pluginDigest(pkg.files[r], fence, pluginKindPins(pkg.manifest), pluginReturnFields(pkg.manifest));
}

/**
 * The SHA-256 (hex) a plugin's consent is pinned to, from its code, its fence, its inline kinds and its declared
 * return fields (`pluginConsentText`).
 * `code` may be the file's BYTES: they are hashed as they are, never decoded, because decoding drops a
 * leading BOM and turns an invalid byte into U+FFFD, so two different files could share a digest.
 */
function pluginDigest(code, fence, kinds = [], returns = []) {
  const [head, tail] = pluginConsentText('\u0001', String(fence ?? ''), kinds, returns).split('\u0001');
  return crypto.createHash('sha256').update(head).update(typeof code === 'string' ? code : Buffer.from(code)).update(tail).digest('hex');
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
    if (typeof v?.sha256 !== 'string' || !HEX64.test(v.sha256)) continue;
    const pins = (Array.isArray(v.pins) ? v.pins : []).filter((p) => typeof p?.sha256 === 'string' && HEX64.test(p.sha256) && p.sha256 !== v.sha256).slice(0, MAX_PINS - 1).map((p) => approvalOf(p));
    out[k] = { ...approvalOf(v), ...(pins.length ? { pins } : {}) };
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

/** The approval of `type/name` at exactly `sha256` in `entries` (from `readTrust`): the current one or a kept pin. */
function trustOf(entries, type, name, sha256) {
  const e = entries?.[key(type, name)];
  if (!e || !sha256) return undefined;
  return e.sha256 === sha256 ? approvalOf(e) : e.pins?.find((p) => p.sha256 === sha256);
}
/** Has the user approved exactly this code for `<type>/<name>`? */
function isTrusted(type, name, sha256, file = trustFile()) {
  return !!trustOf(readTrust(file), type, name, sha256);
}

/**
 * Record the user's yes for this code. Replaces an approval of earlier code under the same name.
 * `layer` is the OS sandbox layer the consent text showed (on, unmeasured, off), or null when it
 * could not be checked: a render that can only give the package a weaker one is refused.
 */
function grantTrust(type, name, sha256, { file = trustFile(), now = new Date(), layer = null, keep = false } = {}) {
  if (!HEX64.test(String(sha256))) throw new Error('grantTrust needs a SHA-256 in hex');
  const entries = readTrust(file);
  const was = entries[key(type, name)];
  // `keep`: the earlier approvals of this name stay, as pins, so another project's pin still runs.
  const pins = keep && was ? [approvalOf(was), ...(was.pins ?? [])].filter((p) => p.sha256 !== sha256).slice(0, MAX_PINS - 1) : [];
  entries[key(type, name)] = { sha256, at: now.toISOString(), ...(LAYERS.includes(layer) ? { layer } : {}), ...(pins.length ? { pins } : {}) };
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

module.exports = { trustFile, codeDigest, pluginDigest, readTrust, trustOf, isTrusted, grantTrust, revokeTrust, MAX_PINS };
