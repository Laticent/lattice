#!/usr/bin/env node
/**
 * Generate the LTT JSON Schema from the LTT TypeScript types — guardrail G1 of
 * engineering/decisions/2026-09-24-lattice-timing-track.md §8: ONE source for the schema.
 *
 *   docs/src/lib/ltt/types.ts  →  docs/src/lib/ltt/ltt.schema.json  (committed)
 *
 * WHY GENERATE. The repo's known failure with a spec is drift: `readAlong` 1.0 was specified
 * and 1.1 shipped differently. A hand-written schema beside hand-written types is the same
 * shape waiting to happen, so the types are the source and this script derives the schema.
 * `--check` regenerates in memory and fails on any difference, and `npm run build:check`
 * runs it, so a type changed without regenerating cannot merge.
 *
 * WHY NOT A LIBRARY. A TS → JSON Schema package would be a new dependency for a file with
 * twenty declarations (HARD RULE #15). The TypeScript parser is already installed, and the
 * types file keeps to a small subset of TypeScript on purpose (its header lists it). Anything
 * outside that subset is REFUSED with its location — never approximated — because a schema
 * that silently loosened a field would pass every check this guardrail exists to run.
 *
 * Mapping: an interface is an object (`required` = its non-optional keys; `@closed` adds
 * `additionalProperties: false`); a union of string literals is an `enum`; any other union is
 * `oneOf`; `T[]` is an array; a fixed tuple uses `prefixItems`; a type name is a `$ref` into
 * `$defs`. Doc comments become `description`; `@integer`, `@minimum <n>` and `@pattern <re>`
 * narrow a type. Draft 2020-12.
 *
 * Flags:
 *   --check    Exit 1 when the committed schema differs from what the types generate.
 *   --silent   Suppress the success line.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'docs', 'src', 'lib', 'ltt', 'types.ts');
const OUT = path.join(ROOT, 'docs', 'src', 'lib', 'ltt', 'ltt.schema.json');
const ROOT_TYPE = 'Ltt';

/**
 * The doc comment attached to `node`, split into prose and tags.
 *
 * "Attached" means the LAST `/** … *\/` before the node with nothing but whitespace between them,
 * whichever line it sits on. TypeScript's own attachment misses a comment on the same line as the
 * previous token (`{ /** @integer *\/ a: number }` is, to TypeScript, a trailing comment of `{`),
 * and so did the leading-comment ranges this used to read: the tag silently vanished and the field
 * was loosened. So both leading and trailing ranges are read here, and the rule is positional.
 *
 * Tags come LAST, after the prose, and each carries at most one value token (`@minimum 0`,
 * `@pattern ^x$`; `@integer` and `@closed` carry none). Anything else after a tag is refused, because
 * it used to become the tag's value: `@pattern ^x$ the id` shipped the pattern `^x$ the id`.
 */
function docOf(node, sf) {
  const full = sf.getFullText();
  const pos = node.getFullStart();
  const ranges = [...(ts.getTrailingCommentRanges(full, pos) || []), ...(ts.getLeadingCommentRanges(full, pos) || [])]
    .filter((r) => full.slice(r.pos, r.pos + 3) === '/**')
    .sort((a, b) => a.pos - b.pos);
  const last = ranges[ranges.length - 1];
  if (!last) return { description: '', tags: {} };
  // AMBIGUOUS attachment is refused, never guessed (checker, PR #2347). A doc comment must sit
  // directly against its node — nothing but whitespace between — and when a line break separates
  // them, it must start its own line. `a: number; /** @integer *\/\n b: number` is ambiguous (it
  // reads as trailing `a` and would narrow `b`), and a plain comment wedged between a doc comment and
  // its field used to drop the tag silently.
  const gap = full.slice(last.end, node.getStart(sf));
  if (gap.trim() !== '') {
    throw new Error(`${where(node, sf)}: a doc comment is separated from this field by other text — put it directly above the field`);
  }
  const lineStart = full.lastIndexOf('\n', last.pos - 1) + 1;
  // Only an OPENING BRACE may precede it on its line: `{ /** … */` can document nothing but the
  // first member below it.
  if (/\n/.test(gap) && !/(?:^|\{)\s*$/.test(full.slice(lineStart, last.pos))) {
    throw new Error(`${where(node, sf)}: a doc comment trails the previous line — it is ambiguous which field it documents. Give it its own line above the field`);
  }
  const text = full.slice(last.pos, last.end);
  const body = text
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\*?\s?/, ''))
    .join('\n');
  const at = body.search(/(^|\s)@\w/);
  const prose = at < 0 ? body : body.slice(0, at);
  const tags = {};
  if (at >= 0) {
    const tokens = body.slice(at).trim().split(/\s+/);
    for (let i = 0; i < tokens.length; i++) {
      const name = tokens[i].slice(1);
      if (!tokens[i].startsWith('@') || !['integer', 'closed', 'minimum', 'pattern'].includes(name)) {
        throw new Error(
          `${where(node, sf)}: "${tokens[i]}" in a doc comment — the generator knows @integer, @closed, @minimum <n> and @pattern <regex>, and tags go last, after the prose`,
        );
      }
      if (name in tags) throw new Error(`${where(node, sf)}: @${name} appears twice`);
      if (name === 'minimum' || name === 'pattern') {
        const value = tokens[++i];
        if (value === undefined || value.startsWith('@')) throw new Error(`${where(node, sf)}: @${name} needs a value`);
        tags[name] = value;
      } else tags[name] = '';
    }
  }
  return { description: prose.replace(/\s+/g, ' ').trim(), tags };
}

