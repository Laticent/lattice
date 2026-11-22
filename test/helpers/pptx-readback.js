// Read a .pptx back into what a person sees and edits: per slide, every object in paint order (groups flattened,
// with the group path), its frame in EMU, geometry, fill, outline, shadow, picture bytes (as a hash), alt text,
// placeholder role, and its text, paragraph by paragraph and run by run (font, size, weight, slant, color,
// spacing, caps, field). The layout each slide uses is read the same way, with its background and whether it shows
// the master's own shapes (`showMaster`, false for `showMasterSp="0"`), and the slide master once per package. Ids, XML
// formatting, attribute order and part names are left out on purpose: they may change, the content may not.
//
// Used by the parity test (test/unit/calco/pptx-parity.test.js) and the structure test. jsdom's DOMParser parses
// each part, so a part that is not well-formed XML throws here.
const crypto = require('node:crypto');
const JSZip = require('jszip');
const { JSDOM } = require('jsdom');

const parser = new new JSDOM('').window.DOMParser();

/** Parse one XML part; throw with the part name when it is not well-formed. */
function parseXml(xml, name = 'part') {
  const doc = parser.parseFromString(xml, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new Error(`${name} is not well-formed XML: ${err.textContent.slice(0, 200)}`);
  return doc;
}

const kids = (el, tag) => (el ? [...el.children].filter((c) => !tag || c.tagName === tag) : []);
const kid = (el, tag) => kids(el, tag)[0];
const num = (v) => (v == null ? undefined : Number(v));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);

/** A paint: `{color, alpha}` from an `a:srgbClr`, or undefined. */
function paint(fillEl) {
  const clr = fillEl && kid(fillEl, 'a:srgbClr');
  if (!clr) return undefined;
  const a = kid(clr, 'a:alpha');
  return { color: clr.getAttribute('val').toUpperCase(), alpha: a ? Number(a.getAttribute('val')) : 100000 };
}

function readFill(spPr) {
  if (!spPr) return undefined;
  const grad = kid(spPr, 'a:gradFill');
  if (grad) {
    return {
      gradient: kids(kid(grad, 'a:gsLst'), 'a:gs').map((gs) => ({ pos: num(gs.getAttribute('pos')), ...paint(gs) })),
      angle: num(kid(grad, 'a:lin')?.getAttribute('ang')),
    };
  }
  return paint(kid(spPr, 'a:solidFill'));
}

function readLine(spPr) {
  const ln = spPr && kid(spPr, 'a:ln');
  if (!ln) return undefined;
  const fill = paint(kid(ln, 'a:solidFill'));
  if (!fill) return undefined; // `<a:ln/>` with no style and `<a:ln><a:noFill/></a:ln>` both draw nothing
  return {
    ...fill,
    w: num(ln.getAttribute('w')),
    dash: kid(ln, 'a:prstDash')?.getAttribute('val') || 'solid',
    cap: ln.getAttribute('cap') || undefined,
    join: kid(ln, 'a:round') ? 'round' : kid(ln, 'a:bevel') ? 'bevel' : undefined,
  };
}

function readShadow(spPr) {
  const sh = spPr && kid(kid(spPr, 'a:effectLst'), 'a:outerShdw');
  if (!sh) return undefined;
  return { blur: num(sh.getAttribute('blurRad')), dist: num(sh.getAttribute('dist')), dir: num(sh.getAttribute('dir')) || 0, ...paint(sh) };
}

function readGeom(spPr) {
  const prst = kid(spPr, 'a:prstGeom');
  if (prst) {
    const gd = kid(kid(prst, 'a:avLst'), 'a:gd');
    // A rounded corner beyond a half-round is drawn as a half-round.
    return { geom: prst.getAttribute('prst'), adj: gd ? Math.min(50000, Number(gd.getAttribute('fmla').replace('val ', ''))) : undefined };
  }
  const cust = kid(spPr, 'a:custGeom');
  if (!cust) return { geom: undefined };
  const path = kid(kid(cust, 'a:pathLst'), 'a:path');
  const pts = [];
  for (const c of kids(path)) {
    const cmd = { 'a:moveTo': 'M', 'a:lnTo': 'L', 'a:cubicBezTo': 'C', 'a:close': 'Z' }[c.tagName];
    pts.push([cmd, ...kids(c, 'a:pt').flatMap((p) => [num(p.getAttribute('x')), num(p.getAttribute('y'))])]);
  }
  return { geom: 'cust', path: pts, pathSize: [num(path.getAttribute('w')), num(path.getAttribute('h'))] };
}

