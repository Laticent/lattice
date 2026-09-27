/**
 * lib/plugins/host-browser.mjs — the plugin host's BROWSER half: it finds each placeholder a
 * plugin's fence emitted, loads the plugin's library, runs the plugin's `hydrate(el, ctx)` and
 * keeps the one settle state every capture waits on
 * (engineering/decisions/2026-09-27-plugin-system.md §4.6–§4.7).
 *
 * THREE SURFACES, ONE SOURCE:
 *   - the RUNTIME (Studio preview and its capture frame, Playground, `--fluid`) imports this
 *     module and `hydrate.generated.js`, and fetches a plugin's library from beside itself;
 *   - the CLI EXPORT PAGE runs without the runtime (its overflow watcher would paint into the
 *     print), so `lib/plugins/hydrate-script.js` SERIALIZES these functions and each plugin's
 *     `hydrate` into one inline script, and the emulator injects the library by `<script src>`;
 *   - the STUDIO EXPORT (docs/src/components/studio/export/deck-export.js) imports
 *     `releaseFigure` to settle what is still pending when its capture budget runs out.
 * So every function exported here is SELF-CONTAINED — it reads nothing from module scope —
 * and `test/unit/plugins/hydrate-host.test.js` runs the serialized script to prove it.
 *
 * THE SETTLE STATE lives in markup, where a capture on any surface can read it without a
 * handle on this code:
 *
 *   data-lattice-settle="pending"      written by the ENGINE (lib/plugins/host.js), so a
 *                                      capture that starts before any script ran still waits
 *   data-lattice-settle="hydrating"    a host is drawing it; every other pass and host skips it,
 *                                      and captures keep waiting
 *   data-lattice-settle="rendered"     hydrate returned (or its promise resolved)
 *   data-lattice-settle="error"        the plugin reported a failure it showed on the slide
 *   data-lattice-settle="unavailable"  the library never arrived; the author's source is shown
 *   data-lattice-final                 terminal: set by a capture that gave up waiting, or by
 *                                      this host when a hydrate overran its budget. Nothing
 *                                      touches a final placeholder again, so a late library load
 *                                      cannot draw over what the capture decided to bake.
 *
 * `unavailable` without `final` is recoverable: if the library turns up later (a host page loads
 * it), the next pass clears the source text and draws.
 */

/**
 * Settle one placeholder as `unavailable`, showing the author's own source (the packed body), and
 * — when `final` — close it to every later pass. The Studio capture and this host share it.
 * @param {Element} el
 * @param {(b64: string) => string} fromBase64  the UTF-8 decoder (lib/core/base64-utf8.js)
 * @param {boolean} [final]
 */
export function releaseFigure(el, fromBase64, final) {
  el.setAttribute('data-lattice-settle', 'unavailable');
  if (final) el.setAttribute('data-lattice-final', '');
  try {
    el.textContent = fromBase64(el.getAttribute('data-lattice-config') || '');
  } catch (_e) {
    el.textContent = '';
  }
}

/**
 * The selector every capture waits on: a plugin PLACEHOLDER (never any element an author marked
 * up with the same attribute — the first cut matched those too, stalled every capture on them and
 * then blanked their text) that no pass has settled and nothing has closed.
 */
export const PENDING_FIGURES = '[data-lattice-hydrate]:is([data-lattice-settle="pending"], [data-lattice-settle="hydrating"]):not([data-lattice-final])';

/**
 * Install the host on a window.
 * @param {Window} win
 * @param {ReadonlyArray<{ name: string, hydrate: Function, budgetMs: number,
 *                         payload: null | { file: string, global: string } }>} hydrators
 *   in dependency order (lib/plugins/hydrate.generated.js)
 * @param {{ fromBase64: Function, releaseFigure: Function, baseUrl?: string }} opts
 *   `baseUrl` — where a missing library is fetched from, by its file name; none (the CLI page,
 *   which injects the library itself) means a missing library is simply unavailable
 * @returns {{ run: () => void }} `run` is idempotent and cheap when nothing is pending
 */
