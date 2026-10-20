/**
 * lib/core/katex-wall.js — KaTeX behind a WALL, in this process, with no browser (owner decision 14 and the
 * 2026-10-20 speed rule: "spinning up a browser is an absolute no"; engineering/decisions/
 * 2026-10-19-first-party-plugins-in-the-sandbox.md §3).
 *
 * KaTeX runs inside QuickJS, a small JavaScript engine compiled to WebAssembly (`quickjs-emscripten-core` with the
 * release-sync build). The wall is WebAssembly's own: the code inside reaches its linear memory and nothing else.
 * No `require`, no `fs`, no network, no process, no timers: this module hands it KaTeX's source and one string per
 * formula, and reads one string back. Three limits hold a hostile formula to account:
 *
 *   memory   MEMORY_LIMIT, the WebAssembly memory's hard maximum: a formula that grows without end fails inside
 *   stack    STACK_LIMIT (256 KB), QuickJS's own: runaway recursion in running code fails inside as "stack overflow".
 *            Measured, this does not cost a formula: Node's own stack is the tighter bound, and a formula nested about
 *            100 deep (`\frac` in `\frac`…) overflows it at 1 MB as at 256 KB. That overflow, and a deeply nested
 *            source while QuickJS parses it, surface as a RangeError from the WebAssembly, which this module catches
 *            like any other failure: the instance is dropped and the formula shows its source. KaTeX in Node typesets
 *            such a formula; nothing a deck plausibly holds nests that deep.
 *   time     TIME_LIMIT_MS per formula, by QuickJS's interrupt handler: a formula that never finishes is stopped
 *
 * A formula that hits a limit, or fails inside in any other way, shows its source, as any KaTeX failure always has, and
 * the whole WebAssembly instance is rebuilt before the next one, so nothing a failed formula left behind reaches another.
 *
 * SYNCHRONOUS ON PURPOSE. `createEngine().render()` is synchronous and thousands of callers depend on it, so the
 * wall loads synchronously: `new WebAssembly.Module` and `new WebAssembly.Instance` (Node allows both on the main
 * thread) handed to the emscripten factory through `instantiateWasm`, and the module built without an `await`.
 * Measured on first use: ~30 ms for the WebAssembly, ~95 ms to load KaTeX inside, once per process.
 *
 * THE OUTPUT IS CHECKED, NEVER RE-SPELLED (`checkTypeset`). parse5, the spec-conformant HTML parser a browser's
 * parse agrees with, reads each result; every node must be on KATEX_VOCABULARY, the tags, attributes and style
 * properties KaTeX's own source emits with `trust` off. A result that passes is returned byte for byte, so every
 * export is identical to the old in-process typeset. One that does not (a KaTeX bug, or an element this list never
 * saw) goes through the full slide sanitizer instead (lib/core/sanitize-slide-html.mjs, DOMPurify on jsdom),
 * which loads only then: its ~0.75 s is why it is the fallback and not the rule.
 *
 * The Playground and the Studio never load this file: tools/build-playground.js swaps it for
 * lib/engine/katex-browser-stub.js, so neither the WebAssembly nor parse5 reaches a web bundle.
 */

const fs = require('node:fs');

const MEMORY_LIMIT = 128 * 1024 * 1024;
const INITIAL_MEMORY = 16 * 1024 * 1024;
const STACK_LIMIT = 256 * 1024;
const TIME_LIMIT_MS = 5000;
const KATEX_SOURCE = require.resolve('../plugins/math/vendor/katex/katex.min.js');

/**
 * What KaTeX 0.16 emits with `trust: false`, read from its source (`setAttribute(…)`, `MathNode(…)`, `style.…`) and
 * confirmed against every shipped formula in all three output modes. Deliberately ABSENT: `href`, `src`, `alt` and
 * the elements that carry them (`a`, `img`, `mglyph`), which only `\href` / `\includegraphics` with `trust` on emit.
 */
const MATHML_TAGS = ['math', 'semantics', 'annotation', 'mrow', 'mi', 'mn', 'mo', 'mtext', 'mspace', 'msup', 'msub', 'msubsup',
  'mfrac', 'msqrt', 'mroot', 'mover', 'munder', 'munderover', 'mtable', 'mtr', 'mtd', 'mlabeledtr', 'mpadded', 'mphantom',
  'mstyle', 'menclose'];
