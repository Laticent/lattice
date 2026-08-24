/**
 * AUTHOR DEFERRAL PROBE — is deck-authored script still holding work at capture?
 *
 * THE CONTRACT THIS ENFORCES. The export navigates with `waitUntil: 'load'` and then
 * settles deferred media explicitly (`settleDeferredMedia` in `lattice-emulator.js`).
 * It does NOT wait on author timers. That is a decision, recorded rather than
 * discovered: `engineering/decisions/2026-08-16-render-format-cost-assessment.md`
 * §2a-ter, from #1792. There is no finite wait that is correct — the next deck can
 * always pick a longer one — so the export declines the wait and says so out loud.
 *
 * WHAT WAS ACTUALLY WRONG. Declining is fine; declining SILENTLY is not. Before
 * `waitUntil: 'load'` shipped, `networkidle0`'s idle floor granted a few hundred ms
 * of grace incidentally (measured on a 2-slide deck: 40 ms and 80 ms timers landed,
 * 120 ms did not), so a deck could appear to work. Under `load` that cushion is gone
 * and the export ships the page WITHOUT the script's output, exit 0, no diagnostic —
 * the same failure shape as the lazy-image class `settleDeferredMedia` closed. This
 * probe is the diagnostic. IT DOES NOT WAIT; IT REPORTS.
 *
 * HOW ATTRIBUTION WORKS, AND WHERE IT STOPS.
 * Installed via `page.evaluateOnNewDocument`, so it patches the scheduling APIs before
 * the document's first script runs and survives every re-navigation (initial,
 * auto-split, rails). At schedule time it asks `document.currentScript` who is calling:
 *   - a `<script>` carrying `ENGINE_SCRIPT_ATTR` is OURS                 -> not tracked;
 *   - any other `<script>` came from deck markdown (`lib/engine/index.js` sets
 *     markdown-it `html: true`, which passes raw HTML straight through)  -> tracked;
 *   - `null` -> UNKNOWN PROVENANCE, and deliberately NOT tracked.
 *
 * That last line is the honest limit, and it is where the false NEGATIVES live.
 * `document.currentScript` is null inside a `<script type="module">` and inside any
 * promise continuation, so a module-scripted deck — or one that only chains `.then()`
 * off something this file does not wrap — is invisible here. Defaulting the unknown
 * case to "authored" would have been the worse error, and not hypothetically: the
 * export's own overflow watcher schedules from inside `settleFonts(...).then(check)`,
 * where `currentScript` is null, so every deck in the repo would warn. A false
 * negative degrades to today's behavior; a false positive trains authors to ignore
 * the warning. `lint:deck` is the static net that catches the module case at
 * authoring time (`lib/authoring/lint-core.js`, rule `author-script-defers`).
 *
 * Pure and self-contained — no closure over module scope — so `.toString()` can inject
 * the literal source into the page (the `SETTLE_FONTS_SRC` / `PROBE_SRC` idiom,
 * HARD RULE #1).
 */

/**
 * Attribute stamped on every `<script>` the export itself emits into the rendered
 * document. Anything without it came from the deck. The census in
 * `test/unit/export/engine-script-marker.test.js` pins that every emitter carries it —
 * a missed one is a FALSE POSITIVE warning on every deck that uses that feature.
 */
const ENGINE_SCRIPT_ATTR = 'data-lattice-script';

/**
 * Page-side installer. Patches the deferral APIs and parks its state on
 * `window.__latticeAuthorDeferral`. Idempotent — a second install is a no-op, so a
 * re-navigation that somehow re-runs it cannot double-wrap.
 */
