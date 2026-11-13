/**
 * tools/check-model-ids.mjs — the nightly model guard. Run against RECORDED lists (`--offline`), never
 * the network (HARD RULE #32): each case writes the lists it needs into its own temp folder.
 * engineering/decisions/2026-11-09-model-guard-rails.md
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..', '..', '..');
const SCRIPT = path.join(REPO, 'tools', 'check-model-ids.mjs');
const CONFIG = JSON.parse(fs.readFileSync(path.join(REPO, 'docs', 'src', 'lib', 'models.config.json'), 'utf8'));

/** A list body that carries every id the config names (exact ids as-is; a prefix or pattern gets a matching id). */
function liveLists() {
  const or = CONFIG.openrouter;
  const openrouter = [CONFIG.defaults.chat.openrouter, CONFIG.defaults.image.openrouter, ...or.chatFeatured.map((p) => `${p}-9`), ...or.chatValue.map((p) => `${p}-9`)];
  const voice = [CONFIG.defaults.voice.openrouter, CONFIG.pinned.tourVoice['openrouter-voice'], ...or.voiceQualityRank, ...or.voiceFeatured, ...or.voiceValue];
  return {
    openrouter: { data: openrouter.map((id) => ({ id })) },
    'openrouter-voice': { data: voice.map((id) => ({ id })) },
    gemini: { models: ['gemini-3.8-flash', 'gemini-3.8-pro', 'gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', CONFIG.defaults.voice.gemini].map((id) => ({ name: `models/${id}` })) },
    anthropic: { data: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'].map((id) => ({ id })) },
    openai: { data: ['gpt-6.1', 'gpt-5.2'].map((id) => ({ id })) },
  };
}

function run(lists, extra = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-guard-'));
  for (const [name, body] of Object.entries(lists)) fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(body));
  const md = path.join(dir, 'report.md');
  const r = spawnSync(process.execPath, [SCRIPT, '--offline', dir, '--md', md, ...extra], { encoding: 'utf8' });
  const report = fs.existsSync(md) ? fs.readFileSync(md, 'utf8') : '';
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: r.stdout + r.stderr, report };
}

test('every configured id live: exit 0, every list checked', () => {
  const r = run(liveLists());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /checked=\d+ skipped=none/);
  assert.match(r.report, /Every checked id is live/);
});

test('a deliberately retired id (the dry run) fails and is named in the report', () => {
  const r = run(liveLists(), ['--retire', 'openrouter-guard/not-a-model']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /GONE openrouter: openrouter-guard\/not-a-model/);
  assert.match(r.report, /\| openrouter \| `openrouter-guard\/not-a-model` \| exact \|/);
});

test('a default that left its list fails; a family with no live member fails', () => {
  const lists = liveLists();
  lists['openrouter-voice'].data = lists['openrouter-voice'].data.filter((m) => m.id !== CONFIG.defaults.voice.openrouter);
  lists.anthropic.data = lists.anthropic.data.filter((m) => !m.id.startsWith('claude-haiku'));
  const r = run(lists);
  assert.equal(r.code, 1);
  // A plain substring, not a RegExp built from the id: an id may hold any regex metacharacter.
  assert.ok(r.out.includes(`GONE openrouter-voice: ${CONFIG.defaults.voice.openrouter} (exact, defaults.voice.openrouter)`), r.out);
  assert.match(r.out, /GONE anthropic: \^claude-haiku-\\d \(pattern, families\.chat\.anthropic\)/);
});

test('a billing answer passes the connection and checks nothing on that list; a key refusal fails', () => {
  const lists = liveLists();
  lists.gemini = { status: 429, body: { error: { message: 'You exceeded your current quota, please check your plan and billing details.' } } };
  let r = run(lists);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /list gemini: billing/);
  assert.match(r.out, /skipped=gemini billing=1/);

  lists.gemini = { status: 400, body: { error: { message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } } };
  r = run(lists);
  assert.equal(r.code, 1, r.out);
  assert.match(r.report, /could not be read/);
});

test('a missing list is SKIPPED and reported as skipped, never as a pass for its ids', () => {
  const lists = liveLists();
  delete lists.openai;
  const r = run(lists);
  assert.equal(r.code, 0);
  assert.match(r.out, /list openai: skipped/);
  assert.match(r.out, /skipped=openai/);
});

test('every list measured: billing=0 is printed, which the stand-down requires', () => {
  const r = run(liveLists());
  assert.match(r.out, /billing=0$/m);
});
