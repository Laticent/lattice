/**
 * Unit: the deterministic changelog → semver-bump engine.
 *
 * The bump level for a release is derived purely from the `## Unreleased`
 * section's Keep-a-Changelog categories (see tools/changelog.js). These
 * tests pin that mapping so the automated release can never silently pick
 * the wrong level.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  extractUnreleased,
  extractVersion,
  computeBump,
  nextVersion,
  releaseNotes,
  fitReleaseBody,
  RELEASE_BODY_MAX,
  rollUnreleased,
} = require('../../../tools/changelog.js');

function changelog(unreleasedBody) {
  return [
    '# Changelog',
    '',
    '## Unreleased',
    '',
    unreleasedBody,
    '',
    '## 1.0.0 - 2026-01-01',
    '',
    '- initial release',
    '',
  ].join('\n');
}

describe('changelog bump engine', () => {
  describe('computeBump', () => {
    test('Removed → major', () => {
      assert.equal(computeBump('### Removed\n\n- dropped the `/legacy` export'), 'major');
    });

    test('Breaking-marked bullet under Changed → major', () => {
      assert.equal(
        computeBump('### Changed\n\n- **Breaking:** renamed `cards-grid` slot'),
        'major',
      );
    });

    test('BREAKING CHANGE token → major', () => {
      assert.equal(
        computeBump('### Changed\n\n- raised Node floor to 24\n\nBREAKING CHANGE: drops Node 22'),
        'major',
      );
    });

    test('Added → minor', () => {
      assert.equal(computeBump('### Added\n\n- new `timeline` component'), 'minor');
    });

    test('Changed (non-breaking) → minor', () => {
      assert.equal(computeBump('### Changed\n\n- retuned the type scale'), 'minor');
    });

    test('Deprecated → minor', () => {
      assert.equal(computeBump('### Deprecated\n\n- `fs-md` token names'), 'minor');
    });

    test('Fixed only → patch', () => {
      assert.equal(computeBump('### Fixed\n\n- mermaid scrim leak'), 'patch');
    });

    test('Security only → patch', () => {
      assert.equal(computeBump('### Security\n\n- bumped a transitive dep'), 'patch');
    });

    test('highest precedence wins across mixed categories', () => {
      const body = [
        '### Added',
        '- a new chart',
        '### Fixed',
        '- a bug',
        '### Removed',
        '- an old export',
      ].join('\n');
      assert.equal(computeBump(body), 'major');
    });

    test('Added + Fixed (no breaking) → minor', () => {
      assert.equal(computeBump('### Added\n- x\n### Fixed\n- y'), 'minor');
    });

    test('empty headings with no bullets → throws', () => {
      assert.throws(() => computeBump('### Added\n\n### Fixed\n'), /nothing to release/);
    });

    test('completely empty → throws', () => {
      assert.throws(() => computeBump('\n\n'), /nothing to release/);
    });

    test('repeated category headings are tolerated', () => {
      const body = '### Added\n- one\n### Added\n- two\n### Fixed\n- fix';
      assert.equal(computeBump(body), 'minor');
    });
  });

  describe('extractUnreleased', () => {
    test('captures body up to the next ## heading', () => {
      const md = changelog('### Added\n\n- thing');
      const sec = extractUnreleased(md);
      assert.ok(sec.body.includes('- thing'));
      assert.ok(!sec.body.includes('initial release'));
    });

    test('returns null when there is no Unreleased section', () => {
      assert.equal(extractUnreleased('# Changelog\n\n## 1.0.0\n\n- x'), null);
    });
  });

  describe('nextVersion', () => {
    test('major resets minor + patch', () => {
      assert.equal(nextVersion('1.4.2', 'major'), '2.0.0');
    });
    test('minor resets patch', () => {
      assert.equal(nextVersion('1.4.2', 'minor'), '1.5.0');
    });
    test('patch increments patch', () => {
      assert.equal(nextVersion('1.4.2', 'patch'), '1.4.3');
    });
    test('tolerates a v prefix', () => {
      assert.equal(nextVersion('v0.9.9', 'minor'), '0.10.0');
    });
    test('rejects an unparseable version', () => {
      assert.throws(() => nextVersion('not-a-version', 'patch'), /unparseable/);
    });
  });

  describe('rollUnreleased', () => {
    test('dates the section and seeds a fresh empty Unreleased', () => {
      const md = changelog('### Added\n\n- thing');
      const rolled = rollUnreleased(md, '1.1.0', '2026-05-29');
      assert.match(rolled, /## Unreleased\n\n## 1\.1\.0 - 2026-05-29/);
      // The old body now lives under the dated heading.
      assert.match(rolled, /## 1\.1\.0 - 2026-05-29\n\n### Added\n\n- thing/);
      // The fresh Unreleased is empty (no carried-over content).
      const fresh = extractUnreleased(rolled);
      assert.throws(() => computeBump(fresh.body), /nothing to release/);
    });
  });

  describe('releaseNotes', () => {
    test('returns the trimmed Unreleased body', () => {
      const notes = releaseNotes('\n\n### Added\n\n- thing\n\n\n');
      assert.equal(notes, '### Added\n\n- thing\n');
    });
  });

  // A Release body over GitHub's cap is rejected — at the last step of the
  // release, after the tag is pushed and the run can't simply be repeated.
  describe('fitReleaseBody', () => {
    const long = Array.from({ length: 400 }, (_, i) => `- entry ${i}`).join('\n');

    test('passes a body under the limit through untouched', () => {
      const fitted = fitReleaseBody('### Added\n\n- thing\n', '1.1.0');
      assert.equal(fitted.body, '### Added\n\n- thing\n');
      assert.equal(fitted.truncated, false);
    });
    test('trims an oversized body to fit, pointer included', () => {
      const fitted = fitReleaseBody(long, '1.1.0', 500);
      assert.ok(fitted.truncated);
      assert.ok(fitted.body.length <= 500, `body is ${fitted.body.length} chars`);
      assert.match(fitted.body, /CHANGELOG\.md` § 1\.1\.0/);
    });
    test('cuts on a line boundary, never mid-entry', () => {
      const fitted = fitReleaseBody(long, '1.1.0', 500);
      const kept = fitted.body.split('\n---\n')[0].trimEnd().split('\n');
      for (const line of kept) assert.match(line, /^- entry \d+$/);
    });
    test('the default limit is GitHub\'s', () => {
      assert.equal(RELEASE_BODY_MAX, 125000);
    });
  });

  // The release is cut in two phases across a merge (RELEASE.md): the notes
  // file lives in the gitignored release/ dir, so the publishing phase cannot
  // inherit it — it reads back the dated section the release PR committed.
  // If this slices the wrong section, a Release ships another version's notes.
  describe('extractVersion', () => {
    const rolled = rollUnreleased(changelog('### Added\n\n- new thing'), '1.1.0', '2026-05-29');

    test('slices the dated section a release roll wrote', () => {
      assert.equal(extractVersion(rolled, '1.1.0').body.trim(), '### Added\n\n- new thing');
    });
    test('stops at the next release heading', () => {
      assert.doesNotMatch(extractVersion(rolled, '1.1.0').body, /initial release/);
    });
    test('matches an undated heading', () => {
      assert.match(extractVersion(rolled, '1.0.0').body, /initial release/);
    });
    test('tolerates a v prefix on either side, and the [1.2.3] link form', () => {
      assert.ok(extractVersion(rolled, 'v1.1.0'));
      assert.ok(extractVersion('## [2.0.0] - 2026-06-01\n\n- x', '2.0.0'));
    });
    test('does not confuse a version with a prefix of another', () => {
      const md = '## 1.1.0 - 2026-05-29\n\n- eleven\n\n## 1.1 - 2026-05-01\n\n- one-one';
      assert.match(extractVersion(md, '1.1').body, /one-one/);
    });
    test('returns null for a version that has not shipped', () => {
      assert.equal(extractVersion(rolled, '9.9.9'), null);
    });
    test('never matches the Unreleased heading', () => {
      assert.equal(extractVersion('## Unreleased\n\n- pending', 'Unreleased'), null);
    });
  });
});
