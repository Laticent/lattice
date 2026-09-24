/**
 * Read ONE entry out of a zip from someone else, with a running byte cap that stops the
 * inflate as soon as it is crossed — ONE copy, used by the Studio's imports
 * (docs/src/components/studio/zip-limits.ts) and the CLI's `lattice packages add`.
 *
 * Both readers first refuse on the sizes the archive DECLARES. An archive can lie about them,
 * and `entry.async()` inflates the whole entry before anything can count it, so the running
 * total used to catch a liar only after its one oversized entry had inflated in full (up to
 * the zip's own 25 MB at DEFLATE's ~1000:1, i.e. gigabytes, in a browser tab). This reads the
 * entry through JSZip's `internalStream`, which inflates in chunks, and stops at the first
 * chunk that takes the total past the cap. JSZip's own size check only runs at the END of an
 * entry, so it can't do this. The bound is not exact: pako inflates one 16 KiB compressed
 * chunk synchronously, so after the pause up to that chunk's output (about 16 MB at a
 * 1000:1 ratio, measured) is produced and dropped.
 *
 * A dependency-free leaf: the caller passes the JSZip entry in, and the docs dev server can
 * default-import it (docs/src/plugins/vite-cjs-lib-dev.mjs).
 */

/**
 * @typedef {{ used: number, max: number, message: string }} ReadBudget
 *   `used` is shared by every read against it; `message` is what the refusal says.
 */

/**
 * Inflate one entry, charging every chunk to `budget`. Rejects with `Error(budget.message)`
 * the moment the running total passes `budget.max`, and pauses the stream there.
 * @param {{ internalStream: (type: string) => any }} entry  a JSZip file object
 * @param {'string'|'uint8array'} type
 * @param {ReadBudget} budget
 * @returns {Promise<string|Uint8Array>}
 */
function readEntryCapped(entry, type, budget) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let settled = false;
    const stream = entry.internalStream(type);
    stream
      .on('data', (chunk) => {
        if (settled) return;
        budget.used += chunk.length;
        if (budget.used > budget.max) {
          settled = true;
          stream.pause();
          reject(new Error(budget.message));
          return;
        }
        parts.push(chunk);
      })
      .on('error', (e) => {
        if (settled) return;
        settled = true;
        reject(e);
      })
      .on('end', () => {
        if (settled) return;
        settled = true;
        if (type === 'string') return resolve(parts.join(''));
        const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
        let at = 0;
        for (const p of parts) {
          out.set(p, at);
          at += p.length;
        }
        resolve(out);
      })
      .resume();
  });
}

module.exports = { readEntryCapped };
