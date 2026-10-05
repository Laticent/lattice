/**
 * lib/plugins/drawn-probe.mjs — "does this deck hold a fence a browser runtime draws?", answered
 * from the plugin registry for every surface that used to answer it by naming Mermaid
 * (engineering/decisions/2026-09-27-plugin-system.md §4.8, phase D's browser half).
 *
 * A runtime-drawn plugin (`render.exec.hydrate: "pass"` — Mermaid) declares its fence `as:
 * "code"`: the engine emits the highlighted `<pre><code class="language-<fence>">`, and the
 * plugin's pass draws it later, in the runtime. So until the runtime has tagged it with the host's markup
 * (`data-lattice-hydrate`), the only thing that says "a drawing is owed here" is the code class,
 * and before the engine has run, the fence in the source. Both probes read the fence NAMES from
 * `drawn.generated.mjs`, so a second runtime-drawn plugin is covered the day it lands and no
 * consumer carries a `language-mermaid` roster (the `drawnFenceClasses` ratchet in
 * tools/check-ownership.js).
 *
 * Plain data plus three small functions, and no import but the generated fence names: the
 * Studio's and the Playground's startup JavaScript carries them (docs/route-budget.json), so they
 * are kept minimal. The library's ADDRESS lives apart, in `drawn-library.mjs`, which only
 * lazily loaded code imports — a module that is imported both statically and dynamically keeps
 * its whole namespace in the startup chunk (measured: the payload record, +400 bytes gz).
 */
import { RUNTIME_DRAWN_FENCE_CODE, RUNTIME_DRAWN_FENCES, RUNTIME_DRAWN_OFF, RUNTIME_DRAWN_SOURCE_FENCE } from './drawn.generated.mjs';

/**
 * The fence's `<code>` in a live document, at ANY state: `[class*=]` so the class the runtime
 * defangs it to (`language-<fence>-source`) still matches. For `querySelector`. Never a fence whose
 * `<pre>` carries `data-lattice-off` — the engine's mark for a deck that did not load the plugin.
 */
export const DRAWN_FENCE_CODE = RUNTIME_DRAWN_FENCE_CODE;

/**
 * How many runtime-drawn fence classes this RENDERED markup names. A substring count, like the
 * probes it replaces: a superset (a class name quoted in prose counts too, as does a longer class
 * name that starts with it, and so does the
 * `language-<fence>-source` the runtime defangs a fence to), never a miss, and linear — no regex
 * a hostile deck could make backtrack. Kept this small on purpose: it ships in the Studio's and
 * the Playground's startup JavaScript (docs/route-budget.json).
 * @param {string} html
 */
export function drawnFenceCount(html) {
  const s = String(html || '');
  let n = 0;
  for (const f of RUNTIME_DRAWN_FENCES) n += s.split(`language-${f}`).length - 1;
  // Less every fence of a plugin the deck did not load: the engine marks its `<pre>`
  // (`data-lattice-off="<plugin>"`, one per fence, written straight before its `<code>`), and
  // nothing will draw it.
  for (const m of RUNTIME_DRAWN_OFF) n -= s.split(m).length - 1;
  return Math.max(0, n);
}

/** Does this RENDERED markup hold a runtime-drawn fence? The count, read as a yes/no: one loop to
 * ship, not two. */
export function markupHasDrawnFence(html) {
  return drawnFenceCount(html) > 0;
}

/**
 * Does this Markdown SOURCE open a runtime-drawn fence (or carry the rendered class, for a
 * sample that is already HTML)? The opener reads as the host's own `usesPlugin` probe
 * (lib/plugins/host-grammar.mjs) reads it — any indentation or blockquote markers, three or more
 * backticks or tildes, any whitespace but a newline before the name, and the name ending at
 * anything but a word character or `-` — so this is never narrower than what the CLI bakes. The
 * pattern is generated as a literal (`RUNTIME_DRAWN_SOURCE_FENCE`): smaller in the startup
 * bundle than building it here.
 *
 * A USAGE probe, not admission: it reads no `plugins:` list and no host's default set, so for a deck
 * that did not load the plugin it still answers yes. Every caller uses the answer only to prepare a
 * frame (preload the library, stamp `data-lattice-diagrams`), and that frame then receives the
 * engine's markup, where such a fence is marked `data-lattice-off` and nothing draws or hides it.
 * @param {string} md
 */
export function sourceHasDrawnFence(md) {
  return RUNTIME_DRAWN_SOURCE_FENCE.test(String(md || '')) || markupHasDrawnFence(md);
}
