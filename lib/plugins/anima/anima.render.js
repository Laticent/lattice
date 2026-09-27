/**
 * lib/plugins/anima/anima.render.js — the anima plugin's RENDERER.
 *
 * An ```anima fence (an Anima scene SPEC, JSON) becomes
 * `<div class="anima-spec" data-scene-spec="…base64 JSON…" hidden></div>`.
 * `lib/components/imagery/scene/scene.transform.js` then LIFTS `data-scene-spec` onto the
 * enclosing `<section class="scene">` and removes the div; the docs site's Anima host
 * (docs/src/lib/anima/hydrate.ts) reads that attribute to mount the live animation on the
 * HTML/present surfaces. The PDF is untouched — it keeps the authored poster still.
 *
 * The spec is packed base64 so arbitrary JSON survives as an HTML attribute with no escaping
 * hazard and no ReDoS-prone HTML parsing. It is transport ONLY here — the untrusted spec is
 * validated by `parseScene` in the host before it ever compiles or mounts. Malformed (non-JSON)
 * content degrades to an inert placeholder: the host skips it and the poster stands.
 *
 * No hydrate: the animation host is the docs site's, keyed on the SECTION the transform writes,
 * not on this placeholder, so the plugin's `hydrate` contribution does not describe it.
 */

const fences = Object.freeze({
  anima: (token, ctx) => {
    // Normalize/validate as JSON at authoring time, so a broken spec is caught early and the
    // attribute carries minified, canonical JSON. Invalid → an inert marker.
    let spec64;
    try {
      spec64 = ctx.encodeConfig(JSON.stringify(JSON.parse(token.content)));
    } catch {
      return '<div class="anima-spec anima-spec-error" hidden></div>\n';
    }
    return `<div class="anima-spec" data-scene-spec="${spec64}" hidden></div>\n`;
  },
});

module.exports = { fences };
