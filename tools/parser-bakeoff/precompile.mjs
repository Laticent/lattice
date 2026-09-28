/**
 * parser-bakeoff precompile — write each candidate's grammars in the form a production build
 * would SHIP, so cold import can be measured without the compiler a dev run loads.
 *
 * Peggy, Nearley and Lezer have a build step (`peggy`, `nearleyc`, `lezer-generator`); a
 * shipped parser imports only its small runtime, or nothing. Chevrotain, Ohm and Parsimmon
 * have no build step — their shipped form IS the dev form — so they are not written here.
 *
 * Output: node_modules/.cache/parser-bakeoff/<candidate>/index.mjs (ignored, and inside
 * node_modules so a generated Lezer module still resolves `@lezer/lr`). Every index also
 * imports shared.mjs, so the shipped kernels load inside the timed region for every row,
 * the incumbent's included.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const OUT = new URL('../../node_modules/.cache/parser-bakeoff/', import.meta.url).pathname;
const SHARED = new URL('./shared.mjs', import.meta.url).href;
const here = (p) => new URL(p, import.meta.url).pathname;

export const SHIPPED = ['peggy', 'nearley', 'lezer'];

export async function precompile(name) {
  const dir = `${OUT}${name}/`;
  mkdirSync(dir, { recursive: true });
  const lines = [`import '${SHARED}';`];
  if (name === 'peggy') {
    const peggy = require('peggy');
    const starts = { axis: ['Outer', 'Inner'], gantt: ['Span', 'Point'] };
    for (const n of ['axis', 'flow', 'gantt', 'value', 'inline']) {
      const src = peggy.generate(readFileSync(here(`grammars/peggy/${n}.peggy`), 'utf8'), { output: 'source', format: 'es', allowedStartRules: starts[n] });
      writeFileSync(`${dir}${n}.mjs`, src);
      lines.push(`export * as ${n} from './${n}.mjs';`);
    }
  } else if (name === 'nearley') {
    const m = await import('./impl/nearley.mjs');
    lines.push("import { createRequire } from 'node:module';", 'const require = createRequire(import.meta.url);', "export const nearley = require('nearley');");
    m.SOURCES().forEach((src, i) => {
      writeFileSync(`${dir}g${i}.cjs`, m.compiledJs(src).replace(/\bH\b/g, 'globalThis.__H'));
      lines.push(`export const g${i} = require('./g${i}.cjs');`);
    });
  } else if (name === 'lezer') {
    const { buildParserFile } = require('@lezer/generator');
    const m = await import('./impl/lezer.mjs');
    m.SOURCES().forEach((src, i) => {
      writeFileSync(`${dir}g${i}.mjs`, buildParserFile(src, { moduleStyle: 'es' }).parser);
      lines.push(`export * as g${i} from './g${i}.mjs';`);
    });
  } else {
    return null;
  }
  writeFileSync(`${dir}index.mjs`, `${lines.join('\n')}\n`);
  return `${dir}index.mjs`;
}
