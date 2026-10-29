/**
 * Facts about a parse: what it capped, what in the input is odd, and what no node covered.
 *
 * Segno reports facts and callers decide what they mean
 * (engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md §1). Nothing here names a
 * browser, a URL or a policy: a fact stays true as browsers change, and every grammar gets it free.
 *
 * It is a separate call, not a field on every parse result, because the result is the hot path (the
 * notation parses a span in about 130 ns) and most callers never ask. `facts()` costs one pass over
 * the input and one walk over the top level of the tree, and only for the caller that wants them.
 *
 *   limits     which runtime cap stopped the parse: `depth` (the nesting cap, an ordinary error at
 *              the deepest point), `stack` (the call stack ran out first) or `nodes` (`maxNodes`).
 *   anomalies  characters a reader should not take as ordinary text, as merged runs of one kind.
 *   coverage   how far the parse read, and the ranges inside that no top-level node spans: text a
 *              rule consumed and did not mark, which a later stage may still interpret.
 */

import type { FlatTree } from './flat.js';
import { depthOf, type GrammarSpec, type Node, type ParseError } from './grammar.js';

/** A run of one kind of odd character, as UTF-16 offsets `[from, to)`. */
export interface Anomaly {
  readonly kind: AnomalyKind;
  readonly from: number;
  readonly to: number;
}

/**
 * - `nul`: U+0000.
 * - `lone-surrogate`: a high surrogate not followed by a low one, or a low one not preceded by a high.
 * - `bidi-control`: an embedding, override or isolate (U+202A-202E, U+2066-2069), the "Trojan
 *   Source" class: text that displays in an order other than the one it is read in.
 * - `zero-width`: U+200B-200D, U+2060, and U+FEFF anywhere but offset 0.
 * - `c1-control`: U+0080-009F, which no keyboard types and some decoders read as Windows-1252.
 * - `cr-without-lf`: a carriage return not followed by a line feed (S0 folds line endings, so after
 *   ingest this means the text did not come through S0).
 * - `bom`: U+FEFF at offset 0.
 */
export type AnomalyKind = 'nul' | 'lone-surrogate' | 'bidi-control' | 'zero-width' | 'c1-control' | 'cr-without-lf' | 'bom';

export interface Anomalies {
  /** Merged runs, in input order, at most `max` of them. */
  readonly spans: readonly Anomaly[];
  /** Characters of each kind, counted over the WHOLE input even past `max`. */
  readonly counts: Readonly<Partial<Record<AnomalyKind, number>>>;
  /** True when there were more runs than `max` and `spans` stops early. */
  readonly truncated: boolean;
}

/** How many runs `anomalies()` and `coverage()` list before they stop and say so. */
export const MAX_FACT_SPANS = 1000;

// Every character that can start an anomaly. A clean input (almost every input) is answered by
// this one native search and never reaches the loop.
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this looks for
const SUSPECT = /[\u0000\r\u0080-\u009f​-‍‪-‮⁠⁦-⁩﻿\ud800-\udfff]/;

