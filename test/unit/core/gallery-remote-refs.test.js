/**
 * A component package's sample slide may not fetch from the network (HARD RULE #22;
 * followups.d/2336-p3-packages-trio-followups.md item 2). `lib/packages/gallery-gate.js`
 * renders the gallery through the engine, parses the result with parse5 and hands every
 * element to `lib/core/remote-ref.js`.
 *
 * The FETCHES rows include every spelling the adversarial pass on this change found a
 * source-regex scan missing — each is a place where a regex disagreed with markdown-it, the
 * HTML5 parser or a component transform — so the rendered check has to hold on all of them.
 * The BENIGN rows are what a shipped gallery or an honest author uses. The last test runs the
 * gate over every shipped gallery: they must all still import.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { galleryRemoteRefs, galleryFindings } = require('../../../lib/packages/gallery-gate.js');
const { isRemoteUrl, attrIsRemote, remoteCssRefs, remoteRefsInElements } = require('../../../lib/core/remote-ref.js');

const ROOT = path.resolve(__dirname, '../../..');

const FETCHES = {
  'markdown image': '![x](https://evil.test/a.png)',
  'markdown image, <target>': '![x](<https://evil.test/a.png>)',
  'markdown image, entity-encoded scheme': '![x](&#104;ttps://evil.test/a)',
  'markdown image, backslash-escaped colon': '![x](https\\://evil.test/a)',
  'Marp background image': '![bg right](//evil.test/a.jpg)',
  'alt text nested three deep': '![a [b [c]]](https://evil.test/a.png)',
  'reference image': '![x][r]\n\n[r]: https://evil.test/a',
  'reference target on the next line': '![x][foo]\n\n[foo]:\n  https://evil.test/a.png\n',
  'reference defined in a blockquote': '![x][foo]\n\n> [foo]: https://evil.test/a.png\n',
  'reference label under Unicode case folding': '![x][ẞ]\n\n[SS]: https://evil.test/a.png\n',
  'a fence closed by a longer fence': '```\ncode\n````\n\n![x](https://evil.test/a.png)\n\n```\n',
  'an escaped backtick': '\\`![x](https://evil.test/a.png)`',
  '<img src>': '<img src="https://evil.test/a">',
  '<img/src> with no space': '<div>\n<img/src=https://evil.test/a.png>\n</div>\n',
  '<img alt=x / src>': '<div>\n<img alt=x / src="https://evil.test/a.png">\n</div>\n',
  '<img src>, uppercase hex entity': '<img src="https&#X3A;//evil.test/a.png">\n',
  '<img src>, &bsol;&bsol;host': '<div>\n<img src="&bsol;&bsol;evil.test/a.png">\n</div>\n',
  '<img src>, &Tab; inside the scheme': '<div>\n<img src="h&Tab;ttps://evil.test/a.png">\n</div>\n',
  '<img srcset>': '<img srcset="a.png 1x, https://evil.test/b 2x">',
  'svg <image href>': '<svg><image href="https://evil.test/a"/></svg>',
  'svg <use xlink:href>': '<svg><use xlink:href="//evil.test/a#x"/></svg>',
  'svg <feImage href>': '<svg><filter><feImage href="https://evil.test/a"/></filter></svg>',
  'svg <set attributeName=href>': '<svg><image width="10" height="10"><set attributeName="href" to="https://evil.test/a.png"/></image></svg>\n',
  'svg <animate values>': '<svg><image><animate attributeName="href" values="a.png;https://evil.test/a"/></image></svg>',
  'inline style url()': '<div style="background:url(https://evil.test/a)"></div>',
  'inline style, CSS-escaped url(': '<div style="background:u\\72l(https://evil.test/a)"></div>',
  'inline style, &quot;-quoted url()': '<div style="background:url(&quot;https://evil.test/a&quot;)"></div>',
  'inline style image-set() with ")" in a string': '<p style=\'background-image:image-set("a)b" 1x, "https://evil.test/a.png" 2x)\'>x</p>\n',
  'inline style behind a prose "/*"': 'Text /* x\n\n<p style="background-image:url(https://evil.test/a.png)">hi</p>\n\nmore */ y\n',
  'presentation attribute fill=url()': '<svg><rect fill="url(https://evil.test/a#p)"/></svg>',
  'background directive': '<!-- _backgroundImage: url(https://evil.test/a) -->\n\n# hi',
  'logo: front matter': '---\nlogo: https://evil.test/a.png\n---\n\n# hi\n',
  'meta refresh': '<meta http-equiv="refresh" content="0;url=https://evil.test/">\n',
  'the video component\'s poster bullet': '<!-- _class: video -->\n\n## V\n\n- https://www.youtube.com/watch?v=aqz-KE-bpKQ\n- https://evil.test/p.png `poster`\n',
  'a mermaid label spelled with Mermaid\'s numeric codes': '```mermaid\nflowchart LR\n  A["<img src=\'https#58;#47;#47;evil.test/l.png\'>"]\n```\n',
  'a mermaid label spelled with named codes': '```mermaid\nflowchart LR\n  A["<img src=\'https#colon;#sol;#sol;evil.test/l.png\'>"]\n```\n',
  'a mermaid label spelled with HTML entities': '```mermaid\nflowchart LR\n  A["<img src=\'https&#58;&#x2f;&#x2F;evil.test/l.png\'>"]\n```\n',
  'a mermaid fence inside an HTML block (the CLI still draws it)': '<div>\n\n```mermaid\nflowchart LR\n  A@{ img: "https://evil.test/divimg.png", w: 50, h: 50 } --> B\n```\n\n</div>',
  'a mermaid image with a slashless URL': '```mermaid\nflowchart LR\n  A@{ img: http:evil.test/noslash.png, w: 50, h: 50 }\n```\n',
  'mermaid themeCSS with a slashless url()': '```mermaid\n%%{init: {"themeCSS": ".node rect { fill: url(http:evil.test/t.png) }"}}%%\nflowchart LR\n  A-->B\n```\n',
  'a mermaid label with semicolon-less HTML entities': '```mermaid\nflowchart LR\n  A["<img src=\'http&#58&#47&#47evil.test/nosemi.png\'>"]\n```\n',
  'a mermaid-x fence the runtime would still draw': '```mermaid-x\nflowchart LR\n  A@{ img: "https://evil.test/x.png" }\n```\n',
  'an iframe data: document with a tab in the scheme': '<iframe src="da&#9;ta:text/html,<img src=x>"></iframe>',
  'an iframe data: document behind a control character': '<iframe src="&#1;data:text/html,<img src=x>"></iframe>',
  'an iframe holding a data: document': '<iframe src="data:text/html,<img src=x>"></iframe>',
  'an object holding a data: document': '<object data="data:text/html,<img src=x>"></object>',
  'an embed holding a data: document': '<embed type="text/html" src="data:text/html,x">',
  'an iframe srcdoc': '<iframe srcdoc="<img src=x>"></iframe>',
  'a preload imagesrcset': '<link rel="preload" as="image" imagesrcset="https://evil.test/a.png 1x">',
  'an image inside <noscript>': '<noscript><img src="https://evil.test/a.png"></noscript>',
  '<style> @import': '<style>@import "x.css";</style>',
  // A definition resolves every use of its label in the deck the slide lands in, the deck's
  // own `![r]` included, and the first definition wins. So a remote one is refused even when
  // the slide itself only links with it.
  'a reference LINK (its definition can feed a host deck\'s image)': '[x][r]\n\n[r]: https://ok.test',
  'a remote reference definition the slide never uses': '# hi\n\n[logo]: https://evil.test/l.png\n',
  'a mermaid image shape': '```mermaid\nflowchart LR\nA@{ img: "https://evil.test/i.png" }\n```\n',
  'mermaid themeCSS': '```mermaid\n%%{init: {"themeCSS": ".node rect{fill:url(https://evil.test/t.svg)}"}}%%\nflowchart LR\nA-->B\n```\n',
  '<style> url()': '<style>section{background:url("https://evil.test/a")}</style>',
};

