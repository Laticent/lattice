#!/usr/bin/env bash
# Scan every agent skill we ship or load with NVIDIA SkillSpector and report findings the baseline does not excuse.
#
# SkillSpector (github.com/NVIDIA/SkillSpector, Apache-2.0) reads an agent skill BEFORE an agent
# loads it and flags prompt injection, data exfiltration, privilege escalation, unpinned
# installs, MCP tool poisoning and similar. It never runs the skill. This script runs it
# STATIC-ONLY (--no-llm): nothing leaves the machine and no key is needed.
#
# What it scans (one target per skill or folder):
#   .claude/skills/*/                the skills our own agent sessions load
#   <kit>/plugin/skills/*/           the agent kit's Claude Code plugin skill
#   <kit>/repo/skills/*/             the agent kit's drop-in repo skill
#   <kit>/skills/                    the agent kit's per-task skill files
#   <kit>/repo/{CLAUDE.md,AGENTS.md,lattice.mdc}, <kit>/plugin/.claude-plugin/*.json
#                                    files an agent loads on its own, one target each
#   <kit>/{start,paste,render,authoring,examples}/   instructions people paste into an agent
#   <kit>/{components,reference,upload}/   the catalog an agent reads to pick a layout
#   <kit>/review/                    the bundled deck checker an agent runs
# With <kit>/README.md, that is every file in the agent kit an agent reads or runs.
# <kit> is the agent-kit root: `dist/agent-kit` locally (run `npm run build` first), or the
# `agent/` folder of a `dist-kits` checkout, which is the copy users actually download.
#
# Usage:
#   tools/scan-skills.sh [KIT_DIR] [--md FILE] [--sarif-dir DIR]
#   npm run scan:skills                      # local, against dist/agent-kit
#
# Findings that .github/skillspector-baseline.yaml matches are suppressed; every OTHER finding,
# at any severity, counts (--fail-on-findings). Prints `targets=N`, `skills=N`, `findings=N`
# on stdout for the nightly to read.
# Exit: 0 clean · 1 at least one unexcused finding · 2 the scan could not run.
#
# Needs `skillspector` on PATH (Python 3.12+). Pin the version the baseline was reviewed on:
#   pipx install "git+https://github.com/NVIDIA/skillspector.git@<sha>"   (sha: SKILLSPECTOR_REF
#   in .github/workflows/skillspector-nightly.yml)
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KIT="$ROOT/dist/agent-kit"
MD=""
SARIF_DIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --md) MD="$2"; shift 2 ;;
    --sarif-dir) SARIF_DIR="$2"; shift 2 ;;
    -h|--help) sed -n '2,28p' "$0"; exit 0 ;;
    *) KIT="$1"; shift ;;
  esac
done
BASELINE="$ROOT/.github/skillspector-baseline.yaml"

if ! command -v skillspector >/dev/null 2>&1; then
  echo "scan-skills: skillspector is not on PATH — see this file's header to install it" >&2
  exit 2
fi
if [ ! -d "$KIT/skills" ]; then
  echo "scan-skills: no agent kit at $KIT (run \`npm run build\`, or pass the dist-kits agent/ folder)" >&2
  exit 2
fi
KIT="$(cd "$KIT" && pwd)"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# One scan per skill. SkillSpector refuses --baseline on a --recursive scan, so every folder
# holding a SKILL.md is its own target. The kit's per-task files (<kit>/skills/*.md) carry no
# SKILL.md and scan as one target.
TARGETS=()
for group in "claude:$ROOT/.claude/skills" "kit-plugin:$KIT/plugin/skills" "kit-repo:$KIT/repo/skills"; do
  label="${group%%:*}"
  base="${group#*:}"
  for skill in "$base"/*/SKILL.md; do
    [ -f "$skill" ] || continue
    d="$(dirname "$skill")"
    TARGETS+=("$label/$(basename "$d")|$d")
  done
done
TARGETS+=("kit-skills|$KIT/skills")
for f in repo/CLAUDE.md repo/AGENTS.md repo/lattice.mdc plugin/.claude-plugin/plugin.json \
         plugin/.claude-plugin/marketplace.json start paste render authoring examples \
         components reference upload review README.md plugin/README.md; do
  TARGETS+=("kit/$f|$KIT/$f")
done

# COVERAGE FLOOR. A scan that covered nothing must not read as a clean night: each skill group
# must hold at least one skill, and every named kit file or folder must exist. Missing → exit 2.
for group in "$ROOT/.claude/skills" "$KIT/plugin/skills" "$KIT/repo/skills"; do
  if ! compgen -G "$group/*/SKILL.md" >/dev/null; then
    echo "scan-skills: no SKILL.md under $group — refusing to report a scan that covered nothing" >&2
    exit 2
  fi
