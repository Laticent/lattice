/**
 * lib/core/first-spot-class.mjs
 *
 * The Playground picker's read of a deck's first spot class, from the source PREFIX. Its own module, not part of
 * class-entries.mjs: the Studio loads class-entries eagerly (the Coach reads it), and this function is only the
 * Playground's, which loads it on demand (docs/src/lib/playground-controller.ts `loadClassReader`), so it costs no
 * route eager bytes.
 *
 * Pure, fs-free, ESM.
 */

import { classEntries } from './class-entries.mjs';

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
  let tries = 0;
  for (let i = 0; i < lines.length; i++) {
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
