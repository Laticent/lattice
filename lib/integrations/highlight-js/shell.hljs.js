/**
 * highlight.js language definition for SHELL — Lattice's augmented `bash`.
 *
 * WHY THIS EXISTS. hljs's stock bash grammar knows POSIX built-ins and GNU
 * coreutils, and nothing else. That is fine for a script (it colors
 * `set` / `echo` / `for` / `fi` correctly) and near-useless for the shape a
 * shell block actually takes on a SLIDE — a list of commands:
 *
 *     npm install @workwel/lattice
 *     docker compose up -d --build
 *     kubectl apply -f k8s/ --namespace prod
 *
 * Under stock bash that block renders MONOCHROME: `npm`, `docker`, `kubectl`
 * and every flag are unknown words. Measured on the corpus in
 * `engineering/decisions/2026-08-30-shell-grammar.md`: 1 token across 6 lines.
 *
 * THE REJECTED ALTERNATIVE was to re-point `bash` at another grammar that
 * happens to paint more — `powershell` reads `-flag` as a parameter, so a
 * command list lights up. It also mis-tokenizes real scripts: `${OUT_DIR:-dist}`
 * has its `-dist` painted as a flag, quoted strings stop being strings, and
 * `v1.4.0` becomes the number `1.4`. On a boardroom slide a wrong color is a
 * false claim about the code, so we own the grammar instead of borrowing one.
 *
 * WHAT THIS ADDS to stock bash, and nothing else:
 *   1. FLAGS — `-d`, `--build`, `-sSL` → `.hljs-params`.
 *   2. MODERN CLI TOOLS — the package managers, container/cloud/infra CLIs and
 *      build tools a deck actually shows → `.hljs-built_in`, the same role
 *      stock bash gives `echo`, so no new token and no theme change.
 *
 * THE FLAG RULE USES A TWO-PART `begin`, NOT A LOOKBEHIND. `(?<=\s)--?\w+`
 * would be the obvious spelling and is barred: lookbehind is a SyntaxError on
 * Safari < 16.4, and this grammar is bundled into the browser preview, where a
 * regex that throws at construction takes the whole bundle down — not just the
 * highlighting. A two-part `begin` array (whitespace, then the flag) with
 * `beginScope: {2: 'params'}` expresses the same constraint through hljs's own
 * multi-part begin API, which compiles to a plain group everywhere. See the
 * `contains` entry below for the literal spelling.
 *
 * Requiring the leading whitespace is also what keeps the powershell bug out:
 * `-dist` in `${OUT_DIR:-dist}` is preceded by `:`, and `-file` in
 * `my-file.txt` by a word character, so neither is a flag. (Belt and braces —
 * bash's own variable mode opens at the earlier `$` and swallows `${…}` whole
 * before this rule is ever offered the position.)
 *
 * REGISTERED AS `bash`, which carries `sh` and `zsh` with it (hljs registers a
 * definition's own `aliases`) — see `registerShellHljs` in
 * lib/integrations/markdown-it/plugins.js.
 *
 * `shell` / `console` / `shellsession` ARE DELIBERATELY LEFT ALONE. Upstream they
 * are terminal-SESSION grammars whose job is marking the `$` prompt in pasted
 * output, and a script tagged ```shell is therefore near-monochrome. That is a
 * real defect and it is already handled — by `shellFenceFindings` in
 * lib/core/fence-languages.js, which detects a script under a session tag and
 * tells the author to retag. Annexing the `shell` NAME here would fix the same
 * symptom by overriding what an upstream grammar means, and would leave that lint
 * pointing at a problem it had silently solved. One mechanism, one message: the
 * lint owns the tag mix-up, this grammar owns what a correctly-tagged script and
 * command list look like. (It also makes the lint's advice pay better — retagging
 * to ```sh now buys the CLI built-ins and flags below, not just the script
 * grammar. See engineering/decisions/2026-08-25-on-demand-fence-grammars.md.)
 */

const bashLanguage = require('highlight.js/lib/languages/bash');

/**
 * Commands a deck shows that POSIX never heard of. Curated, not exhaustive:
 * every entry costs a false positive when the same word appears as a bare
 * argument, so generic English words that happen to be commands (`next`,
 * `bundle`) are deliberately OMITTED even though they are real CLIs.
 *
 * Stock bash already covers the coreutils (`find`, `wc`, `sed`, `awk`, `curl`,
 * `make`); duplicates here would be harmless but are left out for clarity.
 */
const MODERN_CLI_TOOLS = [
  // JS/TS toolchain
  'npm', 'npx', 'pnpm', 'yarn', 'bun', 'deno', 'node', 'tsc', 'vite', 'astro',
  'eslint', 'prettier', 'biome', 'vitest', 'jest', 'playwright',
  // Version control + forge
  'git', 'gh', 'glab',
  // Containers, orchestration, infra
  'docker', 'podman', 'kubectl', 'helm', 'kustomize', 'terraform', 'tofu',
  'pulumi', 'ansible', 'vagrant',
  // Clouds
  'aws', 'gcloud', 'az', 'heroku', 'flyctl', 'wrangler',
  // Language toolchains
  'cargo', 'rustup', 'pip', 'pipx', 'poetry', 'uv', 'gem', 'rails', 'composer',
  'mvn', 'gradle', 'dotnet', 'rustc',
  // Packages + services
  'brew', 'apt', 'apt-get', 'dnf', 'yum', 'pacman', 'snap', 'systemctl',
  'journalctl',
  // Data stores
  'psql', 'mysql', 'sqlite3', 'redis-cli', 'mongosh',
  // Structured-text utilities
  'jq', 'yq',
  // Build
  'cmake', 'ninja', 'bazel',
];

/**
 * The compiled grammar's `name`, exported so `registerShellHljs` can ask hljs
 * "is MY grammar already installed?" without hardcoding a string that could
 * drift from this file. Stock bash answers 'Bash', so the two never collide.
 */
const GRAMMAR_NAME = 'Shell';

module.exports = function shellLanguage(hljs) {
  const bash = bashLanguage(hljs);

  return {
    ...bash,
    name: GRAMMAR_NAME,
    // `shell` is NOT among these — see the header. Stock bash's own aliases.
    aliases: ['sh', 'zsh'],
    keywords: {
      ...bash.keywords,
      built_in: [...bash.keywords.built_in, ...MODERN_CLI_TOOLS],
    },
    // FIRST in the list so a flag wins a tie against any bash mode that could
    // open at the same index. Ties are the only case order decides — hljs picks
    // the EARLIEST match first, so `$`-anchored modes still take `${…}`.
    contains: [
      {
        begin: [/\s/, /--?[A-Za-z][\w-]*/],
        beginScope: { 2: 'params' },
      },
      ...bash.contains,
    ],
  };
};

module.exports.GRAMMAR_NAME = GRAMMAR_NAME;
