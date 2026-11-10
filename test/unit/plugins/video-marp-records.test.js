/**
 * A Marp render's `@video{…}` records: read from the Markdown, drawn by the runtime (lib/plugins/video/shared/video-marp-*.js,
 * `recordSpans` in fences.js, lib/runtime/video-card.js). The address rule (spec/LPM.md §10) is what most of these pin: the page supplies the place, the
 * Markdown supplies the record, and a span the Markdown does not hold, or one inside a plugin's subtree, is never drawn.
 * The real-marp-cli half is test/integration/export/marp-kit-video.test.js.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');
const { JSDOM } = require('jsdom');

const { recordSpans } = require('../../../lib/plugins/video/shared/fences.js');
const { latticeVideoRecords, RECORDS_TYPE } = require('../../../lib/plugins/video/shared/video-marp-engine.js');
const { drawRecords, readRecordBlock, validRecords, RECORD_ATTR } = require('../../../lib/plugins/video/shared/video-marp-dom.js');
const { composeVideoCard } = require('../../../lib/runtime/video-card.js');
const { ctxFor } = require('../../../lib/core/plugin-ctx.js');
const { service } = require('../../../lib/core/plugin-services.js');

const YT = '{"https://youtu.be/dQw4w9WgXcQ", title="Tour"}';
const VIMEO = '{"https://vimeo.com/76979871"}';
const ctx = ctxFor('video');

describe('recordSpans — every record span a whole deck holds, read from its Markdown (the VS Code channel)', () => {
  // The same list the marp-cli channel hands over: every span, wherever it sits. Which of them draws is the page's call.
  const md = (...lines) => lines.join('\n');
  test('every span in document order, fenced and running-text ones included', () => {
    const deck = md('---', 'marp: true', '---', '', `\`@video${YT}\``, '', `A \`@video${VIMEO}\` in text.`, '', '```', `\`@video${VIMEO}\``, '```');
    assert.deepEqual(recordSpans(deck), [YT, VIMEO, VIMEO]);
  });

  test('a BOM and CRLF change nothing, and a span across lines reads as markdown-it reads it', () => {
    assert.deepEqual(recordSpans(`\uFEFF\`@video${YT}\`\r\n`), [YT]);
    assert.deepEqual(recordSpans('`@video{"https://youtu.be/dQw4w9WgXcQ",\r\ntitle="T"}`'), ['{"https://youtu.be/dQw4w9WgXcQ", title="T"}']);
  });

  test('the two channels agree: the engine hands over the same list for the same deck', () => {
    const deck = md(`\`@video${YT}\``, '', '1. item', '    - `@video' + VIMEO + '`', '', `> \`@video${YT}\``, '', 'A `@video{"https://youtu.be/dQw4w9WgXcQ",', 'title="T"}` in text.');
    const html = new MarkdownIt().use(latticeVideoRecords).render(deck);
    const engine = JSON.parse(/<script type="application\/lattice-video-records">([^<]*)/.exec(html)[1]);
    assert.deepEqual(recordSpans(deck), engine);
  });
});

describe('latticeVideoRecords — the marp-cli engine plugin', () => {
  const render = (src) => new MarkdownIt({ html: false }).use(latticeVideoRecords).render(src);
  const block = (html) => {
    const m = /<script type="application\/lattice-video-records">([^<]*)<\/script>/.exec(html);
    return m ? JSON.parse(m[1]) : null;
  };

  test('collects every record span in the deck, in order; a fenced block holds no span', () => {
    const html = render(`\`@video${YT}\`\n\n- \`@video${VIMEO}\`\n\n> \`@video${YT}\`\n\nA \`@video${VIMEO}\` in text.\n\n\`\`\`\n\`@video${VIMEO}\`\n\`\`\`\n`);
    assert.deepEqual(block(html), [YT, VIMEO, YT, VIMEO]);
  });

  test('the block goes after the slides, so a last slide keeps its footer outside any card', () => {
    // Inside the last slide it sat after Marp's <footer>, and the video card took the footer in (red team, 2026-11-10).
    const md = new MarkdownIt().use((m) => m.core.ruler.push('slides', (state) => {
      const open = new state.Token('marpit_slide_open', 'section', 1);
      const close = new state.Token('marpit_slide_close', 'section', -1);
      state.tokens.unshift(open);
      state.tokens.push(close);
    })).use(latticeVideoRecords);
    const html = md.render(`\`@video${YT}\`\n`);
    assert.match(html, /<\/section>\s*<script type="application\/lattice-video-records">/);
  });

  test('writes nothing for a deck without a record', () => {
    assert.equal(render('## A\n\nNo clip here.\n').includes(RECORDS_TYPE), false);
  });

  test('the payload cannot end its <script> element, and a raw-HTML option does not matter (a custom token, not html_block)', () => {
    const evil = '{"https://youtu.be/dQw4w9WgXcQ", title="</script><img src=x onerror=alert(1)>"}';
    const html = render(`\`@video${evil}\``);
    const payload = /<script type="application\/lattice-video-records">([^<]*)<\/script>/.exec(html)[1];
    assert.ok(!payload.includes('<'), payload);
    assert.deepEqual(JSON.parse(payload), [evil]);
  });

  test('it is SELF-CONTAINED: the source the Marp configs write in runs with nothing around it', () => {
    // The serialized source, evaluated with no module scope at all: what a marp.config.cjs does with it.
    const rebuilt = new Function(`return (${latticeVideoRecords.toString()});`)();
    assert.deepEqual(
      /<script type="application\/lattice-video-records">([^<]*)/.exec(new MarkdownIt().use(rebuilt).render(`\`@video${YT}\``))[1],
      JSON.stringify([YT]),
    );
    assert.ok(latticeVideoRecords.toString().includes(`'${RECORDS_TYPE}'`), 'the block type inside the function is the one the runtime reads');
  });

  test('the kit config and the export bundle config both install it', () => {
    const { MARP_CONFIG_CJS } = require('../../../lib/export/marp-bundle.js');
    assert.ok(MARP_CONFIG_CJS.includes(latticeVideoRecords.toString()), 'the bundle config carries the function');
    assert.match(MARP_CONFIG_CJS, /engine: \(opts\) => engine\(opts\)\.use\(latticeVideoRecords\)/);
  });
});

describe('drawRecords — the runtime draws only what the Markdown holds', () => {
  const page = (body, cls = '') => new JSDOM(`<!doctype html><body><section id="1" class="${cls}">${body}</section></body>`).window.document;
  const span = (r) => `<code>@video${r.replace(/"/g, '&quot;')}</code>`;

  test('a lone span whose text is a record draws the figure, linked to the provider watch page', () => {
    const doc = page(`<h2>A</h2><p>${span(YT)}</p>`);
    assert.deepEqual(drawRecords(doc, [YT], { ctx }), [doc.querySelector('section')]);
    const fig = doc.querySelector('figure[data-lattice-media="video"]');
    assert.equal(fig?.querySelector('a.video-poster').getAttribute('href'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(doc.querySelector('code'), null);
  });

  test('a span the Markdown does not hold stays code (the address never comes from the page)', () => {
    const doc = page(`<p>${span('{"https://youtu.be/bbbbbbbbbbb"}')}</p>`);
    assert.deepEqual(drawRecords(doc, [YT], { ctx }), []);
    assert.ok(doc.querySelector('p > code'));
  });

  test('never more draws than the Markdown holds the record, counted across passes', () => {
    const doc = page(`<p>${span(YT)}</p><p>${span(YT)}</p>`);
    drawRecords(doc, [YT], { ctx });
    drawRecords(doc, [YT], { ctx });
    drawRecords(doc, [YT], { ctx });
    assert.equal(doc.querySelectorAll('figure').length, 1);
    assert.equal(doc.querySelector('figure').getAttribute(RECORD_ATTR), YT);
  });

  test('a forged figure marker inside a plugin subtree does not use up the author\'s record', () => {
    const doc = page(`<div data-lattice-plugin="p"><figure ${RECORD_ATTR}='${YT.replace(/"/g, '&quot;')}'></figure></div><p>${span(YT)}</p>`);
    drawRecords(doc, [YT], { ctx });
    assert.ok(doc.querySelector(`:scope section > figure[${RECORD_ATTR}]`));
  });

  test('a span inside a plugin subtree is never drawn, even when the record is owed', () => {
    const doc = page(`<div data-lattice-plugin="p"><p>${span(YT)}</p></div><p>${span(YT)}</p>`);
    drawRecords(doc, [YT], { ctx });
    assert.equal(doc.querySelectorAll('figure').length, 1);
    assert.ok(doc.querySelector('[data-lattice-plugin] p > code'), 'the plugin span stays code');
    assert.equal(doc.querySelector('[data-lattice-plugin] figure'), null);
  });

  test('running text, a fenced block and an unknown host stay code; the skip predicate is honored', () => {
    const unknown = '{"https://evil.example/x"}';
    const doc = page(`<p>A ${span(YT)} in text.</p><pre><code>@video${YT}</code></pre><p>${span(unknown)}</p><p>${span(VIMEO)}</p>`);
    assert.deepEqual(drawRecords(doc, [YT, unknown, VIMEO], { ctx, skip: (c) => c.textContent.includes('vimeo') }), []);
    assert.equal(doc.querySelectorAll('code').length, 4);
  });

  test('a tight list item holds its figure, as the engine nests it, even with a nested list after the record', () => {
    const doc = page(`<ul><li>${span(VIMEO)}</li><li>${span(YT)}\n<ul><li>sub</li></ul></li><li>${span(YT)} and text</li></ul>`);
    drawRecords(doc, [VIMEO, YT, YT], { ctx });
    assert.ok(doc.querySelector('ul > li > figure[data-provider="vimeo"]'));
    assert.ok(doc.querySelector('ul > li > figure[data-provider="youtube"] + ul > li'), 'the nested list stays after the figure');
    assert.ok([...doc.querySelectorAll('li > code')].some((c) => c.parentElement.textContent.includes('and text')), 'a span with text beside it stays code');
  });

  test('reached through the plugin\'s services, bound to its own ctx', () => {
    const doc = page(`<p>${span(YT)}</p>`);
    assert.equal(service('video', 'drawMarpRecords')(doc, service('video', 'marpRecords')(`\`@video${YT}\`\n`)).length, 1);
    assert.equal(service('video', 'marpEngineSource')(), latticeVideoRecords.toString());
    assert.equal(typeof service('video', 'readMarpRecordBlock'), 'function');
  });

  test('idempotent: a second pass draws nothing more', () => {
    const doc = page(`<p>${span(YT)}</p>`, 'video');
    drawRecords(doc, [YT], { ctx });
    const once = doc.body.innerHTML;
    assert.deepEqual(drawRecords(doc, [YT], { ctx }), []);
    assert.equal(doc.body.innerHTML, once);
  });
});

describe('the record block and its shape check', () => {
  test('reads the first block; a malformed or mis-shaped one reads as none', () => {
    const doc = (payload) => new JSDOM(`<!doctype html><body><script type="${RECORDS_TYPE}">${payload}</script></body>`).window.document;
    assert.deepEqual(readRecordBlock(doc(JSON.stringify([YT]))), [YT]);
    assert.equal(readRecordBlock(doc('not json')), null);
    assert.equal(readRecordBlock(doc(JSON.stringify([{ record: YT }]))), null);
    assert.equal(readRecordBlock(doc(JSON.stringify(['no braces']))), null);
    assert.equal(readRecordBlock(new JSDOM('<body></body>').window.document), null);
    assert.equal(validRecords(new Array(1500).fill(YT)).length, 1000, 'bounded: the first thousand, not none');
  });
});

describe('composeVideoCard — the card is built around the figure, never from a re-serialized figure', () => {
  // jsdom serializes `<` raw inside an attribute, as Chromium before about 138 and older Firefox do: the attack's real host.
  test('a title that would end the figure early stays text (red team, 2026-11-10)', () => {
    const evil = '{"https://youtu.be/dQw4w9WgXcQ", title="x</figure><img src=x onerror=alert(1)>"}';
    // Escaped the way Marp writes the span: the page holds TEXT, so any <img> after this is one the runtime made.
    const text = `@video${evil}`.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const dom = new JSDOM(`<!doctype html><body><section class="video"><h2>T</h2><p><code>${text}</code></p><p>after</p></section></body>`);
    const doc = dom.window.document;
    const section = doc.querySelector('section');
    assert.equal(doc.querySelectorAll('img').length, 0, 'the fixture holds no element yet');
    drawRecords(doc, [evil], { ctx });
    composeVideoCard(section);
    assert.equal(doc.querySelectorAll('img').length, 0, section.innerHTML);
    assert.ok(section.querySelector('.video-card > .video-head > h2'));
    assert.equal(section.querySelectorAll('figure').length, 1);
    assert.equal(section.querySelector('figcaption').textContent, 'x</figure><img src=x onerror=alert(1)>');
  });

  test('a qr slide gets its code inside the drawn figure', () => {
    const doc = new JSDOM(`<!doctype html><body><section class="video qr"><h2>T</h2><p><code>@video${YT.replace(/"/g, '&quot;')}</code></p></section></body>`).window.document;
    drawRecords(doc, [YT], { ctx });
    composeVideoCard(doc.querySelector('section'));
    assert.ok(doc.querySelector(`figure[${RECORD_ATTR}] .video-aside .video-qr svg`));
    assert.equal(doc.querySelector('[data-lattice-marp-slot]'), null);
  });
});
