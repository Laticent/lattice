// Probe for decks/runtime-off-notice.md (PR 3362): the kit's runtime-off notice, in a real VS Code preview.
//
// At VS Code's default `strict` level our runtime never runs, and the kit's linked stylesheet draws a notice across the top
// of the preview (tools/build-marp-vscode-css.js RUNTIME_OFF_NOTICE). With the runtime allowed (`disable`) the notice is
// gone and the coda is drawn. PROBE_LEVEL names the level, so the probe knows which outcome passes:
//
//   PROBE_LEVEL=strict node tools/vscode-preview-probe.mjs --host desktop --level strict --edits 0 \
//     --deck tools/vscode-harness/decks/runtime-off-notice.md --probe tools/vscode-harness/probes/runtime-off-notice.mjs
//   PROBE_LEVEL=disable ... --level disable ... (the same deck and probe)
//
// The notice fades in 1.5 s after load, and VS Code can re-create the preview frame meanwhile, so every read finds the
// live frame again. The deck carries the kit's `<link rel="stylesheet">` line: without it the notice's CSS never loads
// (the kit registers directive-only theme stubs, engineering/gotchas/vscode.md).
async function preview(page) {
  for (const f of page.frames()) {
    try { if (await f.evaluate(() => document.body?.classList.contains('marp-vscode'))) return f; } catch { /* detached */ }
  }
  return null;
}
const read = () => {
  const before = getComputedStyle(document.body, '::before');
  const on = before.content && before.content !== 'none';
  return {
    runtime: document.documentElement.hasAttribute('data-lattice-runtime'),
    notice: on ? before.content.slice(0, 120) : null,
    noticeHeight: on ? before.height : null,
    noticeOpacity: before.opacity, noticeColor: before.color, noticeBackground: before.backgroundColor,
    noticePosition: before.position,
    codaCells: document.querySelectorAll('.cell-coda').length,
    insights: document.querySelectorAll('.cell-coda > blockquote').length,
    slides: document.querySelectorAll('section').length,
  };
};
export const diagrams = Number(process.env.PROBE_LEVEL === "disable"); // wait for the runtime to draw the deck's one diagram
export async function probe({ page, frame, sleep }) {
  const level = process.env.PROBE_LEVEL || 'strict';
  let got = null;
  for (let i = 0; i < 50; i++) { // bounded at about 10 s
    const f = (await preview(page)) || frame;
    try { got = await f.evaluate(read); } catch { got = null; }
    if (got && (level !== 'strict' || got.noticeOpacity === '1')) break;
    await sleep(200);
  }
  got ||= { error: 'no live preview frame' };
  got.pass = level === 'strict'
    ? !got.runtime && !!got.notice && got.noticeOpacity === '1'
    : got.runtime && !got.notice && got.codaCells > 0;
  got.level = level;
  return got;
}
