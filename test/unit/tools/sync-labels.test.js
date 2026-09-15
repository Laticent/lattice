/**
 * Unit: label taxonomy (tools/sync-labels.js + .github/labels.json).
 *
 * Covers validation (the gh-free seam) and that the committed taxonomy is
 * well-formed and matches the documented dimensions — so labels-as-code can't
 * ship a malformed or drifted vocabulary.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const TOOL = path.join(__dirname, '..', '..', '..', 'tools', 'sync-labels.js');
const { loadLabels, labelArgs, DEFAULT_FILE } = require(TOOL);

const writeJSON = (obj) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'labels-')), 'labels.json');
  fs.writeFileSync(f, JSON.stringify(obj));
  return f;
};

describe('sync-labels loadLabels validation', () => {
  test('accepts a well-formed taxonomy', () => {
    const f = writeJSON([{ name: 'priority:high', color: 'd93f0b', description: 'Next up' }]);
    assert.equal(loadLabels(f).length, 1);
  });
  test('rejects a duplicate name', () => {
    const f = writeJSON([{ name: 'x', color: 'ffffff' }, { name: 'x', color: '000000' }]);
    assert.throws(() => loadLabels(f), /duplicate label: x/);
  });
  test('rejects a bad color', () => {
    const f = writeJSON([{ name: 'x', color: '#fff' }]);
    assert.throws(() => loadLabels(f), /6-digit hex/);
  });
  test('rejects a missing name', () => {
    const f = writeJSON([{ color: 'ffffff' }]);
    assert.throws(() => loadLabels(f), /missing name/);
  });
});

describe('sync-labels labelArgs', () => {
  test('builds an upsert (--force) gh argv', () => {
    const args = labelArgs({ name: 'status:ready', color: '0e8a16', description: 'pickable' });
    assert.deepEqual(args, ['label', 'create', 'status:ready', '--color', '0e8a16', '--description', 'pickable', '--force']);
  });
  test('tolerates a missing description', () => {
    assert.deepEqual(labelArgs({ name: 'x', color: 'ffffff' }).slice(-3), ['--description', '', '--force']);
  });
});

describe('committed .github/labels.json', () => {
  const labels = loadLabels(DEFAULT_FILE); // throws if malformed → also a validity gate
  const names = labels.map((l) => l.name);

  test('covers all four dimensions', () => {
    for (const dim of ['area:', 'type:', 'priority:', 'status:']) {
      assert.ok(names.some((n) => n.startsWith(dim)), `has ${dim} labels`);
    }
  });
  test('priority is the collision-free word set (not pN)', () => {
    assert.deepEqual(
      names.filter((n) => n.startsWith('priority:')).sort(),
      ['priority:critical', 'priority:high', 'priority:low', 'priority:medium'],
    );
  });
  test('status set matches the kanban columns', () => {
    assert.deepEqual(
      names.filter((n) => n.startsWith('status:')).sort(),
      ['status:backlog', 'status:in-progress', 'status:ready', 'status:review'],
    );
  });
  test('no model axis — card-level model tiering was retired (2026-07-28)', () => {
    assert.deepEqual(names.filter((n) => n.startsWith('model:')), []);
  });
});

describe('the committed taxonomy is within GitHub limits', () => {
  // A label description over GitHub's 100-character cap is rejected with
  // `HTTP 422: Validation Failed`, and `tools/sync-labels.js` throws on the
  // first failure — so one long description aborts the run and every label
  // AFTER it in file order silently never gets created.
  //
  // That is not hypothetical. #2215 merged `feedback` with a 111-character
  // description; the Sync labels run on the merge commit created
  // `needs:definition` (96 chars, earlier in the file) and then died on
  // `feedback`. The taxonomy on the repo silently disagreed with the taxonomy
  // in the tree, and the intake bar's exemption — which keys on that exact
  // label — was inert, which is the failure the exemption exists to prevent.
  //
  // Nothing else catches it: the JSON is well-formed, lint is clean, and the
  // workflow only runs on a push to main that touches labels.json, so the first
  // signal is a red run AFTER the merge.
  const DESCRIPTION_CAP = 100; // GitHub's documented limit

  const labels = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', '..', '.github', 'labels.json'), 'utf8'),
  );

  test('every description fits GitHub\'s 100-character cap', () => {
    const over = labels
      .map((l) => ({ name: l.name, length: (l.description || '').length }))
      .filter((l) => l.length > DESCRIPTION_CAP);
    assert.deepEqual(
      over, [],
      `these descriptions would be rejected 422 and abort the sync mid-run: ${
        over.map((l) => `${l.name} (${l.length})`).join(', ')}`,
    );
  });

  test('every label has a name and a description', () => {
    for (const l of labels) {
      assert.ok(l.name?.trim(), 'a label is missing its name');
      assert.ok(l.description?.trim(), `${l.name} is missing its description`);
    }
  });

  test('no duplicate label names — a later entry would silently re-upsert the earlier', () => {
    const names = labels.map((l) => l.name);
    assert.deepEqual(names.length, new Set(names).size, 'duplicate label name in the taxonomy');
  });
});
