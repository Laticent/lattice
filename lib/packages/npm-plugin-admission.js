/**
 * What a bundle must be before an NPM PLUGIN may be handed to the door (threat-model note
 * engineering/decisions/2026-10-16-npm-plugin-threat-model.md §5.1 G2 and G5, §6 decisions 7 to 9).
 *
 * A plugin is one self-contained bundle that Lattice downloads as it is. This module takes its
 * BYTES and its pinned hash and answers yes or no. It never takes a path, never runs `npm`, never
 * `require`s or `import`s what it is given: G5 is that nothing in the host loads a plugin in Node,
 * and a function that only ever sees text cannot. The one place the code runs is the locked page.
 *
 * Refusals, each with a test that fails without it (test/unit/cli/npm-plugin-admission.test.js):
 *   - the bytes do not hash to the pinned SHA-256 (a silent update, a swapped download);
 *   - the bundle leaves anything external: a static `import`, an `export … from`, a dynamic
 *     `import()`, `import.meta`, or any use of `require`, `__require` (esbuild's helper) or `importScripts`. Bundlers write none of these when
 *     everything is inlined, so any one means a dependency was left for someone to supply.
 *
 * The OS-layer rule (refuse at OFF, a failed probe counts as OFF) is `npmLayerRefusal` in
 * lib/core/os-sandbox.js, enforced where the browser's layer is known: the door's worker.
 */
const crypto = require('node:crypto');
const { parse, tokenizer } = require('acorn');

/**
 * An HTML-like comment, which a CLASSIC script reads as a comment and a module reads as operators:
 * `<!--` anywhere, or `-->` first on its line. The worker runs the bundle as a classic script and
 * `externalRefusal` parses it as a module, so a `<!--` line that opened a block comment (for the
 * module) hid an `importScripts` line from the check while the worker ran it (the red team, 2026-10-19). Found on tokens, so a string or a
 * comment that says `<!--` is not one.
 */
function htmlCommentRefusal(code) {
  let prev = [];
  try {
    for (const t of tokenizer(code, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true })) {
      const [a, b] = prev;
      if (b && a && a.value === '<' && b.value === '!' && t.value === '--' && a.end === b.start && b.end === t.start) return 'it holds `<!--`, which a script reads as a comment';
      if (b && b.value === '--' && t.value === '>' && b.end === t.start) {
        const lineStart = code.lastIndexOf('\n', b.start - 1) + 1;
        if (!a || a.end <= lineStart) return 'it holds `-->` at the start of a line, which a script reads as a comment';
      }
      prev = [b, t];
    }
  } catch {
    return null; // the parse below reports what does not tokenize
  }
  return null;
}

/** The first thing a bundle leaves external, or null. Parsed, not grepped: a string or comment may say `require(`. */
function externalRefusal(code) {
  const html = htmlCommentRefusal(code);
  if (html) return html;
  let ast;
  try {
    ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
  } catch (e) {
    return `it does not parse as a module (${String(e.message).slice(0, 120)})`;
  }
  const stack = [ast];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== 'object') continue;
    if (Array.isArray(n)) {
      stack.push(...n);
      continue;
    }
    if (n.type === 'ImportDeclaration') return `it imports ${JSON.stringify(String(n.source.value).slice(0, 80))}`;
    if ((n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') && n.source) return `it re-exports from ${JSON.stringify(String(n.source.value).slice(0, 80))}`;
    if (n.type === 'ImportExpression') return 'it calls import()';
    if (n.type === 'MetaProperty' && n.meta.name === 'import') return 'it reads import.meta';
    // Any mention of the loader, not only a call: esbuild leaves an external as `__require("dep")` behind a
    // helper, and `(0, require)(x)`, `module.require(x)` and `const r = require` all reach it too.
    // A bundle that is really self-contained never names `require` (found by the checker, 2026-10-18).
    if (n.type === 'Identifier' && (n.name === 'require' || n.name === '__require' || n.name === 'importScripts')) return `it names ${n.name}`;
    if (n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier' && n.property.name === 'require') return 'it reaches for .require';
    for (const k of Object.keys(n)) if (k !== 'type' && k !== 'start' && k !== 'end' && n[k] && typeof n[k] === 'object') stack.push(n[k]);
  }
  return null;
}

/**
 * Admit one downloaded plugin bundle, or say why not.
 * @param {{ name: string, code: string|Uint8Array, sha256: string }} plugin  `sha256` is the hash pinned in the project's explicit plugin list
 * @returns {{ ok: true, sha256: string } | { ok: false, reason: string }}
 */
function admitNpmBundle(plugin) {
  const { name, code, sha256 } = plugin ?? {};
  if (typeof name !== 'string' || !name) return { ok: false, reason: 'it has no name' };
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) return { ok: false, reason: 'no SHA-256 is pinned for it' };
  if (typeof code !== 'string' && !(code instanceof Uint8Array)) return { ok: false, reason: 'it has no code' };
  const got = crypto.createHash('sha256').update(code).digest('hex');
  if (got !== sha256) return { ok: false, reason: `its bytes hash to ${got}, not the pinned ${sha256}` };
  const why = externalRefusal(typeof code === 'string' ? code : Buffer.from(code).toString('utf8'));
  return why ? { ok: false, reason: `it is not a self-contained bundle: ${why}` } : { ok: true, sha256: got };
}

module.exports = { admitNpmBundle, externalRefusal };
