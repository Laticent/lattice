/**
 * Unit: Lattice's augmented shell grammar (lib/integrations/highlight-js/shell.hljs.js,
 * registered by `registerShellHljs` in lib/integrations/markdown-it/plugins.js).
 *
 * The grammar exists because hljs's stock bash knows POSIX built-ins and nothing
 * else, so the shape a shell block actually takes on a slide — a list of modern
 * commands — rendered monochrome. These tests pin BOTH halves of that bargain:
 * the new color we wanted (commands, flags), and the correctness we refused to
 * trade for it — `my-file.txt`, a flag in a string or comment, and an `=-value`
 * tail, each of which a powershell-as-bash substitution got wrong.
 *
 * Every rule here is MUTATION-PROVED: removing the flag rule's leading-character
 * guard fails 2 tests, removing the dot rule fails 1, and removing the added
 * commands fails 1. That check is worth re-running after any edit to the grammar,
 * because the most reassuring-looking assertion in this file used to be dead.
 *
 * They also pin what this grammar deliberately does NOT take: `shell` and
 * `console` stay on their upstream SESSION grammar, because the script-under-a-
 * session-tag defect belongs to `shellFenceFindings` (lib/core/fence-languages.js),
 * which tells the author to retag. Two mechanisms for one symptom would leave that
 * lint pointing at a problem it had silently solved.
 *
 * Everything here drives the REAL engine rather than the grammar object, because
 * the registration is the fragile part.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { createEngine } = require('../../../lib/engine/index.js');

/** Render one fence and return just the `<pre>…</pre>` block. */
function fence(lang, body) {
  const out = createEngine().render(`\`\`\`${lang}\n${body}\n\`\`\`\n`);
  const html = typeof out === 'string' ? out : out.html;
  const m = html.match(/<pre[\s\S]*?<\/pre>/);
  assert.ok(m, `no <pre> rendered for ${lang}`);
  return m[0];
}

/** The text inside `<span class="hljs-NAME">` spans, for one token role. */
function tokens(html, role) {
  return [...html.matchAll(new RegExp(`<span class="hljs-${role}">([^<]*)</span>`, 'g'))].map((m) => m[1]);
}

