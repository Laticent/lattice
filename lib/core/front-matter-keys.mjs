/**
 * lib/core/front-matter-keys.mjs
 *
 * THE FRONT-MATTER ISLAND'S KEY READER: the key lines of a deck's YAML block, read once (indent, name, raw value, the
 * spans of the name and value; a block scalar's body lines are never keys). Where the block ends is
 * lib/core/front-matter-fence.mjs; lib/core/front-matter-island.mjs joins the two. The rules, the readers and why each
 * is what it is: engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §5, §11.
 *
 * EACH LINE IS READ BY THE REGISTER GRAMMAR (lib/core/front-matter-grammar.js, its `line` rule, generated into this
 * file's region below): its indent, its name, the colon, and whether it is a block-scalar header. This
 * module is the DRIVER, and it does one thing the grammar cannot: it decides where a block scalar's body ends, every
 * later line that is blank or indented deeper than the header. That compares an indent width with one read lines
 * earlier, which no context-free grammar can do (the grammar file says why).
 *
 * BOUND: linear. Each line is split once, parsed once by the generated parser (linear in its length), and visited once
 * by the loop below: a body line is passed over by the inner loop and the outer loop resumes after it.
 *
 * NAMES. `[\w$][\w$.-]*` followed by optional blanks and `:`: wider than any reader asked for (the loose register
 * reader read a digit-first key like `1x:`, `keyGroups` in lib/core/front-matter-groups.js a `$` or `.`), so no reader
 * loses a key; a reader that wants a narrower name filters on it, as the engine's directives do.
 *
 * LINES. A line ends at `\n`, `\r\n` or a lone `\r`. U+2028 and U+2029 are text, as they are to markdown-it and YAML 1.2.
 *
 * Pure, fs-free and IMPORT-FREE, and it must stay so: CommonJS readers `require()` it (front-matter-key.js, the engine's
 * directives.js), and a required ES module that itself imports one fails to load under Playwright's loader ("request
 * for './x.mjs' is from a module not been linked"); so the parser is generated INTO this file, in the region below,
 * not imported. The docs dev shim (docs/src/plugins/vite-cjs-lib-dev.mjs) hoists a `require('./x.mjs')` of a sibling.
 */

