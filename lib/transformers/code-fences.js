/**
 * THE SLOT A PLUGIN'S FENCE RUNS IN (plugin-system §9 decisions 3 and 10; lib/packages/code-door-fence.mjs).
 *
 * A data plugin's `render.js` owns one fence. Like a code package, it runs sandboxed and
 * asynchronously, and the engine's render is synchronous, so this slot runs nothing itself: it
 * hands the deck HTML to a hook the CALLER supplies (`ctx.codeFences.run`), with the two facts only
 * the render knows, each section's deck position and the render's id prefix. Without a hook it
 * returns its input, so a render that uses no plugin fence is byte-identical to one before.
 *
 * WHY LAST, unlike the code-packages slot, which sits right after the charts. A slide package's
 * output is framed like a chart's (the masthead lift, the cell builders), so it runs early. A
 * fence's output wants no framing, and every pass after the door is a pass that can read a
 * stranger's text as something else: `video`, `contact`, `wifi` and `team-profile` build an
 * address from a bullet, `qr` from a link. A plugin that returned `<li>https://…</li>` on a
 * `video` slide had the video pass write that address into a poster `background-image` (the red
 * team, 2026-10-11). Running last stops the engine's passes
 * but not the runtime's DOM pass, so the door also declines the slides a pass rebuilds from text
 * (lib/transformers/rebuilt-classes.js, derived from the registry) and any slide that holds a raw nested `<section>`.
 *
 * The same hook sees a pane's one-slide render as it sees the deck (`applyAllToHtml` runs for both).
 */
const { slideIndexFor, renderIdPrefix } = require('../core/render-ids');

module.exports = {
  name: 'code-fences',
  selector: '',
  applyToHtml(html, ctx) {
    if (typeof ctx?.codeFences?.run !== 'function') return html;
    return ctx.codeFences.run(html, { slideIndex: slideIndexFor, idPrefix: renderIdPrefix() });
  },
};
