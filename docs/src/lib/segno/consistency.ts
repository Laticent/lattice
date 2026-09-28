/**
 * One spelling per document.
 *
 * Aliases and shortcuts let an author write `[x]`, `{done}` or `{yes}` for the same state. That
 * is a kindness per span and a mess per document, so the host collects every Spelling its spans
 * bound (schema.ts) and asks this module which ones disagree. A "document" is whatever the host
 * groups by — a file, a config, a slide deck (Lattice checks one deck at a time). For each (slot,
 * parameter, value) written more than one way, the spelling used MOST is the house form, and every
 * other occurrence gets a warning with a fix to it. A tie goes to the spelling that appears first,
 * so the answer never depends on anything but the uses passed in.
 */

import type { Diagnostic } from './notation.js';
import type { Spelling } from './schema.js';

export interface Use extends Spelling {
  /** Which slot bound it: "badge", "state". Spellings are only compared within one slot. */
  readonly slot: string;
  /** Where the span is in the document — any stable key the host can map back (a line, an offset). */
  readonly where: string;
}

export interface Inconsistency {
  readonly use: Use;
  readonly preferred: string;
  readonly diagnostic: Diagnostic;
}

/** Every use written differently from its group's most common spelling. */
export function consistency(uses: readonly Use[]): Inconsistency[] {
  const groups = new Map<string, Use[]>();
  for (const u of uses) {
    const key = `${u.slot}\u0000${u.param}\u0000${u.canonical}`;
    const g = groups.get(key);
    if (g) g.push(u);
    else groups.set(key, [u]);
  }
  const out: Inconsistency[] = [];
  for (const g of groups.values()) {
    const counts = new Map<string, number>();
    for (const u of g) counts.set(u.written, (counts.get(u.written) ?? 0) + 1);
    if (counts.size < 2) continue;
    let preferred = g[0].written;
    for (const [w, n] of counts) if (n > (counts.get(preferred) ?? 0)) preferred = w;
    const preferShortcut = g.some((u) => u.written === preferred && u.shortcut);
    for (const u of g) {
      if (u.written === preferred) continue;
      const message = `"${u.canonical}" is written "${preferred}" ${counts.get(preferred)} time(s) elsewhere and "${u.written}" here — pick one`;
      out.push({ use: u, preferred, diagnostic: { code: 'mixed-spelling', severity: 'warning', message, from: u.from, to: u.to, ...fixFor(u, preferred, preferShortcut) } });
    }
  }
  return out;
}

/**
 * The edit that rewrites `u` in the preferred spelling. A word replaces a word in place. A
 * shortcut stands for a whole span, so swapping to or from one rewrites the span — and only
 * when the spelling is alone in it, since `{done, "Shipped"}` has no shortcut form. No fix is
 * better than one that drops what the author wrote.
 */
function fixFor(u: Use, preferred: string, preferShortcut: boolean): { fix?: Diagnostic['fix'] } {
  if (!u.shortcut && !preferShortcut) return { fix: { from: u.from, to: u.to, insert: preferred } };
  if (!u.alone) return {};
  return { fix: { from: u.alone.from, to: u.alone.to, insert: preferShortcut ? preferred : `{${preferred}}` } };
}
