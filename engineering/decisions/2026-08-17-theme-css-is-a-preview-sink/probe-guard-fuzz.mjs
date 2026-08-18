/**
 * §9.7's fuzz claim, made checkable.
 *
 * 300,000 token-biased cases against an INDEPENDENTLY WRITTEN oracle — a regex derived from
 * the rule rather than from the implementation, so a shared bug cannot hide in both. The
 * alphabet is seeded with the terminator and its near-misses (`</styl`, `</styles`,
 * `<</style`, `</style/`, an already-escaped `<\/style`) plus lone surrogates.
 *
 * Committed because §9.7 asserted this result with nothing behind it, and §9.4's own lesson
 * is that a number nobody can re-derive is a number nobody checked.
 *
 *   node engineering/decisions/2026-08-17-theme-css-is-a-preview-sink/probe-guard-fuzz.mjs
 */
import { sanitizeStyleText } from '../../../lib/core/sanitize-style-text.mjs';

// Independent oracle: a regex written from the RULE ("a `</` immediately followed by
// style, ASCII-case-insensitively, gets a backslash between `<` and `/`").

const BS = String.fromCharCode(92);
const oracle = (s) => String(s).replace(/<\/(?=[sS][tT][yY][lL][eE])/g, '<' + BS + '/');
// Token alphabet biased so the terminator and its near-misses actually occur.
const toks = ['</style', '</STYLE', '</StYlE', '</styl', '</styles', '</styl e', '<', '/', '</', '<<', '//',
              's','t','y','l','e','S','x', BS, '>', ' ', '\t', '\n', '\uD800', '\uDC00', '</style>', '</style/', '<' + BS + '/style'];
const rnd = (m) => Math.floor(Math.random() * m);
let n = 0, div = 0, res = 0, nonIdem = 0;
for (let i = 0; i < 300000; i++) {
  let s = '';
  const k = 1 + rnd(6);
  for (let j = 0; j < k; j++) s += toks[rnd(toks.length)];
  n++;
  const a = sanitizeStyleText(s), b = oracle(s);
  if (a !== b && div++ < 6) console.log('DIVERGE', JSON.stringify(s), 'impl', JSON.stringify(a), 'oracle', JSON.stringify(b));
  if (sanitizeStyleText(a) !== a && nonIdem++ < 6) console.log('NOT IDEMPOTENT', JSON.stringify(s));
  if (/<\/style/i.test(a) && res++ < 6) console.log('RESIDUE', JSON.stringify(s), '=>', JSON.stringify(a));
}
console.log('cases', n, 'divergences', div, 'residues', res, 'non-idempotent', nonIdem);
