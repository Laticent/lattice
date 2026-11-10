/**
 * lib/core/media-display.js — THE SHARED DISPLAY LAYER of the media plugins (`image`, `video`): one kernel for the words a
 * media record takes about how it looks, and for the figure's outer markup.
 * engineering/decisions/2026-10-16-media-plugins.md §4.7 (the controls), §4.9 (the approved looks), §4.11 (the guards).
 *
 * A plugin DESCRIBES; the layout it sits in PLACES (§4.7 rule 1). So the words here are only those that say how the thing
 * looks inside the box a layout gives it:
 *
 *   size      `sm` `md` `lg`                                   md by default; never past the layout's box (CSS clamps it)
 *   frame     `mat` `keyline` `float` `device` `corners`       bare, or `frame=mat`; none by default
 *   finish    `nimbus` `halo` `meridian`, strength `nimbus=40`  one finish; strength 20 40 60 80 full (the `backdrop:` scale)
 *   tone      `duotone` `grayscale`, strength `duotone=60`      one tone; full by default
 *   show      `show=title` `show=all` `show=none`               which of the record's words the slide shows (§4.7)
 *   focus     `focus=top` (image only)                          what must stay in view when a layout crops the picture
 *
 * ONE ORDER FOR EVERY SETTING, lowest to highest (§4.7): the deck's register (`image: mat`), then the slide's class
 * (`_class: image-keyline`), then the record's own word, then a PLACING host's override (decision 19). The register factory
 * already resolves the first two into the slide's classes (a slide's word evicts the deck's on its axis), so this kernel
 * reads them from the classes. A flow host overrides nothing; a placing host (collage, `bleed`, the image compositions) lays
 * the figure out itself, so the size and frame it ignores are dropped here, never fought over in CSS (§4.11: no host CSS
 * reaches into a figure).
 *
 * The record's words reach the figure as `data-*` attributes the shared stylesheet (lib/base/base.media.css) reads. The
 * record's TEXT reaches it as `data-lattice-title` / `data-lattice-description`, escaped, filled only from the author's
 * record (§4.5): every reader (narration, the tooltip, the notes, captions) takes the words from there, never from the
 * slide. Pure: no DOM, no fs; bundles into the browser engine.
 */

const { escapeHtml: esc, escapeAttr: escAttr } = require('@laticent/markup');

const SIZES = Object.freeze(['sm', 'md', 'lg']);
const FRAMES = Object.freeze(['mat', 'keyline', 'float', 'device', 'corners']);
const FINISHES = Object.freeze(['nimbus', 'halo', 'meridian']);
const TONES = Object.freeze(['duotone', 'grayscale']);
const STRENGTHS = Object.freeze(['20', '40', '60', '80', 'full']);
const SHOWS = Object.freeze(['title', 'all', 'none']);
const FOCI = Object.freeze(['top', 'bottom', 'left', 'right', 'center']);

/** What the slide shows by default, by kind (§4.7's table): a clip's title tells the room what it is about to watch; a
 *  photo's heading already sets the context. */
const DEFAULT_SHOW = Object.freeze({ image: 'none', video: 'title' });
/** A finish's strength when the author names none, tuned on the demo deck's photographs (§4.7: nimbus fades on bright
 *  photographs, so it starts stronger). The tones default to full. */
const DEFAULT_STRENGTH = Object.freeze({ nimbus: '80', halo: '60', meridian: '60', duotone: 'full', grayscale: 'full' });

/**
 * The record parameters every media kind takes, as Segno slot data (`compileSlot`). Bare words bind by their vocabulary
 * (`lg`, `mat`, `nimbus`); a strength is the finish's or tone's own name with a value (`nimbus=40`), so it can never be
 * mistaken for another bare word.
 * @param {'image'|'video'} kind
 */
function displayParams(kind) {
  const p = {
    size: { type: 'oneOf', values: [...SIZES] },
    frame: { type: 'oneOf', values: [...FRAMES] },
    finish: { type: 'oneOf', values: [...FINISHES] },
    tone: { type: 'oneOf', values: [...TONES] },
    show: { type: 'oneOf', values: [...SHOWS], named: true },
  };
  for (const w of [...FINISHES, ...TONES]) p[w] = { type: 'oneOf', values: [...STRENGTHS], named: true };
  if (kind === 'image') p.focus = { type: 'oneOf', values: [...FOCI], named: true };
  return p;
}