function installAuthorDeferralProbe() {
  const W = window;
  if (W.__latticeAuthorDeferral) return;
  // Inlined rather than read from the module: this function's source travels alone.
  const MARKER = 'data-lattice-script';
  const pending = [];
  W.__latticeAuthorDeferral = { pending };

  // Set while a callback attributed to deck script is on the stack, so work IT
  // schedules inherits the attribution — `document.currentScript` is null inside any
  // callback, and a chained `setTimeout` is the common shape.
  let ctx = null;
  const byId = new Map();

  const originOf = (el) => {
    let slide = 0;
    try {
      const s = el?.closest ? el.closest('section[data-lattice-slide]') : null;
      if (s) slide = Number(s.getAttribute('data-lattice-slide')) || 0;
    } catch (_e) { /* detached, or no closest — report it deck-wide instead */ }
    const src = el?.getAttribute ? el.getAttribute('src') : null;
    return { slide, where: src ? String(src).split('/').pop() : 'inline <script>' };
  };

  /** Open a record if the caller is deck-authored; null means "not ours to report". */
  const track = (kind, detail) => {
    let origin = ctx;
    if (!origin) {
      const cur = document.currentScript;
      // null -> unknown provenance. Not tracked, on purpose; see the header.
      if (!cur || cur.hasAttribute(MARKER)) return null;
      origin = originOf(cur);
    }
    const rec = {
      kind,
      detail: detail == null ? '' : String(detail),
      slide: origin.slide,
      where: origin.where,
      done: false,
    };
    pending.push(rec);
    return rec;
  };

  const settle = (rec) => {
    if (!rec || rec.done) return;
    rec.done = true;
    const i = pending.indexOf(rec);
    if (i >= 0) pending.splice(i, 1);
  };

  /** Run an attributed callback: it has arrived, so settle it, then keep attribution. */
  const invoke = (rec, fn, self, args) => {
    settle(rec);
    const prev = ctx;
    ctx = { slide: rec.slide, where: rec.where };
    try { return fn.apply(self, args); } finally { ctx = prev; }
  };

  // TIMERS. A repeating interval is settled by its FIRST tick, not by ending: an
  // interval never ends, and a clock that has ticked once has already written what the
  // export captures. Reporting it forever would be a permanent false alarm.
  const wrapScheduler = (name, cancelName, hasDelay) => {
    const orig = W[name];
    const cancel = W[cancelName];
    if (typeof orig !== 'function') return;
    W[name] = (fn, ...rest) => {
      // A string handler cannot be wrapped without re-entering `eval`; pass it through
      // rather than change what the deck asked for. Untracked, and rare enough to say so.
      if (typeof fn !== 'function') return orig.call(W, fn, ...rest);
      const rec = track(name, hasDelay ? `${Math.round(Number(rest[0]) || 0)}ms` : '');
      if (!rec) return orig.call(W, fn, ...rest);
      const extra = rest.slice(1);
      const id = orig.call(W, () => invoke(rec, fn, W, extra), rest[0]);
      byId.set(id, rec);
      return id;
    };
    if (typeof cancel === 'function') {
      W[cancelName] = (id) => {
        // A canceled callback is not lost content — the deck said never mind.
        settle(byId.get(id));
        byId.delete(id);
        return cancel.call(W, id);
      };
    }
  };
  wrapScheduler('setTimeout', 'clearTimeout', true);
  wrapScheduler('setInterval', 'clearInterval', true);
  wrapScheduler('requestAnimationFrame', 'cancelAnimationFrame', false);
  wrapScheduler('requestIdleCallback', 'cancelIdleCallback', false);

  // NETWORK. `load` waits for the resources the DOCUMENT declares; it does not wait for
  // a fetch a script starts, which is the same hole one layer down.
  const origFetch = W.fetch;
  if (typeof origFetch === 'function') {
    W.fetch = (input, ...rest) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      const rec = track('fetch', url);
      const p = origFetch.call(W, input, ...rest);
      // Settle on either outcome, and swallow nothing: `p` itself is returned unchanged,
      // so the caller's own rejection handling is untouched.
      if (rec && typeof p?.then === 'function') p.then(() => settle(rec), () => settle(rec));
      return p;
    };
  }
  const XHR = W.XMLHttpRequest;
  const origOpen = XHR?.prototype?.open;
  const origSend = XHR?.prototype?.send;
  if (typeof origOpen === 'function' && typeof origSend === 'function') {
    // These two stay `function`s: they are prototype methods and need their own `this`.
    XHR.prototype.open = function (...args) {
      try { this.__latticeUrl = String(args[1] || ''); } catch (_e) { /* frozen instance */ }
      return origOpen.apply(this, args);
    };
    XHR.prototype.send = function (...args) {
      const rec = track('XMLHttpRequest', this.__latticeUrl || '');
      if (rec) this.addEventListener('loadend', () => settle(rec));
      return origSend.apply(this, args);
    };
  }
}

