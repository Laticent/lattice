/**
 * The changelogs after the Changesets cutover (decision 2026-10-07-first-npm-release §11).
 *
 * The root CHANGELOG.md is an INDEX: it points at each package's own changelog and at the
 * pre-release archive, and it takes no entries. Each package's CHANGELOG.md is written by
 * `changeset version` and ships in that package's tarball (the engine's from
 * packages/lattice/, which `files` lists and the staging tool leaves alone).
 *
 * What can still go wrong, and what this holds:
 * - a PR appends an entry to the index, which is the shared-region conflict #1593 removed;
 * - a pointer into the repo-only `changelog/` archive is relative, so it dangles in the shipped
 *   copy (the release zip carries the index; npm carries the engine's changelog);
 * - a merge leaves conflict markers in a file that ships.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { workspacePackages } = require('../../../tools/release-packages.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const INDEX = path.join(ROOT, 'CHANGELOG.md');
const ENGINE_CHANGELOG = path.join(ROOT, 'packages', 'lattice', 'CHANGELOG.md');
const ARCHIVE_URL = 'https://github.com/Laticent/lattice/blob/main/changelog/';

/** Every changelog that ships: the index (release zip) and each package's own. */
function shippedChangelogs() {
  const files = [INDEX, ...workspacePackages(ROOT).map((p) => path.join(p.dir, 'CHANGELOG.md'))];
  return files.filter((f) => fs.existsSync(f));
}

describe('changelogs after the Changesets cutover', () => {
  test('the engine has its own committed CHANGELOG.md, and the engine manifest ships it', () => {
    assert.ok(fs.existsSync(ENGINE_CHANGELOG), 'packages/lattice/CHANGELOG.md is missing');
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages', 'lattice', 'package.json'), 'utf8'));
    assert.ok(manifest.files.includes('CHANGELOG.md'));
    assert.match(fs.readFileSync(ENGINE_CHANGELOG, 'utf8'), /^# @laticent\/lattice\n/);
  });

  test('the root CHANGELOG.md is an index: no `## Unreleased`, no version section', () => {
    const src = fs.readFileSync(INDEX, 'utf8');
    const sections = src.split('\n').filter((l) => /^##\s+(Unreleased|\[?v?\d+\.\d+)/i.test(l));
    assert.deepEqual(sections, [], 'entries go in a changeset (.changeset/README.md), never in the index');
  });

  for (const file of shippedChangelogs()) {
    const rel = path.relative(ROOT, file);
    const src = fs.readFileSync(file, 'utf8');

    test(`${rel} carries no conflict markers`, () => {
      const hits = src.split('\n').map((line, i) => ({ line, n: i + 1 })).filter(({ line }) => /^(<{7}|={7}|>{7})(\s|$)/.test(line));
      assert.deepEqual(hits.map((h) => `line ${h.n}: ${h.line}`), []);
    });

    test(`${rel}: every pointer into the repo-only changelog/ archive is an absolute URL`, () => {
      const bad = [];
      for (const line of src.split('\n')) {
        const targets = [...line.matchAll(/]\(\s*([^)\s]+)/g)].map((m) => m[1]);
        if (targets.some((t) => /^(?:\.\/|\.\.\/)*changelog\//.test(t))) bad.push(`relative link target: ${line.trim().slice(0, 100)}`);
        if (/changelog\/[A-Za-z0-9._-]+\.md/.test(line) && !targets.some((t) => t.startsWith(ARCHIVE_URL))) {
          bad.push(`bare pointer: ${line.trim().slice(0, 100)}`);
        }
      }
      assert.deepEqual(bad, [], `point into changelog/ with an absolute URL (${ARCHIVE_URL}…): the shipped copy has no changelog/ folder`);
    });
  }
});
