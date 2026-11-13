// Run an async function over a list with at most `jobs` calls in flight.
//
// The one bounded-concurrency helper for tools/. Each worker takes the next item in list order,
// so the items START in order; they can FINISH in any order, and `results[k]` is always the
// result for `items[k]`. Before starting an item a worker asks `stop()`. Once it says yes, no
// new item starts, the ones in flight finish, and the items never started come back as `left`
// (a nightly job uses this to stop starting work at its deadline). A throw from `fn` rejects
// the whole call, as `Promise.all` does; a caller that wants to carry on catches inside `fn`.
//
//   const { results, left } = await pool(files, 4, render, { stop: () => Date.now() >= deadline });

const os = require('node:os');

/** Worker count for CPU-bound work: one per core the process may use. */
const defaultJobs = () => Math.max(1, typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length);

/**
 * @template T, R
 * @param {T[]} items
 * @param {number} jobs at most this many `fn` calls in flight (at least 1)
 * @param {(item: T, index: number) => Promise<R> | R} fn
 * @param {{ stop?: () => boolean }} [opts]
 * @returns {Promise<{ results: R[], done: T[], left: T[] }>}
 */
async function pool(items, jobs, fn, { stop = () => false } = {}) {
  const results = Array.from({ length: items.length });
  const started = new Array(items.length).fill(false);
  let next = 0;
  const worker = async () => {
    while (next < items.length && !stop()) {
      const k = next++;
      started[k] = true;
      results[k] = await fn(items[k], k);
    }
  };
  const n = Math.max(1, Math.min(Math.floor(jobs) || 1, items.length));
  await Promise.all(Array.from({ length: n }, worker));
  return {
    results,
    done: items.filter((_, k) => started[k]),
    left: items.filter((_, k) => !started[k]),
  };
}

module.exports = { pool, defaultJobs };
