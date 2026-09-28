/**
 * The `![bg …]` background-image directive grammar, alone.
 *
 * `bg-image.js` owns what the directive DOES; this leaf owns what it LOOKS LIKE. It is split
 * out because the Studio's image-size memo (`docs/src/lib/image-size-memo.ts`) needs only the
 * pattern, and `bg-image.js` requires three other modules. Vite's dev server serves a `lib/`
 * CommonJS file verbatim, and its shim (`docs/src/plugins/vite-cjs-lib-dev.mjs`) wraps a leaf
 * that requires nothing and refuses anything else, so a default import of `bg-image.js` took
 * every Studio preview down on `npm run dev` (#2457's followup). Keep this file free of
 * a require call: `docs/src/plugins/vite-cjs-lib-dev.test.ts` fails the build if a docs source
 * default-imports a `lib/` CommonJS file that has one.
 */

// Marp background-image directive, anchored to line start so an inline `![bg…]`
// inside backtick code is not consumed.
// The keyword run after `bg` (e.g. " right", " cover blur") — a leading HORIZONTAL space
// then any run of horizontal-space/word chars. Written as an OPTIONAL single-star
// `(?:H(?:H|\w)*)?` (H = `[^\S\r\n]`, one unbounded star over the DISJOINT pair H|\w)
// rather than the nested `(?:\s+\w+)*`: no nested unbounded quantifier for a static
// analyzer to flag as polynomial-ReDoS, and the two star branches share no character so
// it's provably linear. `[^\S\r\n]` is "any whitespace EXCEPT CR/LF", chosen deliberately:
//   (1) it still requires a leading space, so `![bgleft]` stays a normal image;
//   (2) excluding CR/LF keeps the run single-line — the old `\s`-based form could swallow
//       whole lines of punctuation-free prose up to a later `](url)` (a real over-run);
//   (3) INCLUDING nbsp / narrow-nbsp / other Unicode horizontal spaces keeps it a genuine
//       superset of the old `\s`-run — a `![bg` + non-breaking-space + `right](x)` pasted
//       from Word/Docs still lifts, as it did before (a plain `[ \t]` silently dropped it).
// It also tolerates a trailing space before `]` (`![bg right ](x)`), which the old form
// rejected — a leniency win; bgSide() keys on `\bright\b`/`\bleft\b`, so extra space is inert.
const BG_RE = /^!\[bg((?:[^\S\r\n](?:[^\S\r\n]|\w)*)?)\]\(([^)]+)\)/gm;

module.exports = { BG_RE };
