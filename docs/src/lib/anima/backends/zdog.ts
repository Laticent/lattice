// Anima — the Zdog backend: the canonical vector engine (ADR §7). It builds a Zdog
// Anchor tree from the scene (mirroring the IR's nesting — child anchors compose under
// parents, which is why compound motion works), renders to an <svg> (crisp in a PDF
// poster), and on each `draw(state)` updates every node's local transform + reveal (as
// opacity) by id. Zdog is the one engine dep here, allowlisted in the boundary gate
// (ANIMA_ADAPTER_DEPS); the pure core imports none of it.

// @ts-expect-error zdog ships no type declarations; the untyped seams are contained below (ZNode = any).
import Zdog from 'zdog';
import type { RendererCaps } from '../caps';
import type { Renderer } from '../renderer';
import type { BuiltElement, Scene, SceneState, ShapeProps } from '../types';
import { resolveColor, withAlpha } from './paint';

export const ZDOG_CAPS: RendererCaps = {
  vector: true,
  poster: true,
  draw: false,
  true3d: false,
  gltf: false,
  live: true,
  source: ['built'],
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_SIZE = 240; // px, square viewport
const D = 60; // default primary dimension (scene-local units)

export interface ZdogOptions {
  size?: number; // svg pixel size (square)
  zoom?: number; // Illustration zoom (default fits the default dimension range)
}

// biome-ignore lint/suspicious/noExplicitAny: Zdog ships no types; the seams are contained here.
type ZNode = any;

/** Build one Zdog node for a built element (no children yet — the caller recurses). */
function makeNode(el: BuiltElement, parent: ZNode, host: Element): ZNode {
  const p: ShapeProps = el.props ?? {};
  const color = resolveColor(el.color, host);
  const stroke = p.stroke ?? undefined;
  const common = { addTo: parent, color };
  switch (el.shape) {
    case 'group':
      return new Zdog.Anchor({ addTo: parent });
    case 'shape':
      return new Zdog.Shape({ ...common, stroke: p.stroke ?? 12 });
    case 'rect':
      return new Zdog.Rect({ ...common, width: p.width ?? D, height: p.height ?? D, stroke: stroke ?? 4, fill: p.fill ?? false });
    case 'rounded-rect':
      return new Zdog.RoundedRect({ ...common, width: p.width ?? D, height: p.height ?? D, cornerRadius: p.size ?? 12, stroke: stroke ?? 4, fill: p.fill ?? false });
    case 'ellipse':
      return new Zdog.Ellipse({ ...common, diameter: p.diameter ?? p.size ?? D, stroke: stroke ?? 4, fill: p.fill ?? false });
    case 'polygon':
      return new Zdog.Polygon({ ...common, radius: p.size ?? D / 2, sides: p.sides ?? 6, stroke: stroke ?? 4, fill: p.fill ?? false });
    case 'cone':
      return new Zdog.Cone({ ...common, diameter: p.diameter ?? D, length: p.length ?? D, stroke: stroke ?? 1, fill: p.fill ?? true });
    case 'box':
      return new Zdog.Box({ ...common, width: p.width ?? D, height: p.height ?? D, depth: p.depth ?? D, stroke: stroke ?? 1, fill: p.fill ?? true });
    case 'cylinder':
      return new Zdog.Cylinder({ ...common, diameter: p.diameter ?? D, length: p.length ?? D, stroke: stroke ?? 1, fill: p.fill ?? true });
    case 'hemisphere':
      return new Zdog.Hemisphere({ ...common, diameter: p.diameter ?? D, stroke: stroke ?? 1, fill: p.fill ?? true });
    default:
      return new Zdog.Anchor({ addTo: parent });
  }
}

export function zdogRenderer(opts: ZdogOptions = {}): Renderer {
  const size = opts.size ?? DEFAULT_SIZE;
  let host: Element | null = null;
  let svg: SVGSVGElement | null = null;
  let illo: ZNode = null;
  const nodes = new Map<string, ZNode>();
  const baseColor = new Map<string, string | undefined>(); // id → authored token (for re-resolve)

  function build(scene: Scene, into: Element): void {
    const doc = into.ownerDocument;
    if (!doc) throw new Error('zdogRenderer.mount: host has no ownerDocument');
    svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    into.appendChild(svg);
    illo = new Zdog.Illustration({ element: svg, zoom: opts.zoom ?? 1 });
    if (typeof illo.setSize === 'function') illo.setSize(size, size);

    if (scene.source !== 'built') return; // svg scenes are Vivus's; nothing to build here
    const walk = (els: BuiltElement[], parent: ZNode): void => {
      for (const el of els) {
        const node = makeNode(el, parent, into);
        nodes.set(el.id, node);
        baseColor.set(el.id, el.color);
        if (el.children?.length) walk(el.children, node);
      }
    };
    walk(scene.elements, illo);
  }

  function apply(state: SceneState): void {
    if (!illo || !host) return;
    const h: Element = host; // capture the non-null host for the nested walk
    // Apply the scene camera to the Illustration root (a whole-scene rotation).
    if (illo.rotate) {
      illo.rotate.x = state.camera.rotate[0];
      illo.rotate.y = state.camera.rotate[1];
      illo.rotate.z = state.camera.rotate[2];
    }
    const walk = (els: SceneState['elements']): void => {
      for (const es of els) {
        const node = nodes.get(es.id);
        if (node) {
          if (node.translate) {
            node.translate.x = es.transform.at[0];
            node.translate.y = es.transform.at[1];
            node.translate.z = es.transform.at[2];
          }
          if (node.rotate) {
            node.rotate.x = es.transform.rotate[0];
            node.rotate.y = es.transform.rotate[1];
            node.rotate.z = es.transform.rotate[2];
          }
          if (node.scale) {
            const s = es.transform.scale;
            node.scale.x = s;
            node.scale.y = s;
            node.scale.z = s;
          }
          node.visible = es.visible;
          if ('color' in node) node.color = withAlpha(resolveColor(baseColor.get(es.id), h), es.reveal);
        }
        if (es.children.length) walk(es.children);
      }
    };
    walk(state.elements);
    illo.updateRenderGraph();
  }

  const renderer: Renderer = {
    caps: ZDOG_CAPS,
    mount(target, scene) {
      host = target;
      build(scene, target);
    },
    draw(state) {
      apply(state);
    },
    poster(state) {
      apply(state);
      return { svg: svg ? svg.outerHTML : '', width: size, height: size };
    },
    dispose() {
      if (svg?.parentNode) svg.parentNode.removeChild(svg);
      nodes.clear();
      baseColor.clear();
      illo = null;
      svg = null;
      host = null;
    },
  };
  return renderer;
}