function where(node, sf) {
  const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return `${path.relative(ROOT, SOURCE)}:${line + 1}:${character + 1}`;
}

/** Apply the narrowing tags to a schema already built for the type. */
function narrow(schema, tags, node, sf) {
  const out = { ...schema };
  if ('closed' in tags) throw new Error(`${where(node, sf)}: @closed belongs on an interface, not a field`);
  if ('integer' in tags) {
    if (out.type !== 'number') throw new Error(`${where(node, sf)}: @integer on a type that is not a number`);
    out.type = 'integer';
    // SAFE integers only: validateLtt refuses anything past 2^53, where packed relative times stop
    // adding back exactly, so the schema says the same.
    out.maximum = Number.MAX_SAFE_INTEGER;
  }
  if ('minimum' in tags) {
    if (out.type !== 'number' && out.type !== 'integer') throw new Error(`${where(node, sf)}: @minimum on a type that is not a number`);
    const n = Number(tags.minimum);
    if (!Number.isFinite(n)) throw new Error(`${where(node, sf)}: @minimum needs a number, got "${tags.minimum}"`);
    out.minimum = n;
  }
  if ('pattern' in tags) {
    if (out.type !== 'string') throw new Error(`${where(node, sf)}: @pattern on a type that is not a string`);
    new RegExp(tags.pattern); // throws on a bad pattern, here rather than in a consumer
    out.pattern = tags.pattern;
  }
  return out;
}

function typeSchema(node, sf, names) {
  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword:
      return { type: 'string' };
    case ts.SyntaxKind.NumberKeyword:
      return { type: 'number' };
    case ts.SyntaxKind.BooleanKeyword:
      return { type: 'boolean' };
    case ts.SyntaxKind.LiteralType: {
      const lit = node.literal;
      if (lit.kind === ts.SyntaxKind.StringLiteral) return { const: lit.text };
      if (lit.kind === ts.SyntaxKind.NumericLiteral) return { const: Number(lit.text) };
      break;
    }
    case ts.SyntaxKind.TypeReference: {
      const name = node.typeName.getText(sf);
      if (node.typeArguments || !names.has(name)) {
        throw new Error(`${where(node, sf)}: type "${node.getText(sf)}" is not declared in types.ts — the schema can only reference its own declarations`);
      }
      return { $ref: `#/$defs/${name}` };
    }
    case ts.SyntaxKind.ArrayType:
      return { type: 'array', items: typeSchema(node.elementType, sf, names) };
    case ts.SyntaxKind.TupleType: {
      const items = node.elements.map((e) => {
        if (e.kind === ts.SyntaxKind.OptionalType || e.kind === ts.SyntaxKind.RestType || e.kind === ts.SyntaxKind.NamedTupleMember) {
          throw new Error(`${where(e, sf)}: only fixed, unnamed tuples are supported`);
        }
        return typeSchema(e, sf, names);
      });
      return { type: 'array', prefixItems: items, minItems: items.length, maxItems: items.length };
    }
    case ts.SyntaxKind.TypeLiteral:
      return objectSchema(node.members, sf, names, {});
    case ts.SyntaxKind.UnionType: {
      const parts = node.types.map((t) => typeSchema(t, sf, names));
      if (parts.every((p) => typeof p.const === 'string')) return { type: 'string', enum: parts.map((p) => p.const) };
      // Only unions of declared types become `oneOf`, and those are the segment kinds, each told
      // apart by its `kind` const. Anything else can overlap (`string | "x"`), and `oneOf` rejects a
      // value that matches two branches — so it is refused rather than mistranslated.
      if (parts.every((p) => p.$ref)) return { oneOf: parts };
      throw new Error(`${where(node, sf)}: "${node.getText(sf)}" mixes kinds of type — a union here is all string literals or all declared type names`);
    }
    default:
      break;
  }
  throw new Error(`${where(node, sf)}: "${node.getText(sf)}" (${ts.SyntaxKind[node.kind]}) is outside the subset the LTT schema generator supports`);
}

