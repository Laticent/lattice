/**
 * `npx -y <pkg>` from several test FILES at once corrupts npx's shared download cache
 * (`~/.npm/_npx/<hash>`): two processes unpacking the same package into one directory leave
 * `puppeteer-core` half-written, and every marp-cli call after that dies with "Cannot find module".
 * Three export tests fetch marp-cli this way; whenever two land in one CI shard they race (shard 1
 * failed twice on 2026-10-12 after new test files moved the shard boundaries).
 *
 * `npxSync` serializes the FIRST call of each process behind a cross-process lock directory. By the
 * time the next process gets the lock, the cache is warm and its call only reads. Later calls in the
 * same process skip the lock: a warm cache is never written.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const LOCK = path.join(os.tmpdir(), 'lattice-npx-fetch.lock');
// The first call downloads marp-cli and its dependencies from the npm registry. Every marp flake in
// the 2026-10-22..30 census (10 of the render tier's 16 flaky legs) was this download killed at the
// callers' 90 s probe limit ("could not fetch marp-cli (exit null)"): a slow registry, not an error.
// So the fetching call gets at least this long. Retrying instead would restart into the cache a
// killed download can leave half-written, which is the corruption the lock below exists to prevent.
const FETCH_TIMEOUT_MS = 5 * 60 * 1000;
const WAIT_MS = 5 * 60 * 1000;
const STALE_MS = 10 * 60 * 1000;
let warmed = false;

const nap = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function acquire() {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    try {
      fs.mkdirSync(LOCK);
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') return false;
      try {
        if (Date.now() - fs.statSync(LOCK).mtimeMs > STALE_MS) fs.rmdirSync(LOCK); // a crashed holder
      } catch { /* released between the two calls */ }
      if (Date.now() > deadline) return false; // run unlocked rather than hang the suite
      nap(500);
    }
  }
}

/** `spawnSync('npx', args, opts)`, with the first call of this process holding the fetch lock and at least `FETCH_TIMEOUT_MS`. */
function npxSync(args, opts) {
  if (warmed) return spawnSync('npx', args, opts);
  const held = acquire();
  try {
    const timeout = opts?.timeout ? Math.max(opts.timeout, FETCH_TIMEOUT_MS) : undefined;
    return spawnSync('npx', args, { ...opts, timeout });
  } finally {
    warmed = true;
    if (held) try { fs.rmdirSync(LOCK); } catch { /* already gone */ }
  }
}

module.exports = { npxSync };
