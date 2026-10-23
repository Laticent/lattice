/**
 * lib/plugins/mermaid/mermaid.draw-frame.js — Mermaid's half that runs INSIDE the sandboxed draw frame.
 *
 * The frame's kernel (lib/packages/draw-frame-core.mjs) loads the library, owns the message protocol and the size and
 * length limits, and calls `draw(job, env)` for each job; this function answers the figure as text. `env` is the kernel's:
 * `lib` (Mermaid's global), `box` (a laid-out container), `faces(list)` (loads font faces the text is measured in),
 * `PX` (the largest size a job may ask for). The function is self-contained: its text is hashed into the frame's one script,
 * so it names nothing outside itself (the registry build enforces it, as it does for a hydrate function).
 *
 * What comes back is `{ svg, type, links }` as JSON: the host's half (mermaid.draw-host.mjs) sanitizes the svg and filters the links.
 */
async function draw(m, env) {
  const lib = env.lib;
  if (!lib || typeof lib.render !== 'function') throw new Error('mermaid did not load');
  if (typeof m.definition !== 'string' || typeof m.svgId !== 'string' || !m.config || typeof m.config !== 'object') throw new Error('a mermaid draw needs a definition, an id and a config');
  if (m.fonts !== undefined) await env.faces(m.fonts);
  env.box.style.width = (Number.isInteger(m.stage) && m.stage >= 200 && m.stage <= env.PX ? m.stage : 1200) + 'px';
  lib.initialize(m.config);
  const r = await lib.render(m.svgId, m.definition, env.box);
  if (!r || typeof r.svg !== 'string' || r.svg.indexOf('<svg') < 0) throw new Error('mermaid resolved without producing an SVG');
  let links = [];
  if (r.diagramType === 'gantt' && /click/i.test(m.definition)) {
    try {
      const d = await lib.mermaidAPI.getDiagramFromText(m.definition);
      const l = d?.db?.getLinks?.();
      if (l) links = [...l].map((e) => [String(e[0]), String(e[1])]);
    } catch (_e) {
      /* a gantt without links still draws */
    }
  }
  return JSON.stringify({ svg: r.svg, type: String(r.diagramType || ''), links });
}

module.exports = { draw };
