#!/usr/bin/env node
/**
 * mutate-segno — break what Segno promises, one defect at a time, and watch its tests go red.
 *
 * Segno's tests pass. That says little on its own: a test can pass because its fixture never
 * reaches the code it is named for. This battery injects one realistic defect at a time into
 * Segno's source (docs/src/lib/segno/), runs Segno's whole test suite, and reports every defect
 * the suite fails to notice. A surviving mutation is a hole in the tests, not a pass.
 *
 * The same house pattern as tools/mutate-guide-gestures.mjs. Three rules carried over:
 *   - a mutation that DID NOT APPLY is reported on its own and counts as nothing: a harness that
 *     edited no bytes and then read green is the same failure one level up;
 *   - an EQUIVALENT mutation (one no input can tell apart) is left out with a note, never listed:
 *     a battery with permanent survivors teaches you to ignore survivors;
 *   - every file is restored, including on a failing run.
 *
 * SEGNO_MUTATE=1 is set for the test run. It skips ONE test: the check that the committed
 * notation.generated.ts equals what codegen.ts writes today. Under a codegen mutation that check
 * would kill every mutant for a reason that proves nothing about behavior; the kills have to come
 * from the tests that run freshly generated code: grammar-fuzz.test.ts and codegen.test.ts's
 * loaded grammars. (The 20k-span parity fuzz reads the COMMITTED notation.generated.ts, so a
 * codegen.ts mutation cannot reach it.)
 *
 * Usage:  npm run mutate:segno            (about fifteen minutes: one Segno vitest run per mutation)
 *         npm run mutate:segno -- --only=schema,types
 * On-demand; not a CI gate.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const LIB = 'src/lib/segno';
const R = String.raw;

// [file, find, replace, what the defect is]. `find` must occur in the file; the first occurrence
// is replaced.
/* biome-ignore-start lint/suspicious/noTemplateCurlyInString: these ARE source fragments to match, not templates */
const MUTS = [
  // ── grammar.ts: the LL(1) proof. A refusal removed lets a grammar that needs a guess compile,
  //    and the predictive parser then disagrees with the grammar's language.
  ['grammar', 'if (!isEmpty(both)) problems.push(', 'if (false) problems.push(', 'two branches may start with the same character'],
  ['grammar', 'if (empty.length > 1) problems.push(', 'if (false) problems.push(', 'two branches may both match nothing'],
  ['grammar', R`if (!isEmpty(clash)) problems.push(${'`'}${'$'}{inf.path}: branch`, R`if (false) problems.push(${'`'}${'$'}{inf.path}: branch`, 'an empty branch may clash with what follows'],
  ['grammar', 'if (body.nullable) problems.push(', 'if (false) problems.push(', 'a loop body may match nothing'],
  ['grammar', R`if (!isEmpty(clash) && !e.greedy) problems.push(${'`'}${'$'}{inf.path}: after`, R`if (false) problems.push(${'`'}${'$'}{inf.path}: after`, 'a loop may either repeat or stop on the same character'],
  ['grammar', 'for (const name of names) if (onCycle.has(name)) problems.push(', 'for (const name of names) if (false) problems.push(', 'left recursion is not refused'],
  ['grammar', 'if (!i.nullable) return { nullable: false, first };', 'return { nullable: false, first };', 'FIRST of a sequence ignores an empty prefix'],
  ['grammar', "case 'many': { const i = this.get(e.x); return { nullable: e.min === 0 || i.nullable,", "case 'many': { const i = this.get(e.x); return { nullable: i.nullable,", 'many() is not nullable'],
  ['grammar', 'cs = x.nullable ? union(x.first, cs) : x.first;', 'cs = x.first;', 'FOLLOW stops at an empty sibling'],
  ['grammar', "case 'many': add(e.x, union(this.get(e.x).first, follow), followEnd); break;", "case 'many': add(e.x, follow, followEnd); break;", "a loop body's FOLLOW omits its own FIRST"],
  ['grammar', 'if (k < 0) k = empty;', 'if (false) k = empty;', 'a choice never takes its empty branch'],
  ['grammar', 'if (k < 0 && c >= 128) for', 'if (false) for', 'a non-ASCII character never picks a branch'],
  ['grammar', 'if (min && i === st.i) return fail(st, want);', 'if (false) return fail(st, want);', 'many1 of a character set accepts nothing'],
  ['grammar', 'if (min && !x(st)) return false;', 'if (false) return false;', 'many1 of a sequence accepts nothing'],
  ['grammar', 'if (st.depth >= maxDepth) return fail(', 'if (st.depth >= maxDepth * 100) return fail(', 'the nesting cap is gone'],
  ['grammar', "if (ok && st.i < input.length) fail(st, 'end of input');", '', 'trailing input is accepted'],
  ['grammar', 'if (ok) st.stack[st.stack.length - 1].push({ kind, from, to: st.i, kids });', 'if (ok) st.stack[st.stack.length - 1].push({ kind, from, to: from, kids });', 'a tree node ends where it starts'],
  ['grammar', "seen.add(e);\n        switch (e.t) {\n          case 'ref': if (!named.has", "switch (e.t) {\n          case 'ref': if (!named.has", 'the rule-reference walk visits a reused piece once per path (2^depth)'],
  ['grammar', 'if (group.length > 1 || (refsOf.get(group[0]) as string[]).includes(group[0])) for', 'if (false) for', 'no rule counts as recursive (nothing spends the cap)'],
  // NOT `start.followEnd = true` → false: followEnd feeds no check (only the character FOLLOW sets
  // do), so the mutation is EQUIVALENT.

  // ── codegen.ts: the straight-line parser that ships. Killed only by tests that RUN generated
  //    code against the closure parser.
  ['codegen', R`else if (ascii.length === 2) parts.push(${'`'}${'$'}{v} === ${'$'}{ascii[0]} || ${'$'}{v} === ${'$'}{ascii[1]}${'`'});`, R`else if (ascii.length === 2) parts.push(${'`'}${'$'}{v} === ${'$'}{ascii[0]}${'`'});`, 'a two-character set tests only its first'],
  ['codegen', R`high.push(a === hi ? ${'`'}${'$'}{v} === ${'$'}{a}${'`'} : ${'`'}(${'$'}{v} >= ${'$'}{a} && ${'$'}{v} <= ${'$'}{hi})${'`'});`, R`high.push(${'`'}${'$'}{v} === ${'$'}{a}${'`'});`, 'a non-ASCII range tests only its first character'],
  ['codegen', R`: ${'`'}${'$'}{ind}  else return fail(${'$'}{q(expected(e))});\n${'`'};`, ": '';", 'a choice with no matching branch falls through'],
  ['codegen', R`${'$'}{e.min ? ${'`'} if (i === ${'$'}{start}) return fail(${'$'}{q(expected(e.x))});${'`'} : ''}`, '', 'generated many1 of a set accepts nothing'],
  ['codegen', R`} while (${'$'}{testExpr(fb, c, tables)});`, R`} while (false);`, 'generated many1 of a sequence stops after one pass'],
  ['codegen', 'else if (c > t[2 * m + 1]) lo = m + 1;', 'else if (c > t[2 * m + 1]) return false;', 'the generated range search gives up past the middle range'],
  ['codegen', R`high = [${'`'}(${'$'}{v} >= ${'$'}{bounds[0]} &&`, R`high = [${'`'}(${'$'}{v} > ${'$'}{bounds[0]} &&`, 'the generated range search drops the first high character'],
  ['codegen', 'visited.add(e);', '', 'the attempt scan walks a reused piece once per path (2^depth)'],
  ['codegen', 'if (e.min) {', 'if (false) {', 'generated many1 of a sequence accepts nothing'],
  ['codegen', "|| r === '__proto__');", ');', 'a rule named __proto__ is generated'],
  ['codegen', R`${'$'}{ind}depth--;\n`, '', 'generated depth never unwinds'],
  ['codegen', R`buf[${'$'}{b} + 1] = i;`, R`buf[${'$'}{b} + 1] = 0;`, 'a generated node starts at 0'],
  ['codegen', "if (ok && i < n) fail('end of input');", '', 'generated parser accepts trailing input'],

  ['grammar', 'const lo = Math.max(0, Math.ceil(cs[i]));', 'const lo = Math.ceil(cs[i]);', 'a hand-built set may hold the end-of-input code'],

  // ── charset.ts
  ['charset', 'if (lo <= hi) out.push([lo, hi]);', 'if (lo < hi) out.push([lo, hi]);', 'a one-character overlap is missed'],
  ['charset', 'if (next <= MAX_UNIT) out.push([next, MAX_UNIT]);', '', 'a complement loses its top range'],
  ['charset', 'if (c <= high[i + 1]) return true;', 'if (c < high[i + 1]) return true;', 'the last character of a non-ASCII range is not in it'],
  ['charset', 'else if (c > t[2 * m + 1]) lo = m + 1;', 'else if (c > t[2 * m + 1]) return false;', 'the range search gives up past the middle range'],

  // ── notation.ts: the tree reader, diagnostics and fixes
  ['notation', R`if (c === '\\' && (s[i + 1] === '"' || s[i + 1] === '\\'))`, R`if (c === '\\' && s[i + 1] === '"')`, 'an escaped backslash is not unescaped'],
  ['notation', 'while (end > from && isSpace(s.charCodeAt(end - 1))) end--;', 'while (end > from && s.charCodeAt(end - 1) === 32) end--;', 'a trailing tab stays in a bare value'],
  ['notation', 'for (let h = first ? commas : commas - 1; h > 0; h--) items.push(null);', 'for (let h = 0; h > 0; h--) items.push(null);', 'an empty list element does not hold its place'],
  ['notation', 'return { name: nameValue.text.toLowerCase(), value,', 'return { name: nameValue.text, value,', 'a parameter name is case-sensitive'],
  ['notation', 'if (Number.isNaN(c) || isSpace(c) || c === 0x7d) return null;', 'if (Number.isNaN(c) || c === 0x7d) return null;', '`{ ` in prose is taken as a directive'],
  ['notation', 'return r.ok || r.diagnostic.from >= f.from + f.insert.length;', 'return true;', 'a fix that makes no progress is offered'],
  ['notation', "    else if (s[k] === '\\\\') k++;\n    else if (s[k] === '\"') open = -1;", "    else if (s[k] === '\"') open = -1;", 'an escaped quote reads as closing'],
  ['notation', "return stack.reverse().join('');", "return stack.join('');", 'missing closers are offered outermost first'],
  ['notation', "if (e.found === '|') {", "if (false) {", 'a stray | is a generic syntax error'],

  // ── schema.ts: binding
  ['schema', 'if (Object.hasOwn(this.out, hit.name))', 'if (false)', 'a vocab word given twice is accepted'],
  ['schema', 'if (had && had !== name) problems.push(', 'if (false) problems.push(', 'a word that would bind two parameters is not refused'],
  ['schema', '} else if (inCls.length > 1) {', '} else if (inCls.length > 2) {', 'two parameters of one class are not refused'],
  ['schema', 'if (same.length > 1) problems.push(', 'if (same.length > 2) problems.push(', 'two sub-slots of one shape are not refused'],
  ['schema', "if (hasSigils && v.kind === 'scalar' && !v.quoted &&", "if (hasSigils && v.kind === 'scalar' &&", 'a quoted value starting with a sigil is read as one'],
  ['schema', '&& !Object.hasOwn(b.out, p.name) && !b.diags) {', '&& false) {', 'a missing required value is not reported'],
  ['schema', 'clsOf(t) === cls && !(t as Type<unknown>).namedOnly)] as const)', 'clsOf(t) === cls)] as const)', 'a named-only parameter takes a bare word'],
  ['schema', 'v.items.length > options.max) {', 'v.items.length > options.max + 1) {', 'a list takes one more than its max'],
  ['schema', 'if (copy) shortcutBound.set(token, deepFreeze(copy as Bound<RecordOf<S>>));', 'if (copy) shortcutBound.set(token, copy as Bound<RecordOf<S>>);', 'the shared shortcut result is not frozen'],
  ['schema', 'if (!r.ok) throw new SchemaError([`shortcut', 'if (false) throw new SchemaError([`shortcut', 'a shortcut the slot rejects is accepted'],
  ['schema', 'param: sp.param ? `${name}.${sp.param}` : name', 'param: sp.param', "a sub-slot's words share a group with the parent's"],
  ['schema', 'if (expanded && expanded.kind === ', 'if (false && expanded.kind === ', 'a shortcut with surrounding space is not expanded'],
  ['schema', 'for (const w of t.words ?? []) if (w.startsWith(sigil.toLowerCase())) problems.push(', 'for (const w of t.words ?? []) if (false) problems.push(', 'a sigil may start a declared word'],
  ['schema', "if ('+-\\u2212(", "if (false && '+-\\u2212(", 'a sigil may start a number'],
  ['schema', "const named = it.name !== null ? { named: true } : {};", 'const named = {};', 'a named spelling is not marked named'],
  ['schema', 'const copy = plainCopy(r);', 'const copy = r;', "the shortcut cache freezes the caller's objects"],

  // ── types.ts: the value readers
  ['types', 'read: (s, quoted) => (quoted ? undefined : map.get(s.toLowerCase())),', 'read: (s) => map.get(s.toLowerCase()),', 'a quoted word reads as a vocab word'],
  ['types', '(i === p.length && c === 48)', 'false', 'an indexed slot takes a leading zero'],
  ['types', 'if (n > max) return undefined;', '', 'an indexed slot has no ceiling'],
  ['types', ' || options.max > MAX_INDEXED)', ')', 'an indexed max has no cap'],
  ['types', "  for (const w of words) if (!TYPEABLE.test(w)) throw", '  for (const w of words) if (false) throw', 'a flag word need not be typeable'],
  ['types', 'if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo || dt.getUTCDate() !== dd) return undefined;', '', '2026-13-01 is a date'],
  ['types', 'return from !== undefined && to !== undefined ? { from, to } : undefined;', 'return { from, to };', 'half a range is a range'],
  ['types', "if (!t || t.includes('..') || !NUMERIC.test(t)) return undefined;", 'if (!t || !NUMERIC.test(t)) return undefined;', 'a range reads as a number'],
  ['types', 'read: (s, quoted) => (!quoted && words.includes(', 'read: (s, quoted) => (words.includes(', 'a quoted flag word switches the flag on'],
  ['types', 'if (p < digitsFrom && (lead === 45 || lead === 0x2212)) { neg = !neg; p++; }', 'if (p < digitsFrom && lead === 45) { neg = !neg; p++; }', 'the fast path ignores a U+2212 minus'],

  // NOT deleting the fast path's `,`/`.` early-out after the digits: neither is a unit letter or a
  // `)`, so the reader still stops short of the end and returns null. The mutation is EQUIVALENT.

  // ── consistency.ts: one spelling per document
  ['consistency', 'for (const [w, n] of counts) if (n > (counts.get(preferred) ?? 0)) preferred = w;', '', 'the first spelling wins, not the most common'],
  ['consistency', 'if (!u.alone) return {};', '', 'a shortcut fix rewrites a span that holds more'],
  ['consistency', 'return shortcutIsOneItem ? {', 'return true ? {', 'a word is swapped for a shortcut that expands to more'],
  ['consistency', 'insert: u.named ? `{${u.param}=${preferred}}` : `{${preferred}}`', 'insert: `{${preferred}}`', 'a shortcut rewritten to a word drops the name'],
  ['consistency', 'const key = `${u.slot}\\u0000${u.param}\\u0000${u.canonical}`;', 'const key = `${u.param}\\u0000${u.canonical}`;', 'spellings are grouped across slots'],
  // NOT `counts.size < 2` → `< 1`: a group with one spelling then yields no inconsistency anyway
  // (every use IS the preferred one), so the mutation is EQUIVALENT.
];
/* biome-ignore-end lint/suspicious/noTemplateCurlyInString: end */

