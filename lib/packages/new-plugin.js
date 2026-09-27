/**
 * `lattice packages new plugin <name>` — the files of a new plugin package, ready to build
 * (spec/LPM.md §11, engineering/decisions/2026-09-27-plugin-system.md §4.13).
 *
 * The scaffold is the smallest plugin that exercises the parts an author most often needs: one
 * FENCE named after the plugin, a renderer that escapes the body into a figure, a stylesheet that
 * paints with two tokens, a docs page and two fixtures. It passes the build's resolver and the
 * conformance harness as written — test/unit/packages/new-plugin.test.js resolves it and runs its
 * fixtures — so an author starts from green and changes one thing at a time.
 *
 * Pure: `scaffoldPlugin` returns `{ files }` and never touches the disk; the CLI writes them.
 */

const { NAME_RE } = require('./kinds.js');

/** Title case from a slug: `step-plot` → `Step plot`. */
function titleOf(name) {
  const words = name.split('-');
  return [words[0].charAt(0).toUpperCase() + words[0].slice(1), ...words.slice(1)].join(' ');
}

/**
 * Why `name` cannot be a new plugin, or null. A plugin's scaffolded fence is named after it, so
 * the name must also be free as a fence: not a code language, not a shipped plugin's fence.
 * @param {string} name
 * @param {{ plugins: string[], fences: string[], languages: Set<string> }} taken
 */
function nameRefusal(name, taken) {
  if (!NAME_RE.test(name)) return `"${name}" is not a plugin name — use lowercase letters, digits and hyphens, starting with a letter`;
  if (taken.plugins.includes(name)) return `a plugin named "${name}" already exists`;
  if (taken.fences.includes(name)) return `"${name}" is already a fence another plugin renders`;
  if (taken.languages.has(name)) return `"${name}" is a code language (highlight.js), so a fence of that name would take over every code block in it`;
  return null;
}

/**
 * The files of a new plugin package, keyed by file name.
 * @param {string} name  a name `nameRefusal` accepted
 * @returns {{ files: Record<string, string> }}
 */
function scaffoldPlugin(name) {
  const title = titleOf(name);
  const manifest = {
    $schema: '../plugin.schema.json',
    type: 'plugin',
    format: 1,
    name,
    api: 1,
    title,
    description: `A \`${name}\` fence: its body renders as a captioned figure. Replace this line with what the plugin does.`,
    contributes: {
      fences: { [name]: { body: 'text' } },
      styles: true,
    },
    tokens: ['--accent', '--text-muted'],
    render: {
      surfaces: { engine: 'figure', preview: 'figure', pdf: 'figure', player: 'figure', marp: 'source' },
      parity: 'equivalent',
      degradesTo: 'code-block',
    },
  };

  const render = `/**
 * lib/plugins/${name}/${name}.render.js — the ${name} plugin's RENDERER.
 *
 * A \`\`\`${name} fence becomes a figure. \`token.content\` is the fence body; everything written
 * into markup goes through \`ctx.escape\`. Keep no state in closures: the engine reuses its parser
 * across renders. Contract: spec/LPM.md §4.2 and §5.1.
 */

const fences = Object.freeze({
  ${JSON.stringify(name)}: (token, ctx) =>
    \`<figure class="${name}"><pre class="${name}-body">\${ctx.escape(token.content.replace(/\\n$/, ''))}</pre></figure>\\n\`,
});

module.exports = { fences };
`;

  const styles = `/* lib/plugins/${name}/${name}.styles.css — token-only CSS (spec/LPM.md §4.4).
 * Every color goes through var(--token), and every token read here is listed in the manifest's
 * \`tokens\` — the build checks the two agree. */
section figure.${name} {
  border-inline-start: 3px solid var(--accent);
  padding-inline-start: 0.75em;
}
section figure.${name} .${name}-body {
  color: var(--text-muted);
  white-space: pre-wrap;
}
`;

  const docs = `# ${name}

${title}: a \`\`\`${name} fence renders its body as a figure, on any slide.

This is a **plugin** (spec/LPM.md). Replace this page with what an author needs: the syntax, an
example, what each surface shows, and what happens when the input is wrong.

## Authoring

\`\`\`\`markdown
## A slide with a ${name} figure

\`\`\`${name}
Any text. It renders verbatim, escaped.
\`\`\`
\`\`\`\`

## Failure behavior

A renderer that throws or returns a non-string renders the fence as a code block (the manifest's
\`degradesTo\`); the rest of the deck is unaffected.
`;

  const fixtures = `# ${name} — conformance fixtures

The plugin harness (\`test/unit/plugins/conformance.test.js\`) runs every case below: the
\` \`\`\`markdown \` fence is the input, rendered by the engine, and each bullet an assertion about the
render (\`renders\`, \`omits\`, \`detect true|false\`). Add a case for every behavior you promise.

## the fence renders a figure, its body escaped

\`\`\`\`markdown
\`\`\`${name}
a < b & c
\`\`\`
\`\`\`\`

- renders \`<figure class="${name}"><pre class="${name}-body">a &lt; b &amp; c</pre></figure>\`
- omits \`<code\`
- detect true

## another fence is left alone

\`\`\`\`markdown
\`\`\`text
not mine
\`\`\`
\`\`\`\`

- omits \`<figure class="${name}"\`
- detect false
`;

  return {
    files: {
      [`${name}.manifest.json`]: `${JSON.stringify(manifest, null, 2)}\n`,
      [`${name}.render.js`]: render,
      [`${name}.styles.css`]: styles,
      [`${name}.docs.md`]: docs,
      [`${name}.fixtures.md`]: fixtures,
    },
  };
}

module.exports = { scaffoldPlugin, nameRefusal, titleOf };