// ── segno:generated ── from lib/core/front-matter-grammar.js; DO NOT EDIT this region: run `npm run segno-lib:build`.
// biome-ignore format: generated
const lineGrammar = (() => {
const T0 = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
const T1 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
const T2 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
const T3 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const T4 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
const T5 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
const T6 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const T7 = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const T8 = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
const T9 = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
const T10 = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1]);
const T11 = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
const T12 = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
const R0 = /[\u2028-\u2029]/g;
const R1 = /[^\s\S]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: a generated character class; control characters are input like any other
const R2 = /[\u0000-\u0008\u000a-\u001f\u0021-\uffff]/g;
const KINDS = ["indent", "name", "wide", "gap", "colon", "lead", "ind", "comment", "junk"];
let s = "";
let n = 0;
let i = 0;
let depth = 0;
let err = null;
let buf = new Int32Array(256);
let top = 0;
function grow() {
  const next = new Int32Array(buf.length * 2);
  next.set(buf);
  buf = next;
}
function fail(expected) {
  if (!err) err = { at: i, expected, found: i < n ? s[i] : null };
  return false;
}
function r_line() {
  {
    const c0 = top;
    if (top + 4 > buf.length) grow();
    top += 4;
    buf[c0] = 0;
    buf[c0 + 1] = i;
    if (!r_blanks()) return false;
    buf[c0 + 2] = i;
    buf[c0 + 3] = top;
  }
  {
    const c1 = i < n ? s.charCodeAt(i) : -1;
    if (c1 >= 0 && c1 < 128 && T0[c1] === 1 || c1 >= 128 && c1 <= 65535) {
      {
        const c2 = c1;
        if (c2 >= 0 && c2 < 128 && T1[c2] === 1) {
          {
            const c3 = top;
            if (top + 4 > buf.length) grow();
            top += 4;
            buf[c3] = 1;
            buf[c3 + 1] = i;
            {
              const c4 = c2;
              if (c4 >= 0 && c4 < 128 && T2[c4] === 1) {
                i++;
              } else if (c4 >= 0 && c4 < 128 && T3[c4] === 1) {
                {
                  const c5 = top;
                  if (top + 4 > buf.length) grow();
                  top += 4;
                  buf[c5] = 2;
                  buf[c5 + 1] = i;
                  i++;
                  buf[c5 + 2] = i;
                  buf[c5 + 3] = top;
                }
              } else return fail("front matter");
            }
            for (let c6 = i < n ? s.charCodeAt(i) : -1; c6 >= 0 && c6 < 128 && T5[c6] === 1; c6 = i < n ? s.charCodeAt(i) : -1) {
              {
                const c7 = c6;
                if (c7 >= 0 && c7 < 128 && T4[c7] === 1) {
                  i++;
                } else if (c7 === 36 || c7 === 46) {
                  {
                    const c8 = top;
                    if (top + 4 > buf.length) grow();
                    top += 4;
                    buf[c8] = 2;
                    buf[c8 + 1] = i;
                    i++;
                    buf[c8 + 2] = i;
                    buf[c8 + 3] = top;
                  }
                } else return fail("front matter");
              }
            }
            buf[c3 + 2] = i;
            buf[c3 + 3] = top;
          }
          {
            const c9 = i < n ? s.charCodeAt(i) : -1;
            if (c9 === 9 || c9 === 32) {
              {
                const c10 = top;
                if (top + 4 > buf.length) grow();
                top += 4;
                buf[c10] = 3;
                buf[c10 + 1] = i;
                if (!r_blanks1()) return false;
                buf[c10 + 2] = i;
                buf[c10 + 3] = top;
              }
            }
          }
          {
            const c11 = i < n ? s.charCodeAt(i) : -1;
            if (c11 >= 0 && c11 < 128 && T0[c11] === 1 || c11 >= 128 && c11 <= 65535) {
              {
                const c12 = c11;
                if (c12 === 58) {
                  {
                    const c13 = top;
                    if (top + 4 > buf.length) grow();
                    top += 4;
                    buf[c13] = 4;
                    buf[c13 + 1] = i;
                    i++;
                    buf[c13 + 2] = i;
                    buf[c13 + 3] = top;
                  }
                  {
                    const c14 = i < n ? s.charCodeAt(i) : -1;
                    if (c14 === 9 || c14 === 32) {
                      {
                        const c15 = top;
                        if (top + 4 > buf.length) grow();
                        top += 4;
                        buf[c15] = 5;
                        buf[c15 + 1] = i;
                        if (!r_blanks1()) return false;
                        buf[c15 + 2] = i;
                        buf[c15 + 3] = top;
                      }
                    }
                  }
                  {
                    const c16 = i < n ? s.charCodeAt(i) : -1;
                    if (c16 >= 0 && c16 < 128 && T0[c16] === 1 || c16 >= 128 && c16 <= 65535) {
                      {
                        const c17 = c16;
                        if (c17 === 62 || c17 === 124) {
                          {
                            const c18 = top;
                            if (top + 4 > buf.length) grow();
                            top += 4;
                            buf[c18] = 6;
                            buf[c18 + 1] = i;
                            i++;
                            {
                              const c19 = i < n ? s.charCodeAt(i) : -1;
                              if (c19 >= 0 && c19 < 128 && T6[c19] === 1) {
                                {
                                  const c20 = c19;
                                  if (c20 >= 0 && c20 < 128 && T7[c20] === 1) {
                                    i++;
                                    {
                                      const c21 = i < n ? s.charCodeAt(i) : -1;
                                      if (c21 === 43 || c21 === 45) {
                                        i++;
                                      }
                                    }
                                  } else if (c20 === 43 || c20 === 45) {
                                    i++;
                                    {
                                      const c22 = i < n ? s.charCodeAt(i) : -1;
                                      if (c22 >= 0 && c22 < 128 && T7[c22] === 1) {
                                        i++;
                                      }
                                    }
                                  } else return fail("front matter");
                                }
                              }
                            }
                            buf[c18 + 2] = i;
                            buf[c18 + 3] = top;
                          }
                          {
                            const c23 = i < n ? s.charCodeAt(i) : -1;
                            if (c23 >= 0) {
                              {
                                const c24 = c23;
                                if (c24 === 9 || c24 === 32) {
                                  if (!r_blanks1()) return false;
                                  {
                                    const c25 = i < n ? s.charCodeAt(i) : -1;
                                    if (c25 >= 0 && c25 < 128 && T0[c25] === 1 || c25 >= 128 && c25 <= 65535) {
                                      {
                                        const c26 = c25;
                                        if (c26 === 35) {
                                          {
                                            const c27 = top;
                                            if (top + 4 > buf.length) grow();
                                            top += 4;
                                            buf[c27] = 7;
                                            buf[c27 + 1] = i;
                                            i++;
                                            {
                                              let c30 = i;
                                              const c31 = n;
                                              const c32 = s;
                                              const c33 = c30 + 16 < c31 ? c30 + 16 : c31;
                                              while (c30 < c33) {
                                                const c28 = c32.charCodeAt(c30);
                                                if (!(c28 >= 0 && c28 < 128 && T8[c28] === 1 || c28 >= 128 && c28 <= 8231 || c28 >= 8234 && c28 <= 65535)) break;
                                                c30++;
                                              }
                                              if (c30 === c33 && c30 < c31) {
                                                if (c31 !== c32.length) {
                                                  while (c30 < c31) {
                                                    const c28 = c32.charCodeAt(c30);
                                                    if (!(c28 >= 0 && c28 < 128 && T8[c28] === 1 || c28 >= 128 && c28 <= 8231 || c28 >= 8234 && c28 <= 65535)) break;
                                                    c30++;
                                                  }
                                                } else {
                                                  R0.lastIndex = c30;
                                                  c30 = R0.test(c32) ? R0.lastIndex - 1 : c31;
                                                }
                                              }
                                              i = c30;
                                            }
                                            buf[c27 + 2] = i;
                                            buf[c27 + 3] = top;
                                          }
                                          {
                                            const c34 = i < n ? s.charCodeAt(i) : -1;
                                            if (c34 >= 8232 && c34 <= 8233) {
                                              {
                                                const c35 = top;
                                                if (top + 4 > buf.length) grow();
                                                top += 4;
                                                buf[c35] = 8;
                                                buf[c35 + 1] = i;
                                                i++;
                                                if (!r_rest()) return false;
                                                buf[c35 + 2] = i;
                                                buf[c35 + 3] = top;
                                              }
                                            }
                                          }
                                        } else if (c26 >= 0 && c26 < 128 && T9[c26] === 1 || c26 >= 128 && c26 <= 65535) {
                                          {
                                            const c36 = top;
                                            if (top + 4 > buf.length) grow();
                                            top += 4;
                                            buf[c36] = 8;
                                            buf[c36 + 1] = i;
                                            i++;
                                            if (!r_rest()) return false;
                                            buf[c36 + 2] = i;
                                            buf[c36 + 3] = top;
                                          }
                                        } else return fail('"#" or front matter');
                                      }
                                    }
                                  }
                                } else if (c24 >= 0 && c24 < 128 && T0[c24] === 1 || c24 >= 128 && c24 <= 65535) {
                                  {
                                    const c37 = top;
                                    if (top + 4 > buf.length) grow();
                                    top += 4;
                                    buf[c37] = 8;
                                    buf[c37 + 1] = i;
                                    i++;
                                    if (!r_rest()) return false;
                                    buf[c37 + 2] = i;
                                    buf[c37 + 3] = top;
                                  }
                                } else return fail("front matter");
                              }
                            }
                          }
                        } else if (c17 >= 0 && c17 < 128 && T10[c17] === 1 || c17 >= 128 && c17 <= 65535) {
                          i++;
                          if (!r_rest()) return false;
                        } else return fail("front matter");
                      }
                    }
                  }
                } else if (c12 >= 0 && c12 < 128 && T11[c12] === 1 || c12 >= 128 && c12 <= 65535) {
                  i++;
                  if (!r_rest()) return false;
                } else return fail('":" or front matter');
              }
            }
          }
        } else if (c2 >= 0 && c2 < 128 && T12[c2] === 1 || c2 >= 128 && c2 <= 65535) {
          i++;
          if (!r_rest()) return false;
        } else return fail("front matter");
      }
    }
  }
  return true;
}
function r_rest() {
  {
    let c40 = i;
    const c41 = n;
    const c42 = s;
    const c43 = c40 + 16 < c41 ? c40 + 16 : c41;
    while (c40 < c43) {
      const c38 = c42.charCodeAt(c40);
      if (!(c38 >= 0)) break;
      c40++;
    }
    if (c40 === c43 && c40 < c41) {
      if (c41 !== c42.length) {
        while (c40 < c41) {
          const c38 = c42.charCodeAt(c40);
          if (!(c38 >= 0)) break;
          c40++;
        }
      } else {
        R1.lastIndex = c40;
        c40 = R1.test(c42) ? R1.lastIndex - 1 : c41;
      }
    }
    i = c40;
  }
  return true;
}
function r_blanks() {
  {
    let c46 = i;
    const c47 = n;
    const c48 = s;
    const c49 = c46 + 16 < c47 ? c46 + 16 : c47;
    while (c46 < c49) {
      const c44 = c48.charCodeAt(c46);
      if (!(c44 === 9 || c44 === 32)) break;
      c46++;
    }
    if (c46 === c49 && c46 < c47) {
      if (c47 !== c48.length) {
        while (c46 < c47) {
          const c44 = c48.charCodeAt(c46);
          if (!(c44 === 9 || c44 === 32)) break;
          c46++;
        }
      } else {
        R2.lastIndex = c46;
        c46 = R2.test(c48) ? R2.lastIndex - 1 : c47;
      }
    }
    i = c46;
  }
  return true;
}
function r_blanks1() {
  {
    const c51 = i;
    let c52 = i;
    const c53 = n;
    const c54 = s;
    const c55 = c52 + 16 < c53 ? c52 + 16 : c53;
    while (c52 < c55) {
      const c50 = c54.charCodeAt(c52);
      if (!(c50 === 9 || c50 === 32)) break;
      c52++;
    }
    if (c52 === c55 && c52 < c53) {
      if (c53 !== c54.length) {
        while (c52 < c53) {
          const c50 = c54.charCodeAt(c52);
          if (!(c50 === 9 || c50 === 32)) break;
          c52++;
        }
      } else {
        R2.lastIndex = c52;
        c52 = R2.test(c54) ? R2.lastIndex - 1 : c53;
      }
    }
    i = c52;
    if (i === c51) return fail("front matter");
  }
  return true;
}
const RULES = { "line": r_line, "rest": r_rest, "blanks": r_blanks, "blanks1": r_blanks1 };
const OK = { ok: true, tree: { buf, top: 0, kinds: KINDS } };
function parse(input, rule = "line") {
  let start = r_line;
  if (rule !== "line") {
    const named = Object.hasOwn(RULES, rule) ? RULES[rule] : void 0;
    if (!named) throw new Error('segno: no rule "' + rule + '"');
    start = named;
  }
  s = input;
  n = s.length;
  i = 0;
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
  return OK;
}
return { parse };
})();
// ── segno:generated:end ──


