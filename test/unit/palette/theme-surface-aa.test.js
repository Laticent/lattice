/**
 * Unit gate: every theme clears WCAG AA on every critical text/ink-on-surface
 * pair the theme-scoped audit can resolve.
 *
 * This locks the theme-wide AA sweep. The pair MATRIX lives in
 * `tools/contrast-audit.js` (`PAIRS`) — the same list the `contrast-audit` CLI
 * prints — so the tool and this gate share ONE source of truth. The matrix
 * covers text roles on the canvas AND the card surface (`bg-alt`), and the
 * foreground status ink (`--pass`/`--warn`/`--fail`) on both, which is where a
 * warn amber tuned for `--bg` used to slip under AA on the slightly darker
 * `--bg-alt`. A theme value that regresses any pair below 4.5:1 fails here with
 * the exact fg/bg/ratio, before it can reach a slide. (The mermaid/chart node-fill
 * pairs in the matrix reference engine-COMPOSED tokens the theme files don't
 * declare — `EXTERNAL_BG` — so they're expected skips here; auditing them needs a
 * tool that loads the engine, tracked in #1165.)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { auditTheme, listAllThemes } = require('../../../tools/contrast-audit.js');

describe('theme surface AA (contrast-audit PAIRS over every theme)', () => {
  const themes = listAllThemes();

  test('the theme set is non-empty (guards a silently-empty sweep)', () => {
    assert.ok(themes.length >= 30, `expected the full theme set, saw ${themes.length}`);
  });

  for (const name of themes) {
    test(`${name}: every audited pair clears AA (4.5:1)`, () => {
      const res = auditTheme(name);
      assert.ok(res, `${name}: theme file did not resolve`);
      const lines = res.fails.map(
        (f) => `${f.fgHex} on ${f.bgHex} = ${f.ratio.toFixed(2)}:1 — ${f.ctx}`,
      );
      assert.equal(res.fails.length, 0, `${name} sub-AA pairs:\n  ${lines.join('\n  ')}`);
      // Also fail on UNRESOLVED pairs: a theme-owned fg/bg the audit couldn't
      // reduce to hex (a future color-mix()/oklch()/var(--x,fallback) value the
      // resolvers in tools/contrast-audit.js — parsePaletteVars / resolveTranslucent
      // / parseHex — don't handle) is otherwise silently skipped, turning a real
      // sub-AA regression into a phantom "0 fails". Force the resolver to be
      // extended instead of letting coverage rot. (Engine-composed backdrops are
      // the EXTERNAL_BG allowlist, not counted here. 0 missing across all themes today.)
      const miss = res.missing.map((m) => `${m.fg} on ${m.bg} — ${m.ctx}`);
      assert.equal(res.missing.length, 0, `${name} UNRESOLVED (extend the resolvers in contrast-audit.js):\n  ${miss.join('\n  ')}`);
    });
  }
});
