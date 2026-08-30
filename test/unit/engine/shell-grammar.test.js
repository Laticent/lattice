/**
 * Unit: Lattice's augmented shell grammar (lib/integrations/highlight-js/shell.hljs.js,
 * registered by `registerShellHljs` in lib/integrations/markdown-it/plugins.js).
 *
 * The grammar exists because hljs's stock bash knows POSIX built-ins and nothing
 * else, so the shape a shell block actually takes on a slide — a list of modern
 * commands — rendered monochrome. These tests pin BOTH halves of that bargain:
 * the new color we wanted (commands, flags), and the correctness we refused to
 * trade for it (the `${VAR:-default}` and `my-file.txt` cases are exactly what a
 * powershell-as-bash substitution got wrong — see the decision note).
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

  describe('the correctness a powershell-as-bash substitution would have cost', () => {
    test('a default-value substitution is ONE variable, not a stray flag', () => {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: `${…}` is shell source under test, not an unfinished template literal.
      const SUBSTITUTION = '${OUT_DIR:-dist}';
      const html = fence('bash', `OUT_DIR=${SUBSTITUTION}`);
      assert.ok(
        html.includes(`<span class="hljs-variable">${SUBSTITUTION}</span>`),
        `a shell default-value substitution must stay a single variable token, got: ${html}`,
      );
      assert.deepEqual(tokens(html, 'params'), [], '-dist is a default value, not a flag');
    });

    test('a hyphen inside a word is not a flag', () => {
      const html = fence('bash', 'cp my-file.txt /tmp/');
      assert.deepEqual(tokens(html, 'params'), [], 'my-file.txt has no flag in it');
    });

    test('quoted strings stay strings', () => {
      const html = fence('bash', 'git tag -m "release 1.4.0"');
      assert.ok(html.includes('hljs-string'), 'the quoted message must remain a string');
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
    });

    test('```console keeps its prompt, and its embedded commands gain the augmentation', () => {
      const html = fence('console', '$ npm run build\nok');
      assert.ok(html.includes('hljs-meta prompt_'), `console must keep its prompt token, got: ${html}`);
      assert.ok(tokens(html, 'built_in').includes('npm'), 'the session grammar embeds bash, so npm should color');
    });
  });
});
