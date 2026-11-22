/**
 * The two-person relay kernel: who is signing, and how a signature reads.
 * Pure and fs-free apart from `loadRoster`, so the card tool, the baton and their tests share one
 * definition. Design and the owner's decisions: engineering/decisions/2026-11-22-two-person-relay.md
 * (D3: the actor comes from the non-secret LATTICE_ACTOR variable, validated against the committed
 * roster `.github/actors.json`; unset means no signature, never a guessed name).
 */
const fs = require('node:fs');
const path = require('node:path');

const ROSTER_PATH = path.join(__dirname, '..', '.github', 'actors.json');

/** The committed roster: `{ key: "Display Name" }`, for example `{ picard: "John Luke Picard" }`. */
function loadRoster(file = ROSTER_PATH) {
  const roster = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!roster || typeof roster !== 'object' || Array.isArray(roster)) {
    throw new Error(`${file} must be a JSON object of { key: "Display Name" }`);
  }
  for (const [key, name] of Object.entries(roster)) {
    if (!/^[a-z][a-z0-9-]*$/.test(key) || typeof name !== 'string' || !name.trim()) {
      throw new Error(`${file}: "${key}" must be a lower-case key with a non-empty display name`);
    }
  }
  return roster;
}

const HOW_TO_SET = 'set it on your own cloud environment, then start a new session (a variable reaches a session only when it starts)';

/**
 * Who this session signs as.
 * @returns {{status: 'ok', key: string, name: string}
 *   | {status: 'unset', message: string}
 *   | {status: 'invalid', message: string}}
 */
function resolveActor(env, roster) {
  const raw = env.LATTICE_ACTOR;
  const keys = Object.keys(roster).join(' | ');
  if (raw === undefined || raw.trim() === '') {
    return { status: 'unset', message: `LATTICE_ACTOR is not set, so nothing is signed (valid: ${keys}); ${HOW_TO_SET}.` };
  }
  const key = raw.trim();
  if (!Object.hasOwn(roster, key)) {
    return {
      status: 'invalid',
      message: `LATTICE_ACTOR="${raw}" is not in .github/actors.json (valid: ${keys}); ${HOW_TO_SET}.`,
    };
  }
  return { status: 'ok', key, name: roster[key] };
}

/**
 * This session's id as it appears in the `Claude-Session:` trailer (`session_<id>`), or null.
 * LATTICE_SESSION wins; otherwise the cloud harness's CLAUDE_CODE_REMOTE_SESSION_ID (`cse_<id>`),
 * which names the same session with a different prefix.
 */
function sessionId(env) {
  for (const raw of [env.LATTICE_SESSION, env.CLAUDE_CODE_REMOTE_SESSION_ID]) {
    if (!raw) continue;
    const m = /^(?:session_|cse_)([A-Za-z0-9]+)$/.exec(raw.trim());
    if (m) return `session_${m[1]}`;
  }
  return null;
}

/** The signature line that goes ABOVE the usual footers: `— John Luke Picard · session_01…`. */
function signature(name, session) {
  return session ? `— ${name} · ${session}` : `— ${name}`;
}

module.exports = { ROSTER_PATH, loadRoster, resolveActor, sessionId, signature, HOW_TO_SET };
