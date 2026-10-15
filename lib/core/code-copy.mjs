/**
 * lib/core/code-copy.mjs — the copy buttons on a code block: "Copy code" (the plain source) and
 * "Copy as HTML" (the highlighted block with the theme's colors written inline, so it pastes colored
 * into a document, a slide tool or an email). engineering/decisions/2026-10-15-code-plugin.md §9.7.
 *
 * OFF BY DEFAULT. A block opts in with `@code{copy}` and a deck with `code: copy`; the code plugin
 * marks such a block `<pre data-copy>` (lib/plugins/code/code.render.js). Nothing else draws a button.
 *
 * READING SURFACES ONLY. The buttons are drawn by script, never by the render, so no export carries
 * them: a PDF, a PPTX, an image or a video is captured from markup that holds only the marker. Two
 * hosts call this, each behind its own "a person is reading this" gate:
 *   - the bundled runtime (lib/runtime/index.js), only on a document whose builder stamped
 *     `<html data-lattice-live-media>` — the Studio preview, the Playground, Present — and never on a
 *     capture frame, which is built without it (lib/core/image-painting.js explains the flag), nor on
 *     a thumbnail (`data-lattice-thumbnail`, every tile of the Studio's preview pool) or a specimen;
 *   - the HTML player (lib/export/player-core.mjs), which ships no runtime: it inlines this function
 *     by its source text, and skips it while a video is recorded from the player.
 * code.styles.css hides the buttons in print and on a section being exported, as a backstop.
 *
 * SELF-CONTAINED, because the player inlines it with `.toString()`: it names nothing outside its own
 * body except the window it is handed. It builds every element with createElement (no markup sink,
 * HARD RULE #22), and the HTML it copies is a styled CLONE of the block's own text, read back with
 * `outerHTML`, never parsed from a string.
 *
 * @param {Window} win
 * @returns {{ install: () => number, copy: (button: Element, nav?: Navigator) => Promise<boolean> }}
 *   `install` decorates every marked block not yet decorated and returns how many; `copy` runs a
 *   button's copy with a given navigator (the Studio's parent page clicks through a preview frame
 *   that takes no pointer events, and writes with its own clipboard)
 */
