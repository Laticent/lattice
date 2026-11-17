/**
 * lib/core/css-tokens.mjs — ONE CSS TOKENIZER, for a whole stylesheet and for an island (Segno P5).
 *
 * `eachCssToken(css, visit, from, to)` reads `css[from, to)` as CSS Syntax 3 tokens and calls `visit(type, from, to)`
 * for each, in order. The tokens cover the stretch exactly: concatenating every span gives it back, byte for byte. An
 * ISLAND is a stretch of a larger text (an inline `style` value, a computed `background-image`, one declaration's
 * value): pass its bounds and every offset comes back in the host text's coordinates. A WHOLE SHEET is the same call with
 * the default bounds. engineering/decisions/2026-10-22-segno-deck-pipeline.md §P5 census lists every reader.
 *
 * TYPES (`visit`'s first argument):
 *   comment     `/* … *\/`; an unclosed one runs to the end, as CSS reads it
 *   ws          a run of whitespace (space, tab, and the three newlines `\n`, `\r`, `\f`)
 *   string      a quoted string, quotes included. A BAD string (one a newline ends) has no closing quote; the newline
 *               is the next token, as CSS reads it
 *   url         an unquoted `url(…)`, from the name to the `)` (or the end). The name may be spelled with escapes
 *               (`u\72l(`), as CSS reads it. A QUOTED `url("…")` is a `function` token, a string and a `)`, as in CSS
 *   function    a name and its `(`: `var(`, `url(` before a quote
 *   at          `@` and a name: `@font-face`, `@import`
 *   hash        `#` and a name (a `#` alone is `other`)
 *   ident       a name: `section`, `--x`, `-webkit-mask`, `\31 0`
 *   { } ( ) [ ] ; : ,    the one character, as itself
 *   other       a run of any other characters: `.`, `>`, `*`, `!`, `%`, digits, a `/` or `@` that starts nothing
 *
 * WHERE IT DIFFERS FROM THE SPEC, on purpose (each is the side the readers before it were on):
 *   - Numbers are not tokens. A digit run is `other`, so `10px` is `other` + `ident`, and `1url(x)` is `other` + `url`
 *     where a browser reads a dimension and then a `(` block.
 *   - A backslash before a newline continues a name (CSS ends the name there and reads a `\` delimiter).
 *   - `-1x` and `--` read as names.
 *   None of the readers on this tokenizer reads a number, and the three are what `cssRefSpans` (#2871) reads as well.
 *
 * THE GRAMMAR is lib/core/css-ref-grammar.js's `cssSheetSpec`, which shares its escape, string and `url(` rules with
 * `cssSpec`, the reader behind `cssRefSpans`. tools/build-segno-grammar.js generates the parser INTO this file's region
 * below. This file is the DRIVER, and it does two things the grammar leaves to it: after a `url(` it reads the one token
 * that follows (the grammar stops there, css-ref-grammar.js says why), and it gives the stretches the tape skips (runs
 * of `other`) back as tokens.
 *
 * BOUND: linear. The parser reads each character once, but for the `url(` name attempt (at most 32 characters), and a
 * `url(` costs two more parses, each reading only its own stretch. `tokenWork` counts the parses and the tokens.
 *
 * Pure, fs-free and IMPORT-FREE, and it must stay so: CommonJS readers `require()` it, and a required ES module that
 * itself imports one fails to load under Playwright's loader; the docs dev shim (docs/src/plugins/vite-cjs-lib-dev.mjs)
 * hoists a `require('./x.mjs')` of a sibling. So the parser is generated into this file, not imported.
 */

