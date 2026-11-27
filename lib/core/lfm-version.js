/**
 * lib/core/lfm-version.js — read a deck's `lfm:` line (LFM 1.0 §2.1, the version line).
 *
 * A deck MAY state the LFM version it was written for: `lfm: 1.0`. A deck that states none is read
 * as LFM 1.0. A reader reads any minor of a major it implements, and refuses a major it does not,
 * with a message that a newer reader is needed (spec/EXTENDING-1.0.md §6). This reader implements
 * LFM 1.x.
 *
 * One kernel, two callers (HARD RULE #1): lint-core reports the line (`lfm-version`), and the
 * command line refuses to render a deck of an unknown major. Pure and fs-free.
 */
/** The LFM major version this reference implementation reads. */
const LFM_MAJOR = 1;

/**
 * Read the value of an `lfm:` line, as `frontMatterValue` returns it (a string, or null when the
 * deck has no such line).
 * @param {string|null|undefined} value
 * @returns {{ stated: boolean, raw: string|null, ok: boolean, major: number|null, minor: number|null,
 *   problem: null|'malformed'|'newer-major'|'older-major' }}
 */
function readLfmVersion(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return { stated: false, raw: null, ok: true, major: LFM_MAJOR, minor: 0, problem: null };
  }
  const raw = String(value).trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!m) return { stated: true, raw, ok: false, major: null, minor: null, problem: 'malformed' };
  const major = Number(m[1]);
  const minor = m[2] === undefined ? 0 : Number(m[2]);
  if (major === LFM_MAJOR) return { stated: true, raw, ok: true, major, minor, problem: null };
  return { stated: true, raw, ok: false, major, minor, problem: major > LFM_MAJOR ? 'newer-major' : 'older-major' };
}

/** The sentence an author reads when the line is wrong; null when it is fine. */
function lfmVersionMessage(v) {
  if (v.ok) return null;
  if (v.problem === 'malformed') return `\`lfm: ${v.raw}\` isn't a version; write it as major.minor, like \`lfm: 1.0\`.`;
  return `This deck says it is LFM ${v.raw}, and this Lattice reads LFM ${LFM_MAJOR}.x. A deck of another major version needs a Lattice that reads it.`;
}

module.exports = { LFM_MAJOR, readLfmVersion, lfmVersionMessage };
