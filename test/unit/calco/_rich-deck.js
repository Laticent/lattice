// A deck that exercises every feature Calco's PPTX writer has: shared backgrounds (a color and a
// JPEG), the title, header, footer and page-number roles, a card group with a label, an accent rule
// that wraps a corner, a sub-group (a pill inside a card), a gradient with alt text, round-capped and
// filled paths, a picture with an SVG, a photo, a shadow, dashes, every run style, notes, alt text, a
// picture-less slide, and markup characters in every text channel. The structure, round-trip and
// parity tests read it (engineering/decisions/2026-11-13-native-pptx-writer.md §How it is proven).
const { ONE_PX_PNG, ONE_PX_JPEG, style, frame } = require('./_fixtures');

const card = { kind: 'box', x: 100, y: 100, w: 300, h: 160, radii: [10, 10, 10, 10], fill: { color: '#f2f5fa', alpha: 1 }, stroke: { color: '#898e95', alpha: 1, width: 1 }, shadow: { color: '#000000', alpha: 0.2, x: 0, y: 4, blur: 8 }, group: 0 };
const accent = { kind: 'line', side: 'bottom', x: 110, y: 258.5, w: 280, h: 0, stroke: { color: '#2e608a', alpha: 1, width: 3 }, wrap: [10, 10], group: 0 };
const tag = { kind: 'box', x: 101, y: 101, w: 80, h: 24, radii: [10, 0, 7, 0], fill: { color: '#2e608a', alpha: 1 }, text: 0, group: 0 };
const tagText = frame([[{ text: 'Build', style: style({ size: 12, color: '#ffffff' }) }]], { x: 111, y: 105, w: 40, h: 16, firstLineHeight: 15, lineHeight: 16 });
const body = frame([[{ text: 'Owns the policy.', style: style({ size: 18 }) }]], { x: 120, y: 160, w: 200, h: 24, firstLineHeight: 22, lineHeight: 24, group: 0 });
const rule = { kind: 'line', side: 'bottom', x: 40, y: 500, w: 600, h: 0, stroke: { color: '#898e95', alpha: 0.5, width: 2, dash: 'dash' } };
const pillCard = { kind: 'box', x: 480, y: 90, w: 300, h: 200, radii: [0, 0, 0, 0], fill: { color: '#ffffff', alpha: 1 }, group: 4 };
const pill = { kind: 'box', x: 500, y: 100, w: 120, h: 30, radii: [15, 15, 15, 15], fill: { color: '#ffeedd', alpha: 0.8 }, group: 4, sub: 5 };
const dot = { kind: 'box', x: 505, y: 110, w: 10, h: 10, radii: [5, 5, 5, 5], fill: { color: '#ff0000', alpha: 1 }, group: 4, sub: 5, pseudo: true };
const grad = { kind: 'box', x: 800, y: 300, w: 200, h: 100, radii: [0, 0, 0, 0], fill: { color: '#336699', alpha: 1 }, gradient: { angle: 135, stops: [{ pos: 0, color: '#336699', alpha: 1 }, { pos: 1, color: '#99ccff', alpha: 0.5 }] }, alt: 'A "wash" & <more>' };
const mark = { kind: 'path', x: 850, y: 500, w: 20, h: 20, path: [['M', 0, 10], ['L', 8, 18], ['L', 20, 0]], closed: false, stroke: { color: '#008800', alpha: 1, width: 2, dash: 'dot' }, cap: 'round', join: 'round' };
const filledMark = { kind: 'path', x: 900, y: 500, w: 20, h: 20, path: [['M', 0, 0], ['L', 20, 0], ['C', 20, 10, 10, 20, 0, 20], ['Z']], closed: true, fill: { color: '#880000', alpha: 1 } };
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
const pic = { kind: 'picture', x: 1000, y: 50, w: 100, h: 100, image: ONE_PX_PNG, alt: 'Logo', svg };
const photo = { kind: 'picture', x: 1000, y: 200, w: 100, h: 100, image: ONE_PX_JPEG, photo: true };
const header = (text) => frame([[{ text, style: style({ size: 12 }) }]], { role: 'header', x: 30, y: 24, w: 400, h: 20 });
const footer = (text) => frame([[{ text, style: style({ size: 12, italic: true }) }]], { role: 'footer', x: 30, y: 680, w: 400, h: 20 });
const num = (n) => frame([[{ text: String(n), style: style({ size: 12 }) }]], { role: 'number', x: 1200, y: 680, w: 50, h: 20, align: 'right' });
const title = (text) => frame([[{ text, style: style({ size: 40, weight: 700 }) }]], { role: 'title', x: 64, y: 30, w: 900, h: 60 });
const rich = frame(
  [
    [
      { text: 'Small ', style: style({ smallCaps: true }) },
      { text: 'under', style: style({ underline: true }) },
      { text: ' strike', style: style({ strike: true }) },
      { text: ' faint', style: style({ alpha: 0.5 }) },
      { text: ' flat', style: style({ alpha: 0.5, flatColor: '#888888' }) },
    ],
    [],
    [
      { text: 'hi<&>"\'', style: style({ highlight: '#e6f0f5', letterSpacing: 1.5, transform: 'uppercase', weight: 600 }) },
      { text: '🙂', style: style({ emoji: true, family: 'Noto Color Emoji' }) },
    ],
  ],
  { x: 100, y: 320, w: 600, h: 120, align: 'center', role: 'subtitle' },
);

/** A fresh copy each call: writers must not see one another's mutations. */
module.exports = () => ({
  width: 1280,
  height: 720,
  title: 'Rich & <deck>',
  subject: 'Every feature',
  author: 'Calco test',
  company: 'Lattice · test',
  backgrounds: [{ color: '#003d66' }, { image: ONE_PX_JPEG }],
  slides: [
    {
      image: ONE_PX_PNG,
      background: 0,
      description: 'First "slide" <one>',
      notes: 'Line one\nLine <two> & three',
      frames: [tagText, body, title('One'), header('Deck'), footer('Foot'), num(1), rich],
      shapes: [card, accent, tag, rule, pillCard, pill, dot, grad, mark, filledMark, pic, photo],
    },
    { image: ONE_PX_PNG, background: 0, frames: [title('Two'), header('Deck'), footer('Foot'), num(2)] },
    { image: ONE_PX_JPEG, background: 1, frames: [title('Three'), num(3)], notes: 'Third' },
    { frames: [frame([[{ text: 'No picture slide', style: style() }]])], shapes: [{ ...pic, svg: undefined }] },
  ],
});