function objectSchema(members, sf, names, tags) {
  const properties = {};
  const required = [];
  for (const m of members) {
    if (m.kind !== ts.SyntaxKind.PropertySignature || !m.type) {
      throw new Error(`${where(m, sf)}: only plain properties are supported in an LTT object type`);
    }
    if (!ts.isIdentifier(m.name) && !ts.isStringLiteral(m.name)) throw new Error(`${where(m, sf)}: a property name must be a plain name or a string`);
    const key = m.name.text; // the name itself — a quoted "a-b" is the key a-b, not "\"a-b\""
    const doc = docOf(m, sf);
    let schema = narrow(typeSchema(m.type, sf, names), doc.tags, m, sf);
    if (doc.description) schema = { description: doc.description, ...schema };
    properties[key] = schema;
    if (!m.questionToken) required.push(key);
  }
  const out = { type: 'object', properties };
  if (required.length) out.required = required;
  if ('closed' in tags) out.additionalProperties = false;
  return out;
}

/** Build the whole schema object from the types file's text. Exported for the unit test. */
function generate(sourceText = fs.readFileSync(SOURCE, 'utf8')) {
  const sf = ts.createSourceFile(SOURCE, sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const decls = sf.statements.filter((s) => ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s));
  for (const s of sf.statements) {
    if (!decls.includes(s) && !ts.isEmptyStatement(s)) {
      throw new Error(`${where(s, sf)}: types.ts holds type declarations only — move "${s.getText(sf).slice(0, 40)}…" out`);
    }
  }
  const names = new Set();
  for (const d of decls) {
    // Declaration merging would silently keep only the last declaration's fields.
    if (names.has(d.name.text)) throw new Error(`${where(d, sf)}: "${d.name.text}" is declared twice — declare each type once`);
    names.add(d.name.text);
  }
  if (!names.has(ROOT_TYPE)) throw new Error(`types.ts declares no ${ROOT_TYPE}`);
  const $defs = {};
  for (const d of decls) {
    if (d.typeParameters) throw new Error(`${where(d, sf)}: generic declarations are not supported`);
    if (ts.isInterfaceDeclaration(d) && d.heritageClauses) throw new Error(`${where(d, sf)}: \`extends\` is not supported — spell the fields out`);
    const doc = docOf(d, sf);
    const isInterface = ts.isInterfaceDeclaration(d);
    // An interface takes only @closed; @integer / @minimum / @pattern narrow a value, not an object.
    const misplaced = Object.keys(doc.tags).filter((t) => (isInterface ? t !== 'closed' : t === 'closed'));
    if (misplaced.length) throw new Error(`${where(d, sf)}: @${misplaced[0]} does not apply to ${isInterface ? 'an interface' : 'a type alias'}`);
    let schema = isInterface ? objectSchema(d.members, sf, names, doc.tags) : narrow(typeSchema(d.type, sf, names), doc.tags, d, sf);
    if (doc.description) schema = { description: doc.description, ...schema };
    $defs[d.name.text] = schema;
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://laticent.github.io/lattice/schemas/ltt-1.0.schema.json',
    title: 'Lattice Timing Track (LTT) 1.0, canonical encoding',
    description:
      'GENERATED from docs/src/lib/ltt/types.ts by tools/build-ltt-schema.js — do not edit. Rebuild: npm run ltt-schema:build. Spec: engineering/ltt.md.',
    $ref: `#/$defs/${ROOT_TYPE}`,
    $defs,
  };
}

function render(schema) {
  return `${JSON.stringify(schema, null, 2)}\n`;
}

function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const silent = argv.includes('--silent');
  const want = render(generate());
  if (check) {
    const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (have !== want) {
      console.error(
        '[build-ltt-schema] STALE — docs/src/lib/ltt/ltt.schema.json no longer matches types.ts. ' +
          'Run `npm run ltt-schema:build` and commit it (guardrail G1: the types are the one source).',
      );
      process.exit(1);
    }
    if (!silent) console.log('[build-ltt-schema] up to date.');
    return;
  }
  fs.writeFileSync(OUT, want);
  if (!silent) console.log(`[build-ltt-schema] wrote ${path.relative(ROOT, OUT)}`);
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('[build-ltt-schema] failed:', e.message);
    process.exit(1);
  }
}

module.exports = { generate, render, OUT, SOURCE };
