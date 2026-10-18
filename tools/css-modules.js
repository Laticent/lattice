/**
 * Style modules — cut the assembled bundle into ordered files without changing a byte of it.
 *
 * `tools/build-css.js` assembles dist/lattice.css from many sources (HARD RULE #1: source order
 * IS the cascade). This file turns that same assembly into a list of ordered MODULES, each a
 * contiguous slice of the bundle, so a loader can fetch only the slices a deck uses. It changes
 * no CSS: join the modules with "\n" and you get dist/lattice.css back, byte for byte
 * (test/unit/cli/css-modules.test.js proves it). That is the whole contract of the split, and it
 * is why a module here never reorders a rule.
 *
 * Two kinds of cut:
 *   - SOURCE cuts. Every source the bundler emits (a component's stylesheet, a base file, a
 *     plugin's sheet) is its own module. The bundler names them; this file never guesses.
 *   - RUN cuts, inside the few base files that are too big to ship whole (base.modifiers.css is
 *     290 KB, base.tokens.css 116 KB, base.finish.css 82 KB, base.sketch.css 56 KB, base.variants.css
 *     47 KB). Their top-level rules are grouped by the first class they name (`section.divider …`
 *     is the "divider" run), and a run becomes a module. Runs are contiguous: two rules for the
 *     same class that sit apart in the source stay in two modules, because moving one would change
 *     the cascade. Runs under MIN_RUN_BYTES fold into the module before them, so the file does not
 *     explode into hundreds of tiny requests.
 *
 * The manifest records, per module: its id, file, byte length, SHA-256 and the source it came
 * from. The loader will add what each module needs (E2); this file only proves the cut.
 *
 * Pure: strings in, strings out. No fs, no network (the writer lives in build-css.js).
 */
const crypto = require('node:crypto');
const csstree = require('css-tree');

/** Runs smaller than this fold into the previous module of the same source. */
const MIN_RUN_BYTES = 2048;

/** Sources cut by run. Everything else stays one module per source. */
const RUN_SPLIT = new Set([
  'lib/base/base.tokens.css',
  'lib/base/base.modifiers.css',
  'lib/base/base.finish.css',
  'lib/base/base.sketch.css',
  'lib/base/base.variants.css',
]);

const byteLength = (s) => Buffer.byteLength(s, 'utf8');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const slug = (s) => s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/** The first class a top-level node names, or '' when it names none. */
function primaryToken(node) {
  let found = '';
  const visit = (n) => {
    csstree.walk(n, {
      visit: 'Rule',
      enter(rule) {
        if (found) return this.break;
        csstree.walk(rule.prelude, {
          visit: 'ClassSelector',
          enter(c) {
            if (!found) found = c.name;
            return this.break;
          },
        });
        return found ? this.break : undefined;
      },
    });
  };
  visit(node);
  return found;
}

/**
 * Cut one source's text into run modules. Returns [{ token, text }] whose texts concatenate
 * (with no separator) to the input.
 */
function splitRuns(text) {
  const ast = csstree.parse(text, { positions: true });
  const nodes = ast.children.toArray();
  if (nodes.length === 0) return [{ token: '', text }];
  // Group consecutive nodes by primary token.
  const runs = [];
  for (const node of nodes) {
    const token = primaryToken(node);
    const last = runs[runs.length - 1];
    if (last && last.token === token) last.nodes.push(node);
    else runs.push({ token, nodes: [node] });
  }
  // Boundaries sit at the END of the previous node, so the comments before a rule travel with it.
  const cuts = runs.map((_r, i) => (i === 0 ? 0 : runs[i - 1].nodes[runs[i - 1].nodes.length - 1].loc.end.offset));
  const slices = runs.map((r, i) => ({ token: r.token, text: text.slice(cuts[i], i + 1 < runs.length ? cuts[i + 1] : text.length) }));
  // Fold small runs into the previous one (the first run absorbs a small successor instead).
  const out = [];
  for (const s of slices) {
    const prev = out[out.length - 1];
    if (prev && (s.text.length < MIN_RUN_BYTES || prev.text.length < MIN_RUN_BYTES)) {
      if (prev.text.length < s.text.length) prev.token = s.token; // the bigger piece names the module
      prev.text += s.text;
    } else out.push({ ...s });
  }
  return out;
}

/**
 * @param {{id:string, source:string|null, text:string}[]} parts  ordered pieces of the bundle,
 *   each already run through the bundle's post-processing
 * @returns {{id:string, source:string|null, text:string}[]}  modules; joined with "\n" they equal
 *   the parts joined with "\n"
 */
function toModules(parts) {
  const modules = [];
  for (const part of parts) {
    if (!part.source || !RUN_SPLIT.has(part.source)) {
      modules.push({ id: part.id, source: part.source, text: part.text });
      continue;
    }
    const runs = splitRuns(part.text);
    const seen = new Map();
    runs.forEach((run, i) => {
      const base = run.token || (i === 0 ? 'head' : 'rest');
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      modules.push({ id: `${part.id}#${base}${n > 1 ? `~${n}` : ''}`, source: part.source, text: run.text });
    });
  }
  return modules;
}

/**
 * Within a source cut into runs the pieces abut with no separator (they were one text); between
 * sources the bundle joined with "\n". `join` reproduces exactly that.
 */
function joinModules(modules) {
  let out = '';
  modules.forEach((m, i) => {
    if (i > 0) out += m.source !== null && m.source === modules[i - 1].source && m.id.includes('#') ? '' : '\n';
    out += m.text;
  });
  return out;
}

/** File name for a module: a stable order prefix, so a directory listing reads in cascade order. */
function fileName(index, id) {
  return `${String(index).padStart(4, '0')}-${slug(id)}.css`;
}

function manifestOf(modules, fullText, note) {
  return {
    version: 1,
    note: note || 'GENERATED by tools/build-css.js. Join the modules in order (a "\\n" between sources, none inside a source cut into runs) to get dist/lattice.css. bytes are UTF-8 bytes. Module files keep lattice.css\'s stylesheet-relative font URLs (fonts/<file>.woff2), so a loader must resolve them against dist/, not against dist/styles/. See tools/css-modules.js.',
    bytes: byteLength(fullText),
    sha256: sha256(fullText),
    modules: modules.map((m, i) => ({
      id: m.id,
      file: fileName(i, m.id),
      bytes: byteLength(m.text),
      sha256: sha256(m.text),
      source: m.source,
    })),
  };
}

module.exports = { MIN_RUN_BYTES, RUN_SPLIT, splitRuns, toModules, joinModules, manifestOf, fileName, sha256 };