/**
 * The display words a record wrote, or the reason they do not agree. `v` is Segno's bound value.
 * @returns {{ display: object, problem: string|null }}
 */
function readRecordDisplay(v) {
  const d = {};
  let problem = null;
  if (v.size) d.size = String(v.size);
  if (v.frame) d.frame = String(v.frame);
  if (v.show) d.show = String(v.show);
  if (v.focus) d.focus = String(v.focus);
  // A finish named bare (`nimbus`) or by its strength (`nimbus=40`); two different finishes are a contradiction.
  for (const [axis, words] of [['finish', FINISHES], ['tone', TONES]]) {
    const named = words.filter((w) => v[w] != null);
    const all = [...new Set([...(v[axis] ? [String(v[axis])] : []), ...named])];
    if (all.length > 1) problem = problem || `one ${axis} at a time: ${all.join(' and ')}`;
    if (all.length) {
      d[axis] = all[0];
      if (v[all[0]] != null) d[`${axis}Strength`] = String(v[all[0]]);
    }
  }
  return { display: d, problem };
}

/**
 * The display words a slide's classes carry for this kind: the register's (`image-mat`) after the factory let a slide's own
 * class evict the deck's on each axis. A strength rides in the word (`image-nimbus-40`: `nimbus=40` in the front matter).
 * @param {'image'|'video'} kind
 * @param {ReadonlyArray<string>} classes
 */
function classDisplay(kind, classes) {
  const d = {};
  const prefix = `${kind}-`;
  for (const c of classes || []) {
    if (typeof c !== 'string' || !c.startsWith(prefix)) continue;
    const w = c.slice(prefix.length);
    if (SIZES.includes(w)) d.size = w;
    else if (FRAMES.includes(w)) d.frame = w;
    else {
      const [name, strength] = w.split('-');
      const axis = FINISHES.includes(name) ? 'finish' : TONES.includes(name) ? 'tone' : null;
      if (!axis || (strength !== undefined && !STRENGTHS.includes(strength)) || w.split('-').length > 2) continue;
      d[axis] = name;
      if (strength) d[`${axis}Strength`] = strength;
      else delete d[`${axis}Strength`];
    }
  }
  return d;
}

/**
 * The register's words: one axis each, the default first (the plugin manifests' `contributes.registers`, which the register
 * factory builds as it builds `icon:`). Generated from the same lists so the two cannot drift; a test holds the manifests to it.
 */
function registerAxes() {
  const strengthWords = (names) => names.flatMap((n) => [n, ...STRENGTHS.map((s) => `${n}-${s}`)]);
  return {
    size: ['md', 'sm', 'lg'],
    frame: ['unframed', ...FRAMES],
    finish: ['unfinished', ...strengthWords(FINISHES)],
    tone: ['natural', ...strengthWords(TONES)],
  };
}

/** The layouts that seat media figures, from their manifests' `media` field (tools/build-stage-catalog.js). */
const HOSTS = require('./media-hosts.generated.js');

/**
 * The host a figure of this kind sits in on a slide with these classes: the first class that names a layout seating this
 * kind, or null (an ordinary flow, where nothing is overridden).
 * @param {'image'|'video'} kind
 * @param {ReadonlyArray<string>} classes
 * @returns {{ name: string, places: string, kinds: string[], show?: string, ignores?: string[] } | null}
 */
function hostFor(kind, classes) {
  for (const c of classes || []) {
    const h = Object.hasOwn(HOSTS, c) ? HOSTS[c] : null;
    if (h && h.kinds.includes(kind)) return { name: c, ...h };
  }
  return null;
}

/**
 * Resolve every setting in the one order (§4.7): register and slide class → the record's word → a placing host.
 * @param {'image'|'video'} kind
 * @param {object} recordDisplay  readRecordDisplay(...).display
 * @param {{ classes?: ReadonlyArray<string>, host?: ReturnType<typeof hostFor> }} [where]
 */