function readRun(r, field) {
  const rPr = kid(r, 'a:rPr');
  const latin = kid(rPr, 'a:latin');
  const fill = paint(kid(rPr, 'a:solidFill'));
  const hl = paint(kid(rPr, 'a:highlight'));
  const flag = (n) => (rPr?.getAttribute(n) === '1' ? true : undefined);
  return {
    t: kid(r, 'a:t')?.textContent ?? '',
    field: field || undefined,
    sz: num(rPr?.getAttribute('sz')),
    b: flag('b'),
    i: flag('i'),
    u: rPr?.getAttribute('u') || undefined,
    strike: rPr?.getAttribute('strike') || undefined,
    cap: rPr?.getAttribute('cap') || undefined,
    spc: num(rPr?.getAttribute('spc')),
    font: latin?.getAttribute('typeface'),
    color: fill?.color,
    alpha: fill?.alpha,
    highlight: hl?.color,
  };
}

function readText(txBody) {
  if (!txBody) return undefined;
  const bodyPr = kid(txBody, 'a:bodyPr');
  const paras = kids(txBody, 'a:p').map((p) => {
    const pPr = kid(p, 'a:pPr');
    const spc = kid(kid(pPr, 'a:lnSpc'), 'a:spcPct');
    return {
      algn: pPr?.getAttribute('algn') || undefined,
      lnSpc: spc ? num(spc.getAttribute('val')) : undefined,
      runs: kids(p)
        .filter((c) => c.tagName === 'a:r' || c.tagName === 'a:fld')
        .map((c) => readRun(c, c.tagName === 'a:fld' ? c.getAttribute('type') : undefined)),
    };
  });
  return {
    wrap: bodyPr?.getAttribute('wrap') || undefined,
    inset: ['lIns', 'tIns', 'rIns', 'bIns'].map((k) => num(bodyPr?.getAttribute(k) ?? 91440)),
    anchor: bodyPr?.getAttribute('anchor') || undefined,
    paras,
  };
}

function readXfrm(spPr) {
  const x = kid(spPr, 'a:xfrm');
  if (!x) return undefined;
  const off = kid(x, 'a:off');
  const ext = kid(x, 'a:ext');
  return [num(off.getAttribute('x')), num(off.getAttribute('y')), num(ext.getAttribute('cx')), num(ext.getAttribute('cy'))];
}

/** Every object in a shape tree, in paint order, groups flattened. `media(rid)` resolves a picture's bytes. */
function readTree(tree, media, groups = []) {
  const out = [];
  for (const el of kids(tree)) {
    if (el.tagName === 'p:grpSp') {
      const name = kid(kid(el, 'p:nvGrpSpPr'), 'p:cNvPr').getAttribute('name');
      out.push(...readTree(el, media, [...groups, name]));
      continue;
    }
    if (el.tagName !== 'p:sp' && el.tagName !== 'p:pic') continue;
    const nv = kid(el, el.tagName === 'p:sp' ? 'p:nvSpPr' : 'p:nvPicPr');
    const c = kid(nv, 'p:cNvPr');
    const ph = kid(kid(nv, 'p:nvPr'), 'p:ph');
    const spPr = kid(el, 'p:spPr');
    const o = {
      kind: el.tagName === 'p:sp' ? 'sp' : 'pic',
      name: ph ? undefined : c.getAttribute('name'),
      descr: c.getAttribute('descr') || undefined,
      ph: ph ? ph.getAttribute('type') || 'obj' : undefined,
      group: groups.length ? groups.join(' / ') : undefined,
      box: readXfrm(spPr),
    };
    if (o.kind === 'pic') {
      const blip = kid(kid(el, 'p:blipFill'), 'a:blip');
      o.image = media(blip.getAttribute('r:embed'));
      const svg = blip.getElementsByTagName('asvg:svgBlip')[0];
      o.svg = svg ? media(svg.getAttribute('r:embed')) : undefined;
      const locks = kid(kid(nv, 'p:cNvPicPr'), 'a:picLocks');
      o.locked = locks?.getAttribute('noMove') === '1' || undefined;
    } else {
      Object.assign(o, readGeom(spPr), { fill: readFill(spPr), line: readLine(spPr), shadow: readShadow(spPr), text: readText(kid(el, 'p:txBody')) });
    }
    out.push(o);
  }
  return out;
}

