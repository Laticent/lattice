/**
 * Unit: lib/theme/serialize.js — derived token map → themes/<name>.css text.
 *
 * Proves the emitted CSS (1) names a valid @theme directive, (2) imports the
 * engine, (3) parses back through the SAME parser the contrast gate uses, and
 * (4) the parsed result is still contrast-clean in both modes — i.e. nothing
 * is lost or malformed between derivation and a droppable theme file.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { deriveTheme, requiredTokenList } = require('../../../lib/theme/derive.js');
const { serializeTheme, themeAsset } = require('../../../lib/theme/serialize.js');
const { auditVars } = require('../../../lib/theme/contrast.js');
const { STARTERS } = require('../../../lib/theme/starters.js');

// Same parser shape as test/unit/palette/contrast.test.js (light-dark aware),
// widened to accept `_` in token names (hljs-built_in).
function parsePaletteVars(content, mode = 'light') {
  const stripped = content.replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = {};
  for (const block of stripped.match(/:root\s*\{[^}]*\}/g) || []) {
    for (const d of block.match(/--[a-z0-9_-]+\s*:\s*[^;]+/gi) || []) {
      const m = d.match(/--([a-z0-9_-]+)\s*:\s*(.+)$/i);
      if (m) vars[m[1]] = m[2].trim();
    }
  }
  for (const k of Object.keys(vars)) {
    const ld = vars[k].match(/^light-dark\(\s*([^,]+?)\s*,\s*(.+?)\s*\)$/i);
    if (ld) vars[k] = mode === 'dark' ? ld[2] : ld[1];
  }
  return vars;
}

describe('theme-serialize', () => {
  test('rejects an invalid theme name', () => {
    const map = deriveTheme(STARTERS[0].essentials);
    assert.throws(() => serializeTheme(map, { name: 'Bad Name' }), /slug/);
    assert.throws(() => serializeTheme(map, { name: '1leading' }), /slug/);
    assert.throws(() => serializeTheme(map, {}), /slug/);
  });

  for (const s of STARTERS) {
    test(`serialize(${s.name}) emits a valid, complete theme file`, () => {
      const map = deriveTheme(s.essentials);
      const css = serializeTheme(map, { name: s.name, label: s.label, description: s.description });

      assert.match(css, new RegExp(`@theme ${s.name}\\b`));
      assert.match(css, /@import 'lattice';/);
      assert.match(css, /:where\(:root\) \{ color-scheme: light; \}/);

      // every required token survives serialization
      const parsed = parsePaletteVars(css, 'light');
      const missing = requiredTokenList().filter(k => parsed[k] == null);
      assert.deepEqual(missing, [], `lost tokens: ${missing.join(', ')}`);
    });

    test(`serialize(${s.name}) round-trips contrast-clean (gate parser)`, () => {
      const map = deriveTheme(s.essentials);
      const css = serializeTheme(map, { name: s.name });
      for (const mode of ['light', 'dark']) {
        const audit = auditVars(parsePaletteVars(css, mode), { mode, level: 'gate' });
        const fmt = audit.failures.concat(audit.missing).map(f => `${f.fill}/${f.ink}[${f.status}]`);
        assert.ok(audit.ok, `${mode}: ${fmt.join(', ')}`);
      }
    });
  }

  /**
   * #1709 — `label` and `description` are free text (the description is MODEL-populated:
   * Fabricate seeds it from the reply) and land inside the header's `/* … *​/` block.
   * Unescaped, two characters end that comment and the remainder of the field is live CSS
   * in a sheet that composes straight into the Studio's preview frame.
   *
   * The assertion is a PROPERTY — "the header comment is closed by us, not by the field" —
   * because a payload list only ever proves the payloads on it. Each arm is pinned:
   * reverting either `commentSafe` call fails its own field's rows, and testing the
   * terminator against the SOURCE instead of the emitted bytes fails the `**​//` row.
   *
   * NOTE what this does NOT buy, and it is why it is only half the fix: it closes the
   * live-CSS channel, not the script one. `<​/style>` in this same field still ends the
   * preview frame's `<style>` element — HTML RAWTEXT does not read CSS comments — which
   * is handled at the frame by `sanitizeStyleText`, and is covered by
   * test/unit/core/sanitize-style-text.test.js. See
   * engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md.
   */
  describe('the header comment cannot be closed by caller text (#1709)', () => {
    const map = deriveTheme(STARTERS[0].essentials);
    /** Where the FIRST `*​/` sits — i.e. where the header ends. */
    const headerEnd = (css) => css.indexOf('*/');
    const benign = headerEnd(serializeTheme(map, { name: 'p', label: 'L', description: 'D' }));

    const payloads = {
      'bare terminator': '*/',
      'terminator then a rule': '*/ :root{--pwned:1} /*',
      // Escaping by scanning the SOURCE leaves this one live: dropping the first slash
      // pushes the second against the same star.
      'adjacent terminators': '**//',
      'an opener only (comments do not nest — must pass through)': '/*',
      'a newline that would break the header shape': 'line one\nline two',
      'a directive that would resolve if it escaped': '*/ @import \'onyx\'; /*',
      'unicode line separator': 'a b',
    };

    for (const field of ['label', 'description']) {
      for (const [label, payload] of Object.entries(payloads)) {
        test(`${field}: ${label}`, () => {
          const css = serializeTheme(map, { name: 'p', label: 'L', description: 'D', [field]: payload });
          const end = headerEnd(css);
          assert.ok(end > 0, 'the header must still be a closed comment');
          const header = css.slice(0, end);
          assert.equal(
            (header.match(/\*\//g) || []).length, 0,
            `caller text closed the header early: ${JSON.stringify(header.slice(-80))}`,
          );
          // The header must still be the header — not a truncated stub that merely
          // happens to contain no terminator.
          assert.ok(end >= benign - 8, `the header collapsed (ended at ${end}, benign ends at ${benign})`);
          assert.match(css, /@import 'lattice';/);
          // The payload text may (and should) survive as inert prose inside the comment —
          // this neutralizes, it does not censor. What must NOT survive is the payload as
          // a LIVE declaration, so the check is on the parsed sheet, not on the bytes.
          assert.ok(
            !Object.hasOwn(parsePaletteVars(css, 'light'), 'pwned'),
            'the injected declaration parsed as a real token',
          );
        });
      }
    }

    test('the field text itself survives — this neutralizes, it does not censor', () => {
      const css = serializeTheme(map, { name: 'p', description: 'Warm 60/30/10 palette */ for boards' });
      assert.match(css, /Warm 60\/30\/10 palette/);
      assert.match(css, /for boards/);
    });

    test('a benign description is byte-for-byte what it always was', () => {
      const d = 'A warm, restrained palette for board decks.';
      assert.ok(serializeTheme(map, { name: 'p', description: d }).includes(` * ${d}\n`));
    });

    test('the emitted sheet still round-trips through the palette parser', () => {
      const css = serializeTheme(map, { name: 'p', label: '*/x', description: '*/y' });
      assert.ok(Object.keys(parsePaletteVars(css, 'light')).length > 40, 'tokens survived the escape');
    });
  });

  describe('themeAsset', () => {
    test('shapes a library-scoped kind:theme record carrying css + essentials', () => {
      const essentials = STARTERS[0].essentials;
      const css = serializeTheme(deriveTheme(essentials), { name: 'dusk' });
      const a = themeAsset({ name: 'dusk', label: 'Dusk', essentials, css });
      assert.equal(a.kind, 'theme');
      assert.equal(a.name, 'dusk');
      assert.equal(a.label, 'Dusk');
      assert.equal(a.deckId, null);
      assert.equal(a.provenance, 'studio');
      assert.equal(a.text, css);
      assert.equal(a.essentials, essentials);
      assert.equal(typeof a.addedAt, 'number');
    });
    test('throws on a non-slug name', () => {
      assert.throws(() => themeAsset({ name: 'Bad Name', css: 'x' }), /slug/);
    });
  });
});
