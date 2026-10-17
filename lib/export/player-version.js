/**
 * lib/export/player-version.js — the frozen player runtime's version stamp, written into every
 * `.html` player's record (`playerVersion`) so a re-import can tell a stale player from a current
 * one (decisions/2026-07-07-html-lattice-player.md §Security). ONE value for both hosts: the CLI
 * wrote '1' and the Studio wrote 'studio', for the same player (decisions/2026-10-16-player-as-
 * library-audit.md §11.9). Requires nothing, so the docs dev server's CommonJS shim can serve it.
 */
const PLAYER_VERSION = '1';

module.exports = { PLAYER_VERSION };
