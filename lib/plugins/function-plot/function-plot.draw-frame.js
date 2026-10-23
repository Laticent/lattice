/**
 * lib/plugins/function-plot/function-plot.draw-frame.js — function-plot's half that runs INSIDE the sandboxed draw frame.
 *
 * `env` is the kernel's (lib/packages/draw-frame-core.mjs): `lib` (function-plot's global), `box`, `px(n)` (is this a size a job may
 * ask for), `token(node, name)` and, because the manifest says `usesHydrate`, `hydrate`: this plugin's own hydrate function
 * (function-plot.hydrate.js), so the plot a preview shows is drawn by the same code the CLI and the runtime run (HARD RULE #1).
 * Self-contained, like the hydrate function: its text is hashed into the frame's one script.
 * The answer is the figure's markup; no `draw-host` half is declared, so the host puts it through the slide sanitizer.
 */
function draw(m, env) {
  const lib = env.lib;
  if (typeof lib !== 'function') throw new Error('function-plot did not load');
  if (typeof m.configB64 !== 'string' || typeof m.configText !== 'string' || !env.px(m.width) || !env.px(m.height) || !Number.isInteger(m.index) || m.index < 0 || m.index > 999) {
    throw new Error('a function-plot draw needs its config, a size and its place');
  }
  const els = [];
  for (let i = 0; i <= m.index; i++) {
    const d = document.createElement('div');
    d.setAttribute('data-lattice-hydrate', 'function-plot');
    env.box.appendChild(d);
    els.push(d);
  }
  const el = els[m.index];
  el.setAttribute('data-lattice-config', m.configB64);
  el.style.cssText = 'width:' + m.width + 'px;height:' + m.height + 'px';
  let state = '';
  env.hydrate(el, {
    lib,
    decodeConfig: () => m.configText,
    settle: (_n, s) => {
      state = s;
    },
    token: env.token,
  });
  if (state === 'error') throw new Error(el.textContent || 'function-plot failed');
  return el.innerHTML;
}

module.exports = { draw };
