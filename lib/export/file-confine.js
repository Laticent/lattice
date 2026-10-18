/**
 * lib/export/file-confine.js — the CLI's answer to "may a render read this local file?"
 *
 * `resolveRelative` (lib/core/media-sources.js) confines a reference by its TEXT: it refuses `..` and
 * `/etc/x`. It has no file system, so it cannot see that `photo.jpg` inside the deck folder is a SYMLINK
 * to `/etc/hostname`, and it never sees a typed `file:///abs/path` at all. This module checks the REAL
 * path (media note §4.11, "Paths stay inside the deck"): a file is allowed only when its resolved path
 * sits inside one of the given roots (the deck's folder, Lattice's own install, the output folder).
 *
 * A typed `file:` address is therefore allowed exactly when it names a file inside those roots, which
 * is what the deck's own relative references do. The CLI cannot tell a deck its author wrote here from
 * a stranger's zip, so it does not try: nothing outside the roots is read either way.
 *
 * Node only (it uses `fs`), so it sits beside pdf-asset-reader.js, which confines by the same rule.
 */
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

/**
 * @param {string[]} roots directories a read may land in (resolved to real paths once)
 * @returns {{ allows: (fileUrlOrPath: string) => boolean, roots: string[] }}
 */
function createFileConfiner(roots) {
	const real = roots
		.map((p) => {
			try {
				return fs.realpathSync(p);
			} catch {
				return null;
			}
		})
		.filter(Boolean);
	return {
		roots: real,
		allows(target) {
			try {
				const s = String(target);
				const file = fs.realpathSync(/^file:/i.test(s) ? fileURLToPath(s.split(/[?#]/)[0]) : s);
				return real.some((root) => file === root || file.startsWith(root.endsWith(path.sep) ? root : root + path.sep));
			} catch {
				return false;
			}
		},
	};
}

module.exports = { createFileConfiner };
