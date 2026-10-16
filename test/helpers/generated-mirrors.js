/**
 * Folders whose files are a generated MIRROR of text written outside the repo, which every
 * test that walks "all tracked Markdown" must skip.
 *
 * backlog.d/ copies issue titles and form fields verbatim (tools/sync-backlog.js). A corpus
 * test that reads it is asserting something about an issue body nobody in a PR can edit, and
 * the nightly sync PR is the only PR that ever changes it. So one issue that quotes an old repo
 * claim, a 500-character Mermaid label or a forged marker would turn that PR red in the merge
 * queue every night until someone edited the issue. That is how the old BACKLOG.md mirror froze
 * for three weeks in August (sync-backlog.yml). The same folder is in US_SKIP_DIRS
 * (tools/check-ownership.js) for the repo-wide text walk.
 *
 * Use the pathspec with `git ls-files`, or the predicate on a list you already have.
 */

const GENERATED_MIRRORS = Object.freeze(['backlog.d/']);

/** `git ls-files` pathspecs that exclude every mirror: append after the include patterns. */
const EXCLUDE_MIRRORS = Object.freeze(GENERATED_MIRRORS.map((d) => `:(exclude)${d}`));

/** The same pathspecs, quoted for a shell-string `execSync` command. */
const EXCLUDE_MIRRORS_SHELL = EXCLUDE_MIRRORS.map((p) => `'${p}'`).join(' ');

/** True for a repo-relative path inside a mirror. */
const isGeneratedMirror = (rel) => GENERATED_MIRRORS.some((d) => rel.split('\\').join('/').startsWith(d));

module.exports = { GENERATED_MIRRORS, EXCLUDE_MIRRORS, EXCLUDE_MIRRORS_SHELL, isGeneratedMirror };
