#!/usr/bin/env node
/**
 * List the whole work queue in one place: the open issues mirrored in backlog.d/ and the
 * unticketed items in followups.d/, one line each, grouped by area and sorted by severity.
 *
 * Both folders hold one file per item, so this listing is how a session sees the queue
 * without opening hundreds of files. Filter it instead of reading it whole:
 *
 * Usage:
 *   node tools/backlog.js                       # everything, grouped by area
 *   node tools/backlog.js --area engine         # one area (any `area:*` label name)
 *   node tools/backlog.js --min high            # critical + high only
 *   node tools/backlog.js --issues | --followups
 *
 * Issue severity is the `priority:*` label; a followup's is its `severity:` field. They are
 * the same words on purpose (followups.d/README.md). Contracts: backlog.d/README.md,
 * followups.d/README.md.
 */

const fs = require('node:fs');
const path = require('node:path');
const { listFollowups } = require('./followups.js');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'backlog.d');
const RANK = { critical: 0, high: 1, medium: 2, low: 3 };

function frontMatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---[ \t]*\n([\s\S]*)$/);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, title: (m[2].match(/^# (.+)$/m) || [])[1] || '' };
}

// "1 card needs X" / "2 cards need X": the old BACKLOG.md banner once printed "1 card need triage".
const cards = (n) => `${n} card${n === 1 ? ' needs' : 's need'}`;

const list = (v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);

/** Every mirrored issue as a row. */
function listIssues(dir = DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^\d+\.md$/.test(f)).map((f) => {
    const p = frontMatter(fs.readFileSync(path.join(dir, f), 'utf8')) || { meta: {}, title: '' };
    const areas = list(p.meta.area);
    return {
      kind: 'issue', id: `#${p.meta.issue || f.replace('.md', '')}`, areas,
      severity: list(p.meta.priority)[0] || '', status: p.meta.status || 'none',
      flags: list(p.meta.flags), title: p.title,
    };
  });
}

/** Issues and followups as one list of rows. */
function queue({ issues = true, followups = true } = {}) {
  const rows = issues ? listIssues() : [];
  if (followups) {
    for (const i of listFollowups()) {
      rows.push({ kind: 'followup', id: `followups.d/${i.file}`, areas: i.area ? [i.area] : [], severity: i.severity || '', status: 'followup', flags: [], title: i.title || '' });
    }
  }
  return rows;
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const onlyIssues = argv.includes('--issues');
  const onlyFollowups = argv.includes('--followups');
  const area = opt('--area');
  const min = opt('--min');
  if (min && !(min in RANK)) { console.error(`backlog: --min takes one of ${Object.keys(RANK).join(', ')}`); process.exit(2); }

  let rows = queue({ issues: !onlyFollowups, followups: !onlyIssues });
  const all = rows;
  if (area) rows = rows.filter((r) => r.areas.includes(area));
  if (min) rows = rows.filter((r) => (RANK[r.severity] ?? 9) <= RANK[min]);

  // A row lists under its FIRST area, so a multi-area card is counted once; the others follow its title.
  const groups = new Map();
  for (const r of rows) {
    const key = area || r.areas[0] || '(no area)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  for (const key of [...groups.keys()].sort()) {
    const g = groups.get(key).sort((a, b) => (RANK[a.severity] ?? 9) - (RANK[b.severity] ?? 9)
      || (a.kind === b.kind ? 0 : a.kind === 'issue' ? -1 : 1) || a.id.localeCompare(b.id, 'en', { numeric: true }));
    console.log(`\n${key} (${g.length})`);
    for (const r of g) {
      const also = r.areas.filter((a) => a !== key);
      console.log(`  ${(r.severity || '—').padEnd(8)} ${r.id}  [${r.status}]  ${r.title}${also.length ? `  (+${also.join(', ')})` : ''}`);
    }
  }

  const issues = all.filter((r) => r.kind === 'issue');
  const flagged = (f) => issues.filter((r) => r.flags.includes(f)).map((r) => r.id);
  console.log(`\n${rows.length} shown · ${issues.length} open issue(s) in backlog.d/ · ${all.length - issues.length} followup(s) in followups.d/`);
  const triage = flagged('needs:triage');
  const definition = flagged('needs:definition');
  if (triage.length) console.log(`⚠ ${cards(triage.length)} triage (missing area/type/priority): ${triage.join(' ')}`);
  if (definition.length) console.log(`📐 ${cards(definition.length)} definition (missing a swimlane or an acceptance check, so nothing can pull ${definition.length === 1 ? 'it' : 'them'}): ${definition.join(' ')}`);
  if (!issues.length && !onlyFollowups) console.log('backlog.d/ holds no issues yet: the nightly Sync backlog mirror fills it (or dispatch it).');
}

if (require.main === module) main();

module.exports = { listIssues, queue, cards };