export function codeCopy(win) {
  const doc = win.document;
  const SVG = 'http://www.w3.org/2000/svg';
  const KINDS = [
    { kind: 'text', label: 'Copy code', shapes: [['rect', { x: 8, y: 8, width: 12, height: 12, rx: 2 }], ['path', { d: 'M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3' }]] },
    { kind: 'html', label: 'Copy as HTML', shapes: [['path', { d: 'M8 7l-5 5 5 5' }], ['path', { d: 'M16 7l5 5-5 5' }], ['path', { d: 'M13.5 5l-3 14' }]] },
  ];
  const CHECK = [['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }]];

  function icon(shapes) {
    const svg = doc.createElementNS(SVG, 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(k, v);
    for (const [tag, attrs] of shapes) {
      const el = doc.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      svg.append(el);
    }
    return svg;
  }

  /** The block's code exactly: its text, without the one trailing newline a fence ends with. */
  function textOf(pre) {
    const code = pre.querySelector('code') || pre;
    return (code.textContent || '').replace(/\n$/, '');
  }

  /**
   * The block as standalone HTML: a `<pre>` holding a clone of the code's TEXT, each run wrapped in a
   * span with its computed color and style written inline, so it keeps its look anywhere it is pasted.
   * Only text is cloned (no attribute, no class), so nothing of the deck but its visible code travels.
   */
  function styledOf(pre) {
    const code = pre.querySelector('code') || pre;
    const cs = win.getComputedStyle(pre);
    const out = doc.createElement('pre');
    out.style.cssText = [
      `background:${cs.backgroundColor}`, `color:${cs.color}`, `font-family:${cs.fontFamily}`,
      'font-size:13px', 'line-height:1.5', 'padding:12px 16px', 'border-radius:8px', 'white-space:pre', 'overflow-x:auto',
    ].join(';');
    const walker = doc.createTreeWalker(code, 4 /* NodeFilter.SHOW_TEXT */);
    const runs = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) runs.push(n);
    runs.forEach((n, i) => {
      const value = i === runs.length - 1 ? n.nodeValue.replace(/\n$/, '') : n.nodeValue;
      if (!value) return;
      const s = win.getComputedStyle(n.parentElement || code);
      const span = doc.createElement('span');
      span.style.color = s.color;
      if (s.fontStyle === 'italic') span.style.fontStyle = 'italic';
      if (Number(s.fontWeight) >= 600) span.style.fontWeight = '600';
      if (s.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor)) span.style.backgroundColor = s.backgroundColor;
      // A run styled like the one before it joins it, so the pasted HTML is a span per color change.
      const last = out.lastChild;
      if (last && last.style.cssText === span.style.cssText) {
        last.textContent += value;
        return;
      }
      span.textContent = value;
      out.append(span);
    });
    return out;
  }

  /** The last-resort copy, for a page the clipboard API refuses (an insecure origin, an old browser). */
  function copyBySelection(node) {
    const holder = doc.createElement('div');
    holder.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;white-space:pre';
    holder.append(node);
    doc.body.append(holder);
    const range = doc.createRange();
    range.selectNodeContents(holder);
    const sel = win.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    let ok = false;
    try {
      ok = doc.execCommand('copy');
    } catch (_e) {
      ok = false;
    }
    sel.removeAllRanges();
    holder.remove();
    return ok;
  }

  async function write(pre, kind, nav) {
    const text = textOf(pre);
    const html = kind === 'html' ? styledOf(pre) : null;
    const clip = nav?.clipboard;
    try {
      if (html && clip?.write && win.ClipboardItem) {
        await clip.write([new win.ClipboardItem({
          'text/html': new win.Blob([html.outerHTML], { type: 'text/html' }),
          'text/plain': new win.Blob([text], { type: 'text/plain' }),
        })]);
        return true;
      }
      if (!html && clip?.writeText) {
        await clip.writeText(text);
        return true;
      }
    } catch (_e) {
      /* refused: fall through to the selection copy */
    }
    if (html) return copyBySelection(html);
    const t = doc.createElement('span');
    t.textContent = text;
    return copyBySelection(t);
  }

  function settle(button, ok, label) {
    const svg = button.querySelector('svg');
    button.setAttribute('data-copied', ok ? 'yes' : 'no');
    button.setAttribute('aria-label', ok ? 'Copied' : 'Copy blocked by the browser');
    if (ok && svg) svg.replaceWith(icon(CHECK));
    win.clearTimeout(button.__latCopyTimer);
    button.__latCopyTimer = win.setTimeout(() => {
      button.removeAttribute('data-copied');
      button.setAttribute('aria-label', label);
      const now = button.querySelector('svg');
      const k = KINDS.find((x) => x.kind === button.getAttribute('data-kind'));
      if (now && k) now.replaceWith(icon(k.shapes));
    }, 1600);
  }

  async function copy(button, nav = win.navigator) {
    const pre = button.closest('pre[data-copy]');
    const k = KINDS.find((x) => x.kind === button.getAttribute('data-kind'));
    if (!pre || !k) return false;
    const ok = await write(pre, k.kind, nav);
    settle(button, ok, k.label);
    return ok;
  }

  function install() {
    let n = 0;
    for (const pre of doc.querySelectorAll('pre[data-copy]:not([data-copy-ready])')) {
      pre.setAttribute('data-copy-ready', '');
      const bar = doc.createElement('div');
      bar.className = 'lat-code-copy';
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', 'Copy this code');
      for (const k of KINDS) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'lat-code-copy-btn';
        b.setAttribute('data-kind', k.kind);
        b.setAttribute('aria-label', k.label);
        b.append(icon(k.shapes));
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          copy(b);
        });
        bar.append(b);
      }
      pre.prepend(bar);
      n += 1;
    }
    return n;
  }

  return { install, copy };
}