export function installHydrateHost(win, hydrators, opts) {
  const doc = win.document;
  const fromBase64 = opts.fromBase64;
  const release = opts.releaseFigure;
  const loads = Object.create(null); // payload file → 'loading' | 'loaded' | 'failed'
  const known = new Set(hydrators.map((h) => h.name));

  const stateOf = (el) => el.getAttribute('data-lattice-settle');
  const isFinal = (el) => el.hasAttribute('data-lattice-final');
  const libOf = (h) => (h.payload ? win[h.payload.global] : undefined);
  // A FUNCTION, and only a function. An element with `id="functionPlot"` in the deck makes
  // `window.functionPlot` that element (the browser's named access on window), so accepting any
  // object would skip the load and call a <div> (found by the HARD RULE #25 red team, real Chrome).
  const libReady = (h) => !h.payload || typeof libOf(h) === 'function';

  function settle(el, state) {
    if (isFinal(el)) return;
    el.setAttribute('data-lattice-settle', state);
  }

  function placeholders(h, ready) {
    const out = [];
    for (const el of doc.querySelectorAll(`[data-lattice-hydrate="${h.name}"]`)) {
      // `hydrating` is skipped: another pass — or another HOST on the same page (`--fluid` runs
      // the CLI page's serialized host AND the inlined runtime's) — is already drawing it. The
      // mark is markup, not a closure, for exactly that reason.
      if (isFinal(el)) continue;
      const state = stateOf(el);
      if (state === 'pending' || (state === 'unavailable' && ready)) out.push(el);
    }
    return out;
  }

  function ensurePayload(h) {
    const file = h.payload.file;
    if (loads[file] || !opts.baseUrl || doc.readyState === 'loading') return;
    let url = '';
    try {
      url = new URL(file, opts.baseUrl).href;
    } catch (_e) {
      loads[file] = 'failed';
      return;
    }
    loads[file] = 'loading';
    const tag = doc.createElement('script');
    tag.src = url;
    tag.onload = () => {
      loads[file] = libReady(h) ? 'loaded' : 'failed';
      run();
    };
    tag.onerror = () => {
      loads[file] = 'failed';
      run();
    };
    (doc.head || doc.documentElement).appendChild(tag);
  }

  function hydrateOne(h, el) {
    if (stateOf(el) === 'unavailable') el.textContent = '';
    el.setAttribute('data-lattice-settle', 'hydrating');
    const ctx = {
      name: h.name,
      lib: libOf(h),
      decodeConfig: (node) => fromBase64(node.getAttribute('data-lattice-config') || ''),
      settle,
      token: (node, name) => win.getComputedStyle(node).getPropertyValue(name).trim(),
    };
    const done = () => {
      // A draw that lands after the budget closed the placeholder is discarded: the capture has
      // already decided what it bakes, and it is the source text.
      if (isFinal(el)) release(el, fromBase64, true);
      else if (stateOf(el) === 'hydrating') settle(el, 'rendered');
    };
    const fail = (e) => {
      if (isFinal(el)) return;
      el.textContent = `${h.name} error: ${e?.message ? e.message : String(e)}`;
      settle(el, 'error');
    };
    let result;
    try {
      result = h.hydrate(el, ctx);
    } catch (e) {
      fail(e);
      return;
    }
    if (result && typeof result.then === 'function') {
      const timer = win.setTimeout(() => {
        if (stateOf(el) === 'hydrating') release(el, fromBase64, true);
      }, h.budgetMs);
      result.then(
        () => {
          win.clearTimeout(timer);
          done();
        },
        (e) => {
          win.clearTimeout(timer);
          fail(e);
        },
      );
    } else {
      done();
    }
  }

  function run() {
    // A placeholder naming a plugin this page has no browser half for can never draw: settle it
    // with its source rather than leave every capture waiting out its budget on it.
    // (The selector is written out, not read from PENDING_FIGURES: this function is serialized.)
    for (const el of doc.querySelectorAll('[data-lattice-hydrate][data-lattice-settle="pending"]:not([data-lattice-final])')) {
      if (!known.has(el.getAttribute('data-lattice-hydrate'))) release(el, fromBase64, false);
    }
    for (const h of hydrators) {
      const ready = libReady(h);
      const els = placeholders(h, ready);
      if (!els.length) continue;
      if (!ready) {
        const state = loads[h.payload.file];
        if (state === 'failed' || (!opts.baseUrl && state !== 'loading')) {
          for (const el of els) if (stateOf(el) !== 'unavailable') release(el, fromBase64, false);
        } else {
          ensurePayload(h);
        }
        continue;
      }
      for (const el of els) hydrateOne(h, el);
    }
  }

  return { run };
}
