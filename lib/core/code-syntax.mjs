/**
 * The one SYNTAX a code package may not hold: a dynamic `import()` (contract note §10, "The wall's
 * holes"). The worker's second wall (code-shape.mjs `workerScript`) takes names off the worker's
 * global, and `import()` is not a name, so no property wall can take it away. Under the frame's
 * policy it reaches nothing on Chromium, Gecko and WebKit; behind the wall alone it reached a
 * loopback server on all three. So a package whose code holds one is refused, and the wall removes
 * `eval`, `Function` and string timers so code built at run time cannot bring it back.
 *
 * PARSED, not grepped: `"import("` in a string or a comment is fine, and `import /* x *\/ (u)` is not.
 * The parse reads the exact script the worker runs (`workerScript`'s output, a classic script), not
 * the package's file as a module: a classic script reads `<!--` and a line-leading `-->` as comments
 * where a module does not, and a check that parsed a different program than the one that runs could
 * be talked past. A script acorn cannot parse is refused too, rather than run unread.
 *
 * Kept out of code-shape.mjs on purpose: acorn is ~30 KB gz, and code-shape.mjs is in the site's
 * eager bundle (docs/route-budget.json). The CLI's gate loads this module directly; the Studio loads
 * it only when an import or a render meets a code package.
 */
import { parse } from 'acorn';
import { workerScript } from './code-shape.mjs';

/**
 * Why a package's `transform.js` is refused for its syntax, or null. Call after `refuseCode` has
 * accepted the shape: a transform that does not end in `export { name as default }` throws here.
 * @param {string} code  the package's `transform.js`
 * @returns {string|null}
 */
export function codeSyntaxRefusal(code) {
  return scriptRefusal(workerScript(code));
}

/**
 * The worker's script for a package, refusing it first for its syntax: what both doors' runners
 * load (lib/core/code-sandbox.js, docs/src/lib/code-packages/runner.ts), so a package that reached a
 * render without passing a gate (a Studio record saved before this check, a folder placed by hand)
 * is still refused, on the very text the worker would run.
 * @param {string} code  the package's `transform.js`
 * @returns {string}
 */
export function checkedWorkerScript(code) {
  const script = workerScript(code);
  const why = scriptRefusal(script);
  if (why) throw new Error(`code sandbox: ${why.replace(/^its /, "the package's ")}`);
  return script;
}

// Where the package's own text starts inside the worker's script (workerScript puts it here), so a
// position is reported in the author's file, not in ours. The first match is ours: the wall before it
// never spells it.
const BODY_OPEN = 'const __transform=(()=>{';

/** `line:column` (1-based) of `pos` in the author's file, and the line around it, or null when `pos` is in our wrapper. */
function whereIn(script, pos) {
  const start = script.indexOf(BODY_OPEN) + BODY_OPEN.length;
  const at = pos - start;
  // Past the author's last character is our `\n;return name})()`: an unclosed brace or the like.
  if (!(at >= 0)) return null;
  if (pos >= script.lastIndexOf('\n;return ')) return 'the end of the file';
  // Every line terminator JavaScript counts: CRLF, LF, CR, U+2028, U+2029.
  const lines = script.slice(start, pos).split(/\r\n|[\n\r\u2028\u2029]/);
  const line = lines.length;
  const col = lines[line - 1].length + 1;
  const excerpt = (lines[line - 1].slice(-30) + script.slice(pos, pos + 40).split(/[\n\r\u2028\u2029]/)[0]).replace(/[^\x20-\x7e]/g, '?');
  return `${line}:${col}, \`${excerpt}\``;
}

// A verdict is a pure function of the script, and one process may ask about the same package many
// times (the CLI's `list` and render gate, the Studio's runner on every render): remembered for the
// last few scripts.
const memo = new Map();
const MEMO_SIZE = 32;

function scriptRefusal(script) {
  if (memo.has(script)) return memo.get(script);
  const why = parseRefusal(script);
  if (memo.size >= MEMO_SIZE) memo.delete(memo.keys().next().value);
  memo.set(script, why);
  return why;
}

function parseRefusal(script) {
  let ast;
  try {
    ast = parse(script, { ecmaVersion: 'latest', sourceType: 'script' });
  } catch (e) {
    const where = Number.isInteger(e?.pos) ? whereIn(script, e.pos) : null;
    const what = String(e?.message ?? e).replace(/\s*\(\d+:\d+\)$/, '');
    return `its transform.js does not parse as the script a code package runs as (${what}${where ? ` at ${where}` : ''}); bundle it as an ES module with one default export`;
  }
  // Iterative: a deeply nested bundle must not overflow the host's stack on the way to a verdict.
  const stack = [ast];
  while (stack.length) {
    const node = stack.pop();
    if (node.type === 'ImportExpression') {
      const where = whereIn(script, node.start);
      return `its transform.js holds a dynamic \`import()\`${where ? ` at ${where}` : ''}, which a code package may not use: bundle what it loads into transform.js`;
    }
    for (const key in node) {
      const v = node[key];
      if (Array.isArray(v)) {
        for (const c of v) if (c && typeof c.type === 'string') stack.push(c);
      } else if (v && typeof v === 'object' && typeof v.type === 'string') stack.push(v);
    }
  }
  return null;
}
