/**
 * lib/core/plugin-ctx.js — the `ctx` the host hands a plugin at every contribution point that runs in
 * the engine's own process: inline kinds, services, and (through host.js) renderers
 * (engineering/decisions/2026-11-01-plugin-contract-hollywood.md §4).
 *
 * THE HOLLYWOOD RULE. A plugin is called; it does not call in. Everything it needs from the host
 * arrives in its ctx, so its code imports only its own folder and the packages it declares:
 *
 *   ctx.name                    the plugin's own name
 *   ctx.service(plugin, name)   another plugin's service, or null when that plugin is off for this call
 *                               or is not one this plugin declares (`requires` / `optional`). The
 *                               service was built with ITS OWNER's ctx, so a service that reads its own
 *                               data (icons' `drawHtml`) still has it when another plugin calls it.
 *   ctx.data()                  this plugin's data (`contributes.data`), or null while it is not here
 *   ctx.dataPending()           true while this plugin's data may still arrive on this surface
 *   ctx.vocabulary.checks       the engine's status vocabulary as data (statuses, markers, labels), frozen
 *   ctx.marks                   the host's status marks: `read('[x]')`, `html('[x]')`, `element(doc, '[x]')`
 *   ctx.vocabulary.video        the engine's video provider table (`detectProvider`), which the engine reads too
 *   ctx.vocabulary.slots        the engine's record shapes (`CORE`, `coreSlot`; lib/core/segno-slots.js): a pill, a spark, a point
 *
 * A ctx is frozen and carries no live host object: no markdown-it instance, no token array, no `env`.
 *
 * THE HOST BUILDS THE PLUGIN. A plugin exports its inline kinds and its services as FACTORIES,
 * `(ctx) => ({ … })`. The host calls the factory with the ctx for the plugins a deck did not load
 * (`off`), once per off-set, and the engine's call sites keep calling the rows they always called.
 */

const { PLUGIN_GRAMMAR } = require('../plugins/grammar.generated.mjs');
const { pluginData, dataPending } = require('./plugin-data.js');

const GRAMMAR = new Map(PLUGIN_GRAMMAR.map((g) => [g.name, g]));

/** The plugins `name` may call: what its manifest `requires` or lists as `optional`. */
function reachOf(name) {
  const g = GRAMMAR.get(name);
  return new Set(g ? [...g.requires, ...g.optional] : []);
}

let vocabulary = null;
/** The engine's vocabularies a plugin reads as data. Lazy, so a bundle that never asks loads none. */
function vocabularyOf() {
  if (!vocabulary) {
    vocabulary = Object.freeze({
      // Data only: the statuses, their markers and labels. Drawing a mark is a host capability (`ctx.marks`).
      checks: Object.freeze((({ CHECKS, STATUSES, SETS, MARKERS, MARKER_LABELS, MARKER_CLASS }) => ({ CHECKS, STATUSES, SETS, MARKERS, MARKER_LABELS, MARKER_CLASS }))(require('./checks-registry.js'))),
      slots: Object.freeze({ CORE: require('./segno-slots.js').CORE, coreSlot: require('./segno-slots.js').coreSlot }),
      video: Object.freeze({ detectProvider: require('./video-providers.mjs').detectProvider }),
    });
  }
  return vocabulary;
}

let marks = null;
/**
 * The host's status marks, a capability rather than a helper: the engine reads and draws `[x]` itself (a list's
 * leading mark, the prose projection, with the checks plugin off), so a plugin asks the host to read or draw one and
 * every surface draws the same mark (2026-11-01-plugin-contract-alignment-audit.md, Q2).
 */
function marksOf() {
  if (!marks) {
    const { parseInlineState, stateHtml, stateElement } = require('./checks-registry.js');
    marks = Object.freeze({ read: parseInlineState, html: stateHtml, element: stateElement });
  }
  return marks;
}

const NO_OFF = Object.freeze(new Set());

/** A per-off-set cache: off-set → key → value, built once. */
function perOff() {
  const byOff = new WeakMap();
  return (off, key, build) => {
    const k = off || NO_OFF;
    let m = byOff.get(k);
    if (!m) byOff.set(k, (m = new Map()));
    if (!m.has(key)) m.set(key, build());
    return m.get(key);
  };
}

const ctxCache = perOff();
const servicesCache = perOff();
const kindsCache = perOff();

/**
 * The services table (`contributes.services`): each entry is the plugin's `services` FACTORY. Read on first
 * use, not at load, because the table requires every plugin's services module and those may build a ctx.
 */
let servicesTable = null;
function services() {
  if (!servicesTable) {
    const { SERVICES } = require('../plugins/services.generated.js');
    servicesTable = SERVICES;
  }
  return servicesTable;
}

/** The owner's services, built with the owner's own ctx. */
function servicesOf(owner, off) {
  const table = services();
  const factory = Object.hasOwn(table, owner) ? table[owner] : null;
  if (typeof factory !== 'function') return null;
  return servicesCache(off, owner, () => Object.freeze(factory(ctxFor(owner, off))));
}

/** One of `owner`'s services, or null when it is off or does not offer `name`. */
function boundService(owner, name, off) {
  if (off?.has(owner)) return null;
  const fns = servicesOf(owner, off);
  const fn = fns && Object.hasOwn(fns, name) ? fns[name] : null;
  return typeof fn === 'function' ? fn : null;
}

/**
 * The ctx for `name` when the deck did not load the plugins in `off`.
 * @param {string} name
 * @param {Set<string>|null} [off]
 */
function ctxFor(name, off) {
  return ctxCache(off, name, () => {
    const reach = reachOf(name);
    return Object.freeze({
      name,
      service: (plugin, fn) => (reach.has(plugin) ? boundService(plugin, fn, off) : null),
      data: () => pluginData(name),
      dataPending: () => dataPending(name),
      get vocabulary() {
        return vocabularyOf();
      },
      get marks() {
        return marksOf();
      },
    });
  });
}

/** Where each inline-kind function takes `off`, so a row can build the kind that call needs. */
const INLINE_OFF_AT = Object.freeze({ resolve: 1, html: 1, element: 2, diagnose: 1 });

/**
 * One row of the dispatcher's table for an inline kind (`contributes.inline`). The plugin's `inline`
 * export is a FACTORY, `(ctx) => ({ <kind>: { resolve, html, element, diagnose, … } })`; the row builds
 * the kinds with the ctx for the call's `off` and delegates. The manifest's fields (`sigil`, …) win.
 * @param {string} plugin
 * @param {string} kind
 * @param {(ctx: object) => object} factory
 * @param {object} manifestFields
 */
function inlineRow(plugin, kind, factory, manifestFields) {
  const build = (off) => kindsCache(off, `${plugin}/${kind}`, () => factory(ctxFor(plugin, off))[kind]);
  // A kind's data fields (`block`, `address`, …) do not depend on what a deck loaded, so they are read
  // from a build with no `off`; they sit over the manifest's, as the table always spread them.
  const out = { ...manifestFields, ...build(null) };
  for (const [fn, offAt] of Object.entries(INLINE_OFF_AT)) {
    if (typeof out[fn] !== 'function') continue;
    out[fn] = (...args) => build(args[offAt] instanceof Set ? args[offAt] : null)[fn](...args);
  }
  return Object.freeze(out);
}

module.exports = { ctxFor, inlineRow, boundService, reachOf };
