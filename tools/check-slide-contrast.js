#!/usr/bin/env node
/**
 * check-slide-contrast — WCAG AA audit of the ACTUALLY RENDERED slide, not the
 * token table.
 *
 * Complements tools/contrast-audit.js rather than duplicating it (HARD RULE #15).
 * That tool checks each theme's own token matrix — the pairs a palette DECLARES.
 * It structurally cannot see a pairing a COMPONENT invents: `--text-secondary`
 * set on a `--cat-N-fill` panel, `--cat-N-mark` used as a card label, an ink
 * chosen against `--bg-alt` instead of `--bg`. Those only exist once a slide
 * renders. This walks the real DOM of a rendered deck, resolves every text run's
 * effective background by climbing ancestors through transparent paints, and
 * scores WCAG 2.x AA (4.5:1 normal, 3:1 for >=24px or >=18.66px bold). It reads
 * pseudo-element text too, since this engine puts real content there (axis
 * labels, step badges, checkpoint labels).
 *
 * Born from #1207: the token audit was green at 704 pairs while the rendered
 * deck carried 44 sub-AA text runs, several as low as 2.54:1.
 *
 * Usage:  node tools/check-slide-contrast.js <rendered-deck.html> [more.html ...]
 * Exits non-zero if any run falls below its AA threshold. On-demand, not a
 * blocking gate: the "muted chrome" tier (footer, pagination) is WCAG-exempt by
 * palette contract and will always report.
 */
const puppeteer = require('puppeteer');

const PROBE = () => {
  const srgb = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  const parse = (s) => {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg, a) => fg.map((c, i) => c * a + bg[i] * (1 - a));
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

  const effectiveBg = (el) => {
    let node = el, acc = null;
    while (node && node !== document.documentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) {
        acc = acc === null ? { rgb: c.rgb, a: c.a } : { rgb: over(acc.rgb, c.rgb, acc.a), a: 1 };
        if (acc.a >= 1) return acc.rgb;
      }
      node = node.parentElement;
    }
    return acc ? acc.rgb : [255, 255, 255];
  };

  const out = [];
  for (const sec of document.querySelectorAll('section[data-lattice-slide]')) {
    const page = sec.getAttribute('data-lattice-slide');
    const cls = sec.getAttribute('data-class') || '';
    const walker = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    let n;
    while ((n = walker.nextNode())) {
      const t = n.textContent.trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const fs = parseFloat(cs.fontSize);
      if (!fs) continue;
      const fg = parse(cs.color);
      if (!fg) continue;
      const bg = effectiveBg(el);
      const fgc = fg.a < 1 ? over(fg.rgb, bg, fg.a) : fg.rgb;
      const w = parseInt(cs.fontWeight, 10) || 400;
      // WCAG "large text": >=24px, or >=18.66px when bold (>=700)
      const large = fs >= 24 || (fs >= 18.66 && w >= 700);
      out.push({
        page, cls, tag: el.tagName.toLowerCase(),
        text: t.slice(0, 44), fs: +fs.toFixed(1), w, large,
        fg: fgc.map(Math.round), bg: bg.map(Math.round),
        r: +ratio(fgc, bg).toFixed(2), need: large ? 3 : 4.5,
      });
    }
    // pseudo-elements carry real text in this engine (axis labels, badges)
    for (const el of sec.querySelectorAll('*')) {
      for (const pe of ['::before', '::after']) {
        const cs = getComputedStyle(el, pe);
        const content = cs.content;
        if (!content || content === 'none' || content === 'normal') continue;
        if (!/[A-Za-z0-9]/.test(content)) continue;
        const fs = parseFloat(cs.fontSize); if (!fs) continue;
        const fg = parse(cs.color); if (!fg) continue;
        const bg = effectiveBg(el);
        const fgc = fg.a < 1 ? over(fg.rgb, bg, fg.a) : fg.rgb;
        const w = parseInt(cs.fontWeight, 10) || 400;
        const large = fs >= 24 || (fs >= 18.66 && w >= 700);
        out.push({
          page, cls, tag: el.tagName.toLowerCase() + pe,
          text: content.replace(/^"|"$/g, '').slice(0, 44), fs: +fs.toFixed(1), w, large,
          fg: fgc.map(Math.round), bg: bg.map(Math.round),
          r: +ratio(fgc, bg).toFixed(2), need: large ? 3 : 4.5,
        });
      }
    }
  }
  return out;
};

(async () => {
  const files = process.argv.slice(2);
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    args: ['--no-sandbox', '--font-render-hinting=none'],
  });
  let fails = 0, total = 0;
  for (const f of files) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await page.goto('file://' + require('path').resolve(f), { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 400));
    const rows = await page.evaluate(PROBE);
    total += rows.length;
    const bad = rows.filter((x) => x.r < x.need);
    console.log(`\n${'='.repeat(78)}\n${f}  —  ${rows.length} text runs, ${bad.length} below AA\n${'='.repeat(78)}`);
    for (const b of bad) {
      fails++;
      console.log(
        `  p${String(b.page).padStart(2)} ${b.cls.padEnd(30).slice(0, 30)} ${b.tag.padEnd(14)}` +
        ` ${String(b.fs).padStart(5)}px/${String(b.w).padEnd(3)} ${b.r.toFixed(2)}:1 (need ${b.need})` +
        `  fg rgb(${b.fg}) on rgb(${b.bg})\n      "${b.text}"`
      );
    }
    // font-size report for the matrix axis labels specifically
    const axis = rows.filter((x) => /REACH|COGNITION/i.test(x.text));
    if (axis.length) {
      console.log('  ── axis label sizes ──');
      for (const a of axis) console.log(`     ${a.text.padEnd(24)} ${a.fs}px  weight ${a.w}  ${a.r}:1`);
    }
    await page.close();
  }
  await browser.close();
  console.log(`\n${'='.repeat(78)}\n${total} runs checked · ${fails} below AA\n`);
  process.exit(fails ? 1 : 0);
})();