const BENIGN = {
  'a link': '[x](https://ok.test)',
  'an autolink': '<https://ok.test>',
  '<a href>': '<a href="https://ok.test">x</a>',
  'a relative image': '![x](logo.png)',
  'a root-relative image': '![x](/img/logo.png)',
  'a data: image': '![x](data:image/png;base64,AA)',
  'an svg with xmlns and a same-document url()': '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect fill="url(#g)"/></svg>',
  'code shown as code': '`<img src="https://evil.test/a">`\n\n```html\n<img src="https://evil.test/a">\n```',
  'a bare URL in prose': 'See https://ok.test for more.',
  'a relative reference definition': '# hi\n\n[logo]: ./logo.png\n',
  'an object holding a data: image': '<object data="data:image/png;base64,AA"></object>',
  'a plain mermaid diagram': '```mermaid\nflowchart LR\nA-->B\n```\n',
  'the video component with a video URL alone': '<!-- _class: video -->\n\n## V\n\n- https://www.youtube.com/watch?v=aqz-KE-bpKQ\n',
};

// Front matter has to open the file, so a row that starts with it goes in bare.
const slide = (md) => (md.startsWith('---\n') ? md : `<!-- _class: probe -->\n\n${md}\n`);

describe('galleryRemoteRefs (the rendered check)', () => {
  for (const [name, md] of Object.entries(FETCHES)) {
    test(`reports ${name}`, () => {
      const refs = galleryRemoteRefs(slide(md));
      assert.ok(refs.length >= 1, `${name}: ${JSON.stringify(md)}`);
    });
  }
  for (const [name, md] of Object.entries(BENIGN)) {
    test(`does not report ${name}`, () => {
      assert.deepEqual(galleryRemoteRefs(slide(md)), []);
    });
  }

  test('the refusing finding names the target, in the words both doors use', () => {
    const [f] = galleryFindings('<!-- _class: probe -->\n\n![x](https://evil.test/a.png)');
    assert.equal(f.rule, 'skeleton-remote');
    assert.match(f.message, /^its sample slide loads https:\/\/evil\.test\/a\.png from the network/);
    assert.deepEqual(galleryFindings(''), []);
  });

  test('every shipped gallery passes (they must keep importing)', () => {
    const galleries = [];
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.gallery.md')) galleries.push(p);
      }
    })(path.join(ROOT, 'lib/components'));
    assert.ok(galleries.length > 50, `found ${galleries.length} galleries`);
    for (const g of galleries) assert.deepEqual(galleryRemoteRefs(fs.readFileSync(g, 'utf8')), [], path.relative(ROOT, g));
  });
});