describe('augmented shell grammar', () => {
  test('modern CLI tools are built_ins, so a command list is not monochrome', () => {
    const html = fence('bash', [
      'npm install @workwel/lattice',
      'docker compose up -d --build',
      'kubectl apply -f k8s/ --namespace prod',
      'terraform apply -auto-approve',
    ].join('\n'));

    const builtIns = tokens(html, 'built_in');
    for (const cmd of ['npm', 'docker', 'kubectl', 'terraform']) {
      assert.ok(builtIns.includes(cmd), `${cmd} should be a built_in, got ${JSON.stringify(builtIns)}`);
    }
  });

  test('flags become params', () => {
    const html = fence('bash', 'docker compose up -d --build');
    assert.deepEqual(tokens(html, 'params').sort(), ['--build', '-d']);
  });

  test('stock bash keywords and built-ins survive the augmentation', () => {
    const html = fence('bash', 'for f in *.css; do\n  echo "$f"\ndone');
    const keywords = tokens(html, 'keyword');
    for (const kw of ['for', 'in', 'do', 'done']) assert.ok(keywords.includes(kw), `lost keyword ${kw}`);
    assert.ok(tokens(html, 'built_in').includes('echo'), 'lost built_in echo');
  });

  describe('what may precede a flag — the rule that keeps a hyphen from becoming an option', () => {
    // These are the LOAD-BEARING guard cases: each one fails if the flag rule's
    // leading-character set is widened to match a bare `-x` anywhere. (A previous
    // version of this block also asserted `${OUT_DIR:-dist}`, which reads like the
    // strongest case and is mutation-DEAD — bash's own BRACED_VAR mode opens at the
    // earlier `$` and swallows the braces whole, so that assertion passes even with
    // this rule deleted outright. It is kept below, honestly labeled.)
    test('a hyphen inside a word is not a flag', () => {
      const html = fence('bash', 'cp my-file.txt /tmp/');
      assert.deepEqual(tokens(html, 'params'), [], 'my-file.txt has no flag in it');
    });

    test('a flag inside a string stays string, and inside a comment stays comment', () => {
      assert.deepEqual(tokens(fence('bash', 'echo "a --flag inside"'), 'params'), []);
      assert.deepEqual(tokens(fence('bash', '# a --flag in a comment'), 'params'), []);
    });

    test('an option-looking tail after `=` is a value, not a flag', () => {
      assert.deepEqual(tokens(fence('bash', 'tool --opt=-value'), 'params').sort(), ['--opt']);
    });

    test('bash keeps a braced default-value substitution whole — its own mode, not this rule', () => {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: `${…}` is shell source under test, not an unfinished template literal.
      const SUBSTITUTION = '${OUT_DIR:-dist}';
      const html = fence('bash', `OUT_DIR=${SUBSTITUTION}`);
      assert.ok(
        html.includes(`<span class="hljs-variable">${SUBSTITUTION}</span>`),
        `a shell default-value substitution must stay a single variable token, got: ${html}`,
      );
      assert.deepEqual(tokens(html, 'params'), [], '-dist is a default value, not a flag');
    });

    test('quoted strings stay strings', () => {
      const html = fence('bash', 'git tag -m "release 1.4.0"');
      assert.ok(html.includes('hljs-string'), 'the quoted message must remain a string');
    });
  });

  describe('regressions found by the maker-checker pass', () => {
    test('the everyday non-coreutils commands color — `curl` most of all', () => {
      // These are NOT in hljs's GNU_CORE_UTILS, though they read like they would
      // be. An earlier comment claimed stock bash covered them, so they were left
      // out, and `curl` rendered as the one gray word in a colored block.
      const html = fence('bash', 'curl -sSL https://x.sh | sh\ngrep -q x f | sed s/a/b/\nfind . -name "*.md"\nmake build && tar -czf o.tgz .');
      const builtIns = tokens(html, 'built_in');
      for (const cmd of ['curl', 'grep', 'sed', 'find', 'make', 'tar']) {
        assert.ok(builtIns.includes(cmd), `${cmd} should color, got ${JSON.stringify(builtIns)}`);
      }
    });

    test('a dot-prefixed name is a filename, not a command', () => {
      for (const src of ['rm -rf .git && git init', 'tar --exclude=.git -czf o.tgz .']) {
        const html = fence('bash', src);
        assert.ok(
          !html.includes('>.<span class="hljs-built_in">git</span>') && !html.includes('=.<span class="hljs-built_in">git</span>'),
          `.git must not be painted as a command, got: ${html}`,
        );
      }
      // …while the real command on the same line still colors.
      assert.ok(tokens(fence('bash', 'rm -rf .git && git init'), 'built_in').includes('git'));
    });

    test('a flag colors at the start of a block, and after a bracket or pipe', () => {
      // Whitespace-only anchoring left two identical adjacent lines colored
      // differently, because the first flag in a block has nothing before it.
      const html = fence('bash', '-v, --verbose    show more\n-q, --quiet      show less');
      assert.deepEqual(tokens(html, 'params').sort(), ['--quiet', '--verbose', '-q', '-v']);

      assert.deepEqual(tokens(fence('bash', 'Usage: tool [-h] [--json]'), 'params').sort(), ['--json', '-h']);
      assert.deepEqual(tokens(fence('bash', 'case $1 in -h|--help) usage ;; esac'), 'params').sort(), ['--help', '-h']);
    });
  });

  describe('which fence tags it takes, and which it leaves', () => {
    test('```sh and ```zsh reach it — they are bash aliases', () => {
      for (const tag of ['sh', 'zsh']) {
        assert.ok(tokens(fence(tag, 'npm ci'), 'built_in').includes('npm'), `${tag} should be the augmented grammar`);
      }
    });

    test('```shell is NOT annexed — the session grammar keeps the name', () => {
      // Deliberate: `shellFenceFindings` (lib/core/fence-languages.js) owns the
      // script-under-a-session-tag defect by telling the author to retag. If this
      // ever starts coloring, that lint has been silently made redundant.
      const html = fence('shell', 'kubectl apply -f k8s/ --namespace prod');
      assert.deepEqual(tokens(html, 'built_in'), [], '```shell must stay on the upstream session grammar');
      // Assert the IDENTITY, not just the absence of color — the check above would
      // also pass if `shell` were re-registered as an empty grammar.
      const { createEngine: fresh } = require('../../../lib/engine/index.js');
      fresh().render('```sh\nx\n```\n'); // force registration
      assert.equal(require('highlight.js').getLanguage('shell').name, 'Shell Session');
    });

    test('```console keeps its prompt, and its embedded commands gain the augmentation', () => {
      const html = fence('console', '$ docker compose up -d --build\nok');
      assert.ok(html.includes('hljs-meta prompt_'), `console must keep its prompt token, got: ${html}`);
      // The session grammar sets `subLanguage: 'bash'`, which resolves to the
      // RE-REGISTERED grammar — so a transcript gets commands and flags too.
      assert.ok(tokens(html, 'built_in').includes('docker'), 'embedded bash should be ours');
      assert.deepEqual(tokens(html, 'params').sort(), ['--build', '-d']);
    });
  });
});
