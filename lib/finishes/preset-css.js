/**
 * The build's writer for a SHIPPED finish preset (portable-packages §3.6). Split out of
 * lib/finishes/finish-generate.js so the Studio, which imports that module on its eager path,
 * does not carry code only `tools/build-packages-index.js` runs. Same layer plan, engine tokens.
 */
const gen = require('./finish-generate.js');

/**
 * A SHIPPED preset's rule, as the build writes it into base.finish.css: the one-class selector
 * `section.finish-<name>`, every slot family declared (an unused one is `none`, so a preset never
 * inherits a sibling's stray layer), and each face-variant slot as a rich default plus an
 * `--fin-*-opaque` mirror for base.finish.css's OPAQUE FLIP. One layer per line.
 */
function generatePresetCss(name, recipe) {
  const { layerPlan, ENGINE_TOKENS, list } = gen._presetInternals;
  const safe = gen.safeFinishSlug(name);
  if (safe !== name) throw new Error(`finish-generate: "${name}" is not a finish name`);
  const r = gen.coerceRecipe(recipe);
  const rich = layerPlan(r, 'rich', ENGINE_TOKENS);
  const opaque = layerPlan(r, 'opaque', ENGINE_TOKENS);
  const block = (layers) => (layers.length > 1 ? `\n    ${layers.join(',\n    ')}` : ` ${list(layers)}`);
  const decl = (prop, value) => `  ${prop}:${value};`;
  const slot = (d) => {
    const i = d.indexOf(':');
    return decl(d.slice(0, i), ` ${d.slice(i + 1)}`);
  };
  const lines = [
    `section.finish-${safe} {`,
    decl('--fin-texture', block(rich.texture)),
    decl('--fin-texture-opaque', block(opaque.texture)),
    decl('--fin-wash', block(rich.wash)),
    decl('--fin-wash-opaque', block(opaque.wash)),
    decl('--fin-size', ` ${rich.size.join(', ')}`),
    decl('--fin-position', ` ${rich.size.map(() => 'top left').join(', ')}`),
    decl('--fin-repeat', ` ${rich.repeat.join(', ')}`),
  ];
  if (rich.mark.text) {
    lines.push(decl('--fin-mark', ' none'), decl('--fin-mark-opaque', ' none'), ...rich.mark.text.filter((d) => !d.startsWith('--fin-mark:')).map(slot));
  } else {
    lines.push(decl('--fin-mark', block(rich.mark.image)), decl('--fin-mark-opaque', block(opaque.mark.image)), ...rich.mark.slots.map(slot), decl('--fin-mark-text', ' ""'));
  }
  lines.push(decl('--fin-edge', ` ${rich.edge}`), decl('--fin-edge-opaque', ` ${opaque.edge}`), ...rich.edgeSlots.map(slot), '}');
  return lines.join('\n');
}


module.exports = { generatePresetCss };
