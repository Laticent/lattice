/**
 * lattice-engine — theme store.
 *
 * Marp registers palettes via `marp.themeSet.add(cssText)`, keyed by the
 * `@theme <name>` directive in each stylesheet, and resolves `@import 'lattice'`
 * + `@size` when it emits the per-render `css`. The store keys stored CSS by
 * `@theme` name; `cssFor(name)` returns the per-render stylesheet.
 *
 * P1.1 (done): `cssFor` composes the engine-owned scaffold (lib/engine/css.js)
 * with the selected theme, resolving `@import 'lattice'` against the registered
 * base theme and honouring the `size:` directive's `@size` geometry. The
 * scaffold is reverse-engineered from Marpit's — load-bearing rules only,
 * emitted correctly — so themes compose without marp-core's `!important`
 * override layer.
 */



const { composeCss, resolveSize } = require('./css');
const { replaceThemeNameImports } = require('../theme/chain.mjs');

// The hard fallback the browser preview/export hosts scale against when no
// theme is registered yet (or a malformed `@size`): Lattice's default HD box.
const DEFAULT_GEOMETRY = { width: 1280, height: 720 };

const THEME_RE = /@theme\s+([A-Za-z0-9_-]+)/;
// How far into a stylesheet the LEGACY `add(css)` path looks for `@theme`, in
// UTF-16 code units (String.slice), not bytes. The
// directive is a header comment by construction (byte 3 of a palette, 346 of the
// base), so 4 KB covers every real sheet with room to spare — and it bounds the
// miss. Unbounded, a sheet with no directive scanned the entire buffer: 884 µs on
// dist/lattice.css, measured, to then return false and register nothing.
const THEME_SCAN_CHARS = 4096;
const BASE_THEME = 'lattice';

// The theme-name `@import` grammar is NOT declared here. It lives in
// `lib/theme/chain.mjs` (`replaceThemeNameImports`), shared with `flattenCssImports`
// (the caller-supplied `--css` sheet). This file used to carry its own regex and the
// two had drifted. THERE IS A THIRD READER: `THEME_IMPORT_RE` in `./css.js`, which
// resolves the BASE import (`@import 'lattice'`) that this method deliberately hands
// off at BASE_THEME below. It is quoted-only and stays where it is — different
// question, different target — so the shared grammar must never accept a form it
// rejects. See engineering/decisions/2026-08-17-composition-stays-content-addressed.md.

class ThemeStore {
  constructor() {
    this.byName = new Map();
    // Memoize the composed per-render stylesheet by `${name}\u0000${sizeName}` (NUL
    // separates cleanly — it can't occur in either half, so no key can be forged).
    // `cssFor` re-resolves theme imports and re-packs the ~1MB base into a ~560KB
    // sheet on EVERY call — ~26ms at 1× / ~104ms at 4× CPU. It is a PURE function of
    // the registered themes + (name, size), and a live editing host calls it with the
    // SAME (theme, size) on every keystroke, so without this the Studio burned ~104ms
    // (at 4×) of redundant recomposition per edit — the dominant per-edit cost, and
    // wasted outright on a patch render that only swaps the body. Node/CLI (one render
    // per deck) barely notices; the interactive preview is where it hurt. Any theme
    // mutation (`add`) clears the cache, so a re-registered base can't serve stale CSS.
    // See engineering/decisions/2026-07-11-preview-performance-diagnosis.md §D.
    this._cssCache = new Map();
  }

