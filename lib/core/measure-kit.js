/**
 * measure-kit — the live preview's way of learning an item's shape before it packs a layout.
 *
 * Mosaico (docs/src/lib/mosaico) packs boxes from their aspect ratios and never waits. A host that
 * reads those ratios from a browser needs the same four things each time, and `collage` and
 * `logo-wall` used to carry two private copies (decision note §4.5, §8 item 4):
 *
 *   1. MEASURE   — `aspectOfImage` reads a loaded `<img>`; `remember` keeps any aspect by URL.
 *   2. REMEMBER  — one aspect per URL for the life of the document, so a slide seen before stamps
 *                  in the same task, before its first paint. A failed read is forgotten and retried.
 *   3. HOLD      — `run` marks the list `measuring` (the host's CSS hides it), waits for every item
 *                  (capped), then calls `finish` once. A second `run` on the same list is a no-op.
 *   4. SIGNAL    — every run registers on its document, so a caller outside the runtime (a Studio
 *                  export) can wait for `idle(ms)` and then `settle()` whatever is still measuring.
 *                  Reach it at `doc.__latticeMeasure`.
 *
 * THE STABILITY RULE (§4.5, "a re-layout must not shuffle the page"): a list is packed ONCE, when
 * its items are known or the cap passes, never re-packed on each late arrival. `run` enforces it by
 * ignoring a second `finish` and a second `run` on the same list.
 *
 * Pure of layout: this file decides WHEN to pack, never HOW. The host's `finish` calls its planner.
 * No dependency, no layout read: it runs in jsdom as it does in a browser.
 */

const DEFAULT_CAP_MS = 4000;
const REGISTRY = '__latticeMeasure';

// One aspect per key for the life of the module (the life of the document: each preview frame loads
// its own runtime). A value, or a Promise of one while it is fetched; a failed read is forgotten.
const MEMORY = new Map();

/**
 * Resolve an aspect by key, once. `load` returns a number, null, or a Promise of either; a Promise
 * is shared by every caller until it settles. A null is NOT kept, so a later visit tries again, unless
 * `keepNull`: the read succeeded and the thing has no shape (a fetched SVG with no size), so asking again
 * would only repeat the answer. A rejection is never kept.
 * @param {string} key
 * @param {() => (number|null|Promise<number|null>)} load
 * @returns {number|null|Promise<number|null>}
 */
function remember(key, load, { keepNull = false } = {}) {
  if (MEMORY.has(key)) return MEMORY.get(key);
  let got;
  try {
    got = load();
  } catch {
    return null;
  }
  if (!got || typeof got.then !== 'function') {
    if ((Number.isFinite(got) && got > 0) || (keepNull && got === null)) MEMORY.set(key, got);
    return got ?? null;
  }
  const pending = got.then(
    (v) => {
      if ((Number.isFinite(v) && v > 0) || (keepNull && v === null)) MEMORY.set(key, v);
      else MEMORY.delete(key);
      return v ?? null;
    },
    () => {
      MEMORY.delete(key);
      return null;
    },
  );
  MEMORY.set(key, pending);
  return pending;
}

const forget = () => MEMORY.clear(); // for tests

/** Width / height from a loaded image, or null (unloaded, broken, or no size). */
function aspectNow(img) {
  return img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : null;
}

/**
 * An image's aspect: a number when it is known now, a Promise of one while it loads. `complete` is
 * true for an image that loaded AND for one that failed; a failed image will never fire `load` or
 * `error` again, so waiting on it would only burn the cap.
 */
function aspectOfImage(img) {
  // A loaded image knows its own size: that beats any memory of its URL.
  const key = img.currentSrc || img.src || '';
  if (img.complete) {
    const a = aspectNow(img);
    if (key) {
      if (a) MEMORY.set(key, a);
      else MEMORY.delete(key); // broken now: do not answer a later revisit with an old shape
    }
    return a;
  }
  // Not loaded yet. A URL measured before (the Studio re-creates a slide's images on a revisit) is known.
  const wait = () =>
    new Promise((res) => {
      const done = () => res(aspectNow(img));
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });
  return key ? remember(key, wait) : wait();
}

/** The document's registry of runs still measuring. Created on first use. */
function registryOf(doc) {
  if (!doc) return null;
  if (doc[REGISTRY]) return doc[REGISTRY];
  const runs = new Set();
  const waiters = new Set();
  doc[REGISTRY] = {
    runs,
    notify() {
      for (const w of [...waiters]) w();
    },
    /** Resolve true as soon as nothing is measuring, false at `ms` with something still pending. */
    idle(ms = DEFAULT_CAP_MS) {
      if (!runs.size) return Promise.resolve(true);
      return new Promise((res) => {
        const check = () => {
          if (runs.size) return;
          clearTimeout(timer);
          waiters.delete(check);
          res(true);
        };
        const timer = setTimeout(() => {
          waiters.delete(check);
          res(false);
        }, ms);
        waiters.add(check);
      });
    },
    /** Finish every run still measuring with what is known now (the cap, early). Returns how many. */
    settle() {
      const open = [...runs];
      for (const r of open) r.cap();
      return open.length;
    },
  };
  return doc[REGISTRY];
}

const MEASURING = new WeakSet(); // lists a run is already measuring

/**
 * Measure a list's items, then call `finish` once.
 *
 * The list takes `data-<attr>="measuring"` at once, so a second pass of the runtime (it re-runs the
 * passes from a MutationObserver) finds nothing to start. `finish(values)` is expected to set the
 * attribute to its final mode, as the hosts did before this kit.
 *
 * @param {object} o
 * @param {Element} o.list       the element that carries the attribute
 * @param {string}  o.attr       the data attribute name, e.g. `data-collage`
 * @param {(() => (number|null|Promise<number|null>))[]} o.sources  one reader per item, in order
 * @param {(values: (number|null)[]) => void} o.finish   called once; null where unknown
 * @param {number} [o.cap]       ms before it finishes with whatever is known
 * @returns {boolean} false when a run is already measuring this list
 */
function run({ list, attr, sources, finish, cap = DEFAULT_CAP_MS }) {
  if (MEASURING.has(list)) return false;
  MEASURING.add(list);
  list.setAttribute(attr, 'measuring');
  const reg = registryOf(list.ownerDocument);
  const values = sources.map(() => null);
  let done = false;
  let timer = null;
  const entry = { cap: () => end() };
  function end() {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    MEASURING.delete(list);
    reg?.runs.delete(entry);
    try {
      finish(values.slice());
    } catch {
      // A planner that throws must not strand the list hidden: the component's CSS hides `measuring`.
      list.setAttribute(attr, 'fallback');
    } finally {
      reg?.notify();
    }
  }
  reg?.runs.add(entry);
  const reads = sources.map((read, i) => {
    let got;
    try {
      got = read();
    } catch {
      got = null;
    }
    if (got && typeof got.then === 'function') return got.then((v) => { values[i] = v ?? null; }, () => {});
    values[i] = got ?? null;
    return null;
  });
  const pending = reads.filter(Boolean);
  // Every aspect known already (inline marks, a list seen before, loaded images): finish now, in the
  // same task, so the list paints once, packed.
  if (!pending.length) {
    end();
    return true;
  }
  timer = setTimeout(end, cap);
  Promise.all(pending).then(end);
  return true;
}

module.exports = { run, remember, forget, aspectOfImage, aspectNow, registryOf, DEFAULT_CAP_MS, REGISTRY };
