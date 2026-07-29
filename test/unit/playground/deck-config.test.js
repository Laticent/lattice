/**
 * Unit: the universal deck-setup module's pure front-matter helpers.
 *
 * The drawer DOM (createConfigPanel) is verified headless. Here we prove the
 * pure, fs-free parse/serialize pair the controls read + write through:
 * readFrontMatter (pre-fill the form) and writeFrontMatter (rewrite the deck
 * source for one field). No DOM, no storage — the module loads in Node.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const MOD = '../../../docs/src/playground/deck-config.js';

// A deck with no front matter — the Drawing Board's normal "clean" state.
const CLEAN = '<!-- _class: title silent -->\n\n# A new deck\n\nStart sketching.\n';

describe('readFrontMatter', () => {
  test('a deck with no block → all defaults, not configured', async () => {
    const { readFrontMatter } = await import(MOD);
    const fm = readFrontMatter(CLEAN);
    assert.equal(fm.size, 'hd');
    assert.equal(fm.paginate, false);
    assert.equal(fm.header, '');
    assert.equal(fm.footer, '');
    assert.equal(fm.class, '');
    assert.equal(fm.math, '');
    assert.equal(fm.lang, '');
    assert.equal(fm.split, 'headings');
    assert.equal(fm.configured, false);
  });

  test('parses a real block, quoted values, and booleans', async () => {
    const { readFrontMatter } = await import(MOD);
    const src = '---\nmarp: true\nsize: 4K\npaginate: true\nheader: "Lattice · Board"\n---\n\n# Deck\n';
    const fm = readFrontMatter(src);
    assert.equal(fm.size, '4K');
    assert.equal(fm.paginate, true);
    assert.equal(fm.header, 'Lattice · Board');
    assert.equal(fm.configured, true);
  });

  test('a block with only marp: true is not "configured"', async () => {
    const { readFrontMatter } = await import(MOD);
    const fm = readFrontMatter('---\nmarp: true\n---\n\n# Deck\n');
    assert.equal(fm.configured, false);
  });

  test('parses theme, and theme alone does not count as "configured"', async () => {
    const { readFrontMatter } = await import(MOD);
    const fm = readFrontMatter('---\nmarp: true\ntheme: cuoio\n---\n\n# Deck\n');
    assert.equal(fm.theme, 'cuoio');
    assert.equal(fm.configured, false, 'theme is ubiquitous under full sync — not a bespoke-setup signal');
  });

  test('form toggle: canonicalises standard/on/off; retired minimal → standard; absent = default, not configured', async () => {
    const { readFrontMatter } = await import(MOD);
    assert.equal(readFrontMatter('---\nmarp: true\nform: standard\n---\n').form, 'standard');
    assert.equal(readFrontMatter('---\nmarp: true\nform: on\n---\n').form, 'standard');
    assert.equal(readFrontMatter('---\nmarp: true\nform: true\n---\n').form, 'standard');
    // `form: minimal` retired (2026-07-03) → resolves to standard (the default).
    assert.equal(readFrontMatter('---\nmarp: true\nform: minimal\n---\n').form, 'standard');
    assert.equal(readFrontMatter('---\nmarp: true\nform: off\n---\n').form, 'off');
    // Form is ON by default — an absent key reads as standard and is NOT bespoke config.
    assert.equal(readFrontMatter(CLEAN).form, 'standard');
    assert.equal(readFrontMatter(CLEAN).configured, false);
    // Only the explicit opt-out (off) is bespoke config; retired minimal reads as the default.
    assert.equal(readFrontMatter('---\nmarp: true\nform: off\n---\n').configured, true);
    assert.equal(readFrontMatter('---\nmarp: true\nform: minimal\n---\n').configured, false);
  });


  test('glossary toggle (#920): auto → true (boolean); off/absent → false; auto counts as configured', async () => {
    const { readFrontMatter } = await import(MOD);
    assert.equal(readFrontMatter('---\nmarp: true\nglossary: auto\n---\n').glossary, true);
    assert.equal(readFrontMatter('---\nmarp: true\nglossary: AUTO\n---\n').glossary, true); // case-insensitive
    assert.equal(readFrontMatter('---\nmarp: true\nglossary: off\n---\n').glossary, false);
    assert.equal(readFrontMatter(CLEAN).glossary, false);
    assert.equal(readFrontMatter('---\nmarp: true\nglossary: auto\n---\n').configured, true);
  });

  test('lift toggle: on/true/yes → true (boolean); off/absent → false; on counts as configured', async () => {
    const { readFrontMatter } = await import(MOD);
    assert.equal(readFrontMatter('---\nmarp: true\nlift: on\n---\n').lift, true);
    assert.equal(readFrontMatter('---\nmarp: true\nlift: true\n---\n').lift, true);
    assert.equal(readFrontMatter('---\nmarp: true\nlift: ON\n---\n').lift, true); // case-insensitive
    assert.equal(readFrontMatter('---\nmarp: true\nlift: off\n---\n').lift, false);
    assert.equal(readFrontMatter(CLEAN).lift, false);
    assert.equal(readFrontMatter('---\nmarp: true\nlift: on\n---\n').configured, true);
  });

  test('validate: default ON; off/false/no → false and counts as configured', async () => {
    const { readFrontMatter } = await import(MOD);
    assert.equal(readFrontMatter(CLEAN).validate, true); // absent → on (the default)
    assert.equal(readFrontMatter('---\nmarp: true\nvalidate: on\n---\n').validate, true);
    assert.equal(readFrontMatter('---\nmarp: true\nvalidate: off\n---\n').validate, false);
    assert.equal(readFrontMatter('---\nmarp: true\nvalidate: false\n---\n').validate, false);
    assert.equal(readFrontMatter('---\nmarp: true\nvalidate: no\n---\n').validate, false);
    // On (the default) isn't bespoke setup; only an explicit opt-out is "configured".
    assert.equal(readFrontMatter('---\nmarp: true\nvalidate: on\n---\n').configured, false);
    assert.equal(readFrontMatter('---\nmarp: true\nvalidate: off\n---\n').configured, true);
  });
});

describe('writeFrontMatter', () => {
  test('adds a managed block to a clean deck, body preserved', async () => {
    const { writeFrontMatter } = await import(MOD);
    const out = writeFrontMatter(CLEAN, 'paginate', true);
    assert.equal(out, '---\nmarp: true\npaginate: true\n---\n\n' + CLEAN);
    assert.ok(out.startsWith('---\nmarp: true\npaginate: true\n---\n'));
    assert.ok(out.includes('<!-- _class: title silent -->'));
  });

  test('always leads the block with marp: true so an exported .md renders', async () => {
    const { writeFrontMatter } = await import(MOD);
    const out = writeFrontMatter(CLEAN, 'size', '4K');
    assert.ok(/^---\nmarp: true\nsize: 4K\n---\n/.test(out));
  });

  test('emits in canonical order regardless of write order', async () => {
    const { writeFrontMatter } = await import(MOD);
    let src = writeFrontMatter(CLEAN, 'footer', 'Confidential');
    src = writeFrontMatter(src, 'paginate', true);
    src = writeFrontMatter(src, 'size', '4K');
    const block = src.slice(0, src.indexOf('\n---\n'));
    assert.equal(block, '---\nmarp: true\nsize: 4K\npaginate: true\nfooter: Confidential');
  });

  test('form: writes off in canonical slot; standard (default) + retired minimal omit it', async () => {
    const { writeFrontMatter } = await import(MOD);
    const off = writeFrontMatter(CLEAN, 'form', 'off');
    assert.ok(/^---\nmarp: true\nform: off\n---\n/.test(off));
    // Retired `minimal` canonicalises to standard (the default) → the key is omitted.
    const min = writeFrontMatter(CLEAN, 'form', 'minimal');
    assert.ok(!min.includes('form:'));
    // `class` precedes `form` in the canonical order
    let src = writeFrontMatter(CLEAN, 'form', 'off');
    src = writeFrontMatter(src, 'class', 'dark');
    const block = src.slice(0, src.indexOf('\n---\n'));
    assert.equal(block, '---\nmarp: true\nclass: dark\nform: off');
    // standard (the default) clears it back out
    assert.ok(!writeFrontMatter(off, 'form', 'standard').includes('form:'));
  });


  test('glossary (#920): writes the canonical auto; a falsy value omits it; sits after split', async () => {
    const { writeFrontMatter, readFrontMatter } = await import(MOD);
    // Boolean true (the switch) canonicalises to `auto`.
    assert.ok(writeFrontMatter(CLEAN, 'glossary', true).includes('glossary: auto\n'));
    // off / false is the default → no key.
    assert.equal(writeFrontMatter(CLEAN, 'glossary', false), CLEAN);
    // canonical slot: split, then glossary, then size.
    let src = writeFrontMatter(CLEAN, 'size', 'portrait');
    src = writeFrontMatter(src, 'glossary', true);
    const block = src.slice(0, src.indexOf('\n---\n'));
    assert.equal(block, '---\nmarp: true\nglossary: auto\nsize: portrait');
    // round-trips, and switching it off over an existing on clears it.
    assert.equal(readFrontMatter(writeFrontMatter(CLEAN, 'glossary', true)).glossary, true);
    assert.ok(!writeFrontMatter(writeFrontMatter(CLEAN, 'glossary', true), 'glossary', false).includes('glossary'));
  });

  test('lift: writes the canonical on; a falsy value omits it; sits after glossary, before size', async () => {
    const { writeFrontMatter, readFrontMatter } = await import(MOD);
    // Boolean true (the switch) canonicalises to `on`.
    assert.ok(writeFrontMatter(CLEAN, 'lift', true).includes('lift: on\n'));
    assert.ok(writeFrontMatter(CLEAN, 'lift', 'yes').includes('lift: on\n'));
    // off / false is the default → no key.
    assert.equal(writeFrontMatter(CLEAN, 'lift', false), CLEAN);
    assert.equal(writeFrontMatter(CLEAN, 'lift', 'off'), CLEAN);
    // canonical slot: glossary, then lift, then size.
    let src = writeFrontMatter(CLEAN, 'size', 'portrait');
    src = writeFrontMatter(src, 'glossary', true);
    src = writeFrontMatter(src, 'lift', true);
    const block = src.slice(0, src.indexOf('\n---\n'));
    assert.equal(block, '---\nmarp: true\nglossary: auto\nlift: on\nsize: portrait');
    // round-trips, and switching it off over an existing on clears it.
    assert.equal(readFrontMatter(writeFrontMatter(CLEAN, 'lift', true)).lift, true);
    assert.ok(!writeFrontMatter(writeFrontMatter(CLEAN, 'lift', true), 'lift', false).includes('lift'));
  });

  test('validate: default ON is omitted; only an opt-out writes the canonical off', async () => {
    const { writeFrontMatter, readFrontMatter } = await import(MOD);
    // On (the default) — boolean true (the switch) or a truthy string — omits the key.
    assert.equal(writeFrontMatter(CLEAN, 'validate', true), CLEAN);
    assert.equal(writeFrontMatter(CLEAN, 'validate', 'on'), CLEAN);
    // Opt out — boolean false or a falsey string — writes `validate: off`.
    assert.ok(writeFrontMatter(CLEAN, 'validate', false).includes('validate: off\n'));
    assert.ok(writeFrontMatter(CLEAN, 'validate', 'off').includes('validate: off\n'));
    // canonical slot: after form, before math.
    let src = writeFrontMatter(CLEAN, 'math', 'mathjax');
    src = writeFrontMatter(src, 'form', 'off');
    src = writeFrontMatter(src, 'validate', false);
    const block = src.slice(0, src.indexOf('\n---\n'));
    assert.equal(block, '---\nmarp: true\nform: off\nvalidate: off\nmath: mathjax');
    // round-trips, and switching it back on clears the key.
    assert.equal(readFrontMatter(writeFrontMatter(CLEAN, 'validate', false)).validate, false);
    assert.ok(!writeFrontMatter(writeFrontMatter(CLEAN, 'validate', false), 'validate', true).includes('validate'));
  });

  test('quotes a value containing a colon (would break a flat YAML read)', async () => {
    const { writeFrontMatter } = await import(MOD);
    const out = writeFrontMatter(CLEAN, 'header', 'Q3: Board Review');
    assert.ok(out.includes('header: "Q3: Board Review"'));
  });

  test('leaves a plain header bare (no needless quotes)', async () => {
    const { writeFrontMatter } = await import(MOD);
    const out = writeFrontMatter(CLEAN, 'header', 'Lattice · Board Review');
    assert.ok(out.includes('header: Lattice · Board Review\n'));
  });

  test('setting a field back to its default removes just that key', async () => {
    const { writeFrontMatter } = await import(MOD);
    let src = writeFrontMatter(CLEAN, 'size', '4K');
    src = writeFrontMatter(src, 'paginate', true);
    src = writeFrontMatter(src, 'size', 'hd'); // back to default
    assert.ok(!src.includes('size:'));
    assert.ok(src.includes('paginate: true'));
  });

  test('clearing the last managed field drops the block entirely (back to clean)', async () => {
    const { writeFrontMatter } = await import(MOD);
    const withBlock = writeFrontMatter(CLEAN, 'paginate', true);
    const cleared = writeFrontMatter(withBlock, 'paginate', false);
    assert.equal(cleared, CLEAN);
  });

  test('math: only mathjax is written; katex/empty is the default and omitted', async () => {
    const { writeFrontMatter } = await import(MOD);
    assert.ok(writeFrontMatter(CLEAN, 'math', 'mathjax').includes('math: mathjax'));
    assert.equal(writeFrontMatter(CLEAN, 'math', 'katex'), CLEAN);
    assert.equal(writeFrontMatter(CLEAN, 'math', ''), CLEAN);
  });

  test('finish (backdrop): atrium is written; none + empty are the baseline and omitted', async () => {
    const { writeFrontMatter, readFrontMatter } = await import(MOD);
    assert.ok(writeFrontMatter(CLEAN, 'finish', 'atrium').includes('finish: atrium'));
    assert.ok(writeFrontMatter(CLEAN, 'finish', 'gallery').includes('finish: gallery'));
    assert.equal(writeFrontMatter(CLEAN, 'finish', 'none'), CLEAN, 'none is the baseline → no key');
    assert.equal(writeFrontMatter(CLEAN, 'finish', ''), CLEAN);
    // round-trips, and selecting none over an existing backdrop clears it.
    const atrium = writeFrontMatter(CLEAN, 'finish', 'atrium');
    assert.equal(readFrontMatter(atrium).finish, 'atrium');
    assert.equal(writeFrontMatter(atrium, 'finish', 'none'), CLEAN);
  });

  test('mode (rendering hand): sketch / sketch-clean are written; boardroom + empty omitted', async () => {
    const { writeFrontMatter, readFrontMatter } = await import(MOD);
    assert.ok(writeFrontMatter(CLEAN, 'mode', 'sketch').includes('mode: sketch'));
    assert.ok(writeFrontMatter(CLEAN, 'mode', 'sketch-clean').includes('mode: sketch-clean'));
    assert.equal(writeFrontMatter(CLEAN, 'mode', 'boardroom'), CLEAN, 'boardroom is the baseline → no key');
    assert.equal(writeFrontMatter(CLEAN, 'mode', ''), CLEAN);
    const sketched = writeFrontMatter(CLEAN, 'mode', 'sketch');
    assert.equal(readFrontMatter(sketched).mode, 'sketch');
    assert.equal(writeFrontMatter(sketched, 'mode', 'boardroom'), CLEAN);
  });

  test('color-mode: light/dark/system/inherited are written; theme-default (empty) omitted', async () => {
    const { writeFrontMatter, readFrontMatter } = await import(MOD);
    for (const v of ['light', 'dark', 'system', 'inherited']) {
      assert.ok(writeFrontMatter(CLEAN, 'color-mode', v).includes(`color-mode: ${v}`), `color-mode: ${v} should be written`);
    }
    assert.equal(writeFrontMatter(CLEAN, 'color-mode', ''), CLEAN, 'theme default → no key');
    const sys = writeFrontMatter(CLEAN, 'color-mode', 'system');
    assert.equal(readFrontMatter(sys)['color-mode'], 'system');
    assert.equal(writeFrontMatter(sys, 'color-mode', ''), CLEAN, 'clearing to default drops the key');
    assert.equal(readFrontMatter(sys).configured, true, 'a color-mode: value marks the deck configured');
  });

  test('split: rule is written; headings (the default) is omitted/cleared', async () => {
    const { writeFrontMatter, readFrontMatter } = await import(MOD);
    const r = writeFrontMatter(CLEAN, 'split', 'rule');
    assert.ok(r.includes('split: rule'));
    assert.equal(readFrontMatter(r).split, 'rule');
    assert.equal(readFrontMatter(r).configured, true);
    // headings is the default → no key (same render as omitting split).
    assert.equal(writeFrontMatter(CLEAN, 'split', 'headings'), CLEAN);
    assert.equal(writeFrontMatter(CLEAN, 'split', ''), CLEAN);
    // selecting headings over an existing rule clears it back to clean.
    assert.equal(writeFrontMatter(r, 'split', 'headings'), CLEAN);
  });

  test('finish is emitted right after theme, before size', async () => {
    const { writeFrontMatter } = await import(MOD);
    let src = writeFrontMatter(CLEAN, 'size', '4K');
    src = writeFrontMatter(src, 'finish', 'atrium');
    const block = src.slice(0, src.indexOf('\n---', 4));
    assert.ok(block.indexOf('finish: atrium') < block.indexOf('size: 4K'), block);
  });

  test('a nested block (finish-override:) round-trips VERBATIM through an unrelated flat write', async () => {
    const { writeFrontMatter } = await import(MOD);
    // backdrop is a baked finish layer now; the deck author tunes it (and any layer) under
    // `finish-override:`. Deck-setup never manages that block — but a flat edit here must
    // PRESERVE it verbatim, never flatten its two-level nesting into stray scalars.
    const src = '---\nmarp: true\nfinish: finish-recede\nfinish-override:\n  backdrop:\n    strength: 0.4\n    clearance: off\n---\n\n# D\n';
    const out = writeFrontMatter(src, 'paginate', true);
    assert.match(out, /\nfinish-override:\n {2}backdrop:\n {4}strength: 0\.4\n {4}clearance: off\n/);
    assert.match(out, /\npaginate: true\n/);
    // no stray flattened scalars leaked out of the block
    assert.doesNotMatch(out, /^strength:/m);
    assert.doesNotMatch(out, /^backdrop:/m);
  });

  test('a finish-override: block with a BLANK line between layers is not shredded on write', async () => {
    const { writeFrontMatter } = await import(MOD);
    // An author may space layers apart for readability; the scanner must not stop at the
    // blank and tear the later layer out to a top-level scalar (matches front-matter.ts).
    const src = '---\nmarp: true\nfinish: finish-recede\nfinish-override:\n  backdrop:\n    strength: 0.4\n\n  texture:\n    intensity: 4\n---\n\n# D\n';
    const out = writeFrontMatter(src, 'paginate', true);
    assert.match(out, /\n {2}backdrop:\n {4}strength: 0\.4\n/);
    assert.match(out, /\n {2}texture:\n {4}intensity: 4\n/); // the later layer survives
    assert.doesNotMatch(out, /^texture:/m); // NOT torn out to top level
    assert.doesNotMatch(out, /^intensity:/m);
  });

  test('a bespoke finish/mode counts as "configured"; the baselines do not', async () => {
    const { readFrontMatter } = await import(MOD);
    assert.equal(readFrontMatter('---\nmarp: true\nfinish: atrium\n---\n\n# Deck\n').configured, true);
    assert.equal(readFrontMatter('---\nmarp: true\nmode: sketch\n---\n\n# Deck\n').configured, true);
    assert.equal(readFrontMatter('---\nmarp: true\nfinish: none\n---\n\n# Deck\n').configured, false,
      'none is the finish baseline — not a bespoke-setup signal');
    assert.equal(readFrontMatter('---\nmarp: true\nmode: boardroom\n---\n\n# Deck\n').configured, false,
      'boardroom is the mode baseline — not a bespoke-setup signal');
  });

  test('preserves unmanaged keys (style, backgroundColor) on write-back', async () => {
    const { writeFrontMatter } = await import(MOD);
    const src = '---\nmarp: true\nbackgroundColor: "#000"\nstyle: section{}\n---\n\n# Deck\n';
    const out = writeFrontMatter(src, 'paginate', true);
    assert.ok(out.includes('backgroundColor: "#000"'));
    assert.ok(out.includes('style: section{}'));
    assert.ok(out.includes('paginate: true'));
  });

  test('round-trips: write then read returns the same field value', async () => {
    const { writeFrontMatter, readFrontMatter } = await import(MOD);
    const out = writeFrontMatter(CLEAN, 'footer', 'Q3: notes');
    assert.equal(readFrontMatter(out).footer, 'Q3: notes');
  });

  test('updates an existing key in place rather than duplicating it', async () => {
    const { writeFrontMatter } = await import(MOD);
    let src = writeFrontMatter(CLEAN, 'header', 'First');
    src = writeFrontMatter(src, 'header', 'Second');
    assert.equal((src.match(/header:/g) || []).length, 1);
    assert.ok(src.includes('header: Second'));
  });

  test('theme writes right after marp, and updates in place (no duplicate)', async () => {
    const { writeFrontMatter } = await import(MOD);
    let src = writeFrontMatter(CLEAN, 'theme', 'indaco');
    assert.ok(/^---\nmarp: true\ntheme: indaco\n---\n/.test(src), 'theme leads the block after marp');
    src = writeFrontMatter(src, 'paginate', true);
    src = writeFrontMatter(src, 'theme', 'cuoio'); // switch palette
    assert.equal((src.match(/theme:/g) || []).length, 1, 'no duplicate theme key');
    assert.ok(src.includes('theme: cuoio'));
    assert.ok(src.includes('paginate: true'));
  });

  test('clearing theme ("") drops just the theme key', async () => {
    const { writeFrontMatter } = await import(MOD);
    let src = writeFrontMatter(CLEAN, 'theme', 'indaco');
    src = writeFrontMatter(src, 'paginate', true);
    src = writeFrontMatter(src, 'theme', '');
    assert.ok(!src.includes('theme:'));
    assert.ok(src.includes('paginate: true'));
  });

  test('writeFrontMatter never scrubs an unknown theme from the author source', async () => {
    // Validity is enforced at PROPAGATION (the controller), not here — a typo
    // stays in the deck so the author can fix it; it just isn't applied live.
    const { writeFrontMatter } = await import(MOD);
    const src = writeFrontMatter(CLEAN, 'theme', 'totally-made-up');
    assert.ok(src.includes('theme: totally-made-up'));
  });
});

describe('createConfigPanel (DOM)', () => {
  let dom;
  before(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.com/' });
    global.document = dom.window.document;
    global.window = dom.window;
  });
  after(() => { delete global.document; delete global.window; });

  // A tiny editor stand-in: holds the source, hands it out, takes it back.
  function mount(initial) {
    let source = initial;
    const host = document.createElement('div');
    const trigger = document.createElement('button');
    return import(MOD).then(({ createConfigPanel }) => {
      const panel = createConfigPanel({
        host,
        trigger,
        getSource: () => source,
        setSource: (next) => { source = next; },
        palettes: ['indaco', 'cuoio', 'atelier'],
        getDefaultTheme: () => 'indaco',
      });
      return { panel, host, trigger, get: () => source };
    });
  }

  test('renders controls pre-filled from the deck front matter', async () => {
    const { panel, host } = await mount('---\nmarp: true\nsize: 4K\npaginate: true\n---\n\n# Deck\n');
    panel.render();
    const size = host.querySelector('select[aria-label="Slide size"]');
    assert.equal(size.value, '4K', 'size select reflects the deck');
    // The full author set renders two switches (auto-split, page numbers) — target
    // each by its aria-label rather than the first .db-switch-input.
    const paginate = host.querySelector('input[aria-label="Page numbers"]');
    assert.equal(paginate.checked, true, 'paginate switch reflects the deck');
  });

  test('toggling the paginate switch writes it into the source', async () => {
    const { panel, host, get } = await mount(CLEAN);
    panel.render();
    const sw = host.querySelector('input[aria-label="Page numbers"]');
    sw.checked = true;
    sw.dispatchEvent(new dom.window.Event('change'));
    assert.ok(get().includes('paginate: true'), 'source rewritten with the directive');
    assert.ok(get().startsWith('---\nmarp: true'), 'managed block added');
  });

  test('the trigger lights (is-set) only when the deck carries front matter', async () => {
    const { panel, host, trigger, get } = await mount(CLEAN);
    panel.render();
    assert.equal(trigger.classList.contains('is-set'), false, 'clean deck → quiet chip');
    const sw = host.querySelector('input[aria-label="Page numbers"]');
    sw.checked = true;
    sw.dispatchEvent(new dom.window.Event('change'));
    panel.syncTrigger();
    assert.equal(trigger.classList.contains('is-set'), true, 'configured deck → lit chip');
    assert.ok(get().includes('paginate: true'));
  });


  test('toggling the auto-glossary switch writes glossary: auto (and clears it back off) — #920', async () => {
    const { panel, host, get } = await mount(CLEAN);
    panel.render();
    const sw = host.querySelector('input[aria-label="Auto-glossary"]');
    assert.ok(sw, 'the auto-glossary switch renders in the deck-setup drawer');
    assert.equal(sw.checked, false, 'off by default on a clean deck');
    sw.checked = true;
    sw.dispatchEvent(new dom.window.Event('change'));
    assert.ok(get().includes('glossary: auto'), 'enabling writes the canonical glossary: auto');
    sw.checked = false;
    sw.dispatchEvent(new dom.window.Event('change'));
    assert.ok(!get().includes('glossary'), 'disabling clears the key (back to default)');
  });

  test('theme select is pre-filled (deck theme, else default) and writes on change', async () => {
    const withTheme = await mount('---\nmarp: true\ntheme: cuoio\n---\n\n# Deck\n');
    withTheme.panel.render();
    assert.equal(withTheme.host.querySelector('select').value, 'cuoio', 'reflects the deck theme');

    const clean = await mount(CLEAN);
    clean.panel.render();
    const themeSel = clean.host.querySelector('select');
    assert.equal(themeSel.value, 'indaco', 'falls back to the default theme when the deck declares none');
    themeSel.value = 'atelier';
    themeSel.dispatchEvent(new dom.window.Event('change'));
    assert.ok(clean.get().includes('theme: atelier'), 'picking writes theme into the source');
    assert.equal(clean.trigger.classList.contains('is-set'), false, 'theme alone does not light the chip');
  });

  test('an unknown deck theme shows a caution note and falls back', async () => {
    const { panel, host } = await mount('---\nmarp: true\ntheme: made-up\n---\n\n# Deck\n');
    panel.render();
    const warn = host.querySelector('.db-config-warn');
    assert.ok(warn, 'a caution note renders for the unknown theme');
    assert.match(warn.textContent, /made-up/);
    assert.equal(host.querySelector('select').value, 'indaco', 'the select shows the fallback, not the bad value');
  });

  // A profile mount: pass an explicit `fields` allow-list + finishes/note.
  function mountProfile(initial, fields, extra = {}) {
    let source = initial;
    const host = document.createElement('div');
    return import(MOD).then(({ createConfigPanel }) => {
      const panel = createConfigPanel({
        host, trigger: document.createElement('button'),
        getSource: () => source, setSource: (next) => { source = next; },
        palettes: ['indaco', 'cuoio'], getDefaultTheme: () => 'indaco',
        finishes: ['none', 'atrium', 'gallery'], fields, ...extra,
      });
      return { panel, host, get: () => source };
    });
  }

  test('the preview profile renders only the render-register rows (no theme / chrome / Advanced)', async () => {
    const { CONFIG_PROFILES } = await import(MOD);
    const { panel, host } = await mountProfile(CLEAN, CONFIG_PROFILES.preview);
    panel.render();
    const labels = [...host.querySelectorAll('.db-pref-label')].map((n) => n.textContent);
    assert.ok(labels.includes('Finish'), 'finish present');
    assert.ok(labels.includes('Slide size'), 'size present');
    assert.ok(labels.includes('Form'), 'form present');
    assert.ok(!labels.includes('Theme'), 'theme excluded — the studio owns the palette');
    assert.ok(!labels.includes('Header'), 'deck chrome excluded');
    assert.ok(!host.textContent.includes('Advanced'), 'no Advanced section in a preview profile');
  });

  test('the noTheme profile (Playground) drops theme but keeps everything else, incl. Advanced', async () => {
    const { CONFIG_PROFILES } = await import(MOD);
    const { panel, host } = await mountProfile(CLEAN, CONFIG_PROFILES.noTheme);
    panel.render();
    const labels = [...host.querySelectorAll('.db-pref-label')].map((n) => n.textContent);
    assert.ok(!labels.includes('Theme'), 'theme excluded — the top-bar picker owns it');
    assert.ok(labels.includes('Finish') && labels.includes('Header') && labels.includes('Default slide class'));
    assert.ok(host.textContent.includes('Advanced'), 'Advanced section present');
  });

  test('the finish row writes through and a custom note replaces the default intro', async () => {
    const { panel, host, get } = await mountProfile(CLEAN, ['finish'], { note: 'Behind the scenes.' });
    panel.render();
    assert.ok(host.querySelector('.db-settings-note').textContent.includes('Behind the scenes.'));
    const sel = host.querySelector('select[aria-label="Finish"]');
    sel.value = 'atrium';
    sel.dispatchEvent(new dom.window.Event('change'));
    assert.ok(get().includes('finish: atrium'));
  });

  test('no backdrop control renders — backdrop is a baked finish layer, not a Deck-setup field', async () => {
    const { panel, host } = await mountProfile(CLEAN, null); // full author set
    panel.render();
    assert.equal(host.querySelector('input[aria-label="Finish strength"]'), null, 'no strength slider');
    assert.equal(host.querySelector('input[aria-label="Clear behind content"]'), null, 'no clearance toggle');
  });
});