/** Work counter for the unit tier (HARD RULE #32: count work, never time it): lines parsed, and visits by the outer
 *  loop and the body loop together, since the process started. A test reads the difference across one call. */
export const keyWork = { lines: 0, visits: 0 };

// The node kinds the line parser writes, by name.
const KIND = Object.fromEntries(lineGrammar.parse('', 'line').tree.kinds.map((k, i) => [k, i]));

/**
 * @typedef {object} FrontMatterKey  one key line of the front matter
 * @property {string} name        the key, as written
 * @property {string} indent      the blanks before it; '' at column 0
 * @property {string} raw         everything after the colon to the end of the line, untouched (a scalar reader cleans it)
 * @property {number} line        its line in the YAML body, 0-based
 * @property {number} from        where the line starts, as an offset into the text the keys were read from
 * @property {number} to          where it ends (before its line end)
 * @property {number} nameFrom    the name's span
 * @property {number} nameTo
 * @property {number} valueFrom   the value's span: `raw` less its leading and trailing blanks. Empty (`valueFrom ===
 *                                valueTo`) for `key:` with nothing after it
 * @property {number} valueTo
 * @property {boolean} blockScalar  whether the value is a block scalar header (`|`, `>-` …); its body lines are not keys
 * @property {number} bodyEnd     a block scalar's body is YAML lines `line + 1` to `bodyEnd` (exclusive); 0 on any other
 *                                key. (Spans and the key each nests under are `lattice-deck`'s, which alone reads them:
 *                                this module ships in every page that reads a register, so it carries only what they use.)
 */

