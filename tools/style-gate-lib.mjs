/**
 * The computed-style fingerprint shared by the two style gates: `tools/style-needs-audit.mjs` (CLI
 * renders, `-c` subsets) and `tools/style-loader-gate.mjs` (the sheets the Playground's loader built).
 * One element, one hash of every computed property plus ::before and ::after; one list per media setting.
 * `pageFingerprint` and `pageTokenFingerprint` run INSIDE the page, so each must stay self-contained.
 */

export function pageFingerprint() {
  const els = [...document.querySelectorAll('section, section *')];
  // Custom properties are left out of the hash on purpose: a token declared in a module the document
  // never uses is inert unless a rule reads it, and a rule that reads it shows up in the ordinary
  // properties. Reported separately (`tokens`) because script that reads tokens at run time (charts,
  // diagrams) does depend on them.
  const props = (cs) => {
    let s = '';
    for (let i = 0; i < cs.length; i++) if (!cs[i].startsWith('--')) s += `${cs[i]}:${cs.getPropertyValue(cs[i])};`;
    return s;
  };
  const h = (s) => {
    let x = 2166136261;
    for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
    return x >>> 0;
  };
  return els.map((el) => h(props(getComputedStyle(el)) + props(getComputedStyle(el, '::before')) + props(getComputedStyle(el, '::after'))));
}

// Custom properties on the section only (they inherit down), as one hash per slide.
export function pageTokenFingerprint() {
  const h = (s) => {
    let x = 2166136261;
    for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
    return x >>> 0;
  };
  return [...document.querySelectorAll('section')].map((el) => {
    const cs = getComputedStyle(el);
    let s = '';
    for (let i = 0; i < cs.length; i++) if (cs[i].startsWith('--')) s += `${cs[i]}:${cs.getPropertyValue(cs[i])};`;
    return h(s);
  });
}

export async function open(browser, file) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`file://${file}`);
  await page.waitForTimeout(400);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

export async function fingerprints(page) {
  const out = {};
  for (const [name, setup] of [
    ['screen', { media: 'screen', colorScheme: 'light' }],
    ['print', { media: 'print', colorScheme: 'light' }],
    ['dark', { media: 'screen', colorScheme: 'dark' }],
  ]) {
    await page.emulateMedia(setup);
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' }).catch(() => {});
    out[name] = await page.evaluate(pageFingerprint);
    if (name === 'screen') out.tokens = await page.evaluate(pageTokenFingerprint);
  }
  return out;
}
