/**
 * lib/plugin-kit/sandbox.js — the plugin kit's confinement for a render worker: the OS sandbox a
 * browser is launched in (lib/core/os-sandbox.js) and the file guard that keeps it to the deck's own
 * files (lib/core/file-confine.js). The bake host offers the guard as a service; a worker process,
 * which receives no services, requires it from here. Require it where it is used: both are only
 * needed once a worker starts.
 */

const { launchCodeSandbox } = require('../core/os-sandbox.js');
const { createFileConfiner } = require('../core/file-confine.js');

module.exports = { launchCodeSandbox, createFileConfiner };
