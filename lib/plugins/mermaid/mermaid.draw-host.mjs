/**
 * lib/plugins/mermaid/mermaid.draw-host.mjs — Mermaid's half that runs in the HOST page of a sandboxed draw frame.
 *
 * The host (docs/src/lib/preview-draw-host-impl.ts) calls `prepare` on a job before it crosses to the frame and `finish` on the
 * frame's answer before the page sees it. The frame's answer is text from a frame that ran a library over an author's definition, so it
 * is untrusted: `finish` puts the svg through the diagram sanitizer and holds a gantt's links to the schemes a link in a deck may use.
 * `env` is the host's: `fonts(asks)` (keeps the font faces the frame may load), `sanitize.diagram(svg)` and `sanitize.slide(html)`.
 */

// `/` or `\` followed by another `/` or `\` would be a protocol-relative link to another site.
const SAFE_LINK = /^(?:https?:|mailto:|#|\/(?![/\\])|\.)/i;

export function prepare(job, env) {
  return { ...job, fonts: env.fonts(job.fonts) };
}

export function finish(raw, env) {
  const fig = JSON.parse(raw);
  const svg = env.sanitize.diagram(fig.svg);
  // A URL parser drops tabs and newlines, so `/<tab>/host` is a link to another site: they leave before the check, and the cleaned link is the one kept.
  const links = (Array.isArray(fig.links) ? fig.links : [])
    .filter((l) => Array.isArray(l) && typeof l[0] === 'string' && typeof l[1] === 'string')
    .map((l) => [l[0], l[1].replace(/[\t\n\r]/g, '')])
    .filter((l) => SAFE_LINK.test(l[1]));
  return JSON.stringify({ svg, type: String(fig.type || ''), links });
}
