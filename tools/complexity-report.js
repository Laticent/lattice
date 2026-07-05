#!/usr/bin/env node
/**
 * Complexity report — cyclomatic complexity + lines-of-code per function, aggregated per file, across lib/ and tools/.
 *
 * Surfaces the files/functions doing too much (CLAUDE.md: "complexity is the
 * mother of all killers of future productivity") so it can be triaged
 * deliberately instead of discovered the hard way mid-refactor.
 *
 * Cyclomatic complexity here = 1 + one per decision point in the function
 * body: `if`, `else if`, ternary, `for`/`for-in`/`for-of`, `while`/`do-while`,
 * `case` (not `default`), `catch`, and each short-circuit `&&`/`||`/`??` in
 * a boolean expression. This is the standard McCabe count, not a fancier
 * cognitive-complexity variant — simple, well-understood, reproducible.
 *
 * Parses with acorn (the same grammar Node itself uses) rather than Biome's
 * JS API — Biome's `complexity` lint category catches STYLE issues (e.g.
 * `noExcessiveCognitiveComplexity` is not in Biome's rule set today), not a
 * scored metric; this tool is deliberately a separate, simpler measurement.
 *
 * Usage:
 *   node tools/complexity-report.js                 # print worst offenders
 *   node tools/complexity-report.js --json           # machine-readable
 *   node tools/complexity-report.js --top=30          # how many to show
 *   node tools/complexity-report.js --min-complexity=10  # noise floor
 */

const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['lib', 'tools'];
const EXCLUDE = /(^|\/)(node_modules|dist|\.scratch)(\/|$)|\.min\.js$|\.generated\.js$/;

function parseArgs(argv) {
  const args = { json: false, top: 40, minComplexity: 8 };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg.startsWith('--top=')) args.top = Number(arg.slice('--top='.length));
    else if (arg.startsWith('--min-complexity=')) args.minComplexity = Number(arg.slice('--min-complexity='.length));
  }
  return args;
}

function walkFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full);
    if (EXCLUDE.test(rel)) continue;
    if (entry.isDirectory()) walkFiles(full, out);
    else if (/\.(js|mjs|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Named-function boundaries this tool measures. Arrow functions/expressions
 *  nested for callbacks are attributed to their enclosing named function
 *  (or the file's top level) rather than reported as separate units — a
 *  10-line `.map(x => x.foo)` arrow isn't "a function" in the sense this
 *  report cares about. */
const FUNCTION_NODE_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

// AST metadata keys that never hold child nodes.
const SKIP_KEYS = new Set(['type', 'loc', 'range', 'start', 'end']);

/** Call fn(child) for every AST child node of `node` (arrays flattened). */
function walkChildren(node, fn) {
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (child && typeof child.type === 'string') fn(child);
    } else if (value && typeof value.type === 'string') {
      fn(value);
    }
  }
}

/** True for arrows/expressions worth measuring as their own unit: named
 *  (assigned to a const/property) rather than an inline callback argument. */
function isNamedFunctionBinding(node, parent) {
  if (node.type === 'FunctionDeclaration') return true;
  if (!parent) return false;
  if (parent.type === 'VariableDeclarator' || parent.type === 'AssignmentExpression') return true;
  if (parent.type === 'Property' || parent.type === 'ObjectProperty') return true;
  if (parent.type === 'MethodDefinition' || parent.type === 'ClassProperty') return true;
  return false;
}

function functionName(node, parent) {
  if (node.id?.name) return node.id.name;
  if (parent?.type === 'VariableDeclarator' && parent.id?.name) return parent.id.name;
  if (parent?.type === 'AssignmentExpression' && parent.left?.type === 'MemberExpression') {
    return parent.left.property?.name || '(anonymous)';
  }
  if ((parent?.type === 'Property' || parent?.type === 'ObjectProperty' || parent?.type === 'MethodDefinition') && parent.key) {
    return parent.key.name || parent.key.value || '(anonymous)';
  }
  return '(anonymous)';
}

// Node types that each contribute exactly one McCabe decision point.
const DECISION_TYPES = new Set([
  'IfStatement', 'ConditionalExpression',
  'ForStatement', 'ForInStatement', 'ForOfStatement',
  'WhileStatement', 'DoWhileStatement',
  'CatchClause',
]);
const SHORT_CIRCUIT_OPS = new Set(['&&', '||', '??']);

/** Walk a function's body and count McCabe decision points, stopping at
 *  nested function boundaries (their complexity is counted separately). */
function cyclomaticComplexity(fnNode) {
  let complexity = 1;

  function visit(node) {
    if (!node || typeof node.type !== 'string') return;
    if (node !== fnNode && FUNCTION_NODE_TYPES.has(node.type)) return; // nested fn: own unit
    if (DECISION_TYPES.has(node.type)) complexity++;
    else if (node.type === 'SwitchCase' && node.test) complexity++; // `default:` isn't a decision point
    else if (node.type === 'LogicalExpression' && SHORT_CIRCUIT_OPS.has(node.operator)) complexity++;
    walkChildren(node, visit);
  }

  visit(fnNode.body);
  return complexity;
}

function linesOf(node, source) {
  return source.slice(node.start, node.end).split('\n').length;
}

function analyzeFile(file) {
  const source = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  let ast;
  try {
    ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, locations: true });
  } catch {
    try {
      ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
    } catch (err2) {
      return { file: rel, error: err2.message, functions: [] };
    }
  }

  const functions = [];
  function visit(node, parent) {
    if (FUNCTION_NODE_TYPES.has(node.type) && isNamedFunctionBinding(node, parent)) {
      functions.push({
        name: functionName(node, parent),
        line: node.loc.start.line,
        complexity: cyclomaticComplexity(node),
        loc: linesOf(node, source),
      });
    }
    walkChildren(node, (child) => visit(child, node));
  }
  visit(ast, null);

  return {
    file: rel,
    sloc: source.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//')).length,
    functions,
    maxComplexity: functions.reduce((m, f) => Math.max(m, f.complexity), 0),
  };
}

