/**
 * Unit: the relay signature (engineering/decisions/2026-11-22-two-person-relay.md, D3).
 * tools/relay-core.js decides who signs; `npm run card` appends the line. The dangerous direction
 * is a WRONG name on someone's work, so the invalid and unset cases matter most: neither may sign.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const relay = require('../../../tools/relay-core');

const ROOT = path.join(__dirname, '../../..');
const ROSTER = { picard: 'John Luke Picard', kirk: 'James Tiberius Kirk' };

describe('roster', () => {
  test('the committed roster names exactly the two actors the owner chose', () => {
    assert.deepEqual(relay.loadRoster(), ROSTER);
  });

  test('a malformed roster is refused, not half-read', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roster-'));
    const file = path.join(dir, 'actors.json');
    for (const bad of ['[]', '{"Picard": "John"}', '{"picard": ""}', '{"picard": 3}']) {
      fs.writeFileSync(file, bad);
      assert.throws(() => relay.loadRoster(file), /actors\.json/, bad);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('resolveActor', () => {
  test('a roster key signs with its display name', () => {
    assert.deepEqual(relay.resolveActor({ LATTICE_ACTOR: 'kirk' }, ROSTER), { status: 'ok', key: 'kirk', name: 'James Tiberius Kirk' });
    assert.equal(relay.resolveActor({ LATTICE_ACTOR: ' picard\n' }, ROSTER).name, 'John Luke Picard');
  });

  test('unset or blank is "unset", never a default name', () => {
    for (const env of [{}, { LATTICE_ACTOR: '' }, { LATTICE_ACTOR: '   ' }]) {
      const r = relay.resolveActor(env, ROSTER);
      assert.equal(r.status, 'unset');
      assert.match(r.message, /picard \| kirk/);
    }
  });

  test('a value the roster lacks is "invalid": no display name, no case folding, no prototype keys', () => {
    for (const v of ['Picard', 'John Luke Picard', 'spock', 'toString', '__proto__']) {
      const r = relay.resolveActor({ LATTICE_ACTOR: v }, ROSTER);
      assert.equal(r.status, 'invalid', v);
      assert.equal(r.name, undefined);
      assert.match(r.message, /actors\.json/);
    }
  });
});

describe('sessionId + signature', () => {
  test('cse_ and session_ ids both become session_<id>; LATTICE_SESSION wins', () => {
    assert.equal(relay.sessionId({ CLAUDE_CODE_REMOTE_SESSION_ID: 'cse_01DPMM' }), 'session_01DPMM');
    assert.equal(relay.sessionId({ CLAUDE_CODE_REMOTE_SESSION_ID: 'cse_01DPMM', LATTICE_SESSION: 'session_X1' }), 'session_X1');
    assert.equal(relay.sessionId({ CLAUDE_CODE_REMOTE_SESSION_ID: 'not an id' }), null);
    assert.equal(relay.sessionId({}), null);
  });

  test('the line reads "— Name · session_<id>", or just the name without a session', () => {
    assert.equal(relay.signature('John Luke Picard', 'session_01'), '— John Luke Picard · session_01');
    assert.equal(relay.signature('James Tiberius Kirk', null), '— James Tiberius Kirk');
  });
});

describe('npm run card signs', () => {
  const card = (env) => {
    const clean = { ...process.env };
    delete clean.LATTICE_ACTOR;
    delete clean.LATTICE_SESSION;
    delete clean.CLAUDE_CODE_REMOTE_SESSION_ID;
    return spawnSync(process.execPath, [path.join(ROOT, 'tools', 'card.js'), path.join(ROOT, 'engineering', 'card-examples', 'standup.yml')], {
      encoding: 'utf8',
      env: { ...clean, ...env },
    });
  };

  test('valid actor: the signature is the last line, after the closing fence', () => {
    const r = card({ LATTICE_ACTOR: 'picard', CLAUDE_CODE_REMOTE_SESSION_ID: 'cse_01ABC' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /```\n\n— John Luke Picard · session_01ABC\n$/);
    assert.equal(r.stderr, '');
  });

  test('unset: prints the card unsigned, with exactly one warning line', () => {
    const r = card({});
    assert.equal(r.status, 0);
    assert.match(r.stdout, /```\n$/);
    assert.doesNotMatch(r.stdout, /^— /m);
    assert.equal(r.stderr.trim().split('\n').length, 1);
    assert.match(r.stderr, /LATTICE_ACTOR is not set/);
  });

  test('invalid: refused with exit 1 and nothing printed', () => {
    const r = card({ LATTICE_ACTOR: 'spock' });
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /not in \.github\/actors\.json/);
  });
});
