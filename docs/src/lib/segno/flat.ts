/**
 * The flat tree a generated parser writes: four integers per node, in preorder, in one reused
 * buffer — `kind`, `from`, `to`, and `next` (the index just past this node's subtree). A node's
 * children are the nodes from `at + 4` up to `next`, each one skipping to its own `next`.
 *
 * It exists for speed. A tree of objects costs an object and an array per node and a garbage
 * collection behind them; this costs nothing per parse once the buffer has grown to the size
 * of the largest span seen. The buffer is REUSED, so a tree is valid only until the next parse
 * — read it (notation.ts does) before parsing again.
 */

import type { Node } from './grammar.js';

export interface FlatTree {
  readonly buf: Int32Array;
  /** The index just past the last node. Top-level nodes start at 0. */
  readonly top: number;
  /** Kind names, indexed by the first integer of each node. */
  readonly kinds: readonly string[];
}

/** Rebuild the object tree `compile()` produces — for tests that compare the two parsers. */
export function toNodes(t: FlatTree, kind: string, from: number, to: number): Node {
  const read = (lo: number, hi: number): Node[] => {
    const out: Node[] = [];
    for (let k = lo; k < hi; k = t.buf[k + 3]) out.push({ kind: t.kinds[t.buf[k]], from: t.buf[k + 1], to: t.buf[k + 2], kids: read(k + 4, t.buf[k + 3]) });
    return out;
  };
  return { kind, from, to, kids: read(0, t.top) };
}
