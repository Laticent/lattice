#!/usr/bin/env node
/**
 * Extract the bake-off corpus: every distinct markdown table this repo RENDERS AS A TABLE.
 *
 * Walks the tracked markdown (decks, docs-site pages, specs), skipping fenced code, and keeps a
 * table when its slide class is a plain or table-hosting one. Chart inputs (`roadmap`,
 * `heatmap`, `bar` …) are left out because they never render as tables, and so is
 * docs/route-budget.history.md, a generated log. Tables are deduplicated by content.
 *
 * Writes corpus.next.json beside this file rather than corpus.json: the committed corpus is
 * paired with labels.json by id, so replacing it is a re-labeling job, not a refresh.
 *
 * Usage: node tools/frame-lab/bakeoff/corpus.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const KEEP = new Set(['', 'table', 'content', 'columns', 'rows', 'split', 'split-panel', 'compare-prose', 'lead']);
const SKIP = /^(engineering|design|changelog\.d|followups\.d|node_modules)\/|docs\.md$|README|CHANGELOG|AGENTS|CLAUDE|RELEASE|^docs\/route-budget\.history\.md$|^test\/unit|^test\/fixtures\/lint/;
const DECK = /^(examples|lib\/components|lib\/plugins|test\/integration)/;

const files = execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter((f) => f && !SKIP.test(f));
const cells = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const seen = new Set();
const out = [];
for (const f of files) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r/g, '').split('\n');
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fence = !fence; continue; }
    if (fence) continue;
    if (!(/^\s*\|.*\|\s*$/.test(lines[i]) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || ''))) continue;
    const rows = [lines[i]];
    let j = i + 2;
    while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) rows.push(lines[j++]);
    let cls = '';
    for (let k = i; k >= Math.max(0, i - 40); k--) {
      const m = lines[k].match(/_class:\s*([^>]*?)\s*-->/);
      if (m) { cls = m[1]; break; }
      if (/^---\s*$/.test(lines[k])) break;
    }
    const t = { file: f, line: i + 1, cls, head: cells(rows[0]), body: rows.slice(1).map(cells) };
    const key = JSON.stringify([t.head, t.body]);
    if (t.body.length && KEEP.has(cls.split(/\s+/)[0] || '') && !seen.has(key)) { seen.add(key); out.push(t); }
    i = j - 1;
  }
}
out.forEach((t, i) => { t.id = `T${String(i + 1).padStart(3, '0')}`; t.src = DECK.test(t.file) ? 'deck' : 'docs'; });
fs.writeFileSync(path.join(__dirname, 'corpus.next.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`${out.length} tables (${out.filter((t) => t.src === 'deck').length} from decks) → tools/frame-lab/bakeoff/corpus.next.json`);
