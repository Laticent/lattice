/**
 * Bake-off fixtures — REAL engine output, rendered on demand, never committed.
 *
 * A synthetic `<div>` tree flatters every parser equally and answers nothing. What
 * decides this question is the markup we actually parse: deep component nesting,
 * inline SVG with camelCase elements, baked Mermaid, KaTeX spans. So the harness
 * renders the committed gallery through `lib/engine` and slices it.
 *
 * Three sizes, because the answer changes with all three (see the decision note):
 *   slideMedian    the per-render unit the Studio's edit loop works in
 *   slideHeaviest  the worst single slide in the gallery
 *   deck           the whole 116-section gallery — the CLI export's unit
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = new URL('../../', import.meta.url);

let memo;

export async function fixtures() {
  if (memo) return memo;
  const engine = require(new URL('lib/engine', ROOT).pathname).createEngine({ mathOutput: 'html' });
  const src = readFileSync(new URL('test/integration/baseline-decks/gallery.md', ROOT), 'utf8');
  const { html } = engine.render(src, 'indaco');

  const sections = html.match(/<section\b[\s\S]*?<\/section>/g) || [];
  const bySize = sections.slice().sort((a, b) => a.length - b.length);

  memo = {
    deck: html,
    slideMedian: bySize[Math.floor(bySize.length / 2)] ?? html,
    slideHeaviest: bySize[bySize.length - 1] ?? html,
    sections: sections.length,
  };
  return memo;
}