describe('remote-ref predicate', () => {
  test('isRemoteUrl: any scheme but data:, and protocol-relative', () => {
    for (const u of ['https://a', 'HTTP://a', 'ftp://a', '//a', '\\\\a', '\\/a', ' https://a', 'ht\ntps://a', 'blob:https://a/x', 'javascript:x']) assert.equal(isRemoteUrl(u), true, JSON.stringify(u));
    for (const u of ['', '#frag', 'data:image/png;base64,AA', 'logo.png', '/logo.png', './a/b.svg', null, undefined]) assert.equal(isRemoteUrl(u), false, JSON.stringify(u));
  });
  test('attrIsRemote: a link is not a fetch; the same href on <image> is', () => {
    assert.equal(attrIsRemote('a', 'href', 'https://ok.test'), false);
    assert.equal(attrIsRemote('image', 'href', 'https://evil.test'), true);
    assert.equal(attrIsRemote('a', 'ping', 'https://evil.test'), true);
    assert.equal(attrIsRemote('rect', 'fill', 'url(#g)'), false);
    assert.equal(attrIsRemote('rect', 'filter', 'url(https://evil.test/f#x)'), true);
    assert.equal(attrIsRemote('svg', 'xmlns', 'http://www.w3.org/2000/svg'), false);
  });
  test('remoteCssRefs tokenizes: strings, comments and escapes mean what CSS says', () => {
    assert.deepEqual(remoteCssRefs('a{content:"/*"; background:url(https://e/x)} /* */'), ['https://e/x']);
    assert.deepEqual(remoteCssRefs('background:image-set("a)b" 1x, "https://e/y" 2x)'), ['https://e/y']);
    assert.deepEqual(remoteCssRefs('background:u\\72l(//e/z)'), ['//e/z']);
    assert.deepEqual(remoteCssRefs('background:url( "https://e/q" )'), ['https://e/q']);
    assert.deepEqual(remoteCssRefs('/* url(https://e/c) */ fill:url(#g)'), []);
  });
  test('remoteRefsInElements: SMIL and meta refresh, which carry no fetching attribute', () => {
    assert.deepEqual(remoteRefsInElements([{ tag: 'set', attrs: [['attributename', 'href'], ['to', 'https://e/a']] }]), ['https://e/a']);
    assert.deepEqual(remoteRefsInElements([{ tag: 'set', attrs: [['attributename', 'fill'], ['to', 'https://e/a']] }]), []);
    assert.deepEqual(remoteRefsInElements([{ tag: 'meta', attrs: [['http-equiv', 'Refresh'], ['content', "0; URL='https://e/r'"]] }]), ['https://e/r']);
  });
});
