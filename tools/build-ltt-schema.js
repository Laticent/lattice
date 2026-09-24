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

/** The doc comment directly above `node`, split into prose and tags. */
function docOf(node, sf) {
  const text = sf.getFullText();
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) || [];
  const last = ranges.filter((r) => text.slice(r.pos, r.pos + 3) === '/**').pop();
  if (!last) return { description: '', tags: {} };
  const body = text
    .slice(last.pos + 3, last.end - 2)
    .split('\n')
    .map((l) => l.replace(/^\s*\*?\s?/, ''))
    .join('\n');
  const tags = {};
  // A tag runs to the next tag or the end; its value is the text after the name, trimmed.
  const prose = body.replace(/@(integer|closed|minimum|pattern)\b([^@]*)/g, (_m, name, value) => {
    tags[name] = value.trim();
    return '';
  });
  if (/@\w/.test(prose)) {
    const bad = prose.match(/@\w+/)[0];
    throw new Error(`${where(node, sf)}: unknown doc tag ${bad} — the schema generator knows @integer, @closed, @minimum and @pattern`);
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
  if ('integer' in tags) {
    if (out.type !== 'number') throw new Error(`${where(node, sf)}: @integer on a type that is not a number`);
    out.type = 'integer';
  }
  if ('minimum' in tags) {
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
      return { oneOf: parts };
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
    const key = m.name.getText(sf);
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
  const names = new Set(decls.map((d) => d.name.text));
  if (!names.has(ROOT_TYPE)) throw new Error(`types.ts declares no ${ROOT_TYPE}`);
  const $defs = {};
  for (const d of decls) {
    if (d.typeParameters) throw new Error(`${where(d, sf)}: generic declarations are not supported`);
    if (ts.isInterfaceDeclaration(d) && d.heritageClauses) throw new Error(`${where(d, sf)}: \`extends\` is not supported — spell the fields out`);
    const doc = docOf(d, sf);
    let schema = ts.isInterfaceDeclaration(d) ? objectSchema(d.members, sf, names, doc.tags) : narrow(typeSchema(d.type, sf, names), doc.tags, d, sf);
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