function kindAt(s: string, i: number): AnomalyKind | null {
  const c = s.charCodeAt(i);
  if (c === 0) return 'nul';
  if (c === 13) return s.charCodeAt(i + 1) === 10 ? null : 'cr-without-lf';
  if (c >= 0x80 && c <= 0x9f) return 'c1-control';
  if ((c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) return 'bidi-control';
  if (c === 0xfeff) return i === 0 ? 'bom' : 'zero-width';
  if ((c >= 0x200b && c <= 0x200d) || c === 0x2060) return 'zero-width';
  if (c >= 0xd800 && c <= 0xdbff) {
    const d = s.charCodeAt(i + 1); // NaN past the end: not a low surrogate
    return d >= 0xdc00 && d <= 0xdfff ? null : 'lone-surrogate';
  }
  if (c >= 0xdc00 && c <= 0xdfff) {
    const b = i > 0 ? s.charCodeAt(i - 1) : -1;
    return b >= 0xd800 && b <= 0xdbff ? null : 'lone-surrogate';
  }
  return null;
}

/** The odd characters in `input`, found in one pass. Independent of any grammar. */
export function anomalies(input: string, max = MAX_FACT_SPANS): Anomalies {
  const spans: Anomaly[] = [];
  const counts: Partial<Record<AnomalyKind, number>> = {};
  let truncated = false;
  if (!SUSPECT.test(input)) return { spans, counts, truncated };
  let run: { kind: AnomalyKind; from: number; to: number } | null = null;
  const close = () => {
    if (!run) return;
    if (spans.length < max) spans.push(run);
    else truncated = true;
    run = null;
  };
  for (let i = 0; i < input.length; i++) {
    const k = kindAt(input, i);
    if (k === null) { close(); continue; }
    counts[k] = (counts[k] ?? 0) + 1;
    if (run && run.kind === k && run.to === i) run.to = i + 1;
    else { close(); run = { kind: k, from: i, to: i + 1 }; }
  }
  close();
  return { spans, counts, truncated };
}

/** Which runtime cap stopped a parse, or none. */
export type Limit = { readonly cap: 'depth' | 'stack' | 'nodes'; readonly at: number } | null;

/**
 * The cap a failed parse hit. `depth` is recognized by the exact message both runtimes write at the
 * cap, which `spec` sets, so pass the spec the parser was built from.
 */
export function limitOf(spec: GrammarSpec, error: ParseError | null | undefined): Limit {
  if (!error) return null;
  if (error.code === 'stack' || error.code === 'nodes') return { cap: error.code, at: error.at };
  if (error.expected === `at most ${depthOf(spec)} levels of nesting`) return { cap: 'depth', at: error.at };
  return null;
}

export interface Coverage {
  /** The parse read `[0, read)`: the whole input on success, up to the error on failure. */
  readonly read: number;
  /**
   * The ranges inside `[0, read)` that no top-level node spans, at most `max` of them; `null` after a
   * failed parse, which keeps no tree, so what was marked before the error is not known.
   */
  readonly unmarked: ReadonlyArray<readonly [number, number]> | null;
  readonly truncated: boolean;
}

/** Coverage from the top-level nodes of a tree, either shape. */
export function coverage(input: string, result: { ok: true; node?: Node; tree?: FlatTree } | { ok: false; error: ParseError }, max = MAX_FACT_SPANS): Coverage {
  if (!result.ok) {
    const read = Math.min(result.error.at, input.length);
    return { read, unmarked: null, truncated: false };
  }
  const tops: Array<[number, number]> = [];
  if (result.tree) for (let k = 0; k < result.tree.top; k = result.tree.buf[k + 3]) tops.push([result.tree.buf[k + 1], result.tree.buf[k + 2]]);
  else if (result.node) for (const kid of result.node.kids) tops.push([kid.from, kid.to]);
  const unmarked: Array<[number, number]> = [];
  let truncated = false;
  let at = 0;
  const gap = (to: number) => {
    if (to <= at) return;
    if (unmarked.length < max) unmarked.push([at, to]);
    else truncated = true;
  };
  // Top-level nodes are siblings, in order and disjoint, so each one starts at or after the last one's end.
  for (const [from, to] of tops) {
    gap(from);
    at = to;
  }
  gap(input.length);
  return { read: input.length, unmarked, truncated };
}

export interface Facts {
  readonly limits: Limit;
  readonly anomalies: Anomalies;
  readonly coverage: Coverage;
}

/**
 * Every fact about one parse of `input` by a parser built from `spec`: `compile(spec).parse` or the
 * parser `generate(spec)` writes. Read a generated parser's result BEFORE its next parse: the tree
 * is in a shared buffer (flat.ts).
 */
export function facts(spec: GrammarSpec, input: string, result: { ok: true; node?: Node; tree?: FlatTree } | { ok: false; error: ParseError }): Facts {
  return {
    limits: result.ok ? null : limitOf(spec, result.error),
    anomalies: anomalies(input),
    coverage: coverage(input, result),
  };
}
