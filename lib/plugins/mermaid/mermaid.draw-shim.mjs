/**
 * lib/plugins/mermaid/mermaid.draw-shim.mjs — the preview frame's STAND-IN for `window.mermaid`.
 *
 * A preview whose embedding page offers a draw host (docs/src/lib/preview-draw-host.ts; lib/runtime/index.js reads it through
 * `window.parent`) never loads Mermaid into the deck's page. The runtime's Mermaid pass (`mermaid.hydrate.js`) is left
 * exactly as it is — its render queue, its per-palette `initialize`, its SVG cache, its gantt turn, its settle cap — and
 * this object answers the three calls it makes (`initialize`, `render`, `mermaidAPI.getDiagramFromText`) by sending
 * the work out to the host's sandboxed draw frame (lib/packages/draw-frame-core.mjs) and handing back what the library
 * returned, sanitized by the host.
 *
 * WHAT THE LIBRARY DID IN THE PAGE AND THIS DOES INSTEAD
 *   - `render(id, source)`   → `{ svg, diagramType, bindFunctions }`, drawn in the frame against the config last passed to
 *                              `initialize` and the deck's own font faces (the frame has no network but may load fonts from the engine's two font folders its policy names).
 *   - tooltips               Mermaid's flowchart and class `bindFunctions` read a `title` the library put on each
 *                            `g.clickable`; ours is a plain hover binder over the same attribute (`tooltipBinder`).
 *   - gantt links            the frame sends the chart's links with its drawing, and `getDiagramFromText(source)`
 *                            answers them from the render that just ran (the pass reads them right after `render`).
 *   - a click CALLBACK       is not offered, as at `securityLevel: 'strict'`, where Mermaid's own click-callback path returns early.
 *
 * Imported by the runtime only: unlike `host-browser.mjs`, this file is not serialized into the CLI's export page.
 */

const LINKS_MAX = 64;
const TIP_PROPS = new Set(['background', 'background-color', 'color', 'border', 'border-color', 'border-radius', 'padding', 'font-family', 'font-size', 'max-width', 'text-align']);
const FAMILY = /^[A-Za-z0-9 _-]{1,64}$/;