/**
 * The key lines of a YAML body, in order. `base` is added to every offset, so a caller holding the whole source gets
 * source offsets. Every line of a block scalar's body is skipped.
 *
 * @param {string} yaml   the front matter's YAML body (no `---` fences)
 * @param {number} [base] the offset of `yaml` in the text the caller holds
 * @returns {FrontMatterKey[]}
 */
export function frontMatterKeys(yaml, base = 0) {
  const text = String(yaml ?? '');
  // Every line's [start, end), the end before its terminator.
  const lines = [];
  const TERM = /\r\n|\r|\n/g;
  let start = 0;
  for (let m = TERM.exec(text); m; m = TERM.exec(text)) {
    lines.push([start, m.index]);
    start = m.index + m[0].length;
  }
  lines.push([start, text.length]);
  // Each line read once by the grammar.
  const read = lines.map(([from, to]) => readLine(text.slice(from, to)));
  keyWork.lines += lines.length;
  const keys = [];
  for (let i = 0; i < lines.length; i++) {
    keyWork.visits++;
    const r = read[i];
    if (!r.key) continue;
    const [from, to] = lines[i];
    let bodyEnd = 0;
    if (r.header) {
      // Its body: every later line that is blank or indented deeper than the header. The outer loop resumes after it,
      // so each line is visited once.
      let j = i + 1;
      while (j < lines.length) {
        keyWork.visits++;
        const next = text.slice(lines[j][0], lines[j][1]);
        if (next.trim() && read[j].indent <= r.indent) break;
        j++;
      }
      bodyEnd = j;
    }
    keys.push(keyOf(text.slice(from, to), r, from, i, base, bodyEnd));
    if (bodyEnd) i = bodyEnd - 1;
  }
  // Frozen: a reader keeps one list for many reads (lib/core/front-matter-key.js `keysOf`), so none may change it.
  return Object.freeze(keys);
}

