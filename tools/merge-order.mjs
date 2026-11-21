#!/usr/bin/env node
/**
 * Order a merge digest: find PRs that conflict with each other, and land the
 * smaller of each such pair first, so the other rebases once instead of being ejected.
 *
 * `/desk-merge` puts the ready PRs into one 🚦 Merge digest that the owner answers
 * once. Checked one at a time against `main`, two PRs can each be clean and still
 * conflict with EACH OTHER: the first lands, the second is ejected an hour later.
 * This tool checks every pair in memory, the way GitHub merges (merge drivers in
 * .gitattributes ignored, as tools/queue-precheck.sh does), and orders the digest
 * by a fixed rule. It checks pairs only: a conflict that needs three PRs together,
 * or a change to main after the run, is still the merge queue's to catch.
 * The rule:
 *   1. a PR whose base is another digest PR's branch comes after it (dependency);
 *   2. of two PRs that conflict, the smaller (added + deleted lines) goes first,
 *      ties by the older; the other one's session rebases after it lands
 *      (a real conflict, so HARD RULE #16 allows the rebase);
 *   3. otherwise, oldest first.
 * A PR that already conflicts with `main` is listed apart: it rebases before it
 * can be in any digest. A conflict edge that would contradict a dependency is
 * dropped (the dependency wins) and reported.
 *
 * Usage: PR JSON on stdin, `[{number, head, base, created_at, changes?}]`, flat
 * (head and base are branch names) or GitHub's list_pull_requests shape (head and
 * base as objects with `ref`); a missing `changes` is measured from git:
 *   npm run merge:order -- [--no-fetch] [--json] < prs.json
 * Exit: 0 printed · 1 printed, but a PR is on a dependency cycle or git could not
 * measure it (no merge base in a shallow clone, a missing branch; listed under
 * "unmeasured" and left out) · 2 bad input · 3 no PR could be measured, or a pair
 * check failed. Every input PR appears in exactly one list.
 * Contract: .claude/skills/desk-merge/SKILL.md step 3; engineering/workflow.md §Desks.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';

/**
 * Pure core: order `prs` given the pairwise `conflicts` and the PRs that
 * conflict with main. No git, so a test drives it directly.
 * @param {{number:number, head:string, base:string, changes:number, created_at:string}[]} prs
 * @param {{a:number, b:number, files:string[]}[]} conflicts pairs of PR numbers
 * @param {Set<number>} dirty PRs that conflict with main
 */
export function orderMerges(prs, conflicts, dirty = new Set()) {
  // A PR stacked on a PR that must rebase first is held with it, not ordered alone.
  const held = new Map([...dirty].map((n) => [n, 'conflicts with main; rebase first']));
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of prs) {
      if (held.has(p.number)) continue;
      const parent = prs.find((q) => q !== p && q.head === p.base && held.has(q.number));
      if (parent) {
        held.set(p.number, `built on #${parent.number}, which is held`);
        grew = true;
      }
    }
  }
  const live = prs.filter((p) => !held.has(p.number));
  const by = new Map(live.map((p) => [p.number, p]));
  const after = new Map(live.map((p) => [p.number, new Set()])); // u -> v: u lands before v
  const why = new Map(live.map((p) => [p.number, []]));
  const rebaseAfter = new Map();
  const dropped = [];

  const reaches = (from, to) => {
    const seen = new Set();
    const stack = [from];
    while (stack.length) {
      const n = stack.pop();
      if (n === to) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const m of after.get(n) || []) stack.push(m);
    }
    return false;
  };

  for (const p of live) {
    const parent = live.find((q) => q !== p && q.head === p.base);
    if (parent) {
      after.get(parent.number).add(p.number);
      why.get(p.number).push(`after #${parent.number}: built on its branch`);
    }
  }
  // A missing date sorts after every dated PR, then by number, so the order never
  // depends on the order of the input.
  const age = (x) => x.created_at || '~'; // missing or empty: after every date
  const byAge = (x, y) => (age(x) < age(y) ? -1 : age(x) > age(y) ? 1 : x.number - y.number);
  const older = (x, y) => (byAge(x, y) <= 0 ? x : y);
  for (const { a, b, files } of conflicts) {
    const x = by.get(a);
    const y = by.get(b);
    if (!x || !y) continue;
    const first = x.changes !== y.changes ? (x.changes < y.changes ? x : y) : older(x, y);
    const second = first === x ? y : x;
    if (reaches(second.number, first.number)) {
      dropped.push({ first: first.number, second: second.number, files });
      continue;
    }
    after.get(first.number).add(second.number);
    why.get(second.number).push(`after #${first.number}: conflicts (${files.slice(0, 3).join(', ')}); rebase once it lands`);
    rebaseAfter.set(second.number, [...(rebaseAfter.get(second.number) || []), first.number]);
  }

  // Kahn's topological sort; ties go to the oldest PR, so the order is deterministic.
  const indeg = new Map(live.map((p) => [p.number, 0]));
  for (const vs of after.values()) for (const v of vs) indeg.set(v, indeg.get(v) + 1);
  const ready = live.filter((p) => indeg.get(p.number) === 0);
  const order = [];
  while (ready.length) {
    ready.sort(byAge);
    const p = ready.shift();
    order.push(p.number);
    for (const v of after.get(p.number)) {
      indeg.set(v, indeg.get(v) - 1);
      if (indeg.get(v) === 0) ready.push(by.get(v));
    }
  }
  // Every input PR lands in exactly one list: a PR left with unmet edges sits on a
  // dependency cycle (two PRs each built on the other), which no order can satisfy.
  const placed = new Set(order);
  const unordered = live.filter((p) => !placed.has(p.number)).map((p) => p.number).sort((x, y) => x - y);
  // Of those, the ones on the cycle itself reach themselves; the rest only depend on it.
  const onCycle = unordered.filter((n) => [...after.get(n)].some((m) => reaches(m, n)));
  return {
    order: order.map((n) => ({ number: n, why: why.get(n).length ? why.get(n) : ['oldest first'] })),
    rebaseAfter: Object.fromEntries(rebaseAfter),
    dirty: [...dirty].sort((x, y) => x - y),
    held: [...held].filter(([n]) => !dirty.has(n)).map(([number, why]) => ({ number, why })),
    unordered,
    onCycle,
    dropped,
  };
}

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8a7d4c5e8b8fd5f';

