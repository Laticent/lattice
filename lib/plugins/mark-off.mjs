/**
 * lib/plugins/mark-off.mjs — write the engine's `data-lattice-off` marker on a page the ENGINE did
 * not render (spec/LPM.md §3.2.1).
 *
 * The engine marks what belongs to a plugin the deck did not load — a drawn fence's `<pre>`, an
 * extension-point filler's `<section>` — and every browser pass skips a marked element. An
 * Export-to-Marp bundle is rendered by Marp's own markdown-it, so nothing is marked there, and the
 * runtime it carries would draw every Mermaid fence and build every chart. The export records the
 * plugins its producer's admission left off in the bundle's settings block (`pluginsOff`,
 * lib/core/export-settings.js), and the runtime calls this before any pass, so the bundle honors
 * the deck's admission as the engine's markup does.
 *
 * Plain DOM, no plugin named: the fences come from the registry's runtime-drawn record, the
 * sections from whoever offers a slot (a transformer's `plugin` + `layouts`).
 *
 * @param {ParentNode} root
 * @param {Iterable<string>} off  plugin names to mark
 * Inline-code kinds too (`inline`, the registry's `contributes.inline` rows): a `<code>` span that
 * opens with an off plugin's sigil and a brace (`^{database}`) gets the marker the engine's
 * `offPlugin` stamp writes, so the runtime's inline pass leaves it as the author wrote it.
 *
 * @param {{ drawn?: Record<string, { fences: readonly string[] }>,
 *           owners?: ReadonlyArray<{ plugin?: string, layouts?: readonly string[] }>,
 *           inline?: ReadonlyArray<{ plugin?: string, sigil?: string }> }} [from]
 * @returns {number} elements newly marked
 */
export function markPluginsOff(root, off, { drawn = {}, owners = [], inline = [] } = {}) {
  const names = new Set(off || []);
  if (!names.size || !root || typeof root.querySelectorAll !== 'function') return 0;
  let n = 0;
  const mark = (el, name) => {
    if (el.hasAttribute('data-lattice-off')) return;
    el.setAttribute('data-lattice-off', name);
    n++;
  };
  for (const name of names) {
    for (const fence of drawn[name]?.fences || []) {
      if (!/^[a-z][a-z0-9-]*$/i.test(fence)) continue;
      // BY SUBSTRING, as the pass reads a fence (`code[class*="language-<fence>"]`, so its own
      // defanged `language-<fence>-source` still counts): whatever the pass would draw is what is
      // marked. Matching the whole class word missed `language-mermaid-source`, which the pass draws.
      for (const code of root.querySelectorAll(`:is(pre,marp-pre) > code[class*="language-${fence}"]`)) mark(code.parentElement, name);
    }
  }
  for (const owner of owners) {
    if (!owner?.plugin || !names.has(owner.plugin)) continue;
    for (const layout of owner.layouts || []) {
      if (!/^[a-z][a-z0-9-]*$/.test(layout)) continue;
      for (const section of root.querySelectorAll(`section.${layout}`)) mark(section, owner.plugin);
    }
  }
  const sigils = inline.filter((k) => k?.plugin && names.has(k.plugin) && typeof k.sigil === 'string' && k.sigil.length === 1);
  if (sigils.length) {
    for (const code of root.querySelectorAll('section code')) {
      if (code.closest('pre, marp-pre')) continue;
      const text = (code.textContent || '').trimStart();
      for (const k of sigils) if (text.startsWith(`${k.sigil}{`)) { mark(code, k.plugin); break; }
    }
  }
  return n;
}