/** A part's relationships: id → target part name (resolved against the part's folder). */
async function relsOf(zip, partName) {
  const dir = partName.slice(0, partName.lastIndexOf('/'));
  const relsName = `${dir}/_rels/${partName.slice(dir.length + 1)}.rels`;
  const f = zip.file(relsName);
  const out = new Map();
  if (!f) return out;
  const doc = parseXml(await f.async('string'), relsName);
  for (const r of [...doc.getElementsByTagName('Relationship')]) {
    const parts = dir.split('/');
    for (const seg of r.getAttribute('Target').split('/')) {
      if (seg === '..') parts.pop();
      else if (seg !== '.') parts.push(seg);
    }
    out.set(r.getAttribute('Id'), { target: parts.join('/'), type: r.getAttribute('Type').split('/').pop() });
  }
  return out;
}

/** Read a part's tree and background. */
async function readPart(zip, name) {
  const doc = parseXml(await zip.file(name).async('string'), name);
  const rels = await relsOf(zip, name);
  const media = (rid) => {
    const t = rels.get(rid)?.target;
    // The bytes say what a picture is; `.jpg` and `.jpeg` name the same type.
    return t ? `${t.split('.').pop().replace(/^jpg$/, 'jpeg')}:${zip.__hashes.get(t)}` : `missing:${rid}`;
  };
  const cSld = doc.getElementsByTagName('p:cSld')[0];
  const bgPr = kid(kid(cSld, 'p:bg'), 'p:bgPr');
  let bg;
  if (bgPr) {
    const blip = kid(kid(bgPr, 'a:blipFill'), 'a:blip');
    bg = blip ? { image: media(blip.getAttribute('r:embed')) } : { color: paint(kid(bgPr, 'a:solidFill'))?.color };
  }
  return { doc, rels, bg, objects: readTree(kid(cSld, 'p:spTree'), media) };
}

/** Read a whole package. */
async function readPptx(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  zip.__hashes = new Map();
  for (const n of Object.keys(zip.files)) if (n.startsWith('ppt/media/') && !zip.files[n].dir) zip.__hashes.set(n, sha(await zip.file(n).async('nodebuffer')));
  const pres = parseXml(await zip.file('ppt/presentation.xml').async('string'), 'presentation.xml');
  const presRels = await relsOf(zip, 'ppt/presentation.xml');
  const sz = pres.getElementsByTagName('p:sldSz')[0];
  const core = parseXml(await zip.file('docProps/core.xml').async('string'), 'core.xml');
  const coreText = (tag) => core.getElementsByTagName(tag)[0]?.textContent || undefined;
  const fonts = [...pres.getElementsByTagName('p:embeddedFont')].map((ef) => ({
    typeface: kid(ef, 'p:font').getAttribute('typeface'),
    slots: kids(ef).filter((c) => c.tagName !== 'p:font').map((c) => c.tagName.slice(2)),
  }));
  const slides = [];
  for (const id of [...pres.getElementsByTagName('p:sldId')]) {
    const name = presRels.get(id.getAttribute('r:id')).target;
    const slide = await readPart(zip, name);
    const layoutName = [...slide.rels.values()].find((r) => r.type === 'slideLayout').target;
    const layout = await readPart(zip, layoutName);
    const notesName = [...slide.rels.values()].find((r) => r.type === 'notesSlide')?.target;
    let notes = '';
    if (notesName) {
      const nd = parseXml(await zip.file(notesName).async('string'), notesName);
      const body = [...nd.getElementsByTagName('p:sp')].find((sp) => sp.getElementsByTagName('p:ph')[0]?.getAttribute('type') === 'body');
      notes = body ? [...body.getElementsByTagName('a:p')].map((p) => [...p.getElementsByTagName('a:t')].map((t) => t.textContent).join('')).join('\n') : '';
    }
    const showMaster = layout.doc.documentElement.getAttribute('showMasterSp') !== '0';
    slides.push({ layout: { bg: layout.bg, showMaster, objects: layout.objects }, objects: slide.objects, notes: notes.trim() });
  }
  // A slide draws the master's non-placeholder shapes (a running header, a rule) wherever its layout shows the master.
  const masterName = [...presRels.values()].find((r) => r.type === 'slideMaster')?.target;
  const masterPart = masterName ? await readPart(zip, masterName) : undefined;
  const master = masterPart ? { bg: masterPart.bg, objects: masterPart.objects } : undefined;
  return {
    size: [num(sz.getAttribute('cx')), num(sz.getAttribute('cy'))],
    master,
    title: coreText('dc:title'),
    subject: coreText('dc:subject'),
    creator: coreText('dc:creator'),
    fonts,
    slides,
  };
}

module.exports = { readPptx, parseXml };
