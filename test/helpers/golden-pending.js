/**
 * Is a committed golden PDF waiting on the nightly bless?
 *
 * Pull requests no longer commit PDFs (goldens rollout step 3,
 * engineering/decisions/2026-10-06-goldens-bot-blessed.md §2.3). The bless bot renders them
 * the night after a merge and a person merges its PR. Until then a committed PDF can be
 * MISSING (a deck or gallery merged without one) or OLDER than its sources, and that is
 * the expected state, not a defect. A test that asserts on a committed PDF uses this to
 * skip with the reason instead of failing every night until the bless PR is merged.
 *
 * "Waiting" is measured against the last MERGED bless, not the PDF's own last commit: the
 * bless re-commits a PDF only when its pixels moved, so a source edit that moves nothing
 * (a comment, a docs line) never touches the PDF, and a PDF-relative test would then skip
 * forever. Sources last changed before the last merged bless have been checked by it, so
 * their committed PDF is asserted as it always was, and a real defect still fails. With no
 * merged bless in the history at all, nothing is pending and the old behavior holds.
 *
 * Commit times come from git, so the checkout needs history: in a depth-1 clone no bless
 * commit is visible, nothing reads as pending, and the old behavior holds.
 *
 * The excuse EXPIRES. A source change older than PENDING_DAYS is no longer "waiting on
 * tonight's bless": the bless PR has sat unmerged, or the bless cannot render it. Either
 * way the test fails again, so a stalled bless turns the nightly red instead of widening a
 * silent skip window (inversion, step 3).
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PENDING_DAYS = 3;

function lastCommitTime(paths) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%ct', '--', ...paths], { cwd: ROOT, encoding: 'utf8' });
    return Number(out.trim()) || 0;
  } catch {
    return 0;
  }
}

// The bless PR squash-merges as `chore(goldens): nightly bless of <sha> (#N)`
// (golden-bless.yml), and <sha> is the commit it RENDERED from. Same pattern as
// tools/lib/golden-bless-verdict.mjs, which starts rule 4's window there too.
const BLESS_SUBJECT_RE = /^chore\(goldens\): nightly bless of ([0-9a-f]{12,40}) \(#\d+\)$/;

// The commit time of what the last merged bless rendered from. Not the time it merged: a
// person merges the bless PR hours later, and a source committed in between was never
// rendered, so dating the bless by its merge would assert a PDF that is still waiting.
// Searched over every parent: on a branch with main merged in, the bless sits on the
// second-parent side.
function lastBlessTime() {
  try {
    const subjects = execFileSync('git', ['log', '-n', '50', '--format=%s', '--grep=^chore(goldens): nightly bless of ', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
    for (const subject of subjects.split('\n')) {
      const m = subject.match(BLESS_SUBJECT_RE);
      if (!m) continue;
      const out = execFileSync('git', ['log', '-1', '--format=%ct', m[1]], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return Number(out.trim()) || 0;
    }
    return 0;
  } catch {
    return 0; // the rendered-from commit is not in this (shallow) checkout: assert as before
  }
}

/**
 * @param {string} pdf        absolute or repo-relative path of the committed PDF
 * @param {string[]} sources  absolute or repo-relative paths (files or directories) it is built from
 * @returns {string|null}     why it is pending a bless, or null when it should be checked
 */
function pendingBless(pdf, sources, { now = Date.now } = {}) {
  const blessed = lastBlessTime();
  if (!blessed) return null;
  const rel = (p) => (path.isAbsolute(p) ? path.relative(ROOT, p) : p);
  const srcTime = lastCommitTime(sources.map(rel));
  if (srcTime <= blessed) return null; // the last merged bless already saw these sources
  if (now() / 1000 - srcTime > PENDING_DAYS * 86400) return null; // waited too long: assert
  const abs = path.isAbsolute(pdf) ? pdf : path.join(ROOT, pdf);
  return fs.existsSync(abs)
    ? 'its sources changed after the last merged bless; the next bless refreshes it'
    : 'no committed PDF yet; the nightly bless renders it after the merge';
}

module.exports = { pendingBless, PENDING_DAYS, BLESS_SUBJECT_RE };