/**
 * One line through the grammar: its indent width, whether it is a key line, and if it is, where its name and colon sit, its indent width, and
 * whether it is a block-scalar header (a colon, an indicator after a lead, and no `wide`, `gap` or `junk`).
 */
function readLine(line) {
  const r = lineGrammar.parse(line, 'line');
  if (!r.ok) throw Error('front matter');
  const { buf, top } = r.tree;
  // Every node, nested ones included (the flat tree is preorder, four integers a node): which kinds occur, and the spans
  // of the indent, the name and the colon.
  let seen = 0;
  const span = [];
  for (let k = 0; k < top; k += 4) {
    seen |= 1 << buf[k];
    span[buf[k]] = k;
  }
  const has = (kind) => (seen >> KIND[kind]) & 1;
  const at = (kind, end) => buf[span[KIND[kind]] + 1 + end];
  const indent = at('indent', 1) - at('indent', 0); // the line opens with its indent node, empty or not
  if (!has('colon')) return { key: false, indent };
  return { key: true, indent, nameFrom: at('name', 0), nameTo: at('name', 1), colonTo: at('colon', 1), header: has('ind') && has('lead') && !has('wide') && !has('gap') && !has('junk') };
}

function keyOf(line, r, from, index, base, bodyEnd) {
  const raw = line.slice(r.colonTo);
  let vFrom = r.colonTo;
  let vTo = line.length;
  while (vFrom < vTo && (line[vFrom] === ' ' || line[vFrom] === '\t')) vFrom++;
  while (vTo > vFrom && (line[vTo - 1] === ' ' || line[vTo - 1] === '\t')) vTo--;
  const at = base + from;
  return Object.freeze({
    name: line.slice(r.nameFrom, r.nameTo), indent: line.slice(0, r.nameFrom), raw, line: index, from: at, to: at + line.length,
    nameFrom: at + r.nameFrom, nameTo: at + r.nameTo, valueFrom: at + vFrom, valueTo: at + vTo, blockScalar: bodyEnd > 0, bodyEnd,
  });
}

/** The last column-0 line for `name`, or null. */
export function topLevelKey(keys, name) {
  for (let i = keys.length - 1; i >= 0; i--) if (keys[i].name === name && !keys[i].indent) return keys[i];
  return null;
}

/** The last column-0 line for `name`, else the first at any indent, else null: the loose read registers have. */
export function looseKey(keys, name) {
  return topLevelKey(keys, name) ?? keys.find((k) => k.name === name) ?? null;
}

