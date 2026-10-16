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
 *     a chromeless frame (`data-lattice-chromeless`: the Studio's tiles and Present) or a specimen;
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
  /**
   * The code's text nodes, in order, minus the alignment space a `diff` block adds to a line the author
   * left unmarked (`data-pad`, code.render.js): the copy is the source as written. A diff's own `+`,
   * `-` and ` ` markers are the author's and stay.
   */
  function runsOf(code) {
    const walker = doc.createTreeWalker(code, 4 /* NodeFilter.SHOW_TEXT */);
    const runs = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.parentElement?.closest('[data-pad]')) runs.push(n);
    }
    return runs;
  }

  /**
   * Plain mode ends on the fence's own newline, which is not part of the code. Line mode (numbers,
   * focus, wrap, diff) joins its rows with newlines and has no final one to drop: stripping one there
   * would lose a blank last line the author wrote.
   */
  function trailing(code) {
    return code.querySelector('.ln') ? null : /\n$/;
  }

  function textOf(pre) {
    const code = pre.querySelector('code') || pre;
    const text = runsOf(code).map((n) => n.nodeValue).join('');
    const tail = trailing(code);
    return tail ? text.replace(tail, '') : text;
  }

  /** No paint at all: a background a run or a row does not set. */
  const CLEAR = /^(?:transparent|rgba\(0, 0, 0, 0\)|color\(srgb 0 0 0 \/ 0\))$/;

  /**
   * A computed color as `rgb()`/`rgba()`. Chromium reports a `color-mix()` result (the diff and mark
   * bands, code.styles.css) as `color(srgb r g b / a)`, which a word processor or a mail client pasting
   * the HTML does not read, so the band would be dropped. Anything else is returned as computed.
   */
  function legacy(c) {
    const m = /^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)$/.exec(String(c));
    if (!m) return c;
    const [r, g, b] = [m[1], m[2], m[3]].map((v) => Math.round(Math.min(1, Math.max(0, Number(v))) * 255));
    const a = m[4] === undefined ? 1 : Number(m[4]);
    return a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
  }

  /**
   * The block as standalone HTML: a `<pre>` holding a clone of the code's TEXT, each run wrapped in a
   * span with its computed color and style written inline, so it keeps its look anywhere it is pasted.
   * Only text is cloned (no attribute, no class), so nothing of the deck but its visible code travels.
   *
   * A LINE'S BAND travels too. A `diff` line's inserted/deleted band and a `mark=` line's tint are the
   * background of its `.ln` row, not of any run in it, so a row that paints one becomes a full-width
   * span with that background around its runs, as the panel draws it.
   */
  function styledOf(pre) {
    const code = pre.querySelector('code') || pre;
    const cs = win.getComputedStyle(pre);
    const out = doc.createElement('pre');
    out.style.cssText = [
      `background:${legacy(cs.backgroundColor)}`, `color:${legacy(cs.color)}`, `font-family:${cs.fontFamily}`,
      'font-size:13px', 'line-height:1.5', 'padding:12px 16px', 'border-radius:8px', 'white-space:pre', 'overflow-x:auto',
    ].join(';');
    const runs = runsOf(code);
    const tail = trailing(code);
    let row = null; // the `.ln` row the last band came from
    let band = null; // the span carrying that row's background
    runs.forEach((n, i) => {
      const value = i === runs.length - 1 && tail ? n.nodeValue.replace(tail, '') : n.nodeValue;
      if (!value) return;
      const ln = n.parentElement?.closest('.ln');
      if (ln !== row) {
        row = ln && code.contains(ln) ? ln : null;
        band = null;
        const bg = row ? win.getComputedStyle(row).backgroundColor : '';
        if (bg && !CLEAR.test(bg)) {
          band = doc.createElement('span');
          band.style.cssText = `display:inline-block;min-width:100%;background-color:${legacy(bg)}`;
          out.append(band);
        }
      }
      const into = band || out;
      const s = win.getComputedStyle(n.parentElement || code);
      const span = doc.createElement('span');
      span.style.color = legacy(s.color);
      if (s.fontStyle === 'italic') span.style.fontStyle = 'italic';
      if (Number(s.fontWeight) >= 600) span.style.fontWeight = '600';
      // A run's own background, unless it is the row's band showing through.
      const own = n.parentElement && n.parentElement !== row ? s.backgroundColor : '';
      if (own && !CLEAR.test(own)) span.style.backgroundColor = legacy(own);
      // A run styled like the one before it joins it, so the pasted HTML is a span per color change.
      const last = into.lastChild;
      if (last && last.style.cssText === span.style.cssText) {
        last.textContent += value;
        return;
      }
      span.textContent = value;
      into.append(span);
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
      // In the block's title bar, which the render draws for every copy block, so the buttons take
      // their own room and never sit over code. A block from an older render has no bar: the
      // buttons then float at the panel's top right, as they used to.
      const head = pre.querySelector(':scope > .lat-code-title');
      if (head) head.append(bar);
      else pre.prepend(bar);
      n += 1;
    }
    return n;
  }

  return { install, copy };
}