/** The first font family of a CSS list, unquoted, and the rest in order. */
function families(list) {
  return String(list || '')
    .split(',')
    .map((f) => f.trim().replace(/^["']|["']$/g, ''))
    .filter((f) => FAMILY.test(f));
}

/** The `@font-face` rules of a document for the given families: `[{ family, weight, style, url }]`. */
export function fontAsks(doc, wanted) {
  const want = new Set(wanted.map((f) => f.toLowerCase()));
  const asks = [];
  if (!want.size) return asks;
  for (const sheet of Array.from(doc.styleSheets || [])) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch (_e) {
      continue; // a sheet from another origin: not ours to read
    }
    for (const rule of Array.from(rules || [])) {
      if (!rule.style || rule.type !== 5 /* CSSRule.FONT_FACE_RULE */) continue;
      const family = String(rule.style.getPropertyValue('font-family') || '').trim().replace(/^["']|["']$/g, '');
      if (!want.has(family.toLowerCase()) || !FAMILY.test(family)) continue;
      const weight = String(rule.style.getPropertyValue('font-weight') || '400').trim().split(/\s+/)[0];
      const style = String(rule.style.getPropertyValue('font-style') || 'normal').trim() === 'italic' ? 'italic' : 'normal';
      const url = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(rule.style.getPropertyValue('src') || rule.cssText || '');
      if (url && /^[1-9]00$/.test(weight)) asks.push({ family, weight, style, url: url[1] });
    }
  }
  return asks;
}

/**
 * Hover tooltips for a drawn flowchart or class diagram: the `title` the library put on each `g.clickable`, shown in
 * one `div.mermaidTooltip` the way Mermaid's own binder showed it (the runtime pins that node, `pinMermaidTooltip`). Bound
 * inside the target it is handed, so it is safe to replay on a cached drawing.
 */
export function tooltipBinder(doc) {
  return (target) => {
    const nodes = target.querySelectorAll('g.clickable[title]');
    if (!nodes.length) return;
    let tip = doc.querySelector('body > .mermaidTooltip');
    if (!tip) {
      tip = doc.createElement('div');
      tip.className = 'mermaidTooltip';
      tip.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;z-index:100;max-width:200px;padding:2px;text-align:center;font-size:12px;border:1px solid currentColor;border-radius:2px;background:Canvas;color:CanvasText';
      // The look is the diagram's own: its sheet carries a `div.mermaidTooltip` rule in the diagram's palette, which the library's
      // own tooltip picked up because its sheet is document-wide. Only the plain look properties are taken from it.
      for (const st of target.querySelectorAll('style')) {
        const rule = /div\.mermaidTooltip\s*\{([^}]*)\}/.exec(st.textContent || '');
        if (!rule) continue;
        for (const decl of rule[1].split(';')) {
          const at = decl.indexOf(':');
          const prop = decl.slice(0, at).trim().toLowerCase();
          if (at > 0 && TIP_PROPS.has(prop)) tip.style.setProperty(prop, decl.slice(at + 1).replace(/!important/i, '').trim());
        }
        break;
      }
      (doc.body || doc.documentElement).appendChild(tip);
    }
    for (const node of nodes) {
      const text = node.getAttribute('title');
      // The native tooltip would double ours; the text moves to a data attribute.
      node.setAttribute('data-lattice-tip', text);
      node.removeAttribute('title');
      node.addEventListener('mouseover', (e) => {
        tip.textContent = text;
        tip.style.opacity = '0.9';
        tip.style.left = `${e.clientX + 12}px`;
        tip.style.top = `${e.clientY + 12}px`;
      });
      node.addEventListener('mouseout', () => {
        tip.style.opacity = '0';
      });
    }
  };
}

/**
 * A fresh gantt's click binding at `strict`, scoped to the target it is handed: the library ids a task's bar
 * `${svgId}-${taskId}` and its label `${svgId}-${taskId}-text`, and a click opens the link in place. The frame's own binder cannot cross
 * `postMessage`, and the pass's cache hand-back (`ganttLinkBinder` in `mermaid.hydrate.js`) only covers a SECOND draw.
 */
export function ganttBinder(svgId, links) {
  const urlById = new Map();
  for (const [taskId, url] of links) {
    urlById.set(`${svgId}-${taskId}`, url);
    urlById.set(`${svgId}-${taskId}-text`, url);
  }
  return (target) => {
    for (const el of target.querySelectorAll('[id]')) {
      const url = urlById.get(el.id);
      if (url !== undefined) el.addEventListener('click', () => { window.open(url, '_self'); });
    }
  };
}

/**
 * @param {{ draw: (job: object) => Promise<string> }} drawHost  the page's host (`window.parent.__latticeDrawHost`)
 * @param {Document} doc                                          the preview frame's document, for its font faces and its width
 */
export function createShim(drawHost, doc) {
  let config = {};
  const linksBySource = new Map();
  const binder = tooltipBinder(doc);
  const REPLAY = new Set(['flowchart', 'flowchart-v2', 'flowchart-elk', 'class', 'classDiagram']);

  function stage() {
    const w = Math.round(doc.body?.clientWidth || 0);
    return w >= 200 ? w : 1200;
  }

  return {
    // True once the host stops offering Mermaid (its frame could not load): the Mermaid pass then no longer takes this object for the library and
    // loads the real one (`isRealMermaidLibrary`). `kinds` is read live from the host.
    get __latticeStale() {
      const kinds = drawHost?.kinds;
      return Array.isArray(kinds) && !kinds.includes('mermaid');
    },
    version: 'draw-host',
    startOnLoad: false,
    initialize(next) {
      // The runtime always passes its whole config, so this replaces; the library's own defaults apply in the frame.
      config = next && typeof next === 'object' ? JSON.parse(JSON.stringify(next)) : {};
    },
    async render(id, source) {
      const family = families(config.themeVariables?.fontFamily || config.fontFamily);
      const answer = await drawHost.draw({
        kind: 'mermaid',
        definition: String(source),
        svgId: String(id),
        config,
        stage: stage(),
        fonts: fontAsks(doc, family),
      });
      let figure;
      try {
        figure = JSON.parse(answer);
      } catch (_e) {
        throw new Error('the draw host answered something that is not a figure');
      }
      if (!figure || typeof figure.svg !== 'string') throw new Error('Mermaid produced no SVG');
      const links = Array.isArray(figure.links) ? figure.links : [];
      if (links.length) {
        linksBySource.delete(String(source));
        linksBySource.set(String(source), links);
        while (linksBySource.size > LINKS_MAX) linksBySource.delete(linksBySource.keys().next().value);
      }
      const bindFunctions = REPLAY.has(figure.type) ? binder : figure.type === 'gantt' && links.length ? ganttBinder(String(id), links) : undefined;
      return { svg: figure.svg, diagramType: figure.type, bindFunctions };
    },
    // The one other call the Mermaid pass makes: a gantt's links, read right after its render, from the render just made.
    mermaidAPI: {
      async getDiagramFromText(source) {
        const links = linksBySource.get(String(source)) || [];
        return { db: { getLinks: () => new Map(links) } };
      },
    },
  };
}
