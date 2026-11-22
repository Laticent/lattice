/**
 * docs/src/lib/first-spot-class.mjs
 *
 * The Playground picker's read of a deck's first spot class, from the source PREFIX. Its own module beside its one user
 * (playground-controller.ts, which loads it on demand with `loadClassReader`), not part of lib/core/class-entries.mjs:
 * the Studio loads class-entries eagerly (the Coach reads it), so a function only the Playground needs would cost the
 * Studio's eager bytes there.
 *
 * Pure, fs-free, ESM.
 */

import { classEntries } from '../../../lib/core/class-entries.mjs';

/** A line that could hold a class setting: a `_class`/`class` comment or a record opener. A cheap superset. */
const mayHoldClass = (line) => line.includes('<!--') && (line.includes('class') || line.includes('{'));

/**
 * The first SPOT class of `source` (`classEntries(source).find((e) => e.spot)?.value`), reading only the PREFIX through
 * the first line that sets one, and on to that comment's `-->` for a record that wraps. Exact, not a guess: a line's
 * block role, and so every boundary above it, is decided by the lines above it (the contract `classDirectiveAt` rests
 * on). The Playground's picker asks this on every keystroke; on a 120-slide deck the whole-deck scan cost 1.8 ms and
 * this 0.14 ms. After three candidates that set nothing (fenced examples, plain comments) it reads the whole source.
 *
 * @param {string} source
 * @returns {string}
 */
export function firstSpotClass(source) {
  const src = String(source ?? '');
  const lines = src.split('\n');
  // Front matter first: a comment inside the YAML is no slide setting, and a prefix cut inside the open block would read
  // its `---` as a slide break and the comment as a class (the second checker on #3426). No closing line: read it all.
  let start = 0;
  if (/^\uFEFF?---[ \t]*\r?$/.test(lines[0] ?? '')) {
    const close = lines.findIndex((l, k) => k > 0 && /^(?:---|\.\.\.)[ \t]*\r?$/.test(l));
    if (close < 0) return classEntries(src).find((e) => e.spot)?.value ?? '';
    start = close + 1;
  }
  let tries = 0;
  for (let i = start; i < lines.length; i++) {
    if (!mayHoldClass(lines[i])) continue;
    if (++tries > 3) break;
    let end = i;
    while (end < lines.length - 1 && !lines[end].includes('-->')) end++;
    const hit = classEntries(lines.slice(0, end + 1).join('\n')).find((e) => e.spot);
    if (hit) return hit.value;
    i = end;
  }
  return classEntries(src).find((e) => e.spot)?.value ?? '';
}
