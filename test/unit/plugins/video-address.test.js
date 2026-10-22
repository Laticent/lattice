/**
 * The video plugin's trust rule: the address comes ONLY from the author's own `@video{…}` span
 * (engineering/decisions/2026-10-16-media-plugins.md § 4.5). Each arm can fail: it names the path an
 * attacker would use and shows the render does not take it.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const dispatcher = require('../../../lib/core/inline-code-directives.js');
const engine = require('../../../lib/engine');
const { lintText } = require('../../../lib/authoring/lint.js');
const { migrateVideoBullets } = require('../../../lib/core/video-migrate.js');

const render = (md) => engine.createEngine().render(md, 'indaco').html;
const SPAN = '@video{"https://www.youtube.com/watch?v=dQw4w9WgXcQ", title="Tour"}';
const deck = (body, cls = 'video') => `---\ntheme: indaco\n---\n\n<!-- _class: ${cls} -->\n\n## Slide\n\n${body}\n`;

describe('where the address is read', () => {
  test('the markdown-it pass draws a lone span as the figure, from the span\'s own text', () => {
    const html = render(deck(`\`${SPAN}\``));
    assert.match(html, /<figure class="video-embed" data-lattice-media="video" data-provider="youtube"/);
    assert.match(html, /href="https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ"/);
    assert.doesNotMatch(html, /<p>\s*<figure/, 'the figure left its paragraph');
  });

  test('a bullet is NOT an address any more: slide text builds nothing', () => {
    const html = render(deck('- https://www.youtube.com/watch?v=dQw4w9WgXcQ\n- https://evil.example/p.png `poster`'));
    assert.doesNotMatch(html, /video-embed|video-poster|data-lattice-media/);
  });

  test('a span in running text stays code', () => {
    const html = render(deck(`See \`${SPAN}\` for the clip.`));
    assert.doesNotMatch(html, /data-lattice-media/);
    assert.match(html, /<code>@video\{/);
  });

  test('an address that is not a provider host draws nothing', () => {
    const html = render(deck('`@video{"https://attacker.example/?d=secret"}`'));
    assert.doesNotMatch(html, /data-lattice-media|video-poster/);
    assert.match(html, /<code>@video\{/);
  });

  test('a provider name hidden in the query or fragment does not pass for the host', () => {
    for (const u of ['https://evil.example/?next=https://youtu.be/dQw4w9WgXcQ', 'https://evil.example/#vimeo.com/1084537']) {
      assert.doesNotMatch(render(deck(`\`@video{"${u}"}\``)), /data-lattice-media/, u);
    }
  });
});

describe('the DOM path never dispatches an address kind', () => {
  test('renderElement answers null for a span the engine would draw', () => {
    const doc = new JSDOM('<!doctype html><body></body>').window.document;
    assert.equal(dispatcher.renderElement(doc, SPAN), null);
    assert.equal(dispatcher.renderHtml(SPAN), null, 'and it is not inline HTML either: a video is a block');
    assert.ok(dispatcher.renderBlockHtml(SPAN), 'only the block path draws it');
  });

  test('the kind is declared address, named-only, and block', () => {
    const row = require('../../../lib/plugins/inline.generated.js').INLINE.find((k) => k.name === 'video');
    assert.equal(row.address, true);
    assert.equal(row.namedOnly, true);
    assert.equal(row.block, true);
    assert.equal(row.sigil, null);
  });

  test('the bare record is still a pill: a named-only kind is reached only through its name', () => {
    assert.doesNotMatch(dispatcher.renderHtml('{"https://youtu.be/dQw4w9WgXcQ"}') || '', /video-embed/, 'the bare record is a pill, never a video');
    assert.equal(dispatcher.canonicalText(SPAN), SPAN, 'a reader that knows sigils must not rewrite it to a pill');
  });
});

describe('lint', () => {
  test('a bullet clip is an error with an autofix that writes the record', () => {
    const src = deck('- https://www.youtube.com/watch?v=dQw4w9WgXcQ\n- Tour `caption`');
    const f = lintText(src).filter((x) => x.rule === 'video-bullet');
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, 'error');
    assert.equal(f[0].replace.to, '`@video{"https://www.youtube.com/watch?v=dQw4w9WgXcQ", title="Tour"}`');
    const fixed = src.replace(f[0].replace.from, f[0].replace.to);
    assert.equal(lintText(fixed).filter((x) => x.rule === 'video-bullet').length, 0);
    assert.match(render(fixed), /data-lattice-media="video"/, 'the fixed deck draws the clip');
  });

  test('a span in a sentence warns; a lone span, even in a list item, does not', () => {
    assert.equal(lintText(deck(`See \`${SPAN}\`.`)).filter((x) => x.rule === 'video-not-alone').length, 1);
    assert.equal(lintText(deck(`\`${SPAN}\``)).filter((x) => x.rule === 'video-not-alone').length, 0);
    assert.equal(lintText(deck(`- \`${SPAN}\``)).filter((x) => x.rule === 'video-not-alone').length, 0);
  });

  test('a record whose address Segno cannot read says why (video-literal)', () => {
    const f = lintText(deck('`@video{https://youtu.be/dQw4w9WgXcQ?t=90}`')).filter((x) => x.rule === 'video-literal');
    assert.equal(f.length, 1);
    assert.match(f[0].message, /quote/);
  });

  test('a qr slide counts the record as its one payload', () => {
    assert.equal(lintText(deck(`\`${SPAN}\``, 'video qr')).filter((x) => /^qr-/.test(x.rule)).length, 0);
    assert.equal(lintText(deck('Nothing here.', 'video qr')).filter((x) => x.rule === 'qr-missing-payload').length, 1);
  });
});

describe('what the inversion found', () => {
  test('every bullet shape that drew a clip before migrates with the URL token, not the whole line', () => {
    for (const b of ['<https://youtu.be/dQw4w9WgXcQ>', '**https://youtu.be/dQw4w9WgXcQ**', 'Watch the [clip](https://youtu.be/dQw4w9WgXcQ) here', 'https://youtu.be/dQw4w9WgXcQ (two minutes)']) {
      const r = migrateVideoBullets(`<!-- _class: video -->\n\n- ${b}\n`);
      assert.equal(r.changed, 1, b);
      assert.match(r.source, /`@video\{"https:\/\/youtu\.be\/dQw4w9WgXcQ"\}`/, b);
    }
  });

  test('a video slide that names no clip at all is an error, whatever bullet it tried', () => {
    const f = lintText(deck('- Watch it at the link in the notes.')).filter((x) => x.rule === 'video-bullet');
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, 'error');
  });

  test('a list-item span leaves no empty list behind, and the poster carries no aria-label that hides its visible words', () => {
    const html = render(deck(`- \`${SPAN}\``));
    assert.doesNotMatch(html, /<ul>\s*<\/ul>|<li>\s*<\/li>/);
    assert.doesNotMatch(html, /class="video-poster[^>]*aria-label/);
  });
});

describe('migrateVideoBullets', () => {
  test('rewrites caption and poster bullets into one record, and only on a video slide', () => {
    const src = '<!-- _class: video -->\n\n## T\n\n- https://vimeo.com/1084537\n- A caption `caption`\n- sample:video-poster.svg `poster`\n\n---\n\n<!-- _class: content -->\n\n- https://vimeo.com/1084537\n';
    const r = migrateVideoBullets(src);
    assert.equal(r.changed, 1);
    assert.match(r.source, /`@video\{"https:\/\/vimeo\.com\/1084537", title="A caption", poster="sample:video-poster\.svg"\}`/);
    assert.match(r.source, /<!-- _class: content -->\n\n- https:\/\/vimeo\.com\/1084537\n/, 'a content slide is left alone');
  });

  test('a value the record cannot carry leaves the slide as written and counts it skipped', () => {
    const src = '<!-- _class: video -->\n\n- https://vimeo.com/1084537\n- say "hi" `caption`\n';
    const r = migrateVideoBullets(src);
    assert.equal(r.changed, 0);
    assert.equal(r.skipped, 1);
    assert.equal(r.source, src);
  });
});