function resolveDisplay(kind, recordDisplay, where = {}) {
  const d = { size: 'md', show: DEFAULT_SHOW[kind] || 'none', ...classDisplay(kind, where.classes), ...recordDisplay };
  const host = where.host;
  if (host) {
    const placing = host.places !== 'flow';
    const ignores = new Set(host.ignores || []);
    // A host's own `show` default sits below the record's word in a flow host and above it in a placing host (decision 19).
    if (host.show && (placing || !recordDisplay.show)) d.show = host.show;
    // What a placing host lays out itself has nothing to act on, so the figure does not carry it.
    if (ignores.has('size')) d.size = 'md';
    if (ignores.has('frame')) delete d.frame;
    if (ignores.has('finish')) { delete d.finish; delete d.finishStrength; }
    if (ignores.has('tone')) { delete d.tone; delete d.toneStrength; }
  }
  if (d.finish && !d.finishStrength) d.finishStrength = DEFAULT_STRENGTH[d.finish];
  if (d.tone && !d.toneStrength) d.toneStrength = DEFAULT_STRENGTH[d.tone];
  return d;
}

/**
 * The figure's display attributes, in one fixed order so the markup is stable. Every value is one of the kernel's own words,
 * so nothing here can carry author text but the two `data-lattice-*` words, which are escaped.
 * @param {'image'|'video'} kind
 * @param {object} d  resolveDisplay(...)
 * @param {{ title?: string, description?: string }} text
 */
function displayAttrs(kind, d, text = {}) {
  let a = ` data-lattice-media="${kind}" data-size="${d.size}" data-show="${d.show}"`;
  if (d.frame) a += ` data-frame="${d.frame}"`;
  if (d.finish) a += ` data-finish="${d.finish}" data-finish-strength="${d.finishStrength}"`;
  if (d.tone) a += ` data-tone="${d.tone}" data-tone-strength="${d.toneStrength}"`;
  if (d.focus) a += ` data-focus="${d.focus}"`;
  if (text.title) a += ` data-lattice-title="${escAttr(text.title)}"`;
  if (text.description) a += ` data-lattice-description="${escAttr(text.description)}"`;
  return a;
}

/**
 * The record's words as the slide shows them (§4.7): the title and the description each in their own element, so a host's
 * `show=` hides one and not the other, and a screen reader hears each once. A shown title reserves its line even when it is
 * empty (§4.11), so a cold and a warm render lay out the same. A hidden word is not rendered here at all: it still reaches a
 * screen reader through the picture's name (`alt`, `aria-label`) and every other reader through `data-lattice-*`.
 * @param {object} d  resolveDisplay(...)
 * @param {{ title?: string, description?: string }} text
 * @param {{ titleIsName?: boolean }} [opts]  `titleIsName`: the picture is already NAMED by the title (an image's `alt`), so the
 *   visible title is hidden from assistive tech rather than read twice (§4.7, what the test found)
 */
function captionHtml(d, text = {}, opts = {}) {
  const showTitle = d.show === 'title' || d.show === 'all';
  const showDesc = d.show === 'all' && !!text.description;
  if (!showTitle && !showDesc) return '';
  const hide = opts.titleIsName ? ' aria-hidden="true"' : '';
  const title = showTitle ? `<span class="lat-media-title"${hide}>${esc(text.title || '')}</span>` : '';
  const desc = showDesc ? `<span class="lat-media-desc">${esc(text.description)}</span>` : '';
  return `<figcaption class="lat-media-caption">${title}${desc}</figcaption>`;
}

/** The tooltip a pointer shows on screen (§4.7: the title and the description), or ''. */
function tooltip(text = {}) {
  const parts = [text.title, text.description].map((s) => String(s || '').trim()).filter(Boolean);
  return parts.length ? ` title="${escAttr(parts.join(' — '))}"` : '';
}

module.exports = {
  SIZES, FRAMES, FINISHES, TONES, STRENGTHS, SHOWS, FOCI, DEFAULT_SHOW, DEFAULT_STRENGTH,
  displayParams, readRecordDisplay, classDisplay, registerAxes, hostFor, resolveDisplay, displayAttrs, captionHtml, tooltip,
};
