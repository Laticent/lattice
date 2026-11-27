/**
 * The changelog formatter `changeset version` uses (`.changeset/config.json` `changelog`).
 *
 * Changesets' default formatter (`@changesets/changelog-git`) prefixes every entry with a
 * commit hash: `- 3f2a9c1: Charts render in dark mode`. That prefix lands in each package's
 * `CHANGELOG.md` and, from there, in the release notes `tools/release.js` builds from the FIRST
 * LINE of each entry. A reader deciding whether to upgrade has no use for a hash, so this
 * formatter writes the same shape without it:
 *
 *   - <first line of the changeset>
 *     <the rest of the changeset, indented two spaces>
 *
 * Contract: the first line is one plain sentence about what a user can now do, or what stopped
 * breaking (`.changeset/README.md`). The weekly release notes are that line and nothing else.
 */
'use strict';

/** One changeset's entry: its first line as the bullet, the rest indented under it. */
async function getReleaseLine(changeset) {
  const [first, ...rest] = changeset.summary.trim().split('\n').map((l) => l.trimEnd());
  const body = rest.map((l) => (l ? `  ${l}` : '')).join('\n');
  return `- ${first}${rest.length ? `\n${body}` : ''}`;
}

/** The "a dependency moved" entry, listing each internal dependency's new version. */
async function getDependencyReleaseLine(_changesets, dependenciesUpdated) {
  if (!dependenciesUpdated.length) return '';
  return ['- Updated dependencies:', ...dependenciesUpdated.map((d) => `  - ${d.name}@${d.newVersion}`)].join('\n');
}

module.exports = { getReleaseLine, getDependencyReleaseLine };
