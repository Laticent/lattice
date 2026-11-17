// Cenno styles — the one stylesheet, as a string the host injects once (`createCenno` does it).
//
// Cenno never paints a color of its own. Every visual property reads a `--cenno-*` token, and the
// defaults are declared ONCE, on `:root` (and `:host`, for a card mounted in a shadow root), with
// the browser's SYSTEM colors (`Canvas`, `CanvasText`, `GrayText`), so an unstyled card already
// follows light and dark mode. The defaults sit inside `:where()`, which has no specificity, so a
// host's `:root { --cenno-bg: … }` (or a value on any ancestor, or a class on the card) always wins:
// the Studio maps its app theme, the player maps the deck's theme. Every other selector is wrapped
// in `:where()` for the same reason.
//
// Positioning is set from script through the CSSOM (`style.transform`, custom properties), which a
// Content Security Policy that blocks inline style ATTRIBUTES still allows.

export const CENNO_CSS = `
:where(:root,:host){--cenno-bg:Canvas;--cenno-fg:CanvasText;--cenno-border:GrayText;--cenno-border-width:1px;
--cenno-radius:.5rem;--cenno-shadow:0 .5rem 1.5rem rgb(0 0 0/.18);--cenno-pad:.625rem .75rem;--cenno-gap:.375rem;
--cenno-max-width:20rem;--cenno-line-height:1.45;--cenno-arrow-size:.625rem;--cenno-motion:120ms}
:where(.cenno){position:fixed;inset:auto;left:0;top:0;margin:0;box-sizing:border-box;display:block;
width:max-content;max-width:min(var(--cenno-max-width),var(--cenno-room-w,100vw));padding:0;overflow:visible;
background:var(--cenno-bg);color:var(--cenno-fg);
border:var(--cenno-border-width) solid var(--cenno-border);border-radius:var(--cenno-radius);
box-shadow:var(--cenno-shadow);
line-height:var(--cenno-line-height);transform-origin:0 0;z-index:2147483647;overflow-wrap:anywhere}
:where(.cenno[data-cenno-hidden]){visibility:hidden}
:where(.cenno[data-cenno-inert]){pointer-events:none}
:where(.cenno[data-cenno-enter]){animation:cenno-in var(--cenno-motion) ease-out}
@keyframes cenno-in{from{opacity:0}}
@media (prefers-reduced-motion:reduce){:where(.cenno){animation:none}}
:where(.cenno [data-cenno-part=content]){display:flex;flex-direction:column;gap:var(--cenno-gap);
padding:var(--cenno-pad);max-height:var(--cenno-room-h,none);overflow:auto;overscroll-behavior:contain;
border-radius:inherit}
:where(.cenno [data-cenno-part=header]){display:flex;align-items:center;gap:.5rem;font-weight:600}
:where(.cenno [data-cenno-part=title]){flex:1 1 auto;min-width:0}
:where(.cenno [data-cenno-part=lead]),:where(.cenno [data-cenno-part=value]){flex:none}
:where(.cenno [data-cenno-part=value]){font-variant-numeric:tabular-nums;opacity:.75}
:where(.cenno [data-cenno-part=footer]){font-size:.8125em;opacity:.75}
:where(.cenno [data-cenno-part=arrow]){position:absolute;box-sizing:border-box;
width:var(--cenno-arrow-size);height:var(--cenno-arrow-size);background:inherit;
border:inherit;border-radius:0;rotate:45deg}
:where(.cenno[data-cenno-side=bottom] [data-cenno-part=arrow]){top:calc(var(--cenno-arrow-size)/-2);left:var(--cenno-arrow-offset,0);border-right:none;border-bottom:none}
:where(.cenno[data-cenno-side=top] [data-cenno-part=arrow]){bottom:calc(var(--cenno-arrow-size)/-2);left:var(--cenno-arrow-offset,0);border-left:none;border-top:none}
:where(.cenno[data-cenno-side=right] [data-cenno-part=arrow]){left:calc(var(--cenno-arrow-size)/-2);top:var(--cenno-arrow-offset,0);border-right:none;border-top:none}
:where(.cenno[data-cenno-side=left] [data-cenno-part=arrow]){right:calc(var(--cenno-arrow-size)/-2);top:var(--cenno-arrow-offset,0);border-left:none;border-bottom:none}
@media print{:where(.cenno){display:none}}
`
	.replace(/\n/g, '')
	.trim();
