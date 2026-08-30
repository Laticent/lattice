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
 * highlighting. A two-part `begin` array (the preceding character, then the
 * flag) with `beginScope: {2: 'params'}` expresses the same constraint through
 * hljs's own multi-part begin API, which compiles to a plain group everywhere.
 * See the `contains` entry below for the literal spelling.
 *
 * WHAT MAY PRECEDE A FLAG is a deliberate set, not just whitespace. Whitespace
 * alone left two identical adjacent lines colored differently — a flag at index
 * 0 of the block has nothing before it — and missed `[-h]` in a usage line. The
 * set is start-of-line plus ` ([|,;&`, which are the characters that actually
 * precede an option in shell. It excludes word characters (so `-file` in
 * `my-file.txt` is not a flag) and `:` and `=` (so `-dist` in `${OUT_DIR:-dist}`
 * and a `--opt=-value` tail are not). `${…}` has a second guard anyway — bash's
 * own variable mode opens at the earlier `$` and swallows the braces whole — but
 * the character set is what protects the unbraced cases.
 *
 * THE DOT RULE exists because appending to `keywords.built_in` makes bash's
 * `$pattern` (`/\b[a-z][a-z0-9._-]+\b/`) match a command name after a leading
 * dot: `rm -rf .git` and `tar --exclude=.git` painted `git` as a command, which
 * is a false claim about the code of exactly the kind this grammar exists to
 * avoid. `foo.git` and `/path/.git` were always safe (the greedy class and
 * bash's PATH_MODE take them); the bare and `=`-prefixed forms were not. The
 * rule consumes a dot-prefixed name as plain text before keyword matching sees
 * it, and carries no scope of its own — a dotfile is not a token, it is a name.
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
 * Commands a deck shows that stock bash does not color. Curated, not exhaustive:
 * every entry costs a false positive when the same word appears as a bare
 * argument, so generic English words that happen to be commands (`next`,
 * `bundle`, `less`, `more`, `top`, `watch`, `man`, `patch`, `tofu`) are
 * deliberately OMITTED even though they are real CLIs. `diff` and `ps` are out
 * for a different reason — `git diff` and `docker ps` would paint two commands
 * on one line, which reads as a bug rather than as help.
 *
 * WHAT STOCK BASH ACTUALLY COVERS, because an earlier version of this comment
 * asserted the opposite and the gap it caused shipped: hljs's `GNU_CORE_UTILS`
 * is the literal coreutils manifest, so it has `wc`, `cat`, `cp`, `head`, `tr`
 * — and NOT `find`, `sed`, `awk`, `grep`, `curl`, `make`, `ssh` or `tar`, none
 * of which are coreutils. Leaving those out on the strength of that belief left
 * `curl` the one gray word in an otherwise colored block, using the very
 * command this file's header quotes as its flag example. Verify before trimming:
 *   node -e "console.log(new Set(require('highlight.js/lib/languages/bash')(
 *     require('highlight.js')).keywords.built_in).has('curl'))"
 */
const MODERN_CLI_TOOLS = [
  // The everyday commands stock bash misses — NOT coreutils, despite reading
  // like them. These are the ones a slide's command list is actually made of.
  'find', 'sed', 'awk', 'grep', 'curl', 'wget', 'make', 'ssh', 'scp', 'rsync',
  'tar', 'unzip', 'zip', 'xargs',
  // JS/TS toolchain
  'npm', 'npx', 'pnpm', 'yarn', 'bun', 'deno', 'node', 'tsc', 'vite', 'astro',
  'eslint', 'prettier', 'biome', 'vitest', 'jest', 'playwright',
  // Version control + forge
  'git', 'gh', 'glab',
  // Containers, orchestration, infra
  'docker', 'podman', 'kubectl', 'helm', 'kustomize', 'terraform',
  'pulumi', 'ansible', 'vagrant',
  // (`tofu` omitted — a common English noun, and the CLI is rare on a deck.)
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
    // hljs builds ONE alternation from every mode's `begin` and takes the
    // earliest match in the string; `contains` order only breaks ties at the
    // same index. Both rules below win by starting a character EARLIER than the
    // token they protect, not by being listed first — so their position here is
    // for reading order, not precedence.
    contains: [
      // A dot-prefixed name is a filename, not a command: consume `.git` whole,
      // unscoped, so keyword matching never sees `git`.
      { begin: /[\s=:,(]\.[A-Za-z][\w-]*/ },
      // `-d`, `--build`. Group 1 is what may precede a flag (see the header);
      // group 2 is the flag itself, and only group 2 is scoped.
      {
        begin: [/(?:^|[\s([|,;&])/, /--?[A-Za-z][\w-]*/],
        beginScope: { 2: 'params' },
      },
      ...bash.contains,
    ],
  };
};

module.exports.GRAMMAR_NAME = GRAMMAR_NAME;
