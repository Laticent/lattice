// Anima backends — shared paint helpers. Token colours are resolved to a concrete value
// AT PAINT TIME by reading the host's computed CSS (palette-blind authoring, HARD RULE #3):
// the same scene recolours with the theme, and a theme switch re-resolves on the next draw.
// DOM-touching, so it lives under backends/ (the pure core stays DOM-free).

/** Resolve a `var(--token)` (with optional `var(--fallback)`) against the host's computed
 *  style; a non-token string passes through; anything unresolved falls back to `fallback`. */
export function resolveColor(color: string | undefined, host: Element, fallback = '#888888'): string {
  if (!color) return fallback;
  const raw = color.trim();
  const m = raw.match(/^var\(\s*--([a-z0-9_-]+)\s*(?:,\s*(.+))?\)$/i);
  if (!m) return raw; // already a concrete colour
  const cs = host.ownerDocument?.defaultView?.getComputedStyle(host);
  const val = cs?.getPropertyValue(`--${m[1]}`).trim();
  if (val) return val;
  // Fallback expression (e.g. `var(--a, var(--b))`) — recurse; else the literal fallback.
  if (m[2]) return resolveColor(m[2].trim(), host, fallback);
  return fallback;
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
