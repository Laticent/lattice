/**
 * lib/authoring/code-format/browser.mjs — the browser entry the Studio loads when the author formats
 * (docs/src/lib/ensure-code-format.ts), built by tools/build-code-format.js into
 * docs/public/playground/fmt/ with each formatter as its own chunk. Same planner and adapters as
 * `lattice fmt` (./fmt-cli.mjs).
 *
 * Results are kept per block (language, options, text), so formatting a deck again re-formats only
 * the blocks that changed.
 */

import { formatBlock } from './adapters.mjs';
import { applyFormat, planFormat } from './plan.mjs';

const cache = new Map();
const MAX_CACHE = 400;

/**
 * @param {string} markdown
 * @param {{ wasmUrl?: (file: string) => string }} env
 * @param {{ all?: boolean, claimed?: string[] }} [options]  `all`: every block a formatter reads
 *   (an explicit command); otherwise only the blocks that ask (format-on-blur)
 * @returns {Promise<{ markdown: string, changes: Array<{ from: number, to: number, insert: string }>,
 *   skipped: Array<{ lang: string, line: number, error: string }> }>}
 */
export async function formatMarkdown(markdown, env = {}, options = {}) {
  const plan = planFormat(markdown, options);
  const results = new Map();
  for (const job of plan.jobs) {
    if (!cache.has(job.id)) {
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
      cache.set(job.id, formatBlock(job, env));
    }
    results.set(job.id, await cache.get(job.id));
  }
  return applyFormat(markdown, plan, results, options);
}

export { wantsFormat } from './plan.mjs';
