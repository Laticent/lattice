/**
 * Unit: the shared markdown-it engine plugins (lib/integrations/markdown-it/plugins.js).
 *
 * Each plugin is a markdown-it core-ruler hook that transforms the
 * token stream of slides whose `<section>` carries a specific layout
 * class. Tests load the plugins onto the owned slide pipeline (markdown-it +
 * lib/engine/slides — the tokenizer the engine runs them on),
 * apply one plugin in isolation, render fixture markdown, and assert on the HTML.
 *
 * Why one plugin per test instance: the plugins use named ruler hooks
 * (`split_list_counter`, `verdict_grid_badges`, etc.); applying the same plugin
 * twice to one instance would throw, and applying unrelated plugins together (or
 * the full transformer registry) can hide a regression in one plugin under
 * another's side effects. A fresh isolated host per test is cheap.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');
const { installSlidePipeline } = require('../../../lib/engine/slides');
const plugins = require('../../../lib/integrations/markdown-it/plugins');

describe('markdown-it-plugins', () => {
  // Apply ONE plugin in isolation on the owned slide pipeline (markdown-it +
  // lib/engine/slides — the slide/directive tokenizer the
  // engine runs the plugins on). Render fixture markdown,
  // assert on the HTML. Isolation (not the full engine) keeps each plugin's
  // regression from hiding under another plugin's side effects or the transformer
  // registry — isolation the host gives us.
  // NOTE: the owned pipeline defaults to `split: headings`, so a fixture with
  // several headings meant to live on ONE slide must declare `split: rule`.
  function makeMarp(plugin) {
    const md = new MarkdownIt('commonmark', { html: true, breaks: true });
    md.enable(['table', 'strikethrough']); // match lib/engine/index.js's markdown-it config
    installSlidePipeline(md);
    if (plugin) md.use(plugin);
    return { render: (src) => ({ html: md.render(src) }) };
  }

  // ── deckClassPropagate ─────────────────────────────────────────────────

  test('deckClassPropagate: deck-wide `class:` is appended to every section, even those with `_class:`', () => {
    const m = makeMarp(plugins.deckClassPropagate);
    const md = [
      '---',
      'class: dark',
      '---',
      '',
      '# Slide 1',
      '',
      '---',
      '',
      '<!-- _class: title -->',
      '',
      '# Slide 2',
      '',
      '---',
      '',
      '<!-- _class: cards-grid compact -->',
      '',
      '# Slide 3',
    ].join('\n');
    const { html } = m.render(md);
    const sections = [...html.matchAll(/<section[^>]*class="([^"]*)"/g)].map(m => m[1].split(/\s+/).filter(Boolean));
    assert.equal(sections.length, 3);
    for (const cls of sections) {
      assert.ok(cls.includes('dark'), `missing 'dark' on a section; got [${cls.join(', ')}]`);
    }
    // Per-slide layout tokens must survive — append, not replace.
    assert.ok(sections[1].includes('title'),       `slide 2 lost 'title'; got [${sections[1].join(', ')}]`);
    assert.ok(sections[2].includes('cards-grid'),  `slide 3 lost 'cards-grid'; got [${sections[2].join(', ')}]`);
    assert.ok(sections[2].includes('compact'),     `slide 3 lost 'compact'; got [${sections[2].join(', ')}]`);
  });

  test('deckClassPropagate: idempotent — a slide that already declares the deck token gets it once, not twice', () => {
    const m = makeMarp(plugins.deckClassPropagate);
    const md = [
      '---', 'class: dark', '---', '',
      '<!-- _class: list dark -->',
      '# Already-dark slide',
    ].join('\n');
    const { html } = m.render(md);
    const cls = html.match(/<section[^>]*class="([^"]*)"/)[1].split(/\s+/).filter(Boolean);
    const darkCount = cls.filter(c => c === 'dark').length;
    assert.equal(darkCount, 1, `'dark' should appear exactly once; got [${cls.join(', ')}]`);
  });

  test('deckClassPropagate: no-op when front matter has no `class:` directive', () => {
    const m = makeMarp(plugins.deckClassPropagate);
    const md = [
      '---', 'theme: indaco', '---', '',
      '<!-- _class: title -->',
      '# Title',
    ].join('\n');
    const { html } = m.render(md);
    const cls = html.match(/<section[^>]*class="([^"]*)"/)[1].split(/\s+/).filter(Boolean);
    assert.deepEqual(cls, ['title'], `expected only 'title'; got [${cls.join(', ')}]`);
  });

  test('deckClassPropagate: handles space-separated multi-token deck class', () => {
    const m = makeMarp(plugins.deckClassPropagate);
    const md = [
      '---', 'class: dark numbered', '---', '',
      '<!-- _class: cards-grid -->',
      '# Card slide',
    ].join('\n');
    const { html } = m.render(md);
    const cls = html.match(/<section[^>]*class="([^"]*)"/)[1].split(/\s+/).filter(Boolean);
    assert.ok(cls.includes('dark'));
    assert.ok(cls.includes('numbered'));
    assert.ok(cls.includes('cards-grid'));
  });

  test('deckClassPropagate: front-matter `mode: sketch` propagates the mapped class to every section', () => {
    const m = makeMarp(plugins.deckClassPropagate);
    const md = [
      '---', 'mode: sketch', '---', '',
      '# Slide 1', '',
      '---', '',
      '<!-- _class: cards-grid -->',
      '# Slide 2',
    ].join('\n');
    const { html } = m.render(md);
    const sections = [...html.matchAll(/<section[^>]*class="([^"]*)"/g)].map(x => x[1].split(/\s+/).filter(Boolean));
    assert.equal(sections.length, 2);
    for (const cls of sections) assert.ok(cls.includes('sketch'), `missing 'sketch'; got [${cls.join(', ')}]`);
    // Composes with the per-slide layout class, not replaces it.
    assert.ok(sections[1].includes('cards-grid'), `slide 2 lost 'cards-grid'; got [${sections[1].join(', ')}]`);
  });

  test('deckClassPropagate: `mode: sketch-clean` maps to both the sketch + clean-body tokens', () => {
    const m = makeMarp(plugins.deckClassPropagate);
    const md = ['---', 'mode: sketch-clean', '---', '', '# Slide'].join('\n');
    const { html } = m.render(md);
    const cls = html.match(/<section[^>]*class="([^"]*)"/)[1].split(/\s+/).filter(Boolean);
    assert.ok(cls.includes('sketch'));
    assert.ok(cls.includes('sketch-clean-body'));
  });

  test('deckClassPropagate: `mode:` (mode) and `finish:` (backdrop) COMPOSE on every section', () => {
    const m = makeMarp(plugins.deckClassPropagate);
    const md = ['---', 'class: numbered', 'mode: sketch', 'finish: atrium', '---', '', '# Slide'].join('\n');
    const { html } = m.render(md);
    const cls = html.match(/<section[^>]*class="([^"]*)"/)[1].split(/\s+/).filter(Boolean);
    assert.ok(cls.includes('numbered'), `lost class:; got [${cls.join(', ')}]`);
    assert.ok(cls.includes('sketch'), `lost mode:; got [${cls.join(', ')}]`);
    assert.ok(cls.includes('finish'), `lost finish base; got [${cls.join(', ')}]`);
    assert.ok(cls.includes('finish-atrium'), `lost finish preset; got [${cls.join(', ')}]`);
  });

  test('deckClassPropagate: a per-slide `boardroom` opts one slide OUT of the deck-wide style', () => {
    const m = makeMarp(plugins.deckClassPropagate);
    const md = [
      '---', 'mode: sketch', 'finish: atrium', '---', '',
      '# Slide 1 (gets the deck sketch)', '',
      '---', '',
      '<!-- _class: boardroom -->',
      '# Slide 2 (clean, but keeps the backdrop)',
    ].join('\n');
    const { html } = m.render(md);
    const sections = [...html.matchAll(/<section[^>]*class="([^"]*)"/g)].map(x => x[1].split(/\s+/).filter(Boolean));
    assert.ok(sections[0].includes('sketch'), `slide 1 should be sketch; got [${sections[0].join(', ')}]`);
    assert.ok(!sections[1].includes('sketch'), `slide 2 opted out; should NOT be sketch; got [${sections[1].join(', ')}]`);
    // …but the deck-wide finish backdrop still applies to the opted-out slide.
    assert.ok(sections[1].includes('finish-atrium'), `slide 2 should keep the backdrop; got [${sections[1].join(', ')}]`);
  });

  test('deckClassPropagate: an unknown `finish:` value maps to no class (silent baseline)', () => {
    const m = makeMarp(plugins.deckClassPropagate);
    const md = ['---', 'finish: sketchh', '---', '', '<!-- _class: title -->', '# Slide'].join('\n');
    const { html } = m.render(md);
    const cls = html.match(/<section[^>]*class="([^"]*)"/)[1].split(/\s+/).filter(Boolean);
    assert.deepEqual(cls, ['title'], `unknown finish should add nothing; got [${cls.join(', ')}]`);
  });

  test('deckClassPropagate: a per-slide finish-* OVERRIDES the deck finish (no two presets stacked)', () => {
    const m = makeMarp(plugins.deckClassPropagate);
    const md = [
      '---', 'finish: atrium', '---', '',
      '# Slide 1 (gets the deck finish)', '',
      '---', '',
      '<!-- _class: finish finish-halo -->',
      '# Slide 2 (its own finish overrides the deck)',
    ].join('\n');
    const { html } = m.render(md);
    const sections = [...html.matchAll(/<section[^>]*class="([^"]*)"/g)].map(x => x[1].split(/\s+/).filter(Boolean));
    assert.equal(sections.length, 2);
    // Slide 1: deck finish applies in full.
    assert.ok(sections[0].includes('finish') && sections[0].includes('finish-atrium'),
      `slide 1 should carry the deck finish; got [${sections[0].join(', ')}]`);
    // Slide 2: keeps its OWN finish-halo, does NOT also get the deck's finish-atrium
    // (two presets on one section would composite two finishes — the murk bug).
    assert.ok(sections[1].includes('finish-halo'), `slide 2 lost its own finish; got [${sections[1].join(', ')}]`);
    assert.ok(!sections[1].includes('finish-atrium'),
      `slide 2 must NOT inherit the deck finish-atrium; got [${sections[1].join(', ')}]`);
    // The base `finish` compositor token is still present (it carries the slots).
    assert.ok(sections[1].includes('finish'), `slide 2 lost the base finish token; got [${sections[1].join(', ')}]`);
  });

  test('deckClassPropagate: finish-none opts a slide out of the deck finish (no deck preset appended)', () => {
    const m = makeMarp(plugins.deckClassPropagate);
    const md = [
      '---', 'finish: atrium', '---', '',
      '<!-- _class: finish-none -->',
      '# Clean slide',
    ].join('\n');
    const { html } = m.render(md);
    const cls = html.match(/<section[^>]*class="([^"]*)"/)[1].split(/\s+/).filter(Boolean);
    assert.ok(cls.includes('finish-none'), `should keep finish-none; got [${cls.join(', ')}]`);
    assert.ok(!cls.includes('finish-atrium'),
      `finish-none must not inherit the deck finish-atrium; got [${cls.join(', ')}]`);
  });

  test('deckClassPropagate: `claim: quiet` propagates claim-quiet to every section', () => {
    const m = makeMarp(plugins.deckClassPropagate);
    const md = [
      '---', 'claim: quiet', '---', '',
      '# Slide 1', '',
      '---', '',
      '<!-- _class: cards-grid -->',
      '# Slide 2',
    ].join('\n');
    const { html } = m.render(md);
    const sections = [...html.matchAll(/<section[^>]*class="([^"]*)"/g)].map(x => x[1].split(/\s+/).filter(Boolean));
    assert.equal(sections.length, 2);
    for (const cls of sections) assert.ok(cls.includes('claim-quiet'), `missing 'claim-quiet'; got [${cls.join(', ')}]`);
    assert.ok(sections[1].includes('cards-grid'), `slide 2 lost 'cards-grid'; got [${sections[1].join(', ')}]`);
  });

  test('deckClassPropagate: a per-slide claim-* OVERRIDES the deck claim (no two presets stacked)', () => {
    const m = makeMarp(plugins.deckClassPropagate);
    const md = [
      '---', 'claim: quiet', '---', '',
      '# Slide 1 (gets the deck quiet)', '',
      '---', '',
      '<!-- _class: big-number claim-hero -->',
      '# Slide 2 (its own hero overrides the deck quiet)',
    ].join('\n');
    const { html } = m.render(md);
    const sections = [...html.matchAll(/<section[^>]*class="([^"]*)"/g)].map(x => x[1].split(/\s+/).filter(Boolean));
    assert.ok(sections[0].includes('claim-quiet'), `slide 1 should be quiet; got [${sections[0].join(', ')}]`);
    assert.ok(sections[1].includes('claim-hero'), `slide 2 should keep its own hero; got [${sections[1].join(', ')}]`);
    assert.ok(!sections[1].includes('claim-quiet'), `slide 2 must NOT inherit the deck quiet; got [${sections[1].join(', ')}]`);
  });

  test('deckClassPropagate: `claim: framed` and an unknown value map to no class (the frame baseline)', () => {
    const m = makeMarp(plugins.deckClassPropagate);
    for (const v of ['framed', 'nonsense']) {
      const md = ['---', `claim: ${v}`, '---', '', '<!-- _class: title -->', '# Slide'].join('\n');
      const { html } = m.render(md);
      const cls = html.match(/<section[^>]*class="([^"]*)"/)[1].split(/\s+/).filter(Boolean);
      assert.deepEqual(cls, ['title'], `claim: ${v} should add nothing; got [${cls.join(', ')}]`);
    }
  });

  // ── deck-wide `stamp:` / `tone:` SHAPE registers ───────────────────────

  test('deckClassPropagate: `stamp: seal` + `tone: edge` propagate the shape token to every section', () => {
    const m = makeMarp(plugins.deckClassPropagate);
    const md = [
      '---', 'stamp: seal', 'tone: edge', '---', '',
      '# Slide 1', '',
      '---', '',
      '<!-- _class: cards-grid -->',
      '# Slide 2',
    ].join('\n');
    const { html } = m.render(md);
    const sections = [...html.matchAll(/<section[^>]*class="([^"]*)"/g)].map(x => x[1].split(/\s+/).filter(Boolean));
    assert.equal(sections.length, 2);
    for (const cls of sections) {
      assert.ok(cls.includes('stamp-seal'), `missing 'stamp-seal'; got [${cls.join(', ')}]`);
      assert.ok(cls.includes('tone-edge'), `missing 'tone-edge'; got [${cls.join(', ')}]`);
    }
    // Composes with the per-slide layout class, not replaces it.
    assert.ok(sections[1].includes('cards-grid'), `slide 2 lost 'cards-grid'; got [${sections[1].join(', ')}]`);
  });

  test('deckClassPropagate: a per-slide `stamp-*` / `tone-*` shape OVERRIDES the deck register', () => {
    const m = makeMarp(plugins.deckClassPropagate);
    const md = [
      '---', 'stamp: seal', 'tone: edge', '---', '',
      '# Slide 1 (deck shapes)', '',
      '---', '',
      '<!-- _class: stamp-notch tone-glow -->',
      '# Slide 2 (its own shapes win)',
    ].join('\n');
    const { html } = m.render(md);
    const sections = [...html.matchAll(/<section[^>]*class="([^"]*)"/g)].map(x => x[1].split(/\s+/).filter(Boolean));
    // Slide 1 carries the deck shapes.
    assert.ok(sections[0].includes('stamp-seal') && sections[0].includes('tone-edge'),
      `slide 1 should carry the deck shapes; got [${sections[0].join(', ')}]`);
    // Slide 2 keeps its OWN shapes and does NOT also get the deck's (no two stacked).
    assert.ok(sections[1].includes('stamp-notch') && !sections[1].includes('stamp-seal'),
      `slide 2 stamp should be its own; got [${sections[1].join(', ')}]`);
    assert.ok(sections[1].includes('tone-glow') && !sections[1].includes('tone-edge'),
      `slide 2 tone should be its own; got [${sections[1].join(', ')}]`);
  });

  test('deckClassPropagate: a semantic `tone-pass` does NOT suppress the deck `tone:` shape (orthogonal axes)', () => {
    const m = makeMarp(plugins.deckClassPropagate);
    const md = [
      '---', 'tone: edge', '---', '',
      '<!-- _class: tone-pass -->',
      '# A passing slide — its SHAPE still comes from the deck',
    ].join('\n');
    const { html } = m.render(md);
    const cls = html.match(/<section[^>]*class="([^"]*)"/)[1].split(/\s+/).filter(Boolean);
    assert.ok(cls.includes('tone-pass'), `should keep the semantic tone; got [${cls.join(', ')}]`);
    assert.ok(cls.includes('tone-edge'), `semantic tone must not suppress the deck shape; got [${cls.join(', ')}]`);
  });

  test('deckClassPropagate: an unknown `stamp:` / `tone:` value maps to no class (silent default)', () => {
    const m = makeMarp(plugins.deckClassPropagate);
    const md = ['---', 'stamp: sael', 'tone: raill', '---', '', '<!-- _class: title -->', '# Slide'].join('\n');
    const { html } = m.render(md);
    const cls = html.match(/<section[^>]*class="([^"]*)"/)[1].split(/\s+/).filter(Boolean);
    assert.deepEqual(cls, ['title'], `unknown shapes should add nothing; got [${cls.join(', ')}]`);
  });

  // ── deck-wide `spectrum:` register (white-label brand bar) ─────────────

  test('deckClassPropagate: `spectrum: off` / `solid` propagate the token; `on`/unknown add nothing', () => {
    const m = makeMarp(plugins.deckClassPropagate);
    for (const [v, expected] of [['off', 'spectrum-off'], ['solid', 'spectrum-solid']]) {
      const md = ['---', `spectrum: ${v}`, '---', '', '# Slide 1', '', '---', '', '<!-- _class: cards-grid -->', '# Slide 2'].join('\n');
      const sections = [...m.render(md).html.matchAll(/<section[^>]*class="([^"]*)"/g)].map(x => x[1].split(/\s+/).filter(Boolean));
      assert.equal(sections.length, 2);
      for (const cls of sections) assert.ok(cls.includes(expected), `spectrum: ${v} missing '${expected}'; got [${cls.join(', ')}]`);
      assert.ok(sections[1].includes('cards-grid'), `slide 2 lost 'cards-grid'; got [${sections[1].join(', ')}]`);
    }
    for (const v of ['on', 'nonsense']) {
      const cls = m.render(['---', `spectrum: ${v}`, '---', '', '<!-- _class: title -->', '# Slide'].join('\n')).html.match(/<section[^>]*class="([^"]*)"/)[1].split(/\s+/).filter(Boolean);
      assert.deepEqual(cls, ['title'], `spectrum: ${v} should add nothing; got [${cls.join(', ')}]`);
    }
  });

  test('deckClassPropagate: a per-slide `spectrum-*` OVERRIDES the deck register (no two stacked)', () => {
    const m = makeMarp(plugins.deckClassPropagate);
    const md = [
      '---', 'spectrum: solid', '---', '',
      '# Slide 1 (deck solid)', '',
      '---', '',
      '<!-- _class: content spectrum-off -->',
      '# Slide 2 (its own off wins)',
    ].join('\n');
    const sections = [...m.render(md).html.matchAll(/<section[^>]*class="([^"]*)"/g)].map(x => x[1].split(/\s+/).filter(Boolean));
    assert.ok(sections[0].includes('spectrum-solid'), `slide 1 should be solid; got [${sections[0].join(', ')}]`);
    assert.ok(sections[1].includes('spectrum-off') && !sections[1].includes('spectrum-solid'),
      `slide 2 should keep its own off, not inherit solid; got [${sections[1].join(', ')}]`);
  });

  // The meta, progress and watermark Tiles are self-contained Form Tiles (issue
  // #356): each owns its kernel + cross-path parity pin in test/unit/forms/
  // <id>-tile.test.js, so their coverage is no longer here.

  // ── Form deck-wide toggle (`form: off | standard`) ─────────────────────

  test('readFormMode: Form is ON BY DEFAULT — absent form: key → standard; off / false / no opt out', () => {
    for (const v of ['standard', 'true', 'on', 'yes', 'ON', '"standard"']) {
      assert.equal(plugins.readFormMode(`---\nform: ${v}\n---\n`), 'standard', v);
    }
    // `form: minimal` was retired (2026-07-03) → resolves to standard now.
    assert.equal(plugins.readFormMode('---\nform: minimal\n---\n'), 'standard');
    // Explicit opt-out — the only way to disable now.
    for (const v of ['false', 'off', 'no']) {
      assert.equal(plugins.readFormMode(`---\nform: ${v}\n---\n`), 'off', v);
    }
    // Default-on: a deck with no `form:` key (or no front matter block) composes
    // as Form. Only a degenerate empty source stays off.
    assert.equal(plugins.readFormMode('---\ntheme: cuoio\n---\n'), 'standard');
    assert.equal(plugins.readFormMode('# just a heading, no front matter\n'), 'standard');
    assert.equal(plugins.readFormMode(''), 'off');
    assert.equal(plugins.readFormMode(null), 'off');
  });

  test('formToggleClass: `standard` adds form to content; skips bookends / sovereign / incompatible', () => {
    assert.equal(plugins.formToggleClass('content', 'standard'), 'content form');
    assert.equal(plugins.formToggleClass('cards-grid compact', 'standard'), 'cards-grid compact form');
    assert.equal(plugins.formToggleClass('', 'standard'), 'form'); // bare slide
    for (const skip of ['title', 'divider', 'closing', 'math', 'compare-code', 'split-panel', 'image']) {
      assert.equal(plugins.formToggleClass(skip, 'standard'), skip, `should skip ${skip}`);
    }
  });

  test('formToggleClass: `off` is a no-op; retired `minimal` no longer stamps no-progress', () => {
    assert.equal(plugins.formToggleClass('content', 'off'), 'content');
    // `form: minimal` is retired: a deck that still carries it resolves to standard
    // (readFormMode above), so the toggle stamps only `form` — no auto `no-progress`.
    // The "form, no rail" look is now the explicit `class: no-progress` chrome control.
    const mode = plugins.readFormMode('---\nform: minimal\n---\n'); // → 'standard'
    assert.equal(plugins.formToggleClass('content', mode), 'content form');
  });

  test('formToggleClass: respects explicit form / no-form; idempotent', () => {
    assert.equal(plugins.formToggleClass('content form', 'standard'), 'content form');
    assert.equal(plugins.formToggleClass('content no-form', 'standard'), 'content no-form');
    assert.equal(plugins.formToggleClass(plugins.formToggleClass('content', 'standard'), 'standard'), 'content form');
  });

  test('applyFormToggleToHtml: off no-ops; standard rewrites eligible sections', () => {
    const html =
      '<section class="content" data-lattice-slide="1"></section>' +
      '<section class="divider" data-lattice-slide="2"></section>' +
      '<section data-lattice-slide="3"></section>';
    assert.equal(plugins.applyFormToggleToHtml(html, '---\nform: off\n---\n'), html, 'no-op when off');
    const std = plugins.applyFormToggleToHtml(html, '---\nform: standard\n---\n');
    assert.match(std, /<section class="content form" data-lattice-slide="1">/);
    assert.match(std, /<section class="divider" data-lattice-slide="2">/, 'divider skipped');
    assert.match(std, /<section class="form" data-lattice-slide="3">/, 'bare slide gets a class attr');
    // Retired `form: minimal` resolves to standard — no auto `no-progress` stamp.
    const min = plugins.applyFormToggleToHtml(html, '---\nform: minimal\n---\n');
    assert.match(min, /<section class="content form" data-lattice-slide="1">/);
    assert.doesNotMatch(min, /no-progress/);
  });

  // ── applyDeckLogoToHtml ────────────────────────────────────────────────

  function logoFixture(html) {
    // Helper: minimal Marp-shaped section list for the rewriter to walk.
    return html;
  }

  test('applyDeckLogoToHtml: `logo:` with default `logo-on: all` injects <img class="deck-logo"> into every section', () => {
    const html = logoFixture([
      '<section id="1" data-lattice-slide="1"></section>',
      '<section id="2" class="title" data-lattice-slide="2"></section>',
      '<section id="3" data-lattice-slide="3"></section>',
    ].join(''));
    const md = '---\nlogo: ./acme.svg\n---\n';
    const out = plugins.applyDeckLogoToHtml(html, md);
    const imgs = [...out.matchAll(/<img[^>]*class="deck-logo[^"]*"[^>]*>/g)];
    assert.equal(imgs.length, 3, `expected 3 deck-logo imgs; got ${imgs.length}`);
    // No brand class when style is default `auto`.
    for (const m of imgs) {
      assert.ok(!/deck-logo-brand/.test(m[0]),
        `unexpected 'deck-logo-brand'; got ${m[0]}`);
    }
    // Inline custom property must carry the src for the mask rule.
    // The img's src attribute carries the path; CSS handles the
    // grayscale-watermark filter via the `.deck-logo` class.
    assert.match(out, /src="\.\/acme\.svg"/);
  });

  test('applyDeckLogoToHtml: img is the first child of each section (so absolute positioning is predictable)', () => {
    const html = '<section id="1" data-lattice-slide="1"><h1>Title</h1></section>';
    const md = '---\nlogo: ./acme.svg\n---\n';
    const out = plugins.applyDeckLogoToHtml(html, md);
    assert.match(out, /<section id="1" data-lattice-slide="1"><img[^>]*class="deck-logo[^>]*><h1>Title<\/h1><\/section>/);
  });

  test('applyDeckLogoToHtml: ignores literal <section> text inside code blocks (no `data-lattice-slide`)', () => {
    const html = [
      '<section id="1" data-lattice-slide="1"><code>&lt;section&gt;</code></section>',
      // Marp parses unescaped `<section>` in source as a real DOM element,
      // but it won't have `data-lattice-slide`. Make sure we leave it alone.
      '<section id="2" data-lattice-slide="2"><p>before <code><section><img></code> after</p></section>',
    ].join('');
    const md = '---\nlogo: ./acme.svg\n---\n';
    const out = plugins.applyDeckLogoToHtml(html, md);
    const imgs = [...out.matchAll(/<img[^>]*class="deck-logo[^"]*"/g)];
    assert.equal(imgs.length, 2, `expected exactly 2 deck-logo imgs (one per real Marp section); got ${imgs.length}`);
  });

  test('applyDeckLogoToHtml: `logo-on: title` injects only on the first slide and on `title`-classed slides', () => {
    const html = [
      '<section id="1" class="title" data-lattice-slide="1"></section>',
      '<section id="2" data-lattice-slide="2"></section>',
      '<section id="3" class="title" data-lattice-slide="3"></section>',
    ].join('');
    const md = '---\nlogo: ./acme.svg\nlogo-on: title\n---\n';
    const out = plugins.applyDeckLogoToHtml(html, md);
    const sections = out.split(/(?=<section)/);
    assert.equal(sections.length, 3);
    assert.match(sections[0], /<img[^>]*class="deck-logo/,    `cover should have logo: ${sections[0]}`);
    assert.doesNotMatch(sections[1], /<img[^>]*class="deck-logo/, `body should NOT have logo: ${sections[1]}`);
    assert.match(sections[2], /<img[^>]*class="deck-logo/,    `second cover should have logo: ${sections[2]}`);
  });

  test('applyDeckLogoToHtml: `logo-style: brand` adds `deck-logo-brand` class', () => {
    const html = '<section id="1" data-lattice-slide="1"></section>';
    const md = '---\nlogo: ./acme.svg\nlogo-style: brand\n---\n';
    const out = plugins.applyDeckLogoToHtml(html, md);
    assert.match(out, /<img[^>]*class="deck-logo deck-logo-brand"/);
  });

  test('applyDeckLogoToHtml: no-op when front matter has no `logo:` directive', () => {
    const html = '<section id="1" data-lattice-slide="1"></section>';
    const md = '---\ntheme: indaco\n---\n';
    const out = plugins.applyDeckLogoToHtml(html, md);
    assert.equal(out, html);
  });

  test('applyDeckLogoToHtml: tolerates quoted YAML value and paths with spaces', () => {
    const html = '<section id="1" data-lattice-slide="1"></section>';
    const md = '---\nlogo: "./assets/with space/acme.svg"\n---\n';
    const out = plugins.applyDeckLogoToHtml(html, md);
    assert.match(out, /<img[^>]*class="deck-logo/);
    assert.match(out, /src="\.\/assets\/with space\/acme\.svg"/);
  });

  test('applyDeckLogoToHtml: HTML-escapes src to prevent attribute-injection', () => {
    const html = '<section id="1" data-lattice-slide="1"></section>';
    const md = '---\nlogo: "./acme.svg\\"><script>alert(1)</script>"\n---\n';
    const out = plugins.applyDeckLogoToHtml(html, md);
    assert.doesNotMatch(out, /<script>alert\(1\)<\/script>/);
    assert.match(out, /&quot;|&lt;|&gt;/);
  });

  test('applyDeckLogoToHtml: `logo-x`/`logo-y`/`logo-scale` emit clamped inline --logo-* props', () => {
    const html = '<section id="1" data-lattice-slide="1"></section>';
    const md = '---\nlogo: ./acme.svg\nlogo-x: 50\nlogo-y: 84\nlogo-scale: 2.4\n---\n';
    const out = plugins.applyDeckLogoToHtml(html, md);
    assert.match(out, /style="[^"]*--logo-scale:2\.4/);
    assert.match(out, /--logo-x:50%/);
    assert.match(out, /--logo-y:84%/);
    // Positioning flips the corner anchor + re-centers on the point.
    assert.match(out, /--logo-anchor-right:auto/);
    assert.match(out, /--logo-nudge:translate\(-50%, -50%\)/);
  });

  test('applyDeckLogoToHtml: no inline style when placement/size are absent (default corner unchanged)', () => {
    const html = '<section id="1" data-lattice-slide="1"></section>';
    const md = '---\nlogo: ./acme.svg\n---\n';
    const out = plugins.applyDeckLogoToHtml(html, md);
    assert.doesNotMatch(out, /style="[^"]*--logo-/);
  });

  test('applyDeckLogoToHtml: scale-only emits --logo-scale but no positioning props', () => {
    const html = '<section id="1" data-lattice-slide="1"></section>';
    const md = '---\nlogo: ./acme.svg\nlogo-scale: 1.5\n---\n';
    const out = plugins.applyDeckLogoToHtml(html, md);
    assert.match(out, /--logo-scale:1\.5/);
    assert.doesNotMatch(out, /--logo-x:/);
  });

  test('applyDeckLogoToHtml: a lone axis (x without y) does NOT position (avoids a half-shift off the corner)', () => {
    const html = '<section id="1" data-lattice-slide="1"></section>';
    const md = '---\nlogo: ./acme.svg\nlogo-x: 30\n---\n';
    const out = plugins.applyDeckLogoToHtml(html, md);
    assert.doesNotMatch(out, /--logo-x:/);
    assert.doesNotMatch(out, /--logo-nudge:/);
  });

  test('applyDeckLogoToHtml: out-of-range values clamp (x→0..100, scale→0.2..3); non-numbers are ignored', () => {
    const html = '<section id="1" data-lattice-slide="1"></section>';
    const out = plugins.applyDeckLogoToHtml(html, '---\nlogo: ./acme.svg\nlogo-x: 999\nlogo-y: -20\nlogo-scale: 99\n---\n');
    assert.match(out, /--logo-x:100%/);
    assert.match(out, /--logo-y:0%/);
    assert.match(out, /--logo-scale:3/);
    // A non-numeric value can't inject anything into the style.
    const out2 = plugins.applyDeckLogoToHtml(html, '---\nlogo: ./acme.svg\nlogo-scale: "}; evil"\n---\n');
    assert.doesNotMatch(out2, /--logo-scale/);
    assert.doesNotMatch(out2, /evil/);
  });

  // ── verdictGridBadges ──────────────────────────────────────────────────

  test('verdictGridBadges: [x] / [-] / [ ] / [/] markers become badge spans with shape classes', () => {
    const m = makeMarp(plugins.verdictGridBadges);
    const md = [
      '<!-- _class: verdict-grid -->',
      '## Title',
      '',
      '- Card',
      '  - [x] Pass item',
      '  - [-] Warn item',
      '  - [ ] Fail item',
      '  - [/] Skip item',
      '  - body line passes through untouched',
    ].join('\n');
    const { html } = m.render(md);
    assert.match(html, /<span class="badge pass state-full">Pass item<\/span>/);
    assert.match(html, /<span class="badge warn state-half">Warn item<\/span>/);
    assert.match(html, /<span class="badge fail state-empty">Fail item<\/span>/);
    assert.match(html, /<span class="badge skip state-slashed">Skip item<\/span>/);
    // The body line (no marker) should NOT be wrapped in a badge.
    assert.match(html, /body line passes through untouched/);
    assert.doesNotMatch(html, /<span class="badge[^"]*">body line/);
  });

  test('verdictGridBadges: does NOT fire on slides without the verdict-grid class', () => {
    const m = makeMarp(plugins.verdictGridBadges);
    const md = '## Title\n\n- Card\n  - [x] would-be-pass';
    const { html } = m.render(md);
    assert.doesNotMatch(html, /badge pass/);
    // The literal `[x]` text is preserved when the plugin does not fire.
    assert.match(html, /\[x\]/);
  });

  test('verdictGridBadges: top-level body items (depth 1) are not transformed', () => {
    // The plugin only fires at listDepth >= 2 (nested badge items).
    const m = makeMarp(plugins.verdictGridBadges);
    const md = [
      '<!-- _class: verdict-grid -->',
      '- [x] this is a depth-1 item — should NOT be a badge',
    ].join('\n');
    const { html } = m.render(md);
    assert.doesNotMatch(html, /badge pass/);
  });

  // ── obligationMatrixBadges ─────────────────────────────────────────────

  test('obligationMatrixBadges: [x] / [-] / [ ] / [/] markers in <td> become state spans with shape classes', () => {
    const m = makeMarp(plugins.obligationMatrixBadges);
    const md = [
      '<!-- _class: obligation-matrix -->',
      '## Title',
      '',
      '| Reg | A | B | C | D |',
      '| --- | :-: | :-: | :-: | :-: |',
      '| X   | [x] | [-] | [ ] | [/] |',
    ].join('\n');
    const { html } = m.render(md);
    assert.match(html, /<span class="state pass state-full">/);
    assert.match(html, /<span class="state warn state-half">/);
    // obligation-matrix [ ] = exempt → neutral todo/ring (not "not met")
    assert.match(html, /<span class="state todo state-todo">/);
    assert.match(html, /<span class="state skip state-slashed">/);
  });

  // ── checklistItemStates ──────────────────────────────────────────────

  test('checklistItemStates: top-level [x]/[-]/[ ]/[/] items get state + shape classes on <li>', () => {
    const m = makeMarp(plugins.checklistItemStates);
    const md = [
      '<!-- _class: checklist -->',
      '- [x] Done',
      '- [-] Partial',
      '- [ ] Todo',
      '- [/] Skipped',
    ].join('\n');
    const { html } = m.render(md);
    assert.match(html, /<li class="state pass state-full">\s*Done/);
    assert.match(html, /<li class="state warn state-half">\s*Partial/);
    // checklist [ ] = todo → neutral todo/ring (not a red "not done")
    assert.match(html, /<li class="state todo state-todo">\s*Todo/);
    assert.match(html, /<li class="state skip state-slashed">\s*Skipped/);
    // The marker (`[x]` etc.) is stripped from the rendered text.
    assert.doesNotMatch(html, /\[x\]/);
    assert.doesNotMatch(html, /\[ \]/);
    assert.doesNotMatch(html, /\[\/\]/);
  });

  test('checklistItemStates: items without a marker pass through unchanged', () => {
    const m = makeMarp(plugins.checklistItemStates);
    const md = [
      '<!-- _class: checklist -->',
      '- [x] Marked',
      '- Unmarked item should not get a class',
    ].join('\n');
    const { html } = m.render(md);
    assert.match(html, /<li class="state pass state-full">/);
    // The unmarked item should NOT carry a state class.
    assert.match(html, /<li>Unmarked item should not get a class<\/li>/);
  });

  test('checklistItemStates: does NOT fire outside the checklist class', () => {
    const m = makeMarp(plugins.checklistItemStates);
    const md = '- [x] would-be-state\n';
    const { html } = m.render(md);
    assert.doesNotMatch(html, /state pass/);
    assert.match(html, /\[x\]/, 'literal marker preserved when plugin does not fire');
  });

  // ── slotLabelLift ───────────────────────────────────────────────────

  test('slotLabelLift: wraps lead inline content in <strong> on decision slides', () => {
    const m = makeMarp(plugins.slotLabelLift);
    const md = [
      '<!-- _class: decision -->',
      '- Build',
      '  - body about building',
      '- Why not buy',
      '  - body about not buying',
    ].join('\n');
    const { html } = m.render(md);
    assert.match(html, /<li><strong>Build<\/strong>/);
    assert.match(html, /<li><strong>Why not buy<\/strong>/);
  });

  test('slotLabelLift: idempotent — pre-bolded `**Label**` is left alone', () => {
    const m = makeMarp(plugins.slotLabelLift);
    const md = [
      '<!-- _class: compare-prose transition -->',
      '- **Before**',
      '  - body',
    ].join('\n');
    const { html } = m.render(md);
    // Should have exactly ONE pair of <strong> tags around "Before",
    // not nested doubles like <strong><strong>Before</strong></strong>.
    const matches = html.match(/<strong>Before<\/strong>/g) || [];
    assert.equal(matches.length, 1, `expected single <strong> wrap, got: ${html}`);
    assert.doesNotMatch(html, /<strong><strong>/);
  });

  test('slotLabelLift: fires on compare-prose, compare-prose transition, and decision', () => {
    for (const cls of ['compare-prose', 'compare-prose transition', 'decision']) {
      const m = makeMarp(plugins.slotLabelLift);
      const md = `<!-- _class: ${cls} -->\n- Lead\n  - body`;
      const { html } = m.render(md);
      assert.match(html, /<strong>Lead<\/strong>/, `expected lift on ${cls} but got: ${html}`);
    }
  });

  test('slotLabelLift: does NOT fire on unrelated layouts', () => {
    for (const cls of ['cards-grid', 'list', 'content', 'closing']) {
      const m = makeMarp(plugins.slotLabelLift);
      const md = `<!-- _class: ${cls} -->\n- Lead\n  - body`;
      const { html } = m.render(md);
      assert.doesNotMatch(html, /<strong>Lead<\/strong>/, `should not lift on ${cls}`);
    }
  });

  test('slotLabelLift: fires on timeline, list-criteria, and actors', () => {
    for (const cls of ['timeline', 'list-criteria', 'actors']) {
      const m = makeMarp(plugins.slotLabelLift);
      const md = `<!-- _class: ${cls} -->\n- Lead\n  - body`;
      const { html } = m.render(md);
      assert.match(html, /<strong>Lead<\/strong>/, `expected lift on ${cls} but got: ${html}`);
    }
  });

  test('slotLabelLift: fires on the list-steps staged-flow variants (chevron, converge, ghost)', () => {
    // These variants style `li > strong` as the stage label, so the lift is
    // load-bearing — nested `- Problem` MUST become <strong>Problem</strong>.
    for (const cls of ['chevron', 'converge', 'ghost']) {
      const m = makeMarp(plugins.slotLabelLift);
      const md = `<!-- _class: list-steps ${cls} -->\n- Lead\n  - body`;
      const { html } = m.render(md);
      assert.match(html, /<strong>Lead<\/strong>/, `expected lift on list-steps ${cls} but got: ${html}`);
    }
  });

  test('slotLabelLift: staged-flow variants are scoped to a list-steps host (generic words do NOT lift alone)', () => {
    // chevron/converge/ghost are generic English words, so they only trigger the
    // lift ON a list-steps section — a bare `.ghost` section (some future
    // unrelated component) must NOT have its lead silently wrapped.
    for (const cls of ['chevron', 'converge', 'ghost']) {
      const m = makeMarp(plugins.slotLabelLift);
      const md = `<!-- _class: ${cls} -->\n- Lead\n  - body`;
      const { html } = m.render(md);
      assert.doesNotMatch(html, /<strong>Lead<\/strong>/, `should not lift on bare .${cls}`);
    }
  });

  test('slotLabelLift: fires on q-and-a (wraps the question so flex can size it)', () => {
    for (const cls of ['q-and-a', 'q-and-a rail', 'q-and-a grid']) {
      const m = makeMarp(plugins.slotLabelLift);
      const md = `<!-- _class: ${cls} -->\n- Why not delay?\n  - Because the window closes.`;
      const { html } = m.render(md);
      assert.match(html, /<li><strong>Why not delay\?<\/strong>/, `expected lift on ${cls} but got: ${html}`);
    }
  });

  test('slotLabelLift: `timeline` does NOT match the `timeline-list` chart class', () => {
    // `timeline-list` is a chart-family layout whose <li> leads carry a date
    // chip + title that the chart transform owns — the lift must not touch
    // it. A plain \b boundary would mis-fire (hyphen is a word boundary).
    const m = makeMarp(plugins.slotLabelLift);
    const md = '<!-- _class: timeline-list -->\n1. `2024 Q3` Lead\n   - body';
    const { html } = m.render(md);
    assert.doesNotMatch(html, /<strong>/, `timeline-list must not be lifted, got: ${html}`);
  });

  test('slotLabelLift: actors keeps the trailing `code` actor-name pill outside <strong>', () => {
    const m = makeMarp(plugins.slotLabelLift);
    const md = '<!-- _class: actors -->\n- Owns the model `Head of Product`\n  - body';
    const { html } = m.render(md);
    // Label lifted; the code chip stays a sibling, not a child of <strong>.
    assert.match(html, /<strong>Owns the model\s*<\/strong>\s*<code>Head of Product<\/code>/);
  });

  test('slotLabelLift: only the top-level li lead is lifted, not nested li leads', () => {
    const m = makeMarp(plugins.slotLabelLift);
    const md = [
      '<!-- _class: decision -->',
      '- Build',
      '  - nested lead text',
    ].join('\n');
    const { html } = m.render(md);
    assert.match(html, /<strong>Build<\/strong>/);
    // The nested li's lead text should NOT be wrapped in <strong>.
    assert.doesNotMatch(html, /<strong>nested lead text<\/strong>/);
  });

  // ── stripHeadingPeriods ─────────────────────────────────────────────

  test('stripHeadingPeriods: removes trailing period from headings on no-period slides', () => {
    const m = makeMarp(plugins.stripHeadingPeriods);
    const { html } = m.render('<!-- _class: no-period -->\n## Signal to noise.');
    assert.match(html, /<h2[^>]*>Signal to noise<\/h2>/);
  });

  test('stripHeadingPeriods: strips trailing period from h1, h2, h3', () => {
    const m = makeMarp(plugins.stripHeadingPeriods);
    const { html } = m.render([
      '---', 'split: rule', '---', // keep all headings on one slide (engine default is headings-split)
      '<!-- _class: no-period -->',
      '# Title.',
      '## Section.',
      '### Sub.',
    ].join('\n'));
    assert.match(html, /<h1[^>]*>Title<\/h1>/);
    assert.match(html, /<h2[^>]*>Section<\/h2>/);
    assert.match(html, /<h3[^>]*>Sub<\/h3>/);
  });

  test('stripHeadingPeriods: leaves headings without a trailing period unchanged', () => {
    const m = makeMarp(plugins.stripHeadingPeriods);
    const { html } = m.render('<!-- _class: no-period -->\n## No period here');
    assert.match(html, /<h2[^>]*>No period here<\/h2>/);
  });

  test('stripHeadingPeriods: does NOT fire on slides without the no-period class', () => {
    const m = makeMarp(plugins.stripHeadingPeriods);
    const { html } = m.render('## Has a period.');
    assert.match(html, /<h2[^>]*>Has a period\.<\/h2>/);
  });

  // ── addHeadingPeriods ───────────────────────────────────────────────

  test('addHeadingPeriods: appends a period to headings that lack one on with-period slides', () => {
    const m = makeMarp(plugins.addHeadingPeriods);
    const { html } = m.render('<!-- _class: with-period -->\n## Signal to noise');
    assert.match(html, /<h2[^>]*>Signal to noise\.<\/h2>/);
  });

  test('addHeadingPeriods: appends period to h1, h2, h3', () => {
    const m = makeMarp(plugins.addHeadingPeriods);
    const { html } = m.render([
      '---', 'split: rule', '---', // keep all headings on one slide (engine default is headings-split)
      '<!-- _class: with-period -->',
      '# Title',
      '## Section',
      '### Sub',
    ].join('\n'));
    assert.match(html, /<h1[^>]*>Title\.<\/h1>/);
    assert.match(html, /<h2[^>]*>Section\.<\/h2>/);
    assert.match(html, /<h3[^>]*>Sub\.<\/h3>/);
  });

  test('addHeadingPeriods: does not double-append when heading already ends with a period', () => {
    const m = makeMarp(plugins.addHeadingPeriods);
    const { html } = m.render('<!-- _class: with-period -->\n## Already done.');
    assert.match(html, /<h2[^>]*>Already done\.<\/h2>/);
    assert.doesNotMatch(html, /<h2[^>]*>Already done\.\.<\/h2>/);
  });

  test('addHeadingPeriods: does not append when heading ends with !, ?, :, or …', () => {
    const m = makeMarp(plugins.addHeadingPeriods);
    for (const [src, pattern] of [
      ['## Urgent!',    /<h2[^>]*>Urgent!<\/h2>/],
      ['## Question?',  /<h2[^>]*>Question\?<\/h2>/],
      ['## Note:',      /<h2[^>]*>Note:<\/h2>/],
      ['## Continued…', /<h2[^>]*>Continued…<\/h2>/],
    ]) {
      const { html } = m.render(`<!-- _class: with-period -->\n${src}`);
      assert.match(html, pattern);
    }
  });

  test('addHeadingPeriods: does NOT fire on slides without the with-period class', () => {
    const m = makeMarp(plugins.addHeadingPeriods);
    const { html } = m.render('## No period added');
    assert.match(html, /<h2[^>]*>No period added<\/h2>/);
  });

  // ── functionPlotFences ─────────────────────────────────────────────────

  test('functionPlotFences: ```functionplot becomes a div.functionplot with base64-encoded config', () => {
    const m = makeMarp(plugins.functionPlotFences);
    const cfg = '{ "data": [{ "fn": "sin(x)" }] }';
    const md = '```functionplot\n' + cfg + '\n```';
    const { html } = m.render(md);
    assert.match(html, /<div class="functionplot" data-fp-config="[A-Za-z0-9+/=]+"><\/div>/,
      'should emit placeholder div with base64 config');
    // Round-trip: the base64 in the div decodes to the original config (plus \n)
    const m2 = html.match(/data-fp-config="([^"]+)"/);
    assert.ok(m2, 'config attribute should be present');
    const decoded = Buffer.from(m2[1], 'base64').toString('utf8');
    assert.equal(decoded.trim(), cfg.trim());
  });

  test('functionPlotFences: the deprecated ```latticeplot alias still emits a div.functionplot', () => {
    const m = makeMarp(plugins.functionPlotFences);
    const cfg = '{ "data": [{ "fn": "cos(x)" }] }';
    const { html } = m.render('```latticeplot\n' + cfg + '\n```');
    assert.match(html, /<div class="functionplot" data-fp-config="[A-Za-z0-9+/=]+"><\/div>/,
      'the legacy latticeplot fence renders identically to functionplot');
  });

  test('functionPlotFences: other fenced languages are left to the default renderer', () => {
    const m = makeMarp(plugins.functionPlotFences);
    const { html } = m.render('```js\nconst x = 1;\n```');
    // marp-core wraps fences as <pre is="marp-pre" …><code class="language-js">…</code></pre>
    // and runs the contents through highlight.js (so `const` becomes a span).
    assert.match(html, /<code[^>]*language-js[^>]*>[\s\S]*const[\s\S]*x = /);
    assert.doesNotMatch(html, /class="functionplot"/);
  });

  test('functionPlotFences: a fence with no language is also left alone', () => {
    const m = makeMarp(plugins.functionPlotFences);
    const { html } = m.render('```\nplain text\n```');
    assert.match(html, /<code[^>]*>plain text/);
    assert.doesNotMatch(html, /class="functionplot"/);
  });
});