function run({ minComplexity = 8, top = 40 } = {}) {
  const files = SCAN_DIRS.flatMap((d) => walkFiles(path.join(ROOT, d)));
  const results = files.map(analyzeFile);
  const parseErrors = results.filter((r) => r.error);

  const worstFunctions = results
    .flatMap((r) => r.functions.map((f) => ({ ...f, file: r.file })))
    .filter((f) => f.complexity >= minComplexity)
    .sort((a, b) => b.complexity - a.complexity)
    .slice(0, top);

  const worstFiles = results
    .filter((r) => !r.error)
    .map((r) => ({ file: r.file, sloc: r.sloc, maxComplexity: r.maxComplexity, functionCount: r.functions.length }))
    .sort((a, b) => b.sloc - a.sloc)
    .slice(0, top);

  return {
    filesScanned: results.length,
    parseErrors: parseErrors.map((r) => ({ file: r.file, error: r.error })),
    worstFunctions,
    worstFiles,
  };
}

function printReport(report) {
  console.log('=== COMPLEXITY ===');
  console.log(`Files scanned: ${report.filesScanned}`);
  if (report.parseErrors.length) {
    console.log(`Parse errors (skipped): ${report.parseErrors.length}`);
    for (const e of report.parseErrors) console.log(`  ${e.file}: ${e.error}`);
  }

  console.log('\nMost complex functions (cyclomatic complexity):');
  for (const f of report.worstFunctions) {
    console.log(`  ${f.complexity.toString().padStart(3)}  ${f.file}:${f.line}  ${f.name}()  (${f.loc} lines)`);
  }
  if (!report.worstFunctions.length) console.log('  (none above threshold)');

  console.log('\nLargest files (source lines of code):');
  for (const f of report.worstFiles.slice(0, 15)) {
    console.log(`  ${f.sloc.toString().padStart(5)}  ${f.file}  (${f.functionCount} functions, max complexity ${f.maxComplexity})`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = run(args);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
}

if (require.main === module) main();

module.exports = { cyclomaticComplexity, analyzeFile, run };
