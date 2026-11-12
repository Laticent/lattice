/**
 * Lattice layouts for VS Code: the layout names, offered only where a layout name goes.
 *
 * THE PROBLEM. The kit's snippets (tools/build-snippets.js) carry every layout, but a snippet
 * has no idea where the cursor is. With Markdown quick suggestions on, VS Code matched their
 * prefixes against ordinary prose and opened the menu on 21 of 30 words (prefix `lattice-kpi`),
 * 284 of 400 (`/kpi`) and 108 of 150 (`::kpi`), measured in VS Code 1.145.2 with Marp for VS Code
 * 3.6.1 (followups.d/3122-p3, now closed). VS Code skips a prefix's leading symbols and matches
 * loosely across the name, so no snippet prefix keeps prose quiet.
 *
 * THE FIX is a completion provider, which can read the line. It answers only when the text
 * before the cursor is inside a class directive, `<!-- _class: ` or `<!-- class: `, at any word
 * of the class list; everywhere else it returns nothing, so prose opens no menu. Its trigger
 * characters (space, colon) open the menu as the author types the directive, even with quick
 * suggestions off, which is VS Code's default for Markdown.
 *
 * Pure CommonJS with no dependencies: `vscode` is the host's module, and `layouts.json` (name,
 * summary, bucket per layout) is written beside this file when the kit is built
 * from the component manifests (kit/vscode/vsix.js), so the list cannot drift from the catalog.
 */

const path = require('node:path');
const fs = require('node:fs');

/**
 * The partial class word at the cursor when `before` (the line up to the cursor) is inside a
 * class directive, else null. Exported for the unit test; the host never calls it directly.
 * @param {string} before
 * @returns {string | null}
 */
function classContext(before) {
  const m = /<!--\s*_?class\s*:\s*(?:[\w-]+\s+)*([\w-]*)$/.exec(before);
  return m ? m[1] : null;
}

function loadLayouts(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'layouts.json'), 'utf8'));
  } catch {
    return [];
  }
}

function activate(context) {
  const vscode = require('vscode');
  const layouts = loadLayouts(context.extensionPath || __dirname);
  const provider = {
    provideCompletionItems(document, position) {
      const before = document.lineAt(position.line).text.slice(0, position.character);
      const word = classContext(before);
      if (word === null) return undefined;
      const range = new vscode.Range(position.line, position.character - word.length, position.line, position.character);
      return layouts.map((l) => {
        const item = new vscode.CompletionItem(l.name, vscode.CompletionItemKind.EnumMember);
        item.range = range;
        item.detail = `Lattice · ${l.bucket}`;
        item.documentation = new vscode.MarkdownString(l.summary || '');
        return item;
      });
    },
  };
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider({ language: 'markdown' }, provider, ' ', ':'));
}

function deactivate() {}

module.exports = { activate, deactivate, classContext };