/**
 * Page-side reader. Returns a plain, structured-clone-safe snapshot of what is still
 * outstanding. `installed: false` means the probe never ran — reported rather than
 * guessed, so a wiring regression cannot masquerade as a clean deck.
 */
function readAuthorDeferralProbe() {
  const state = window.__latticeAuthorDeferral;
  if (!state) return { installed: false, pending: [] };
  return {
    installed: true,
    pending: state.pending.map((r) => ({ kind: r.kind, detail: r.detail, slide: r.slide, where: r.where })),
  };
}

/** At most this many distinct rows are named before the rest are summarized. */
const MAX_DEFERRAL_LINES = 4;

/**
 * Node-side formatter: outstanding records -> the warning lines to print, or `[]` when
 * there is nothing to say. Pure, so the wording is unit-testable without a browser.
 *
 * Identical (slide, where, kind, detail) records collapse to one line with a count — a
 * deck that schedules the same tick sixty times must not print sixty lines. `where` earns
 * its place in the key AND the line: a deck can carry both an inline block and a
 * `<script src>`, and "which one" is the author's first question.
 */
function formatAuthorDeferralWarning(pending) {
  if (!Array.isArray(pending) || pending.length === 0) return [];
  const groups = new Map();
  for (const rec of pending) {
    const slide = Number(rec?.slide) || 0;
    const where = String(rec?.where || 'script');
    const kind = String(rec?.kind || 'deferred work');
    const detail = String(rec?.detail || '');
    const key = JSON.stringify([slide, where, kind, detail]);
    const hit = groups.get(key);
    if (hit) hit.count += 1;
    else groups.set(key, { slide, where, kind, detail, count: 1 });
  }
  const rows = [...groups.values()].sort(
    (a, b) => a.slide - b.slide || a.where.localeCompare(b.where) || a.kind.localeCompare(b.kind),
  );
  const n = pending.length;
  const lines = [
    `  ⚠ ${n} deck-authored script task${n === 1 ? '' : 's'} had not run when the export captured — whatever ${n === 1 ? 'it writes is' : 'they write is'} NOT in this file.`,
  ];
  for (const row of rows.slice(0, MAX_DEFERRAL_LINES)) {
    const at = row.slide ? `slide ${row.slide}` : 'deck';
    const call = row.detail ? `${row.kind}(${row.detail})` : row.kind;
    lines.push(`      ${at} · ${row.where} · ${call}${row.count > 1 ? ` × ${row.count}` : ''}`);
  }
  if (rows.length > MAX_DEFERRAL_LINES) {
    lines.push(`      … and ${rows.length - MAX_DEFERRAL_LINES} more`);
  }
  lines.push('    The export captures at the load event plus an explicit media settle; it does not wait on author timers.');
  lines.push('    Do the work synchronously at parse time, or author the content in markdown. See design/skill.md § Raw HTML in a deck.');
  return lines;
}

module.exports = {
  ENGINE_SCRIPT_ATTR,
  MAX_DEFERRAL_LINES,
  installAuthorDeferralProbe,
  readAuthorDeferralProbe,
  formatAuthorDeferralWarning,
  INSTALL_AUTHOR_DEFERRAL_PROBE_SRC: `(${installAuthorDeferralProbe.toString()})()`,
  READ_AUTHOR_DEFERRAL_PROBE_SRC: readAuthorDeferralProbe.toString(),
};