// ── segno:generated ── from lib/core/css-ref-grammar.js; DO NOT EDIT this region: run `npm run segno-lib:build`.
// biome-ignore format: generated
const sheetGrammar = (() => {
const T0 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const T1 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const T2 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const T3 = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
const T4 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const T5 = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
const T6 = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
const T7 = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
const T8 = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
const T9 = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
const T10 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
const T11 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
const T12 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const T13 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const T14 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const T15 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
const T16 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
const T17 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
const T18 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
const T19 = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1]);
const T20 = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
const T21 = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
const T22 = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
const T23 = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
const T24 = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
// biome-ignore lint/suspicious/noControlCharactersInRegex: a generated character class; control characters are input like any other
const R0 = /[\u0000-\u0008\u000b\u000e-\u001f\u0021-\uffff]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: a generated character class; control characters are input like any other
const R1 = /[\u0009-\u000a\u000c-\u000d\u0020\u0022-\u0023\u0027-\u0029\u002c-\u002d\u002f\u003a-\u003b\u0040-\u005d\u005f\u0061-\u007b\u007d\u0080-\uffff]/g;
const KINDS = ["str", "url", "cmt", "ws", "at", "hash", "ident", "open", "close", "semi", "colon", "comma", "body", "rparen", "unq"];
let s = "";
let n = 0;
let i = 0;
let depth = 0;
let err = null;
let buf = new Int32Array(256);
let top = 0;
let uf_0 = 2147483647;
let uv_0 = -1;
function ux_0(from) {
  if (uf_0 <= from && (uv_0 < 0 || uv_0 >= from)) return uv_0;
  uf_0 = from;
  return uv_0 = s.indexOf("*/", from);
}
let halted = false;
function grow() {
  const next = new Int32Array(buf.length * 2);
  next.set(buf);
  buf = next;
}
function fail(expected) {
  if (!err) err = { at: i, expected, found: i < n ? s[i] : null };
  return false;
}
function r_wsUnit() {
  {
    const c0 = i < n ? s.charCodeAt(i) : -1;
    if (c0 === 13) {
      i++;
      {
        const c1 = i < n ? s.charCodeAt(i) : -1;
        if (c1 === 10) {
          i++;
        }
      }
    } else if (c0 >= 0 && c0 < 128 && T0[c0] === 1) {
      i++;
    } else return fail('"\\r" or a space');
  }
  return true;
}
function r_hexEscape() {
  {
    const c2 = i < n ? s.charCodeAt(i) : -1;
    if (!(c2 >= 0 && c2 < 128 && T1[c2] === 1)) return fail("a hex digit");
    i++;
  }
  {
    const c3 = i < n ? s.charCodeAt(i) : -1;
    if (c3 >= 0 && c3 < 128 && T1[c3] === 1) {
      i++;
      {
        const c4 = i < n ? s.charCodeAt(i) : -1;
        if (c4 >= 0 && c4 < 128 && T1[c4] === 1) {
          i++;
          {
            const c5 = i < n ? s.charCodeAt(i) : -1;
            if (c5 >= 0 && c5 < 128 && T1[c5] === 1) {
              i++;
              {
                const c6 = i < n ? s.charCodeAt(i) : -1;
                if (c6 >= 0 && c6 < 128 && T1[c6] === 1) {
                  i++;
                  {
                    const c7 = i < n ? s.charCodeAt(i) : -1;
                    if (c7 >= 0 && c7 < 128 && T1[c7] === 1) {
                      i++;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  {
    const c8 = i < n ? s.charCodeAt(i) : -1;
    if (c8 >= 0 && c8 < 128 && T2[c8] === 1) {
      if (!r_wsUnit()) return false;
    }
  }
  return true;
}
function r_escape() {
  if ((i < n ? s.charCodeAt(i) : -1) !== 92) return fail('"\\\\"');
  i++;
  {
    const c9 = i < n ? s.charCodeAt(i) : -1;
    if (c9 >= 0) {
      {
        const c10 = c9;
        if (c10 >= 0 && c10 < 128 && T1[c10] === 1) {
          if (!r_hexEscape()) return false;
        } else if (c10 >= 0 && c10 < 128 && T3[c10] === 1 || c10 >= 128 && c10 <= 65535) {
          i++;
        } else return fail("a hex digit or an escaped character");
      }
    }
  }
  return true;
}
function r_stringDq() {
  {
    const c11 = top;
    if (top + 4 > buf.length) grow();
    top += 4;
    buf[c11] = 0;
    buf[c11 + 1] = i;
    if ((i < n ? s.charCodeAt(i) : -1) !== 34) return fail('"\\""');
    i++;
    for (let c12 = i < n ? s.charCodeAt(i) : -1; c12 >= 0 && c12 < 128 && T7[c12] === 1 || c12 >= 128 && c12 <= 65535; c12 = i < n ? s.charCodeAt(i) : -1) {
      {
        const c13 = c12;
        if (c13 === 92) {
          i++;
          {
            const c14 = i < n ? s.charCodeAt(i) : -1;
            if (c14 >= 0) {
              {
                const c15 = c14;
                if (c15 >= 0 && c15 < 128 && T4[c15] === 1) {
                  {
                    const c16 = c15;
                    if (c16 === 13) {
                      i++;
                      {
                        const c17 = i < n ? s.charCodeAt(i) : -1;
                        if (c17 === 10) {
                          i++;
                        }
                      }
                    } else if (c16 === 10 || c16 === 12) {
                      i++;
                    } else return fail('"\\r" or a newline');
                  }
                } else if (c15 >= 0 && c15 < 128 && T1[c15] === 1) {
                  if (!r_hexEscape()) return false;
                } else if (c15 >= 0 && c15 < 128 && T5[c15] === 1 || c15 >= 128 && c15 <= 65535) {
                  i++;
                } else return fail('"\\r", a newline, a hex digit or an escaped character');
              }
            }
          }
        } else if (c13 >= 0 && c13 < 128 && T6[c13] === 1 || c13 >= 128 && c13 <= 65535) {
          i++;
        } else return fail('"\\\\" or a string character');
      }
    }
    {
      const c18 = i < n ? s.charCodeAt(i) : -1;
      if (c18 === 34) {
        i++;
      }
    }
    buf[c11 + 2] = i;
    buf[c11 + 3] = top;
  }
  return true;
}
function r_stringSq() {
  {
    const c19 = top;
    if (top + 4 > buf.length) grow();
    top += 4;
    buf[c19] = 0;
    buf[c19 + 1] = i;
    if ((i < n ? s.charCodeAt(i) : -1) !== 39) return fail(`"'"`);
    i++;
    for (let c20 = i < n ? s.charCodeAt(i) : -1; c20 >= 0 && c20 < 128 && T9[c20] === 1 || c20 >= 128 && c20 <= 65535; c20 = i < n ? s.charCodeAt(i) : -1) {
      {
        const c21 = c20;
        if (c21 === 92) {
          i++;
          {
            const c22 = i < n ? s.charCodeAt(i) : -1;
            if (c22 >= 0) {
              {
                const c23 = c22;
                if (c23 >= 0 && c23 < 128 && T4[c23] === 1) {
                  {
                    const c24 = c23;
                    if (c24 === 13) {
                      i++;
                      {
                        const c25 = i < n ? s.charCodeAt(i) : -1;
                        if (c25 === 10) {
                          i++;
                        }
                      }
                    } else if (c24 === 10 || c24 === 12) {
                      i++;
                    } else return fail('"\\r" or a newline');
                  }
                } else if (c23 >= 0 && c23 < 128 && T1[c23] === 1) {
                  if (!r_hexEscape()) return false;
                } else if (c23 >= 0 && c23 < 128 && T5[c23] === 1 || c23 >= 128 && c23 <= 65535) {
                  i++;
                } else return fail('"\\r", a newline, a hex digit or an escaped character');
              }
            }
          }
        } else if (c21 >= 0 && c21 < 128 && T8[c21] === 1 || c21 >= 128 && c21 <= 65535) {
          i++;
        } else return fail('"\\\\" or a string character');
      }
    }
    {
      const c26 = i < n ? s.charCodeAt(i) : -1;
      if (c26 === 39) {
        i++;
      }
    }
    buf[c19 + 2] = i;
    buf[c19 + 3] = top;
  }
  return true;
}
function r_wideName() {
  for (let c27 = i < n ? s.charCodeAt(i) : -1; c27 >= 0 && c27 < 128 && T11[c27] === 1 || c27 >= 128 && c27 <= 65535; c27 = i < n ? s.charCodeAt(i) : -1) {
    {
      const c28 = c27;
      if (c28 === 92) {
        if (!r_escape()) return false;
      } else if (c28 >= 0 && c28 < 128 && T10[c28] === 1 || c28 >= 128 && c28 <= 65535) {
        i++;
      } else return fail('"\\\\" or a name character');
    }
  }
  return true;
}
function r_sheet() {
  for (let c29 = i < n ? s.charCodeAt(i) : -1; c29 >= 0; c29 = i < n ? s.charCodeAt(i) : -1) {
    if (!r_sheetToken()) return false;
  }
  return true;
}
function r_sheetToken() {
  {
    const c30 = i < n ? s.charCodeAt(i) : -1;
    if (c30 >= 0 && c30 < 128 && T12[c30] === 1 && t_0()) {
    } else if (c30 === 47) {
      {
        const c60 = top;
        if (top + 4 > buf.length) grow();
        top += 4;
        buf[c60] = 2;
        buf[c60 + 1] = i;
        i++;
        {
          const c61 = i < n ? s.charCodeAt(i) : -1;
          if (c61 === 42) {
            i++;
            {
              const c62 = ux_0(i);
              if (c62 >= 0 && c62 + 2 <= n) i = c62 + 2;
              else {
                i = n;
              }
            }
          }
        }
        buf[c60 + 2] = i;
        buf[c60 + 3] = top;
      }
    } else if (c30 === 34) {
      if (!r_stringDq()) return false;
    } else if (c30 === 39) {
      if (!r_stringSq()) return false;
    } else if (c30 >= 0 && c30 < 128 && T2[c30] === 1) {
      {
        const c63 = top;
        if (top + 4 > buf.length) grow();
        top += 4;
        buf[c63] = 3;
        buf[c63 + 1] = i;
        {
          const c65 = i;
          let c66 = i;
          const c67 = n;
          const c68 = s;
          const c69 = c66 + 16 < c67 ? c66 + 16 : c67;
          while (c66 < c69) {
            const c64 = c68.charCodeAt(c66);
            if (!(c64 >= 0 && c64 < 128 && T2[c64] === 1)) break;
            c66++;
          }
          if (c66 === c69 && c66 < c67) {
            if (c67 !== c68.length) {
              while (c66 < c67) {
                const c64 = c68.charCodeAt(c66);
                if (!(c64 >= 0 && c64 < 128 && T2[c64] === 1)) break;
                c66++;
              }
            } else {
              R0.lastIndex = c66;
              c66 = R0.test(c68) ? R0.lastIndex - 1 : c67;
            }
          }
          i = c66;
          if (i === c65) return fail("a space");
        }
        buf[c63 + 2] = i;
        buf[c63 + 3] = top;
      }
    } else if (c30 === 64) {
      {
        const c70 = top;
        if (top + 4 > buf.length) grow();
        top += 4;
        buf[c70] = 4;
        buf[c70 + 1] = i;
        i++;
        {
          const c71 = i < n ? s.charCodeAt(i) : -1;
          if (c71 >= 0 && c71 < 128 && T15[c71] === 1 || c71 >= 128 && c71 <= 65535) {
            {
              const c73 = c71;
              if (c73 === 92) {
                if (!r_escape()) return false;
              } else if (c73 >= 0 && c73 < 128 && T16[c73] === 1 || c73 >= 128 && c73 <= 65535) {
                i++;
              } else return fail('"\\\\" or a name start');
            }
            if (!r_wideName()) return false;
          }
        }
        buf[c70 + 2] = i;
        buf[c70 + 3] = top;
      }
    } else if (c30 === 35) {
      {
        const c74 = top;
        if (top + 4 > buf.length) grow();
        top += 4;
        buf[c74] = 5;
        buf[c74 + 1] = i;
        i++;
        if (!r_wideName()) return false;
        buf[c74 + 2] = i;
        buf[c74 + 3] = top;
      }
    } else if (c30 >= 0 && c30 < 128 && T15[c30] === 1 || c30 >= 128 && c30 <= 65535) {
      {
        const c75 = top;
        if (top + 4 > buf.length) grow();
        top += 4;
        buf[c75] = 6;
        buf[c75 + 1] = i;
        {
          const c76 = c30;
          if (c76 === 92) {
            if (!r_escape()) return false;
          } else if (c76 >= 0 && c76 < 128 && T16[c76] === 1 || c76 >= 128 && c76 <= 65535) {
            i++;
          } else return fail('"\\\\" or a name start');
        }
        if (!r_wideName()) return false;
        buf[c75 + 2] = i;
        buf[c75 + 3] = top;
      }
      {
        const c77 = i < n ? s.charCodeAt(i) : -1;
        if (c77 === 40) {
          {
            const c78 = top;
            if (top + 4 > buf.length) grow();
            top += 4;
            buf[c78] = 7;
            buf[c78 + 1] = i;
            i++;
            buf[c78 + 2] = i;
            buf[c78 + 3] = top;
          }
        }
      }
    } else if (c30 >= 0 && c30 < 128 && T17[c30] === 1) {
      {
        const c79 = top;
        if (top + 4 > buf.length) grow();
        top += 4;
        buf[c79] = 7;
        buf[c79 + 1] = i;
        i++;
        buf[c79 + 2] = i;
        buf[c79 + 3] = top;
      }
    } else if (c30 >= 0 && c30 < 128 && T18[c30] === 1) {
      {
        const c80 = top;
        if (top + 4 > buf.length) grow();
        top += 4;
        buf[c80] = 8;
        buf[c80 + 1] = i;
        i++;
        buf[c80 + 2] = i;
        buf[c80 + 3] = top;
      }
    } else if (c30 === 59) {
      {
        const c81 = top;
        if (top + 4 > buf.length) grow();
        top += 4;
        buf[c81] = 9;
        buf[c81 + 1] = i;
        i++;
        buf[c81 + 2] = i;
        buf[c81 + 3] = top;
      }
    } else if (c30 === 58) {
      {
        const c82 = top;
        if (top + 4 > buf.length) grow();
        top += 4;
        buf[c82] = 10;
        buf[c82 + 1] = i;
        i++;
        buf[c82 + 2] = i;
        buf[c82 + 3] = top;
      }
    } else if (c30 === 44) {
      {
        const c83 = top;
        if (top + 4 > buf.length) grow();
        top += 4;
        buf[c83] = 11;
        buf[c83 + 1] = i;
        i++;
        buf[c83 + 2] = i;
        buf[c83 + 3] = top;
      }
    } else if (c30 >= 0 && c30 < 128 && T19[c30] === 1) {
      {
        const c85 = i;
        let c86 = i;
        const c87 = n;
        const c88 = s;
        const c89 = c86 + 16 < c87 ? c86 + 16 : c87;
        while (c86 < c89) {
          const c84 = c88.charCodeAt(c86);
          if (!(c84 >= 0 && c84 < 128 && T19[c84] === 1)) break;
          c86++;
        }
        if (c86 === c89 && c86 < c87) {
          if (c87 !== c88.length) {
            while (c86 < c87) {
              const c84 = c88.charCodeAt(c86);
              if (!(c84 >= 0 && c84 < 128 && T19[c84] === 1)) break;
              c86++;
            }
          } else {
            R1.lastIndex = c86;
            c86 = R1.test(c88) ? R1.lastIndex - 1 : c87;
          }
        }
        i = c86;
        if (i === c85) return fail("a character");
      }
    } else return fail(`"U", "u", "\\\\", "/", "\\"", "'", a space, "@", "#", a name start, an opener, a closer, ";", ":", "," or a character`);
  }
  return true;
}
function r_urlBody() {
  {
    const c90 = top;
    if (top + 4 > buf.length) grow();
    top += 4;
    buf[c90] = 12;
    buf[c90 + 1] = i;
    {
      let c93 = i;
      const c94 = n;
      const c95 = s;
      const c96 = c93 + 16 < c94 ? c93 + 16 : c94;
      while (c93 < c96) {
        const c91 = c95.charCodeAt(c93);
        if (!(c91 >= 0 && c91 < 128 && T2[c91] === 1)) break;
        c93++;
      }
      if (c93 === c96 && c93 < c94) {
        if (c94 !== c95.length) {
          while (c93 < c94) {
            const c91 = c95.charCodeAt(c93);
            if (!(c91 >= 0 && c91 < 128 && T2[c91] === 1)) break;
            c93++;
          }
        } else {
          R0.lastIndex = c93;
          c93 = R0.test(c95) ? R0.lastIndex - 1 : c94;
        }
      }
      i = c93;
    }
    {
      const c97 = i < n ? s.charCodeAt(i) : -1;
      if (c97 === 34 || c97 === 39) {
        {
          const c98 = c97;
          if (c98 === 34) {
            if (!r_stringDq()) return false;
          } else if (c98 === 39) {
            if (!r_stringSq()) return false;
          } else return fail(`"\\"" or "'"`);
        }
        {
          let c101 = i;
          const c102 = n;
          const c103 = s;
          const c104 = c101 + 16 < c102 ? c101 + 16 : c102;
          while (c101 < c104) {
            const c99 = c103.charCodeAt(c101);
            if (!(c99 >= 0 && c99 < 128 && T2[c99] === 1)) break;
            c101++;
          }
          if (c101 === c104 && c101 < c102) {
            if (c102 !== c103.length) {
              while (c101 < c102) {
                const c99 = c103.charCodeAt(c101);
                if (!(c99 >= 0 && c99 < 128 && T2[c99] === 1)) break;
                c101++;
              }
            } else {
              R0.lastIndex = c101;
              c101 = R0.test(c103) ? R0.lastIndex - 1 : c102;
            }
          }
          i = c101;
        }
        {
          const c105 = i < n ? s.charCodeAt(i) : -1;
          if (c105 === 41) {
            {
              const c106 = top;
              if (top + 4 > buf.length) grow();
              top += 4;
              buf[c106] = 13;
              buf[c106 + 1] = i;
              i++;
              buf[c106 + 2] = i;
              buf[c106 + 3] = top;
            }
          }
        }
      } else if (c97 >= 0 && c97 < 128 && T20[c97] === 1 || c97 >= 128 && c97 <= 65535) {
        {
          const c107 = top;
          if (top + 4 > buf.length) grow();
          top += 4;
          buf[c107] = 14;
          buf[c107 + 1] = i;
          {
            const c108 = c97;
            if (c108 >= 0 && c108 < 128 && T21[c108] === 1 || c108 >= 128 && c108 <= 65535) {
              {
                const c109 = c108;
                if (c109 === 92) {
                  if (!r_escape()) return false;
                } else if (c109 >= 0 && c109 < 128 && T22[c109] === 1 || c109 >= 128 && c109 <= 65535) {
                  i++;
                } else return fail('"\\\\" or a character');
              }
              for (let c110 = i < n ? s.charCodeAt(i) : -1; c110 >= 0 && c110 < 128 && T24[c110] === 1 || c110 >= 128 && c110 <= 65535; c110 = i < n ? s.charCodeAt(i) : -1) {
                {
                  const c111 = c110;
                  if (c111 === 92) {
                    if (!r_escape()) return false;
                  } else if (c111 >= 0 && c111 < 128 && T23[c111] === 1 || c111 >= 128 && c111 <= 65535) {
                    i++;
                  } else return fail('"\\\\" or a character');
                }
              }
              {
                const c112 = i < n ? s.charCodeAt(i) : -1;
                if (c112 === 41) {
                  {
                    const c113 = top;
                    if (top + 4 > buf.length) grow();
                    top += 4;
                    buf[c113] = 13;
                    buf[c113 + 1] = i;
                    i++;
                    buf[c113 + 2] = i;
                    buf[c113 + 3] = top;
                  }
                }
              }
            } else if (c108 === 41) {
              {
                const c114 = top;
                if (top + 4 > buf.length) grow();
                top += 4;
                buf[c114] = 13;
                buf[c114 + 1] = i;
                i++;
                buf[c114 + 2] = i;
                buf[c114 + 3] = top;
              }
            } else return fail('"\\\\", a character or ")"');
          }
          buf[c107 + 2] = i;
          buf[c107 + 3] = top;
        }
      } else {
      }
    }
    buf[c90 + 2] = i;
    buf[c90 + 3] = top;
    halted = true;
    n = i;
  }
  return true;
}
function t_0() {
  const i0 = i;
  const n0 = n;
  const top0 = top;
  const d0 = depth;
  const e0 = err;
  n = Math.min(n0, i0 + 32);
  const ok = b_0();
  n = n0;
  if (ok && err === e0) {
    const c31 = i < n ? s.charCodeAt(i) : -1;
    if (c31 < 0 || c31 >= 0) {
      if (halted) n = i;
      return true;
    }
  }
  halted = false;
  i = i0;
  top = top0;
  depth = d0;
  err = e0;
  return false;
}
function b_0() {
  {
    const c32 = top;
    if (top + 4 > buf.length) grow();
    top += 4;
    buf[c32] = 1;
    buf[c32 + 1] = i;
    {
      const c33 = i < n ? s.charCodeAt(i) : -1;
      if (c33 === 85 || c33 === 117) {
        i++;
      } else if (c33 === 92) {
        i++;
        {
          const c34 = i < n ? s.charCodeAt(i) : -1;
          if (c34 === 85 || c34 === 117) {
            i++;
          } else if (c34 >= 0 && c34 < 128 && T13[c34] === 1) {
            {
              const c35 = c34;
              if (c35 === 48) {
                i++;
                {
                  const c36 = i < n ? s.charCodeAt(i) : -1;
                  if (c36 === 48) {
                    i++;
                    {
                      const c37 = i < n ? s.charCodeAt(i) : -1;
                      if (c37 === 48) {
                        i++;
                        {
                          const c38 = i < n ? s.charCodeAt(i) : -1;
                          if (c38 === 48) {
                            i++;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
            {
              const c39 = i < n ? s.charCodeAt(i) : -1;
              if (!(c39 === 53 || c39 === 55)) return fail('"5", "7"');
              i++;
            }
            {
              const c40 = i < n ? s.charCodeAt(i) : -1;
              if (!(c40 === 53)) return fail('"5"');
              i++;
            }
            {
              const c41 = i < n ? s.charCodeAt(i) : -1;
              if (c41 >= 0 && c41 < 128 && T2[c41] === 1) {
                if (!r_wsUnit()) return false;
              }
            }
          } else return fail('"U", "u", "0" or "5", "7"');
        }
      } else return fail('"U", "u" or "\\\\"');
    }
    {
      const c42 = i < n ? s.charCodeAt(i) : -1;
      if (c42 === 82 || c42 === 114) {
        i++;
      } else if (c42 === 92) {
        i++;
        {
          const c43 = i < n ? s.charCodeAt(i) : -1;
          if (c43 === 82 || c43 === 114) {
            i++;
          } else if (c43 >= 0 && c43 < 128 && T13[c43] === 1) {
            {
              const c44 = c43;
              if (c44 === 48) {
                i++;
                {
                  const c45 = i < n ? s.charCodeAt(i) : -1;
                  if (c45 === 48) {
                    i++;
                    {
                      const c46 = i < n ? s.charCodeAt(i) : -1;
                      if (c46 === 48) {
                        i++;
                        {
                          const c47 = i < n ? s.charCodeAt(i) : -1;
                          if (c47 === 48) {
                            i++;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
            {
              const c48 = i < n ? s.charCodeAt(i) : -1;
              if (!(c48 === 53 || c48 === 55)) return fail('"5", "7"');
              i++;
            }
            {
              const c49 = i < n ? s.charCodeAt(i) : -1;
              if (!(c49 === 50)) return fail('"2"');
              i++;
            }
            {
              const c50 = i < n ? s.charCodeAt(i) : -1;
              if (c50 >= 0 && c50 < 128 && T2[c50] === 1) {
                if (!r_wsUnit()) return false;
              }
            }
          } else return fail('"R", "r", "0" or "5", "7"');
        }
      } else return fail('"R", "r" or "\\\\"');
    }
    {
      const c51 = i < n ? s.charCodeAt(i) : -1;
      if (c51 === 76 || c51 === 108) {
        i++;
      } else if (c51 === 92) {
        i++;
        {
          const c52 = i < n ? s.charCodeAt(i) : -1;
          if (c52 === 76 || c52 === 108) {
            i++;
          } else if (c52 >= 0 && c52 < 128 && T14[c52] === 1) {
            {
              const c53 = c52;
              if (c53 === 48) {
                i++;
                {
                  const c54 = i < n ? s.charCodeAt(i) : -1;
                  if (c54 === 48) {
                    i++;
                    {
                      const c55 = i < n ? s.charCodeAt(i) : -1;
                      if (c55 === 48) {
                        i++;
                        {
                          const c56 = i < n ? s.charCodeAt(i) : -1;
                          if (c56 === 48) {
                            i++;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
            {
              const c57 = i < n ? s.charCodeAt(i) : -1;
              if (!(c57 === 52 || c57 === 54)) return fail('"4", "6"');
              i++;
            }
            {
              const c58 = i < n ? s.charCodeAt(i) : -1;
              if (!(c58 === 67 || c58 === 99)) return fail('"C", "c"');
              i++;
            }
            {
              const c59 = i < n ? s.charCodeAt(i) : -1;
              if (c59 >= 0 && c59 < 128 && T2[c59] === 1) {
                if (!r_wsUnit()) return false;
              }
            }
          } else return fail('"L", "l", "0" or "4", "6"');
        }
      } else return fail('"L", "l" or "\\\\"');
    }
    if ((i < n ? s.charCodeAt(i) : -1) !== 40) return fail('"("');
    i++;
    buf[c32 + 2] = i;
    buf[c32 + 3] = top;
    halted = true;
    n = i;
  }
  return true;
}
const RULES = { "wsUnit": r_wsUnit, "hexEscape": r_hexEscape, "escape": r_escape, "stringDq": r_stringDq, "stringSq": r_stringSq, "wideName": r_wideName, "sheet": r_sheet, "sheetToken": r_sheetToken, "urlBody": r_urlBody };
const OK = { ok: true, tree: { buf, top: 0, kinds: KINDS, end: 0 } };
function parse(input, rule = "sheet", from = 0) {
  let start = r_sheet;
  if (rule !== "sheet") {
    const named = Object.hasOwn(RULES, rule) ? RULES[rule] : void 0;
    if (!named) throw new Error('segno: no rule "' + rule + '"');
    start = named;
  }
  if (input !== s) {
    uf_0 = 2147483647;
  }
  s = input;
  n = s.length;
  if (!(from >= 0 && from <= n && Number.isInteger(from))) throw new Error("segno: from must be a whole number from 0 to " + n + ", not " + from);
  i = from;
  halted = false;
  depth = 0;
  err = null;
  top = 0;
  if (buf.length > 65536) {
    buf = new Int32Array(256);
    OK.tree.buf = buf;
  }
  const ok = start();
  if (ok && i < n) fail("end of input");
  const e = err;
  if (!ok || e) return { ok: false, error: e ?? { at: i, expected: "a valid input", found: null } };
  OK.tree.buf = buf;
  OK.tree.top = top;
  OK.tree.end = n;
  return OK;
}
return { parse };
})();
// ── segno:generated:end ──

/** Work counter for the unit tier (HARD RULE #32: count work, never time it): parses run and tokens given, since the
 *  process started. A test reads the difference across one call. */
export const tokenWork = { parses: 0, tokens: 0 };

const KIND = Object.fromEntries(sheetGrammar.parse('', 'sheet').tree.kinds.map((k, i) => [k, i]));
const PUNCT = { 123: '{', 125: '}', 40: '(', 41: ')', 91: '[', 93: ']' };
const NAMED = [];
NAMED[KIND.cmt] = 'comment';
NAMED[KIND.str] = 'string';
NAMED[KIND.ws] = 'ws';
NAMED[KIND.hash] = 'hash';
NAMED[KIND.at] = 'at';
NAMED[KIND.semi] = ';';
NAMED[KIND.colon] = ':';
NAMED[KIND.comma] = ',';

function parse(s, rule, from) {
  tokenWork.parses++;
  const r = sheetGrammar.parse(s, rule, from);
  // The grammar matches every string, so a refusal is a defect in the generated parser.
  if (!r.ok) throw new Error(`CSS tokenizer refused the input at ${r.error.at}: expected ${r.error.expected}`);
  return r.tree;
}

/**
 * Call `visit(type, from, to)` for each token of `css[from, to)`, in order; the spans cover the stretch exactly.
 * @param {string} css
 * @param {(type: string, from: number, to: number) => void} visit
 * @param {number} [from]
 * @param {number} [to]
 */
export function eachCssToken(css, visit, from = 0, to) {
  const host = String(css ?? '');
  const end = to === undefined ? host.length : Math.min(to, host.length);
  const start = Math.max(0, Math.min(from, end));
  // An island is read on its own text; offsets are moved back into the host's.
  const s = start === 0 && end === host.length ? host : host.slice(start, end);
  const n = s.length;
  const emit = (type, a, b) => {
    tokenWork.tokens++;
    visit(type, a + start, b + start);
  };
  let pos = 0;
  while (pos < n) {
    const tree = parse(s, 'sheet', pos);
    const { buf, top } = tree;
    let gap = pos;
    let urlAt = -1;
    for (let k = 0; k < top; k = buf[k + 3]) {
      const kind = buf[k];
      const a = buf[k + 1];
      const b = buf[k + 2];
      if (a > gap) emit('other', gap, a);
      gap = b;
      if (kind === KIND.url) {
        urlAt = a;
        break;
      }
      if (kind === KIND.open || kind === KIND.close) emit(PUNCT[s.charCodeAt(a)], a, b);
      else if (kind === KIND.ident) {
        // A name and the `(` right after it are one function token.
        const next = buf[k + 3];
        if (next < top && buf[next] === KIND.open && buf[next + 1] === b && s.charCodeAt(b) === 40) {
          emit('function', a, b + 1);
          gap = b + 1;
          k = next;
        } else emit('ident', a, b);
      } else if (kind === KIND.at || kind === KIND.hash) emit(b - a > 1 ? NAMED[kind] : 'other', a, b);
      else if (kind === KIND.cmt) emit(b - a > 1 ? 'comment' : 'other', a, b);
      else emit(NAMED[kind], a, b);
    }
    if (urlAt < 0) {
      // Every character starts a token, so a parse that stops short of the end is a defect in the generated parser.
      if (tree.end !== n) throw new Error(`CSS tokenizer stopped at ${tree.end} of ${n}`);
      if (gap < n) emit('other', gap, n);
      break;
    }
    // After `url(`: the one token CSS reads there. A string makes it a function token; anything else is one url token.
    const nameEnd = gap;
    const body = parse(s, 'urlBody', nameEnd);
    const bodyEnd = body.top ? body.buf[2] : nameEnd;
    // The body node comes first on the tape and its children after it, in order.
    let quoted = false;
    for (let k = 0; k < body.top; k += 4) if (body.buf[k] === KIND.str) quoted = true;
    if (!quoted) {
      emit('url', urlAt, bodyEnd);
      pos = bodyEnd;
      continue;
    }
    emit('function', urlAt, nameEnd);
    // `url(  "x"  )`: whitespace, the string, whitespace, the `)`; each as the tokens they are.
    let at = nameEnd;
    for (let k = 0; k < body.top; k += 4) {
      const kind = body.buf[k];
      const a = body.buf[k + 1];
      const b = body.buf[k + 2];
      if (kind !== KIND.str && kind !== KIND.rparen) continue;
      if (a > at) emit('ws', at, a);
      emit(kind === KIND.str ? 'string' : ')', a, b);
      at = b;
    }
    if (bodyEnd > at) emit('ws', at, bodyEnd);
    pos = bodyEnd;
  }
}

/**
 * The tokens of `css[from, to)` as `{ type, from, to }` records, for a reader that looks ahead.
 * @param {string} css
 * @param {number} [from]
 * @param {number} [to]
 * @returns {Array<{ type: string, from: number, to: number }>}
 */
export function cssTokens(css, from = 0, to) {
  const out = [];
  eachCssToken(css, (type, a, b) => out.push({ type, from: a, to: b }), from, to);
  return out;
}

// ── SHARED READERS ───────────────────────────────────────────────────────────────────────────────────────────────────
// Readers more than one module needs, written on the tokens. A reader one module needs lives in that module.

/** Whitespace and comments: what may sit between two tokens that mean something. */
export const isTrivia = (type) => type === 'ws' || type === 'comment';

// One escape (`\` and 1 to 6 hex digits and the one whitespace that belongs to it, or `\` and any one character), or a
// backslash before a newline, which continues a string's line and adds nothing.
const ESCAPE = /\\(?:(\r\n|[\n\r\f])|([0-9a-fA-F]{1,6})(?:\r\n|[ \t\n\r\f])?|([\s\S]))|\\$/g;

/**
 * `text` with its CSS escapes decoded, as CSS Syntax 3 §4.3.7 decodes them: `\75 ` is `u`, `\:` is `:`, a zero, a
 * surrogate or a code point past U+10FFFF is U+FFFD, a backslash at the end is U+FFFD, and a backslash before a newline
 * (a string's line continuation) is nothing.
 * @param {string} text
 * @returns {string}
 */
export function cssUnescape(text) {
  if (!text.includes('\\')) return text;
  return text.replace(ESCAPE, (_m, newline, hex, ch) => {
    if (newline !== undefined) return '';
    if (hex !== undefined) {
      const cp = Number.parseInt(hex, 16);
      return cp === 0 || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff ? '�' : String.fromCodePoint(cp);
    }
    return ch === undefined ? '�' : ch;
  });
}

/**
 * The value of the string token `css[from, to)`, decoded, and whether its closing quote is there (a bad string, ended by
 * a newline or the end of the text, has none).
 * @param {string} css
 * @param {number} from
 * @param {number} to
 * @returns {{ value: string, closed: boolean }}
 */
export function cssStringValue(css, from, to) {
  const q = css[from];
  let closed = false;
  if (to - from >= 2 && css[to - 1] === q) {
    // The last character closes the string unless an odd run of backslashes escapes it.
    let k = to - 2;
    while (k > from && css[k] === '\\') k--;
    closed = (to - 2 - k) % 2 === 0;
  }
  return { value: cssUnescape(css.slice(from + 1, closed ? to - 1 : to)), closed };
}

/**
 * Each `@import` of a sheet, with the token after it. An `@import` inside a string or a comment is not one; the
 * at-keyword's name is decoded and matched case-insensitively (`@IMPORT`, `@imp\6frt `), as CSS reads it. What a caller
 * accepts as a theme name stays with the caller: the engine's ThemeStore and the `--css` flattener resolve into
 * different domains and read different widths (lib/theme/chain.mjs says why they are not unified).
 *
 *   target   the first token after the whitespace and comments: `{ type, value, closed }`. `value` is a string's
 *            decoded value (`closed` false for a bad string), an ident's decoded name, or the raw text of any other
 *            token; null when the sheet ends first
 *   from     the `@`
 *   to       past the target, the whitespace and comments after it, and one `;` if it follows: the span ThemeStore
 *            splices a resolved theme into
 * @param {string} css
 * @returns {Array<{ from: number, to: number, target: null | { type: string, value: string, closed: boolean } }>}
 */
export function cssImports(css) {
  const s = String(css ?? '');
  if (!s.includes('@')) return [];
  const toks = cssTokens(s);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.type !== 'at' || cssUnescape(s.slice(t.from + 1, t.to)).toLowerCase() !== 'import') continue;
    let j = i + 1;
    while (j < toks.length && isTrivia(toks[j].type)) j++;
    const tok = toks[j];
    if (!tok) {
      out.push({ from: t.from, to: toks[toks.length - 1].to, target: null });
      break;
    }
    let target;
    if (tok.type === 'string') target = { type: 'string', ...cssStringValue(s, tok.from, tok.to) };
    else if (tok.type === 'ident') target = { type: 'ident', value: cssUnescape(s.slice(tok.from, tok.to)), closed: true };
    else target = { type: tok.type, value: s.slice(tok.from, tok.to), closed: true };
    let k = j + 1;
    while (k < toks.length && isTrivia(toks[k].type)) k++;
    const to = toks[k]?.type === ';' ? toks[k].to : toks[k - 1].to;
    out.push({ from: t.from, to, target });
    i = j;
  }
  return out;
}
