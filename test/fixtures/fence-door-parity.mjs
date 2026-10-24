/**
 * ONE FIXTURE FOR BOTH FENCE DOORS (HARD RULE #1; plugin-system §9 decisions 10 to 15).
 *
 * The CLI's door (lib/packages/code-door.js, run through a real Chromium in
 * test/integration/export/plugin-fence-door.test.js) and the Studio's door
 * (docs/src/lib/code-packages/door-run.ts, run in docs/src/lib/code-packages/door.fence.test.ts)
 * each render THIS deck with THIS plugin and must satisfy the same CHECKS on the finished HTML.
 * A rule one door learns and the other does not shows up here as a check that one of them fails.
 */

/** A stranger's renderer: rows out of the fence's text, plus everything a fence's output must lose. */
export const RENDERER = `function render(fence) {
  var rows = fence.body.trim().split("\\n").map(function (l) { return "<li>" + l.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</li>"; }).join("");
  return '<ul class="lp-gantt-plugin-rows foreign-class cell-stage" id="' + fence.id + '" onclick="alert(1)">' + rows + '</ul><img src="https://evil.example/i.png" alt=""><video poster="https://evil.example/p.png"></video><script>alert(2)</script><a href="https://evil.example/l">link</a>';
}
export { render as default };`;

export const PLUGIN = { name: 'gantt-plugin', fence: 'gantt', code: RENDERER };

const fence = (body) => `\`\`\`gantt\n${body}\n\`\`\`\n`;

/** Slide 1 draws; slide 2 is another language; slide 3 is rebuilt by the shipped `qr-general` pass (a `closing qr` slide reads its bullet into a code; `video` left this slot when its address began to come only from the author's `@video{…}` span); slide 4 holds a raw nested section. */
export const DECK = [
  '---\ntheme: indaco\nplugins: [gantt-plugin]\n---\n',
  `## Plan\n\n${fence('Design 1 < 2\nBuild 3')}`,
  '## Code\n\n```js\nconst x = 1;\n```\n',
  `<!-- _class: closing qr -->\n\n## Clip\n\n- https://example.com/v\n\n${fence('qr slide, not drawn')}`,
  `## Nested\n\n<section class="x"><p>raw</p></section>\n\n${fence('nested, not drawn')}`,
].join('\n---\n\n').replace('\n---\n\n## Plan', '\n## Plan');

/** The same deck without the `plugins:` line: the plugin is installed but the deck did not list it. */
export const DECK_UNLISTED = DECK.replace('plugins: [gantt-plugin]\n', '');

const bodyOf = (html, text) => html.includes(text);
const root = (html) => /<div data-lattice-plugin="gantt-plugin">[\s\S]*?<\/div>/.exec(html)?.[0] ?? '';

/** [label, predicate over the finished deck HTML] for a render where the plugin is listed AND approved. */
export const CHECKS = [
  ['the first fence is drawn in the plugin’s root', (h) => /<div data-lattice-plugin="gantt-plugin">/.test(h)],
  ['it was handed the fence’s text as written', (h) => bodyOf(root(h), '<li>Design 1 &lt; 2</li><li>Build 3</li>')],
  ['its own class and an id in its namespace stay', (h) => /<ul class="lp-gantt-plugin-rows" id="lp-gantt-plugin-[0-9a-f]{8}-0">/.test(root(h))],
  ['a foreign class, an engine class and an inline handler go', (h) => root(h) !== '' && !/foreign-class|cell-stage|onclick/.test(root(h)) && !/foreign-class|onclick/.test(h)],
  ['a script, a remote image and a link go', (h) => !/<script|evil\.example|alert\(/i.test(h)],
  ['a media element with no source left to show is dropped (an empty <img> fails the Studio’s PDF writer)', (h) => root(h) !== '' && !/<img|<video|<audio|<image/i.test(root(h))],
  ['a fence of another language is still code', (h) => /language-js/.test(h)],
  ['exactly one fence is drawn: a slide a shipped pass rebuilds, and one with a raw <section>, stay code', (h) => (h.match(/data-lattice-plugin="gantt-plugin"/g) || []).length === 1 && /language-gantt/.test(h) && h.includes('qr slide, not drawn') && h.includes('nested, not drawn')],
];