  /**
   * Register a stylesheet under a name.
   *
   *   add(name, cssText)   the contract — identity is GIVEN, never searched for
   *   add(cssText)         legacy — the name is recovered from `@theme`
   *
   * IDENTITY IS AN ARGUMENT, NOT A SEARCH. Every caller in this repo already
   * holds the name when it registers: the fetcher fetched BY name, the Studio
   * serialized WITH one, a shared payload carries `{ name, css }`, the CLI has a
   * path. They handed over a blob anyway and this method regexed the name back
   * out of it — of a 1.5 MB base sheet, on a call live hosts make every render.
   * `theme-fetch.ts` was the clearest case: `if (!PG.hasTheme(name)) PG.addThemes([css])`
   * uses the name and discards it on the same line.
   *
   * The cost of the search on the happy path is ~0.15 µs, which is nothing — this
   * is not a performance fix and should not be sold as one. What the search costs
   * is CORRECTNESS: a stylesheet with no `@theme` registers NOTHING while returning
   * a `false` nobody checks, and before the scan was bounded it paid a full-buffer
   * traversal to get there. Given the name, that mode stops existing on the named
   * path — and every way of reaching it through the named path is now a THROW:
   * a missing/non-string name, and a missing/non-string stylesheet.
   *
   * The one-argument form stays because `./engine` is a published export and
   * `window.LatticePlayground.addThemes` is documented public API; an external
   * consumer passing bare CSS must keep working. In-repo callers use the two-
   * argument form and `checkThemeIdentity` (tools/check-ownership.js) keeps it
   * that way. See engineering/decisions/2026-08-16-theme-identity-ownership.md.
   */
  add(...args) {
    // A REST PARAM, so the branch is on true ARITY — how many arguments the caller
    // actually passed — and not on the value of either. Three narrower tests were
    // tried and each was wrong in the same direction:
    //   `name === null`          conflated "one argument" with "a broken name", so
    //                            `add(null, css)` silently scanned the sheet.
    //   `cssText === undefined`  conflated "one argument" with "a missing stylesheet",
    //                            so `add('lattice', undefined)` fell into the LEGACY
    //                            branch, discarded the given name, and scanned the NAME
    //                            as css — a named registration that silently no-ops,
    //                            the exact failure this method exists to abolish,
    //                            reachable through its own new branch.
    //   a sentinel DEFAULT param did not work either: an explicit `undefined` argument
    //                            triggers a default, so it collapsed to the same bug.
    const [nameOrCss, cssText] = args;
    const legacy = args.length < 2;
    const css = legacy ? nameOrCss : cssText;
    let name = legacy ? null : nameOrCss;
    if (legacy) {
      // Legacy path: recover identity from the content. Bounded to the head of
      // the sheet — the directive is at byte 3 of a palette and byte 346 of the
      // base (max 1005 across all 70 shipped stylesheets, measured), so a miss
      // costs a small scan rather than the whole buffer.
      if (typeof css !== 'string') return false;
      const m = THEME_RE.exec(css.slice(0, THEME_SCAN_CHARS));
      if (!m) return false;
      name = m[1];
    }
    if (!name || typeof name !== 'string') {
      throw new TypeError(`ThemeStore.add: a theme needs a name, got ${JSON.stringify(name)}`);
    }
    // VALIDATE THE STYLESHEET TOO. `add(name, null)` used to return `true` and store
    // `null`: `has(name)` was then true forever — permanently disarming every
    // `if (!hasTheme(name))` self-heal guard in docs/src/lib/theme-fetch.ts — while
    // `cssFor` served scaffold-only CSS. A `true` that means "registered nothing" is
    // worse than the `false` this method set out to eliminate.
    if (typeof css !== 'string') {
      throw new TypeError(`ThemeStore.add: theme "${name}" needs its stylesheet as a string, got ${css === null ? 'null' : typeof css}`);
    }
    this.byName.set(name, css);
    // A newly registered / replaced theme (base included) can change any composed
    // output, so drop the whole memo — registration is a setup-time event, not a
    // per-render one, so clearing wholesale costs nothing in practice.
    this._cssCache.clear();
    return true;
  }

  has(name) {
    return this.byName.has(name);
  }

  /**
   * Inline theme-to-theme `@import 'name'` against the store, recursively, so a
   * `*-dark` wrapper (`@import 'concrete'; :root{color-scheme:dark}`) carries the
   * full base palette into composeCss. `@import 'lattice'` is left for composeCss
   * (it inlines the base scaffold); unknown / cyclic names are left in place (they
   * fall through to composeCss's URL-import hoisting, the pre-fix behaviour).
   * Without this the wrapper's import hoisted as a dead `@import 'concrete';` and
   * every `*-dark` sheet collapsed to scaffold-only (~2 KB, no tokens).
   */
  resolveThemeImports(cssText, seen) {
    return replaceThemeNameImports(cssText || '', (importName, full) => {
      if (importName === BASE_THEME) return full; // composeCss resolves the base
      if (seen.has(importName) || !this.byName.has(importName)) return full;
      seen.add(importName);
      return this.resolveThemeImports(this.byName.get(importName), seen);
    });
  }

  /**
   * Return the per-render CSS for a registered theme: the engine scaffold +
   * the theme with theme-name imports (incl. `@import 'lattice'`) resolved
   * against the registered base. `sizeName` is the deck's `size:` directive
   * value (selects the `@size` geometry). Unknown themes return an empty string
   * rather than throwing.
   */
  cssFor(name, sizeName) {
    if (!this.byName.has(name)) return '';
    const key = `${name}\u0000${sizeName || ''}`;
    const cached = this._cssCache.get(key);
    if (cached !== undefined) return cached;
    const themeCss = this.resolveThemeImports(this.byName.get(name), new Set([name]));
    const css = composeCss({
      themeCss,
      baseLatticeCss: this.byName.get(BASE_THEME) || '',
      sizeName,
    });
    this._cssCache.set(key, css);
    return css;
  }

  /**
   * Resolve the deck's pixel geometry for a `size:` directive — the SAME registry
   * lookup `cssFor` bakes into the scaffold, but returned as plain numbers
   * `{ width, height }` for the browser hosts that fit-scale and export the slide
   * (they need `w / slideWidth`, not a CSS string). An unregistered size → the HD
   * default, so a host always has a usable divisor.
   *
   * `name` (the theme) is accepted and ignored: geometry belongs to the engine's
   * registry, not to a stylesheet, so the answer no longer varies by palette
   * (engineering/decisions/2026-08-16-size-registry-ownership.md). Keeping the
   * parameter keeps every call site — and the `cssFor(name, size)` symmetry —
   * intact. It also stops this method resolving a theme's imports (inlining the
   * ~1 MB base) purely to read a comment.
   */
  geometryFor(_name, sizeName) {
    const { width, height } = resolveSize(sizeName);
    const w = parseFloat(width);
    const h = parseFloat(height);
    return {
      width: Number.isFinite(w) && w > 0 ? w : DEFAULT_GEOMETRY.width,
      height: Number.isFinite(h) && h > 0 ? h : DEFAULT_GEOMETRY.height,
    };
  }
}

module.exports = { ThemeStore };
