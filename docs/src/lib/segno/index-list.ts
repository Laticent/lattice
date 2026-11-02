/**
 * index-list.ts — the index list: `3-5 9`, space-separated 1-based indices and ranges, read into the set
 * of indices they name (`{3, 4, 5, 9}`). Lattice reads it in three places that must agree: a slide's
 * `_focus: line 3-5 9`, the code plugin's `@code{focus=…, mark=…}` and the linter, so one reader serves
 * all three.
 *
 * A token that is not a number or a range is skipped, and so is a range wider than `MAX_INDEX_SPAN`
 * (a typo, not a request: expanding `1-20000000` once took 7 s and then threw out of the Set). A caller
 * that reports problems passes `invalid`, which collects each skipped token as written.
 */

/** The widest range `readIndexList` expands; a slide's list or code block is a few dozen entries. */
export const MAX_INDEX_SPAN = 10000;

export function readIndexList(text: string, invalid?: string[]): Set<number> {
  const out = new Set<number>();
  for (const tok of String(text).trim().split(/\s+/)) {
    if (!tok) continue;
    const r = /^(\d+)(?:-(\d+))?$/.exec(tok);
    if (!r) {
      invalid?.push(tok);
      continue;
    }
    const a = Number(r[1]);
    const b = r[2] ? Number(r[2]) : a;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (hi - lo >= MAX_INDEX_SPAN) {
      invalid?.push(tok);
      continue;
    }
    for (let i = lo; i <= hi; i++) out.add(i);
  }
  return out;
}
