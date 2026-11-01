/**
 * The plugin kernels AS THE HOST BUILDS THEM, for tests that call a plugin's functions directly
 * (engineering/decisions/2026-11-01-plugin-contract-hollywood.md §4). A plugin reaches another plugin and its
 * own data only through the ctx the host hands it (lib/core/plugin-ctx.js), so each wrapper here supplies that
 * ctx (or the host's data) exactly as the dispatcher does. An `off` set, where a test passes one, becomes the
 * ctx for that set, so "the icons plugin is off" still means what it meant.
 */
const { ctxFor } = require('../../../lib/core/plugin-ctx.js');
const { pluginData } = require('../../../lib/core/plugin-data.js');

const pillsModule = require('../../../lib/plugins/pills/pills.inline.js');
const iconsModule = require('../../../lib/plugins/icons/icons.inline.js');
const avatarsModule = require('../../../lib/plugins/avatars/avatars.inline.js');
const checksModule = require('../../../lib/plugins/checks/checks.inline.js');

const pillCtx = (off) => ctxFor('pills', off instanceof Set ? off : null);

const pills = Object.freeze({
  ...pillsModule,
  resolve: (text, off, probe) => pillsModule.resolve(text, pillCtx(off), probe),
  diagnose: (text, off, explain) => pillsModule.diagnose(text, pillCtx(off), explain),
  attempt: (text, off, explain) => pillsModule.attempt(text, pillCtx(off), explain),
  iconProblem: (text, off) => pillsModule.iconProblem(text, pillCtx(off)),
  iconSpelling: (text, off) => pillsModule.iconSpelling(text, pillCtx(off)),
  pillHtml: (text, off, lead) => pillsModule.pillHtml(text, pillCtx(off), lead),
  pillElement: (doc, text, off, lead) => pillsModule.pillElement(doc, text, pillCtx(off), lead),
  pillHtmlFrom: (parts, off, lead) => pillsModule.pillHtmlFrom(parts, pillCtx(off), lead),
  pillElementFrom: (doc, parts, off, lead) => pillsModule.pillElementFrom(doc, parts, pillCtx(off), lead),
  nextWords: (text) => pillsModule.nextWords(text, pillCtx(null)),
  editPill: (text, edit) => pillsModule.editPill(text, edit, pillCtx(null)),
});

const icons = Object.freeze({
  ...iconsModule,
  iconHtml: (text) => iconsModule.iconHtml(text, pluginData('icons')),
  iconElement: (doc, text) => iconsModule.iconElement(doc, text, pluginData('icons')),
  svgHtml: (name, cls) => iconsModule.svgHtml(name, cls, pluginData('icons')),
  svgElement: (doc, name, cls) => iconsModule.svgElement(doc, name, cls, pluginData('icons')),
});

const avatars = Object.freeze({
  ...avatarsModule,
  avatarHtml: (text) => avatarsModule.avatarHtml(text, pluginData('avatars')),
  avatarElement: (doc, text) => avatarsModule.avatarElement(doc, text, pluginData('avatars')),
  svgHtml: (f, cls) => avatarsModule.svgHtml(f, cls, pluginData('avatars')),
  svgElement: (doc, f, cls) => avatarsModule.svgElement(doc, f, cls, pluginData('avatars')),
});

const checks = checksModule.create(ctxFor('checks'));

module.exports = { pills, icons, avatars, checks };
