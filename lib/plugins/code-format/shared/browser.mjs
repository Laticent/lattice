/**
 * lib/plugins/code-format/shared/browser.mjs — the browser entry the docs site loads above its render
 * (docs/src/lib/ensure-code-format.ts), built by tools/build-code-format.js into
 * docs/public/playground/fmt/ with each formatter as its own chunk. Same plan and adapters as the CLI.
 *
 * Results are kept per block (language, options, text), so typing in one block of a deck does not
 * re-format the others, and a block typed back to what it was formats from memory.
 */

import { formatBlock } from './adapters.mjs';
import { applyFormat, planFormat, wantsFormat } from './plan.mjs';

const cache = new Map();
const MAX_CACHE = 400;

/**
 * @param {string} markdown
 * @param {{ wasmUrl?: (file: string) => string }} env
 * @returns {Promise<{ markdown: string, skipped: Array<{ lang: string, line: number, error: string }> }>}
 */
export async function formatMarkdown(markdown, env = {}) {
  if (!wantsFormat(markdown)) return { markdown, skipped: [] };
  const jobs = planFormat(markdown);
  const results = new Map();
  for (const job of jobs) {
    if (!job.supported) continue;
    if (!cache.has(job.id)) {
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
      cache.set(job.id, formatBlock(job, env));
    }
    results.set(job.id, await cache.get(job.id));
  }
  return applyFormat(markdown, jobs, results);
}
