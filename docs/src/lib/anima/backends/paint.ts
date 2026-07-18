// Anima backends — shared paint helpers. Token colours are resolved to a concrete value
// AT PAINT TIME by reading the host's computed CSS (palette-blind authoring, HARD RULE #3):
// the same scene recolours with the theme, and a theme switch re-resolves on the next draw.
// DOM-touching, so it lives under backends/ (the pure core stays DOM-free).

/** Resolve ANY colour expression — `var(--token)`, `light-dark(...)` (how Lattice themes
 *  define tokens), `hsl()/oklch()`, a hex, a keyword — to a concrete, NORMALIZED `rgb()`/
 *  `rgba()` string, by probing the browser's own computed style in the host's context (so
 *  the theme's custom props + color-scheme apply). Normalizing to rgb is what lets
 *  `withAlpha` add `reveal` opacity to any theme token format (the trio flagged that
 *  `light-dark(...)`/`hsl()` values slip past a rgb/hex-only parser). In a real browser this
 *  yields a normalized `rgb()`; in jsdom `getComputedStyle` doesn't resolve the cascade so it
 *  returns the literal input (harmless — withAlpha passes a non-rgb string through, and the
 *  byte-stable poster gate runs in real Chromium). Backends resolve ONCE (per mount) and
 *  cache the rgb, so a live theme switch requires a RE-MOUNT (the host's responsibility). */
export function resolveColor(color: string | undefined, host: Element, fallback = '#888888'): string {
  if (!color) return fallback;
  const doc = host.ownerDocument;
  const win = doc?.defaultView;
  if (!doc || !win) return fallback;
  const probe = doc.createElement('span');
  probe.style.color = color; // 'var(--accent)', 'light-dark(#a,#b)', '#hex', … — anything CSS accepts
  probe.style.position = 'absolute';
  probe.style.width = '0';
  probe.style.height = '0';
  probe.style.overflow = 'hidden';
  host.appendChild(probe); // inherit the host's custom properties + color-scheme
  try {
    const computed = win.getComputedStyle(probe).color;
    return computed && computed !== '' ? computed : fallback;
  } finally {
    probe.remove(); // never leave the probe attached, even if getComputedStyle throws
  }
}

/** Apply `alpha` (0..1) to a concrete colour, so `reveal` reads as OPACITY. Handles
 *  `rgb()/rgba()` (what getComputedStyle returns) and `#rgb/#rrggbb`; other forms pass
 *  through unchanged (alpha 1 is a no-op anyway). */
export function withAlpha(color: string, alpha: number): string {
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  if (a >= 1) return color;
  const c = color.trim();
  const rgb = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${a})`;
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1];
    const full = h.length === 3 ? h.split('').map((d) => d + d).join('') : h;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return color;
}
