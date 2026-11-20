#!/usr/bin/env node
/**
 * css-rule-equiv — do two stylesheets carry the same cascade, rule for rule?
 *
 * Compares the ordered list of style rules in BEFORE and AFTER: each rule's at-rule context
 * (`@container (width<20em)`), its selectors, each selector's specificity, and its declarations.
 * Comments, whitespace, quoting of attribute values and the form of a selector list are ignored;
 * the order of rules, selectors and declarations is not, because the cascade reads all three.
 *
 * Built for the nesting spike (engineering/decisions/2026-11-19-nesting-spike.md): a source moved to
 * native nesting is proven by lowering it the way tools/build-css.js does and comparing the result
 * with the flat file it replaces. Both sides go through `distributeLeadingIs`, as every shipped
 * bundle does, so a leading `:is(A, B) x` and the flat `A x, B x` compare equal ONLY when A and B
 * are equally specific (the specificities are part of what is compared).
 *
 * Usage:
 *   node tools/css-rule-equiv.js <before.css> <after.css> [--lower]
 *   node tools/css-rule-equiv.js --emit-flat <nested.css>   # the flat form the build ships
 *     --lower   lower AFTER's nesting first (esbuild, nesting only), as build-css.js does
 * Exit codes: 0 equivalent · 1 a rule differs (the first few are printed) · 2 usage error.
 */
const fs = require('node:fs');
const csstree = require('css-tree');
const esbuild = require('esbuild');
const { distributeLeadingIs, splitSelectorList, stripCssComments } = require('../lib/core/leading-is');
const { specificity } = require('./lib/css-specificity.js');

function normalizeSelector(sel) {
  const ast = csstree.parse(stripCssComments(sel).trim(), { context: 'selector' });
  csstree.walk(ast, { visit: 'AttributeSelector', enter(n) {
    if (n.value && n.value.type === 'Identifier') n.value = { type: 'String', value: n.value.name };
  } });
  return { text: csstree.generate(ast), spec: specificity(ast).join(',') };
}

/** The ordered style rules and at-rule entries of a stylesheet, each as {ctx, sels:[{text,spec}], decls}. */
function styleRules(css) {
  const ast = csstree.parse(css, { parseValue: true, parseRulePrelude: false });
  const out = [];
  const ctx = [];
  csstree.walk(ast, {
    enter(n) {
      if (n.type === 'Atrule') {
        const head = `@${n.name} ${n.prelude ? csstree.generate(n.prelude) : ''}`.trim();
        // A statement at-rule (@import, @charset, a @layer list) and the declarations an at-rule
        // holds directly (@font-face, @property, @page) are part of the cascade too: compare them
        // as entries with no selector, so two sheets that differ only there are not reported equal.
        if (!n.block) out.push({ ctx: [...ctx, `${head};`].join(' / '), sels: [], decls: '' });
        else {
          const own = n.block.children.toArray().filter((d) => d.type === 'Declaration')
            .map((d) => `${d.property}:${csstree.generate(d.value)}${d.important ? '!important' : ''}`);
          if (own.length) out.push({ ctx: [...ctx, head].join(' / '), sels: [], decls: own.join(';') });
        }
        ctx.push(head);
      }
      if (n.type === 'Rule') {
        const sels = splitSelectorList(stripCssComments(csstree.generate(n.prelude))).filter((s) => s.trim()).map(normalizeSelector);
        const decls = n.block.children.toArray().filter((d) => d.type === 'Declaration')
          .map((d) => `${d.property}:${csstree.generate(d.value)}${d.important ? '!important' : ''}`);
        if (decls.length) out.push({ ctx: ctx.join(' / '), sels, decls: decls.join(';') });
      }
    },
    leave(n) { if (n.type === 'Atrule') ctx.pop(); },
  });
  return out;
}

const lowerNestingOnly = (css) => esbuild.transformSync(css, { loader: 'css', target: 'esnext', supported: { nesting: false } }).code;

/** Compare two stylesheets; returns {before, after, diffs:[{at, before, after}]}. */
function compare(beforeCss, afterCss, { lower = false } = {}) {
  const a = styleRules(distributeLeadingIs(beforeCss));
  const b = styleRules(distributeLeadingIs(lower ? lowerNestingOnly(afterCss) : afterCss));
  const show = (r) => r && `${r.ctx} | ${r.sels.map((s) => `${s.text} (${s.spec})`).join(' , ')} | ${r.decls}`;
  const diffs = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (show(a[i]) !== show(b[i])) diffs.push({ at: i, before: show(a[i]), after: show(b[i]) });
  }
  return { before: a.length, after: b.length, diffs };
}

function main(argv) {
  const files = argv.filter((x) => !x.startsWith('--'));
  // --emit-flat <nested.css>: print the source the way the build ships it (nesting lowered, leading
  // :is() split). test/fixtures/table-reflow.flat.css is written with it; see css-nesting.test.js.
  if (argv.includes('--emit-flat')) {
    if (files.length !== 1) {
      process.stderr.write('usage: node tools/css-rule-equiv.js --emit-flat <nested.css>\n');
      return 2;
    }
    process.stdout.write(distributeLeadingIs(lowerNestingOnly(fs.readFileSync(files[0], 'utf8'))));
    return 0;
  }
  if (files.length !== 2) {
    process.stderr.write('usage: node tools/css-rule-equiv.js <before.css> <after.css> [--lower] | --emit-flat <nested.css>\n');
    return 2;
  }
  const r = compare(fs.readFileSync(files[0], 'utf8'), fs.readFileSync(files[1], 'utf8'), { lower: argv.includes('--lower') });
  for (const d of r.diffs.slice(0, 5)) process.stdout.write(`rule ${d.at}\n  before: ${d.before}\n  after:  ${d.after}\n`);
  process.stdout.write(`rules: before ${r.before}, after ${r.after}; differing ${r.diffs.length}\n`);
  return r.diffs.length ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { compare, styleRules };
