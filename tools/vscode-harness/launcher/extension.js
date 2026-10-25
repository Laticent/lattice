// The VS Code side of tools/vscode-preview-probe.mjs. Loaded with --extensionDevelopmentPath.
//
// CDP keystrokes do not reach the desktop Electron window (engineering/gotchas/vscode.md), so
// this extension does the two things the probe cannot: open the deck with its Markdown preview
// to the side, and edit the document when the probe asks. An edit is a real WorkspaceEdit, so
// VS Code pushes `updateContent` to the preview exactly as it does for typing.
//
// The probe passes two paths in the environment and asks for an edit by writing `edit` to the
// trigger file; this extension deletes the file and appends ` x` to the deck's last line.
const vscode = require('vscode');
const fs = require('node:fs');

exports.activate = async () => {
	const deck = process.env.LATTICE_PROBE_DECK;
	const trigger = process.env.LATTICE_PROBE_TRIGGER;
	const log = (m) => {
		if (process.env.LATTICE_PROBE_LOG) fs.appendFileSync(process.env.LATTICE_PROBE_LOG, `${new Date().toISOString()} ${m}\n`);
	};
	if (!deck || !trigger) return;
	try {
		const uri = vscode.Uri.file(deck);
		await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), vscode.ViewColumn.One);
		await vscode.commands.executeCommand('markdown.showPreviewToSide', uri);
		log('preview opened');
		setInterval(async () => {
			if (!fs.existsSync(trigger)) return;
			const cmd = fs.readFileSync(trigger, 'utf8').trim();
			fs.unlinkSync(trigger);
			if (cmd !== 'edit') return;
			const doc = await vscode.workspace.openTextDocument(uri);
			const edit = new vscode.WorkspaceEdit();
			edit.insert(uri, doc.lineAt(doc.lineCount - 1).range.end, ' x');
			log(`edit applied=${await vscode.workspace.applyEdit(edit)}`);
		}, 200);
	} catch (e) {
		log(`error ${e?.stack}`);
	}
};
