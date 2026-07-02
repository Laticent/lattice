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

  test('form toggle: canonicalises standard/on/minimal/off; absent = standard (default), not configured', async () => {
    const { readFrontMatter } = await import(MOD);
    assert.equal(readFrontMatter('---\nmarp: true\nform: standard\n---\n').form, 'standard');
    assert.equal(readFrontMatter('---\nmarp: true\nform: on\n---\n').form, 'standard');
    assert.equal(readFrontMatter('---\nmarp: true\nform: true\n---\n').form, 'standard');
    assert.equal(readFrontMatter('---\nmarp: true\nform: minimal\n---\n').form, 'minimal');
    assert.equal(readFrontMatter('---\nmarp: true\nform: off\n---\n').form, 'off');
    // Form is ON by default — an absent key reads as standard and is NOT bespoke config.
    assert.equal(readFrontMatter(CLEAN).form, 'standard');
    assert.equal(readFrontMatter(CLEAN).configured, false);
    // The explicit opt-out (off) and minimal ARE bespoke config.
    assert.equal(readFrontMatter('---\nmarp: true\nform: off\n---\n').configured, true);
    assert.equal(readFrontMatter('---\nmarp: true\nform: minimal\n---\n').configured, true);
  });

  test('autosplit toggle: on/true/yes → true (boolean); off/absent → false, not configured', async () => {
    const { readFrontMatter } = await import(MOD);
    assert.equal(readFrontMatter('---\nmarp: true\nautosplit: on\n---\n').autosplit, true);
    assert.equal(readFrontMatter('---\nmarp: true\nautosplit: true\n---\n').autosplit, true);
    assert.equal(readFrontMatter('---\nmarp: true\nautosplit: yes\n---\n').autosplit, true);
    assert.equal(readFrontMatter('---\nmarp: true\nautosplit: off\n---\n').autosplit, false);
    assert.equal(readFrontMatter(CLEAN).autosplit, false);
    assert.equal(readFrontMatter('---\nmarp: true\nautosplit: on\n---\n').configured, true);
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

  test('form: writes off/minimal in canonical slot; standard (default) omits it', async () => {
    const { writeFrontMatter } = await import(MOD);
    const off = writeFrontMatter(CLEAN, 'form', 'off');
    assert.ok(/^---\nmarp: true\nform: off\n---\n/.test(off));
    const min = writeFrontMatter(CLEAN, 'form', 'minimal');
    assert.ok(min.includes('form: minimal\n'));
    // `class` precedes `form` in the canonical order
    let src = writeFrontMatter(CLEAN, 'form', 'off');
    src = writeFrontMatter(src, 'class', 'dark');
    const block = src.slice(0, src.indexOf('\n---\n'));
    assert.equal(block, '---\nmarp: true\nclass: dark\nform: off');
    // standard (the default) clears it back out
    assert.ok(!writeFrontMatter(off, 'form', 'standard').includes('form:'));
  });

  test('autosplit: writes the canonical on; a falsy value omits it; sits after split, before size', async () => {
    const { writeFrontMatter, readFrontMatter } = await import(MOD);
    // Boolean true (the switch) and a truthy string both canonicalise to `on`.
    assert.ok(writeFrontMatter(CLEAN, 'autosplit', true).includes('autosplit: on\n'));
    assert.ok(writeFrontMatter(CLEAN, 'autosplit', 'yes').includes('autosplit: on\n'));
    // off / false is the default → no key.
    assert.equal(writeFrontMatter(CLEAN, 'autosplit', false), CLEAN);
    assert.equal(writeFrontMatter(CLEAN, 'autosplit', 'off'), CLEAN);
    // canonical slot: split, then autosplit, then size.
    let src = writeFrontMatter(CLEAN, 'size', 'portrait');
    src = writeFrontMatter(src, 'split', 'rule');
    src = writeFrontMatter(src, 'autosplit', true);
    const block = src.slice(0, src.indexOf('\n---\n'));
    assert.equal(block, '---\nmarp: true\nsplit: rule\nautosplit: on\nsize: portrait');
    // round-trips, and switching it off over an existing on clears it.
    assert.equal(readFrontMatter(writeFrontMatter(CLEAN, 'autosplit', true)).autosplit, true);
    assert.ok(!writeFrontMatter(writeFrontMatter(CLEAN, 'autosplit', true), 'autosplit', false).includes('autosplit'));
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

  test('backdrop.strength writes the NESTED block, clamps, defaults-out at 1, and survives other writes', async () => {
    const { writeFrontMatter, readFrontMatter } = await import(MOD);
    // writes as a nested backdrop: map (not a flat key)
    const dim = writeFrontMatter(CLEAN, 'backdrop.strength', '0.4');
    assert.match(dim, /\nbackdrop:\n {2}strength: 0\.4\n/);
    assert.equal(readFrontMatter(dim)['backdrop.strength'], '0.4');
    assert.equal(readFrontMatter(dim).configured, true);
    // clamps to 0–1: a below-range value pins to 0 (still written, ≠ default)
    assert.match(writeFrontMatter(CLEAN, 'backdrop.strength', '-0.5'), /\nbackdrop:\n {2}strength: 0\n/);
    // an above-range value clamps to 1 = full = the default → no block
    assert.equal(writeFrontMatter(CLEAN, 'backdrop.strength', '1.8'), CLEAN);
    // 1 (full) is the default, as is empty → no backdrop block
    assert.equal(writeFrontMatter(CLEAN, 'backdrop.strength', '1'), CLEAN);
    assert.equal(writeFrontMatter(CLEAN, 'backdrop.strength', ''), CLEAN);
    // survives an unrelated write — NOT flattened into stray scalars
    const withPag = writeFrontMatter(dim, 'paginate', true);
    assert.match(withPag, /\nbackdrop:\n {2}strength: 0\.4\n/);
    assert.match(withPag, /\npaginate: true\n/);
    // clearing it (→ 1) removes only the backdrop block
    const cleared = writeFrontMatter(withPag, 'backdrop.strength', '1');
    assert.doesNotMatch(cleared, /backdrop:/);
    assert.match(cleared, /\npaginate: true\n/);
    // coexists with a scalar finish:, in order (finish then backdrop)
    const both = writeFrontMatter('---\nmarp: true\nfinish: atrium\nbackdrop:\n  strength: 0.3\n---\n\n# D\n', 'header', 'Board');
    assert.ok(both.indexOf('finish: atrium') < both.indexOf('backdrop:'), both);
    assert.ok(both.indexOf('backdrop:') < both.indexOf('header: Board'), both);
  });

  test('backdrop.clearance writes the nested toggle (on), defaults-out (off), and coexists with strength', async () => {
    const { writeFrontMatter, readFrontMatter } = await import(MOD);
    const on = writeFrontMatter(CLEAN, 'backdrop.clearance', true);
    assert.match(on, /\nbackdrop:\n {2}clearance: on\n/);
    assert.equal(readFrontMatter(on)['backdrop.clearance'], 'on');
    assert.equal(readFrontMatter(on).configured, true);
    // off / false → omitted (default), no backdrop block
    assert.equal(writeFrontMatter(CLEAN, 'backdrop.clearance', false), CLEAN);
    // composes with strength in ONE backdrop block
    const both = writeFrontMatter(writeFrontMatter(CLEAN, 'backdrop.strength', '0.5'), 'backdrop.clearance', true);
    assert.match(both, /\nbackdrop:\n/);
    assert.match(both, /strength: 0\.5/);
    assert.match(both, /clearance: on/);
    // clearing clearance leaves strength intact
    const justStrength = writeFrontMatter(both, 'backdrop.clearance', false);
    assert.match(justStrength, /strength: 0\.5/);
    assert.doesNotMatch(justStrength, /clearance:/);
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

  test('toggling the auto-split switch writes autosplit: on (and clears it back off)', async () => {
    const { panel, host, get } = await mount(CLEAN);
    panel.render();
    const sw = host.querySelector('input[aria-label="Auto-split overflow"]');
    assert.ok(sw, 'the auto-split switch renders in the full author set');
    assert.equal(sw.checked, false, 'off by default on a clean deck');
    sw.checked = true;
    sw.dispatchEvent(new dom.window.Event('change'));
    assert.ok(get().includes('autosplit: on'), 'enabling writes the canonical on');
    sw.checked = false;
    sw.dispatchEvent(new dom.window.Event('change'));
    assert.ok(!get().includes('autosplit'), 'disabling clears the key (back to default)');
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

  test('the Finish strength slider renders and writes the nested backdrop.strength', async () => {
    const { panel, host, get } = await mountProfile(CLEAN, ['backdrop.strength']);
    panel.render();
    const range = host.querySelector('input[aria-label="Finish strength"]');
    assert.ok(range, 'a range slider renders for the strength axis');
    assert.equal(range.value, '1', 'defaults to full (1) on a clean deck');
    range.value = '0.35';
    range.dispatchEvent(new dom.window.Event('input'));
    assert.match(get(), /\nbackdrop:\n {2}strength: 0\.35\n/);
  });
});