const KATEX_VOCABULARY = Object.freeze({
  tags: new Set([
    'html:span',
    'svg:svg', 'svg:path', 'svg:line',
    ...MATHML_TAGS.map((t) => `mathml:${t}`),
    // KaTeX nests MathML inside `<mi>` and `<mo>` (`\bmod`, `\coloneqq`, `\stackrel`, `\dddot`, ...). Those are MathML
    // text integration points, so the HTML parser — parse5 and every browser alike — files what is inside them in the
    // HTML namespace, as unknown elements: inert, and rendered as they always were. Refusing them sent those formulas
    // to the full sanitizer, which deleted the subtree and emptied the accessible copy (the checker, 2026-10-20).
    // `annotation` and `math` stay MathML-only.
    ...MATHML_TAGS.filter((t) => t !== 'math' && t !== 'annotation').map((t) => `html:${t}`),
  ]),
  attrs: new Set([
    'class', 'style', 'aria-hidden', 'title', 'display', 'encoding',
    'width', 'height', 'depth', 'voffset', 'lspace', 'rspace', 'viewBox', 'preserveAspectRatio', 'd', 'x1', 'x2', 'y1', 'y2', 'stroke-width',
    'accent', 'accentunder', 'columnalign', 'columnlines', 'columnspacing', 'rowlines', 'rowspacing', 'displaystyle', 'scriptlevel',
    'fence', 'separator', 'stretchy', 'largeop', 'linebreak', 'linethickness', 'mathbackground', 'mathcolor', 'mathsize', 'mathvariant',
    'maxsize', 'minsize', 'notation', 'valign',
  ]),
  styles: new Set([
    'background-color', 'border', 'border-bottom-width', 'border-color', 'border-right-style', 'border-right-width', 'border-style',
    'border-top-width', 'border-width', 'bottom', 'color', 'height', 'left', 'margin', 'margin-left', 'margin-right', 'margin-top',
    'min-width', 'padding-left', 'position', 'text-shadow', 'top', 'vertical-align', 'width',
  ]),
});
const NAMESPACES = {
  'http://www.w3.org/1999/xhtml': 'html',
  'http://www.w3.org/2000/svg': 'svg',
  'http://www.w3.org/1998/Math/MathML': 'mathml',
};
// A style value is words, numbers, units, colors and these functions, nothing else: no `url(`, no `image-set(`,
// no escape (`\`), no at-rule, no comment, no quote.
const STYLE_VALUE_RE = /^[\w\s#%.,+\-*()]*$/;
const STYLE_FUNCTIONS = new Set(['var', 'calc', 'rgb', 'rgba', 'hsl', 'hsla']);

let parse5;
/** True when every node of `html` is on KATEX_VOCABULARY. */
function checkTypeset(html) {
  parse5 ??= require('parse5');
  const stack = [parse5.parseFragment(html)];
  while (stack.length) {
    const node = stack.pop();
    if (node.nodeName === '#text') continue;
    if (node.nodeName !== '#document-fragment') {
      if (!node.tagName || !KATEX_VOCABULARY.tags.has(`${NAMESPACES[node.namespaceURI]}:${node.tagName}`)) return false;
      for (const a of node.attrs) {
        // The parser files `xmlns` under the XMLNS namespace; it may only name the element's own namespace.
        if (a.name === 'xmlns') {
          if (a.value !== node.namespaceURI) return false;
          continue;
        }
        if (a.namespace || a.prefix || !KATEX_VOCABULARY.attrs.has(a.name)) return false;
        if (a.name === 'style' && !styleOk(a.value)) return false;
      }
    }
    for (const c of node.childNodes ?? []) stack.push(c);
  }
  return true;
}

function styleOk(value) {
  for (const decl of value.split(';')) {
    if (!decl.trim()) continue;
    const at = decl.indexOf(':');
    if (at < 0) return false;
    const prop = decl.slice(0, at).trim();
    const v = decl.slice(at + 1);
    if (!KATEX_VOCABULARY.styles.has(prop) || !STYLE_VALUE_RE.test(v)) return false;
    // KaTeX positions only within its own boxes: `fixed` or `sticky` would let a result cover the slide.
    if (prop === 'position' && !/^\s*(?:relative|absolute)\s*$/.test(v)) return false;
    for (const m of v.matchAll(/([a-z-]*)\s*\(/gi)) if (!STYLE_FUNCTIONS.has(m[1].toLowerCase())) return false;
  }
  return true;
}

let sanitizer;
/** The full slide sanitizer, loaded only for a result `checkTypeset` refused. */
function sanitizeFully(html) {
  if (!sanitizer) {
    const { JSDOM } = require('jsdom');
    const { createSlideSanitizer } = require('./sanitize-slide-html.mjs');
    sanitizer = createSlideSanitizer(require('dompurify'), new JSDOM('').window);
  }
  return sanitizer(html);
}

let quickjs; // the QuickJS WebAssembly module: built once per process
let vm; // the context KaTeX lives in: rebuilt, with its WebAssembly instance, after a formula hits a limit
/** Build the QuickJS module synchronously (see the header). */
function quickjsModule() {
  if (quickjs) return quickjs;
  const factory = require('@jitl/quickjs-wasmfile-release-sync/emscripten-module');
  const { QuickJSFFI } = require('@jitl/quickjs-wasmfile-release-sync/ffi');
  const { QuickJSWASMModule } = require('quickjs-emscripten-core');
  const compiled = new WebAssembly.Module(fs.readFileSync(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm')));
  const emscripten = {
    // THE MEMORY LIMIT. The build imports its memory, so the instance gets one with a hard maximum: growing past it
    // fails inside, as "out of memory". QuickJS's own `setMemoryLimit` cannot be the limit here: this build has no
    // `malloc_usable_size`, so it counts nothing (measured: 2 GB of strings went through a 64 MB setting).
    wasmMemory: new WebAssembly.Memory({ initial: INITIAL_MEMORY / 65536, maximum: MEMORY_LIMIT / 65536 }),
    instantiateWasm(imports, done) {
      const instance = new WebAssembly.Instance(compiled, imports);
      done(instance, compiled);
      return instance.exports;
    },
  };
  factory(emscripten);
  if (!emscripten.calledRun) throw new Error('the QuickJS WebAssembly did not start synchronously');
  emscripten.type = 'sync';
  quickjs = new QuickJSWASMModule(emscripten, new QuickJSFFI(emscripten));
  return quickjs;
}

/** A fresh context holding KaTeX and one entry point, `__typeset(src, optionsJson)`. */
function katexContext() {
  const runtime = quickjsModule().newRuntime();
  runtime.setMaxStackSize(STACK_LIMIT);
  const ctx = runtime.newContext();
  const loaded = ctx.evalCode(
    `var module = { exports: {} }; var exports = module.exports; var self = globalThis;\n${fs.readFileSync(KATEX_SOURCE, 'utf8')}\n` +
      'var katex = module.exports.default || module.exports;\n' +
      'globalThis.__typeset = function (src, options) { return katex.renderToString(src, JSON.parse(options)); };',
    'katex.min.js',
  );
  if (loaded.error) {
    const why = ctx.dump(loaded.error);
    loaded.error.dispose();
    ctx.dispose();
    runtime.dispose();
    throw new Error(`KaTeX did not load inside the wall: ${why?.message ?? why}`);
  }
  loaded.value.dispose();
  return ctx;
}

function dropContext() {
  // NOT disposed piece by piece: QuickJS asserts when a runtime that hit a limit is freed with live objects, and an
  // emscripten abort leaves the instance unusable. The whole WebAssembly instance is dropped instead, and the next
  // formula builds a fresh one (~125 ms), so nothing a stopped formula left behind can reach another.
  vm = undefined;
  quickjs = undefined;
}


/**
 * Run `call(ctx)` inside the wall under the time limit, and read its result as a string. The limit stays installed
 * until the result is read, and the reads run no code inside: a string by `getString`, an error by its `message`
 * through `getProp` alone. `dump` would run getters and `toJSON` inside the wall with no deadline, which code inside
 * could use to hang this process (the checker, 2026-10-20). ANY failure drops the whole instance, so the next call
 * starts clean: a limit, a throw, or a result that is not a string.
 */
function inside(call) {
  vm ??= katexContext();
  const ctx = vm;
  const deadline = Date.now() + TIME_LIMIT_MS;
  ctx.runtime.setInterruptHandler(() => Date.now() > deadline);
  try {
    const result = call(ctx);
    if (result.error) {
      let message = 'the formula failed inside the wall';
      try {
        const m = ctx.getProp(result.error, 'message');
        if (ctx.typeof(m) === 'string') message = ctx.getString(m);
        m.dispose();
      } catch {
        /* a message that cannot be read is no message: the generic one stands */
      }
      throw new Error(message);
    }
    if (ctx.typeof(result.value) !== 'string') throw new Error('the wall returned something other than a string');
    const out = ctx.getString(result.value);
    result.value.dispose();
    return out;
  } catch (e) {
    dropContext();
    throw e;
  } finally {
    if (vm === ctx) ctx.runtime.removeInterruptHandler();
  }
}

/** KaTeX's output as it may leave: its own bytes when `checkTypeset` passes them, the full sanitizer's otherwise. */
function finish(html) {
  return checkTypeset(html) ? html : sanitizeFully(html);
}

/**
 * `katex.renderToString`, run inside the wall. Throws when KaTeX throws or a limit stops it, as KaTeX itself does,
 * so math.render.js's own catch shows the source.
 * @param {string} src
 * @param {object} options  KaTeX's options; JSON-serializable
 * @returns {string}
 */
function renderToString(src, options) {
  const html = inside((ctx) => {
    const fn = ctx.getProp(ctx.global, '__typeset');
    const a = ctx.newString(String(src));
    const b = ctx.newString(JSON.stringify(options ?? {}));
    try {
      return ctx.callFunction(fn, ctx.undefined, a, b);
    } finally {
      fn.dispose();
      a.dispose();
      b.dispose();
    }
  });
  return finish(html);
}

/** TEST SEAM: evaluate `code` in KaTeX's own context, under the same limits. Never called by the engine. */
function _insideWall(code) {
  return inside((ctx) => ctx.evalCode(String(code), 'probe.js'));
}

module.exports = { renderToString, checkTypeset, finish, KATEX_VOCABULARY, TIME_LIMIT_MS, MEMORY_LIMIT, _insideWall };