/** Files two refs conflict on, merged in memory the way GitHub merges; [] if clean. */
export function conflictFiles(refA, refB, cwd = process.cwd()) {
  // merge-tree exits 1 (its "conflict" code) for an unknown ref too, with no file
  // listed, which would read as clean; so both refs must resolve first.
  for (const ref of [refA, refB]) {
    const v = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd });
    if (v.status !== 0) throw new Error(`git merge-tree ${refA} ${refB} could not run: no commit at ${ref}`);
  }
  const r = spawnSync(
    'git',
    ['--attr-source=' + EMPTY_TREE, 'merge-tree', '--write-tree', '--name-only', '--no-messages', refA, refB],
    { cwd, encoding: 'utf8' },
  );
  if (r.status === 0) return [];
  if (r.status === 1) return r.stdout.split('\n').slice(1).filter(Boolean);
  throw new Error(`git merge-tree ${refA} ${refB} could not run: ${(r.stderr || '').trim()}`);
}

function main() {
  const args = process.argv.slice(2);
  const fetch = !args.includes('--no-fetch');
  const json = args.includes('--json');
  let prs;
  try {
    // Accepts the flat shape or GitHub's own list_pull_requests shape (head/base objects).
    const refOf = (b) => (typeof b === 'string' ? b : b?.ref);
    prs = JSON.parse(fs.readFileSync(0, 'utf8'));
    if (!Array.isArray(prs)) throw new Error('shape');
    prs = prs.map((p) => ({ ...p, head: refOf(p.head), base: refOf(p.base) ?? 'main' }));
    if (prs.some((p) => !Number.isInteger(p.number) || typeof p.head !== 'string' || !p.head)) throw new Error('shape');
  } catch {
    console.error('merge-order: stdin must be a JSON list of {number, head, base, changes, created_at}');
    process.exit(2);
  }
  const ref = (head) => `origin/${head}`;
  try {
    if (fetch) execFileSync('git', ['fetch', '-q', 'origin', 'main', ...prs.map((p) => p.head)], { stdio: 'inherit' });
    // One PR git cannot measure (no merge base in a shallow clone, a deleted branch)
    // is set apart with its reason; the rest are still ordered.
    const unmeasured = [];
    const measured = [];
    const dirty = new Set();
    for (const p of prs) {
      try {
        // A PR's size, when the input lacks it: lines added plus deleted since it left main.
        if (!Number.isFinite(p.changes)) {
          const stat = execFileSync('git', ['diff', '--shortstat', `origin/main...${ref(p.head)}`], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          p.changes = [...stat.matchAll(/(\d+) (?:insertion|deletion)/g)].reduce((n, m) => n + Number(m[1]), 0);
        }
        if (conflictFiles(ref(p.head), 'origin/main').length) dirty.add(p.number);
        measured.push(p);
      } catch (err) {
        const why = (err.stderr ? String(err.stderr) : err.message).trim().split('\n')[0];
        unmeasured.push({ number: p.number, why: why || 'git could not measure it' });
      }
    }
    if (prs.length && !measured.length) throw new Error(`no PR could be measured; first: #${unmeasured[0].number} ${unmeasured[0].why}`);
    prs = measured;
    const clean = prs.filter((p) => !dirty.has(p.number));
    const conflicts = [];
    for (let i = 0; i < clean.length; i++) {
      for (let j = i + 1; j < clean.length; j++) {
        const files = conflictFiles(ref(clean[i].head), ref(clean[j].head));
        if (files.length) conflicts.push({ a: clean[i].number, b: clean[j].number, files });
      }
    }
    const result = { ...orderMerges(prs, conflicts, dirty), unmeasured };
    if (result.unordered.length || unmeasured.length) process.exitCode = 1;
    if (json) return console.log(JSON.stringify(result, null, 2));
    for (const u of unmeasured) console.log(`unmeasured: #${u.number} left out (${u.why}); check it by hand`);
    for (const [i, o] of result.order.entries()) console.log(`${i + 1}. #${o.number}  ${o.why.join('; ')}`);
    for (const n of result.dirty) console.log(`rebase first: #${n} conflicts with main`);
    for (const h of result.held) console.log(`held: #${h.number} ${h.why}`);
    for (const n of result.unordered) {
      const what = result.onCycle.includes(n) ? 'is on a dependency cycle' : 'is built on a PR in a dependency cycle';
      console.log(`unordered: #${n} ${what}; order it by hand`);
    }
    for (const p of prs.filter((x) => !x.created_at)) console.log(`warning: #${p.number} has no created_at; it sorts after every dated PR`);
    for (const d of result.dropped) console.log(`note: #${d.first} and #${d.second} conflict, but a dependency fixes their order`);
  } catch (err) {
    console.error(`merge-order: ${err.message}`);
    process.exit(3);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
