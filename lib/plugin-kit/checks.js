/**
 * lib/plugin-kit/checks.js — the plugin kit's check vocabulary: the six states, their markers, labels
 * and classes, and the HTML a state mark renders as (lib/core/checks-registry.js). The engine reads the
 * same table (status marks, the list-text grammar, narration), so it lives in core; the checks plugin
 * reaches it only through here (engineering/decisions/2026-10-18-checks.md).
 */

module.exports = require('../core/checks-registry.js');
