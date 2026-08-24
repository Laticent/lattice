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
 * ═══ THE PRIME DIRECTIVE: OBSERVE, NEVER PERTURB ═══
 *
 * This runs in EVERY export render, so a wrapper that changes what deck code sees is a
 * defect strictly worse than the silence it was written to fix. The first cut broke
 * exactly that rule and a checker caught it: the callback wrapper took no parameters, so
 * `requestAnimationFrame(ts => …)` received `undefined` instead of a
 * `DOMHighResTimeStamp` and `requestIdleCallback(d => d.timeRemaining())` threw — in the
 * page, where the emulator registers no `pageerror` handler, so the render exited 0 with
 * a wrong slide AND NO WARNING. Three rules came out of that, each load-bearing:
 *
 *   1. FORWARD EVERYTHING, BOTH WAYS. Trailing arguments go to the original API so the
 *      BROWSER delivers them, and whatever the browser hands the callback is passed
 *      straight through. The wrapper never manufactures an argument list.
 *   2. NEVER SWALLOW A THROW. A synchronous throw out of the original settles the record
 *      and is re-thrown unchanged.
 *   3. WRAP ONLY WHAT CAN ACTUALLY LOSE CONTENT. See the next block.
 *
 * ═══ WHAT IS WRAPPED, AND WHAT DELIBERATELY IS NOT ═══
 *
 * Wrapped: `setTimeout`, `setInterval`, `XMLHttpRequest`. Each can hold work past the load
 * event, which is the definition of the loss this reports, and each is observable without
 * changing what the deck sees.
 *
 * NOT wrapped, and these are decisions rather than omissions:
 *
 *   - `requestAnimationFrame`. A rAF scheduled at parse time runs at the next paint,
 *     long before the capture — MEASURED: its output is in the PDF. So it can never be
 *     the lost-content signal, and a self-rescheduling paint loop ALWAYS has one frame
 *     outstanding, which made it a guaranteed false alarm on a deck that rendered
 *     perfectly. Wrapping it bought nothing and cost the argument bug above.
 *   - `requestIdleCallback`. Same argument-shape hazard (an `IdleDeadline`), and what
 *     "idle" means inside a headless print is not something this file can reason about
 *     honestly. It stays a static-only finding — `lint:deck` names it.
 *   - `fetch`. Settling the record means attaching to the deck's promise, and attaching is
 *     what MARKS a promise handled. Both strategies were built and measured in a real
 *     render, and both perturb: swallowing the rejection stops a deck's
 *     `unhandledrejection` fallback from painting, and re-throwing fires that fallback
 *     SPURIOUSLY on a deck whose own `.catch` already handled it. There is no third
 *     option, so the feature is withdrawn rather than shipped with either behavior.
 *
 * FALSE NEGATIVES, listed rather than glossed. None of these is reported at capture:
 * `Worker` message replies, `queueMicrotask`, `MutationObserver`, `IntersectionObserver`,
 * `fetch`, `element.animate` finishing, `WebSocket` / `EventSource` messages, dynamic `import()`,
 * a bare promise chain off something not wrapped, and any `setTimeout` handed a STRING
 * handler (wrapping that would mean re-entering `eval`). A false negative degrades to
 * the behavior that shipped before this change; a false positive trains authors to
 * ignore the warning, so the asymmetry is deliberate in that direction.
 *
 * ═══ HOW ATTRIBUTION WORKS, AND WHERE IT STOPS ═══
 *
 * Installed via `page.evaluateOnNewDocument`, so it patches before the document's first
 * script and survives every re-navigation (initial, auto-split, rails). At schedule time
 * it asks `document.currentScript` who is calling:
 *   - a `<script>` carrying `ENGINE_SCRIPT_ATTR` is OURS                 -> not tracked;
 *   - any other `<script>` came from deck markdown (`lib/engine/index.js` sets
 *     markdown-it `html: true`, which passes raw HTML straight through)  -> tracked;
 *   - `null` -> UNKNOWN PROVENANCE, and deliberately NOT tracked.
 *
 * That last line is where the rest of the false negatives live. `document.currentScript`
 * is null inside a `<script type="module">` and inside any promise continuation.
 * Defaulting the unknown case to "authored" would have been the worse error, and not
 * hypothetically: the export's own overflow watcher schedules from inside
 * `settleFonts(...).then(check)`, where `currentScript` is null, so every deck in the
 * repo would warn. `lint:deck` is the static net for the module case
 * (`lib/authoring/lint-core.js`, rule `author-script-defers`).
 *
 * ONLY THE TOP-LEVEL DOCUMENT installs. `evaluateOnNewDocument` reaches every frame, but
 * only the main frame is ever READ — so installing inside an `<iframe>` would change an
 * embedded document's behavior for zero reporting benefit, and the pipeline explicitly
 * supports embedded frames (`settleDeferredMedia` promotes `<iframe loading="lazy">`).
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
  // Top-level document only — see ONLY THE TOP-LEVEL DOCUMENT in the header. Guarded
  // because a cross-origin `window.top` access can throw rather than answer.
  try { if (W.top && W.top !== W) return; } catch (_e) { return; }
  // Inlined rather than read from the module: this function's source travels alone.
  const MARKER = 'data-lattice-script';
  const pending = new Set();
  W.__latticeAuthorDeferral = { pending };

  // Set while a callback attributed to deck script is on the stack, so work IT
  // schedules inherits the attribution — `document.currentScript` is null inside any
  // callback, and a chained `setTimeout` is the common shape.
  let ctx = null;

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
    };
    pending.add(rec);
    return rec;
  };

  const settle = (rec) => { if (rec) pending.delete(rec); };

  /** Run an attributed callback: it has arrived, so settle it, then keep attribution. */
  const invoke = (rec, fn, self, args) => {
    settle(rec);
    const prev = ctx;
    ctx = { slide: rec.slide, where: rec.where };
    try { return fn.apply(self, args); } finally { ctx = prev; }
  };

  // TIMERS. `setTimeout` and `setInterval` share ONE id space per spec (the list of
  // active timers), which is why one map is correct here — and why the first cut, which
  // also put rAF/rIC ids in it, had two id spaces colliding: `clearTimeout(t)` settled
  // whichever record happened to share the number.
  //
  // A repeating interval is settled by its FIRST tick, not by ending: an interval never
  // ends, and a clock that has ticked once has already written what the export captures.
  const byId = new Map();
  const wrapTimer = (name, cancelName) => {
    const orig = W[name];
    const cancel = W[cancelName];
    if (typeof orig !== 'function') return;
    W[name] = (fn, ...rest) => {
      // A string handler cannot be wrapped without re-entering `eval`; pass it through
      // rather than change what the deck asked for.
      if (typeof fn !== 'function') return orig.call(W, fn, ...rest);
      const rec = track(name, `${Math.round(Number(rest[0]) || 0)}ms`);
      if (!rec) return orig.call(W, fn, ...rest);
      // `...rest` goes to the ORIGINAL, so the browser delivers the trailing arguments
      // itself and hands them to this wrapper; `...cbArgs` forwards whatever arrived.
      // The wrapper never builds an argument list of its own (prime directive #1).
      let id;
      try {
        id = orig.call(W, (...cbArgs) => {
          // Dropped here as well as on cancel: a record left keyed by a fired timer's id
          // is never reachable again, and a long render can fire hundreds of thousands.
          byId.delete(id);
          return invoke(rec, fn, W, cbArgs);
        }, ...rest);
      } catch (e) {
        // Nothing was scheduled, so nothing is outstanding. Re-thrown unchanged.
        settle(rec);
        throw e;
      }
      byId.set(id, rec);
      return id;
    };
    if (typeof cancel === 'function') {
      W[cancelName] = (id, ...rest) => {
        // A canceled callback is not lost content — the deck said never mind.
        settle(byId.get(id));
        byId.delete(id);
        return cancel.call(W, id, ...rest);
      };
    }
  };
  wrapTimer('setTimeout', 'clearTimeout');
  wrapTimer('setInterval', 'clearInterval');

  // NETWORK. `load` waits for the resources the DOCUMENT declares; it does not wait for a
  // request a script starts, which is the same hole one layer down. XHR is observable
  // without perturbation — `addEventListener('loadend')` is purely additive.
  //
  // `fetch` IS NOT WRAPPED, and that is the prime directive winning over a feature I had
  // working. Settling the record means attaching to the deck's promise, and BOTH ways of
  // doing that change the page — measured in a real render, not argued:
  //   · `p.then(settle, settle)` marks `p` handled and resolves the derived promise, so a
  //     deck that paints a fallback from `unhandledrejection` STOPPED PAINTING it;
  //   · re-throwing from the rejection arm leaves a derived rejection in flight, so a deck
  //     that correctly `.catch`es its fetch got a SPURIOUS `unhandledrejection` — measured
  //     as the fallback overwriting a slide that had rendered fine.
  // There is no third option: observing a promise's outcome is what marks it handled. So a
  // pending `fetch` is a false negative at capture, listed with the others above, and
  // `lint:deck` names `fetch(` statically instead.
  const XHR = W.XMLHttpRequest;
  const origOpen = XHR?.prototype?.open;
  const origSend = XHR?.prototype?.send;
  if (typeof origOpen === 'function' && typeof origSend === 'function') {
    // These two stay `function`s: they are prototype methods and need their own `this`.
    XHR.prototype.open = function (...args) {
      try {
        // Non-enumerable, so the probe does not show up in `Object.keys(xhr)` or in a
        // deck's `JSON.stringify` of one.
        Object.defineProperty(this, '__latticeUrl', {
          value: String(args[1] || ''), configurable: true, writable: true, enumerable: false,
        });
      } catch (_e) { /* frozen instance — the record just carries no URL */ }
      return origOpen.apply(this, args);
    };
    XHR.prototype.send = function (...args) {
      const rec = track('XMLHttpRequest', this.__latticeUrl || '');
      if (rec) this.addEventListener('loadend', () => settle(rec));
      try {
        return origSend.apply(this, args);
      } catch (e) {
        settle(rec);
        throw e;
      }
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
    pending: [...state.pending].map((r) => ({ kind: r.kind, detail: r.detail, slide: r.slide, where: r.where })),
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
 *
 * THE WORDING IS ABOUT THE TASK, NOT ABOUT LOST CONTENT, and that is a correction. What
 * the probe knows is that a scheduled task had not run; whether the author MEANT it to
 * paint something is not knowable from here. An earlier draft asserted the content was
 * missing, which reads as a lie on the one shape that is common and harmless — a long
 * housekeeping `setInterval` that writes nothing to the DOM. The first line now states
 * what happened; the follow-up states what it means for the file.
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
    `  ⚠ ${n} deck-authored script task${n === 1 ? '' : 's'} had not run when the export captured:`,
  ];
  for (const row of rows.slice(0, MAX_DEFERRAL_LINES)) {
    const at = row.slide ? `slide ${row.slide}` : 'deck';
    const call = row.detail ? `${row.kind}(${row.detail})` : row.kind;
    lines.push(`      ${at} · ${row.where} · ${call}${row.count > 1 ? ` × ${row.count}` : ''}`);
  }
  if (rows.length > MAX_DEFERRAL_LINES) {
    lines.push(`      … and ${rows.length - MAX_DEFERRAL_LINES} more`);
  }
  lines.push('    The export captures at the load event plus an explicit media settle; it does not wait on author timers,');
  lines.push('    so anything those tasks would have written is NOT in this file.');
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
