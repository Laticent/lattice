// The Mermaid label cap (lib/plugins/mermaid/shared/label-length.js): which fences it refuses, that
// the check is linear, and that a label AT the cap stays cheap in the marked Mermaid ships — the
// timing arm that pins the guard (engineering/mermaid.md § A label longer than 500 characters).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { MAX_LABEL_TEXT, overlongLabelText, overlongMessage } = require('../../../lib/plugins/mermaid/shared/label-length.js');

const B = '`';
const fence = (label) => `flowchart LR\n  A["${label}"] --> B\n`;

test('a markdown string longer than the cap is refused, on one line or across many', () => {
  const lab = '[a]('.repeat(2000);
  assert.deepEqual(overlongLabelText(fence(`${B}${lab}${B}`)), { kind: 'quoted label', length: lab.length + 2, max: MAX_LABEL_TEXT });
  const split = Array.from({ length: 40 }, () => '*a '.repeat(10)).join('\n');
  assert.equal(overlongLabelText(fence(`${B}${split}${B}`)).kind, 'quoted label');
});

// The checker's bypasses: mindmap and kanban labels cross lines, quoted or not, and reach marked
// whole (15 s at 16 KB, with no line over 808 characters).
const lines = (unit, n, per) => Array.from({ length: n }, () => unit.repeat(per)).join('\n');
test('a mindmap or kanban label spread over short lines is refused, quoted or bracketed', () => {
  assert.equal(overlongLabelText(`mindmap\n  root["${lines('[a](', 20, 200)}"]\n`).kind, 'quoted label');
  assert.equal(overlongLabelText(`kanban\n todo[Todo]\n  t1["${lines('[a](', 20, 200)}"]\n`).kind, 'quoted label');
  assert.equal(overlongLabelText(`mindmap\n  root[${lines('*a ', 20, 30)}]\n`).kind, 'bracket label');
  assert.equal(overlongLabelText(`mindmap\n  root((${lines('_a ', 20, 30)}))\n`).kind, 'bracket label');
  assert.equal(overlongLabelText(`---\ntitle: x\n---\n%% c\nmindmap\n  ${'*a '.repeat(200)}\n`).kind, 'line');
});

test('a long line that is not a label passes: data rows, directives, flowchart plain text', () => {
  const nums = Array.from({ length: 300 }, (_, i) => i * 7).join(', ');
  assert.equal(overlongLabelText(`xychart-beta\n  bar [${nums}]\n`), null);
  assert.equal(overlongLabelText(`%%{init: {"theme": "base", "themeVariables": {${' "a": 1,'.repeat(150)} "b": 2}}}%%\nflowchart LR\n  A --> B\n`), null);
  assert.equal(overlongLabelText(`sequenceDiagram\n  A->>B: ${'word '.repeat(300)}\n`), null);
});

test('ordinary diagrams pass, including labels exactly at the cap', () => {
  assert.equal(overlongLabelText('flowchart LR\n  A["`**bold** text`"] --> B["plain"]\n'), null);
  assert.equal(overlongLabelText(fence('x'.repeat(MAX_LABEL_TEXT))), null);
  assert.equal(overlongLabelText(fence('x'.repeat(MAX_LABEL_TEXT + 1))).length, MAX_LABEL_TEXT + 1);
  assert.equal(overlongLabelText(`mindmap\n  root[${'y'.repeat(MAX_LABEL_TEXT - 10)}]\n    ((child))\n`), null);
  assert.equal(overlongLabelText(''), null);
  assert.equal(overlongLabelText(undefined), null);
  assert.match(overlongMessage(overlongLabelText(fence('x'.repeat(600)))), /capped at 500/);
});

test('every Mermaid fence the repository ships passes', () => {
  const { execSync } = require('node:child_process');
  const fs = require('node:fs');
  const root = path.resolve(__dirname, '../../..');
  const files = execSync('git ls-files "*.md" "*.mdx"', { cwd: root }).toString().trim().split('\n');
  let n = 0;
  for (const f of files) {
    if (!fs.existsSync(path.join(root, f))) continue; // a deletion not yet committed
    const s = fs.readFileSync(path.join(root, f), 'utf8');
    for (const m of s.matchAll(/^```mermaid[^\n]*\n([\s\S]*?)^```/gm)) {
      n++;
      assert.equal(overlongLabelText(m[1]), null, `${f}: ${JSON.stringify(overlongLabelText(m[1]))}`);
    }
  }
  assert.ok(n > 50, `found only ${n} fences`);
});

test('the check is linear: 2 MB of source in well under a second', () => {
  const big = `mindmap\n${'  A[b] "c"\n'.repeat(200_000)}`;
  const t = performance.now();
  overlongLabelText(big);
  assert.ok(performance.now() - t < 500);
});

test('at the cap, the marked Mermaid ships lexes the worst known shapes quickly', async (t) => {
  let markedPath;
  try {
    markedPath = require.resolve('marked', { paths: [path.dirname(require.resolve('mermaid/package.json'))] });
  } catch {
    t.skip('mermaid or its marked is not installed');
    return;
  }
  const { marked } = require(markedPath);
  for (const unit of ['[a](', '![a](', '*a ', '_a ']) {
    const s = unit.repeat(Math.floor(MAX_LABEL_TEXT / unit.length));
    const t0 = performance.now();
    marked.lexer(s);
    const ms = performance.now() - t0;
    // A few ms measured at the cap on marked 16.4.2; 22.5 s for `[a](` at 8 KB. The budget is
    // wide for slow CI and still a long way under the uncapped cost.
    assert.ok(ms < 1000, `${JSON.stringify(unit)} at ${s.length} chars took ${ms.toFixed(0)} ms`);
  }
});