done
if ! compgen -G "$KIT/skills/*.md" >/dev/null; then
  echo "scan-skills: $KIT/skills holds no .md — refusing to report a scan that covered nothing" >&2
  exit 2
fi
for t in "${TARGETS[@]}"; do
  p="${t#*|}"
  if [ ! -e "$p" ]; then
    echo "scan-skills: expected target $p is missing — refusing to report a partial scan as clean" >&2
    exit 2
  fi
done

# Record the targets in order first: the summary and the SARIF merge read these lists, so the
# report's order does not depend on which scan finishes first.
: >"$WORK/names"
: >"$WORK/jobs"
for t in "${TARGETS[@]}"; do
  IFS='|' read -r name dir <<<"$t"
  slug="${name//\//__}"
  echo "$name|$slug" >>"$WORK/names"
  printf '%s|%s\0' "$slug" "$dir" >>"$WORK/jobs"
  if [ -n "$SARIF_DIR" ]; then
    # Where a reader finds the scanned files: repo-relative for our own skills, and under a
    # `dist-kits/agent/` prefix for the kit, which lives on that branch and not in this tree.
    # Test the KIT arm first: in CI the kit is checked out INSIDE the repo workspace.
    case "$dir" in
      "$KIT"/*) where="dist-kits/agent/${dir#"$KIT"/}" ;;
      "$ROOT"/*) where="${dir#"$ROOT"/}" ;;
      *) where="$dir" ;;
    esac
    [ -f "$dir" ] && where="$(dirname "$where")"
    echo "$slug|$where" >>"$WORK/sarif-targets"
  fi
done

# PARALLEL. The targets are independent, and one after another they took 29 min on a GitHub
# runner (each scans twice: the verdict, then SARIF), against a job limit where a timeout ends
# the night in silence. One scan per core. SCAN_JOBS overrides the count.
scan_one() {
  local slug="${1%%|*}" dir="${1#*|}" rc
  skillspector scan "$dir" --no-llm --fail-on-findings --baseline "$BASELINE" \
    -f json -o "$WORK/$slug.json" >"$WORK/$slug.log" 2>&1
  rc=$?
  echo "$rc" >"$WORK/$slug.rc"
  if [ -n "$SARIF_DIR" ]; then
    skillspector scan "$dir" --no-llm --baseline "$BASELINE" \
      -f sarif -o "$WORK/$slug.sarif" >/dev/null 2>&1 || true
  fi
}
export -f scan_one
export BASELINE WORK SARIF_DIR
JOBS="${SCAN_JOBS:-$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 2)}"
xargs -0 -n 1 -P "$JOBS" bash -c 'scan_one "$1"' _ <"$WORK/jobs"

WORST=0
while IFS='|' read -r name slug; do
  rc="$(cat "$WORK/$slug.rc" 2>/dev/null || echo 2)"
  if [ "$rc" -ge 2 ] || [ ! -s "$WORK/$slug.json" ]; then
    echo "scan-skills: $name could not be scanned (exit $rc):" >&2
    tail -n 5 "$WORK/$slug.log" >&2 2>/dev/null
    WORST=2
  elif [ "$rc" -eq 1 ] && [ "$WORST" -lt 1 ]; then
    WORST=1
  fi
done <"$WORK/names"

# ONE SARIF, ONE RUN. Code scanning rejects an upload holding several runs with the same tool
# and category, so 22 per-skill files under one category would fail every night. Merge every
# target's results into a single run, prefixing each path with where that skill lives.
if [ -n "$SARIF_DIR" ] && [ -s "$WORK/sarif-targets" ]; then
  mkdir -p "$SARIF_DIR"
  node - "$WORK" "$SARIF_DIR/skillspector.sarif" <<'EOF' || echo "scan-skills: SARIF merge failed (the verdict is unaffected)" >&2
const fs = require('node:fs');
const path = require('node:path');
const [dir, out] = process.argv.slice(2);
let merged = null;
const rules = new Map();
for (const line of fs.readFileSync(path.join(dir, 'sarif-targets'), 'utf8').trim().split('\n')) {
  const [slug, where] = line.split('|');
  let doc;
  try { doc = JSON.parse(fs.readFileSync(path.join(dir, `${slug}.sarif`), 'utf8')); } catch { continue; }
  for (const run of doc.runs || []) {
    if (!merged) merged = { ...run, results: [], invocations: [] };
    for (const r of run.tool?.driver?.rules || []) if (!rules.has(r.id)) rules.set(r.id, r);
    for (const res of run.results || []) {
      for (const loc of res.locations || []) {
        const al = loc.physicalLocation?.artifactLocation;
        if (al?.uri) al.uri = `${where}/${al.uri}`;
      }
      merged.results.push(res);
    }
    merged.invocations.push(...(run.invocations || []));
  }
}
if (!merged) process.exit(1);
merged.tool = { ...merged.tool, driver: { ...merged.tool.driver, rules: [...rules.values()] } };
fs.writeFileSync(out, JSON.stringify({ $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0', runs: [merged] }, null, 1));
console.error(`scan-skills: wrote ${out} (${merged.results.length} results, one run)`);
EOF
fi

# Summarize. Node is the one runtime every Lattice job already has.
node - "$WORK" "${MD:-}" <<'EOF'
const fs = require('node:fs');
const path = require('node:path');
const [dir, mdOut] = process.argv.slice(2);
const names = fs.readFileSync(path.join(dir, 'names'), 'utf8').trim().split('\n').map((l) => l.split('|'));
const rows = [];
const found = [];
let skills = 0;
let targets = 0;
for (const [name, slug] of names) {
  let rc = 2; // no rc file: the scan died before writing one, which is "could not scan"
  try { rc = Number(fs.readFileSync(path.join(dir, `${slug}.rc`), 'utf8')); } catch {}
  let d = null;
  try { d = JSON.parse(fs.readFileSync(path.join(dir, `${slug}.json`), 'utf8')); } catch {}
  if (!d) { rows.push(`| ${name} | could not scan (exit ${rc}) | – | – | – | – |`); continue; }
  targets++;
  // A recursive scan nests one report per skill; a single scan IS the report.
  const reports = d.skills ? d.skills : [d];
  skills += reports.length;
  let active = 0;
  let suppressed = 0;
  let max = 0;
  for (const r of reports) {
    const issues = r.issues || [];
    active += issues.length;
    suppressed += r.suppressed_count || 0;
    max = Math.max(max, r.risk_assessment?.score ?? 0);
    for (const i of issues) {
      const where = `${i.location?.file ?? '?'}:${i.location?.start_line ?? '?'}`;
      found.push(`| ${name} | ${i.severity} | ${i.category} (${i.id}) | \`${where}\` | ${String(i.finding).replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 120)} |`);
    }
  }
  // rc 2 still writes a JSON report, so the crash has to be named here or it reads as FINDINGS.
  const verdict = rc === 0 ? 'clean' : rc === 1 ? 'FINDINGS' : `could not scan (exit ${rc})`;
  rows.push(`| ${name} | ${verdict} | ${reports.length} | ${active} | ${suppressed} | ${max} |`);
}
const md = [
  '## SkillSpector scan (static, `--no-llm`)',
  '',
  '| Target | Result | Skills | Unexcused findings | Baseline-suppressed | Max risk score |',
  '|---|---|---|---|---|---|',
  ...rows,
  '',
  found.length
    ? ['### Unexcused findings', '', '| Target | Severity | Category | Where | Matched text |', '|---|---|---|---|---|', ...found.slice(0, 60),
       found.length > 60 ? `\n_…and ${found.length - 60} more._` : ''].join('\n')
    : 'No finding outside `.github/skillspector-baseline.yaml`.',
  '',
  'A finding here is either a real problem in a skill or a false positive. Read the matched text. ' +
    'Fix the skill, or add a NARROW rule with its reason to `.github/skillspector-baseline.yaml` in a PR.',
].join('\n');
if (mdOut) fs.writeFileSync(mdOut, `${md}\n`);
else console.error(md);
console.log(`targets=${targets}`);
console.log(`skills=${skills}`);
console.log(`findings=${found.length}`);
EOF

exit "$WORST"