const FILE = { grammar: 'grammar.ts', codegen: 'codegen.ts', charset: 'charset.ts', notation: 'notation.ts', schema: 'schema.ts', types: 'types.ts', consistency: 'consistency.ts' };
// One Segno run takes about 10 s; a run past this is a hang, not a slow machine.
const DEADLINE_MS = 120_000;
const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1].split(',');

const survivors = [];
const notApplied = [];
let killed = 0;
let ran = 0;
for (const [which, from, to, name] of MUTS) {
  if (only && !only.includes(which)) continue;
  ran++;
  const abs = path.join(DOCS, LIB, FILE[which]);
  const orig = fs.readFileSync(abs, 'utf8');
  if (!orig.includes(from)) {
    notApplied.push(`${which}: ${name}`);
    process.stderr.write(`NOT APPLIED  ${which}: ${name}\n`);
    continue;
  }
  fs.writeFileSync(abs, orig.replace(from, () => to));
  let failed = 0;
  let hung = false;
  try {
    const out = execFileSync('npx', ['vitest', 'run', LIB, '--reporter=json'], { cwd: DOCS, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64e6, timeout: DEADLINE_MS, killSignal: 'SIGKILL', env: { ...process.env, SEGNO_MUTATE: '1' } });
    failed = JSON.parse(out.slice(out.indexOf('{'))).numFailedTests;
  } catch (e) {
    // A mutant that makes the suite HANG was caught: CI would time out on it. Vitest cannot stop
    // a synchronous infinite loop (the `set()` clamp mutant makes one), so the deadline is ours.
    if (e.code === 'ETIMEDOUT' || e.signal) hung = true;
    const t = String(e.stdout ?? '');
    const i = t.indexOf('{');
    try { failed = i >= 0 ? (JSON.parse(t.slice(i)).numFailedTests || 1) : 1; } catch { failed = 1; }
  } finally {
    fs.writeFileSync(abs, orig);
  }
  if (failed > 0) killed++;
  else survivors.push(`${which}: ${name}`);
  process.stderr.write(`${failed > 0 ? (hung ? 'KILLED (the suite hung)' : 'KILLED  ') : 'SURVIVED'}  ${which}: ${name}\n`);
}
const applied = ran - notApplied.length;
console.log(`\n${ran} mutations · ${killed} killed · ${survivors.length} survived · ${notApplied.length} did not apply · score ${applied ? Math.round((100 * killed) / applied) : 0}%`);
if (survivors.length) console.log(`SURVIVORS:\n  ${survivors.join('\n  ')}`);
if (notApplied.length) console.log(`NOT APPLIED (proves nothing):\n  ${notApplied.join('\n  ')}`);
if (survivors.length || notApplied.length) process.exitCode = 1;
