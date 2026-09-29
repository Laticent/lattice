/**
 * parser-bakeoff size — what each candidate would add to the BROWSER bundle, where
 * lint-core and the render kernels already ship (the Studio lints on the main thread).
 * Minified by esbuild, then gzipped; bytes.
 *
 *   runtime   the library a page must load to run a grammar (0 for Peggy, whose output is
 *             standalone, and for the incumbent, which is plain code)
 *   grammars  what the five targets compile to in their SHIPPED form: Peggy's generated
 *             parsers, nearleyc's output, Lezer's parse tables, and for the libraries with
 *             no build step (Chevrotain, Ohm, Parsimmon) the grammar code itself
 *
 * SAME SCOPE FOR EVERYONE: grammars plus the glue that drives them, and never shared.mjs's
 * policy. The incumbent's kernels cannot be split that way — their policy tables sit inside
 * the same modules — so its row is an upper bound, and `./label-set` (the flowchart key,
 * reached lazily, which drags two generated catalogs in) is left out.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import * as esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const ROOT = new URL('../../', import.meta.url).pathname;
const here = (p) => new URL(p, import.meta.url).pathname;
const gz = (code) => gzipSync(Buffer.from(code)).length;

async function bundle(contents, external = []) {
  const r = await esbuild.build({
    stdin: { contents, resolveDir: ROOT, loader: 'js' }, bundle: true, minify: true, write: false,
    platform: 'browser', format: 'esm', logLevel: 'silent', external,
  });
  return gz(r.outputFiles[0].text);
}
/** A glue module without its imports and without the grammar TEXT it carries (a shipped
 *  build carries the compiled form instead, which is counted separately). */
const glue = (file) => readFileSync(here(file), 'utf8').replace(/^import .*$/gm, '').replace(/String\.raw`[\s\S]*?`/g, '``');
const minify = async (code) => gz((await esbuild.transform(code, { minify: true, loader: 'js', format: 'esm' })).code);

async function peggyGrammars() {
  const peggy = require('peggy');
  const starts = { axis: ['Outer', 'Inner'], gantt: ['Span', 'Point'] };
  let code = '';
  for (const n of ['axis', 'flow', 'gantt', 'value', 'inline']) {
    const one = peggy.generate(readFileSync(here(`grammars/peggy/${n}.peggy`), 'utf8'), { output: 'source', format: 'es', allowedStartRules: starts[n] || undefined })
      .replace(/export\s*\{[^}]*\};?/g, '').replace(/export default [^;]*;?/g, '');
    code = `${code}\nglobalThis.p_${n} = (() => {${one}\nreturn peg$parse; })();`;
  }
  return minify(code);
}

export async function sizeRows(names) {
  const rows = [];
  for (const n of names) {
    try {
      switch (n) {
        case 'incumbent': {
          // `flowchart-grammar.js` lazily requires `./label-set` for its key, and esbuild
          // follows that into two generated catalogs — 8 KB of the first measurement, none of
          // it parsing. It is kept out, as the policy challengers call is kept out of theirs.
          const mods = ['bracket-list', 'flowchart-grammar', 'gantt-time', 'chart-values', 'inline-pills', 'state-marks'];
          const g = await bundle(mods.map((m, i) => `export * as m${i} from './lib/core/${m}.js';`).join('\n'), ['./label-set']);
          rows.push({ candidate: n, runtime: 0, grammars: g, total: g, note: 'the six kernel modules; their policy tables are still inside, so an upper bound' });
          break;
        }
        case 'peggy': {
          const g = (await peggyGrammars()) + (await minify(glue('impl/peggy.mjs')));
          rows.push({ candidate: n, runtime: 0, grammars: g, total: g, note: 'generated parsers are standalone; + glue module' });
          break;
        }
        case 'chevrotain': {
          const rt = await bundle("export * from 'chevrotain';");
          const g = await minify(glue('impl/chevrotain.mjs'));
          rows.push({ candidate: n, runtime: rt, grammars: g, total: rt + g, note: 'in the tree only inside the mermaid UMD script, so not shareable with our bundle' });
          break;
        }
        case 'ohm': {
          const rt = await bundle("export * from 'ohm-js';");
          const g = await minify(readFileSync(here('impl/ohm.mjs'), 'utf8').replace(/^import .*$/gm, '')); // Ohm ships its grammar TEXT
          rows.push({ candidate: n, runtime: rt, grammars: g, total: rt + g, note: 'interprets grammar text at load' });
          break;
        }
        case 'nearley': {
          const rt = await bundle("export { default } from 'nearley/lib/nearley.js';");
          const m = await import('./impl/nearley.mjs');
          const g = (await minify(glue('impl/nearley.mjs'))) + await minify(m.SOURCES().map((src) => m.compiledJs(src).replace(/module\.exports\s*=\s*grammar;?/, '').replace(/\(function \(\) \{/, '{').replace(/\}\)\(\);\s*$/, '}')).join('\n'));
          rows.push({ candidate: n, runtime: rt, grammars: g, total: rt + g, note: 'nearleyc output + postprocessor helpers' });
          break;
        }
        case 'parsimmon': {
          const rt = await bundle("export { default } from 'parsimmon';");
          const g = await minify(glue('impl/parsimmon.mjs'));
          rows.push({ candidate: n, runtime: rt, grammars: g, total: rt + g });
          break;
        }
        case 'lezer': {
          const rt = await bundle("export * from '@lezer/lr'; export * from '@lezer/common';");
          const { buildParserFile } = require('@lezer/generator');
          const m = await import('./impl/lezer.mjs');
          const g = (await minify(glue('impl/lezer.mjs'))) + await minify(m.SOURCES().map((src) => `(() => {${buildParserFile(src, { moduleStyle: 'es' }).parser.replace(/^import .*$/gm, '').replace(/export const /g, 'const ')}\nreturn parser; })()`).map((x, i) => `globalThis.l${i} = ${x};`).join('\n'));
          rows.push({ candidate: n, runtime: rt, grammars: g, total: rt + g, note: 'parse tables + tree walkers; three targets only' });
          break;
        }
        default: break;
      }
    } catch (e) {
      rows.push({ candidate: n, runtime: null, grammars: null, total: null, note: `failed: ${e.message.slice(0, 80)}` });
    }
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) console.table(await sizeRows(['incumbent', 'peggy', 'chevrotain', 'ohm', 'nearley', 'parsimmon', 'lezer']));
