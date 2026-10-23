// The consent strip for code packages (contract note §9; docs/src/lib/code-packages/door.ts).
//
// A code package is a component whose `transform.js` someone else wrote. Its slides render as the
// engine drew them, with a note, until the user approves the code here. The strip names each
// package the deck uses that is not approved in this browser, says what the code is (its size and
// SHA-256) and what contains it, and offers the one choice. The approval is for these exact bytes:
// a package whose code changes asks again. It lives in this browser only, never in a deck or a
// backup, so no file can bring its own approval.

import { Code2, Sparkles } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { approveCodePackage, approvePlugin, type CodePackagesStatus, isPluginApproved, offeredIn, onCodePackagesStatus, type StudioPlugin, unapprovedIn } from '@/lib/code-packages/door';
import { returnsConsent } from '../../../../lib/packages/code-shape.mjs';
import { deckPluginList, writeDeckPlugins } from '../../../../lib/plugins/deck-plugins.mjs';

const isPlugin = (p: { name: string }): p is StudioPlugin => 'fence' in p;
/** What a plugin draws, in the words the strip uses: its fence and its `@kind{…}` spans (2026-10-14-plugin-inline-door.md). */
const drawsWhat = (p: StudioPlugin): string => {
	const parts = [...(p.fence ? ['```' + p.fence + ' block'] : []), ...(p.kinds ?? []).map((k) => `@${k.name}{…} spans`)];
	return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? 'nothing');
};
/** The renderer's role in the details line: a fence-only plugin reads as it always has. */
const codeRole = (p: StudioPlugin): string => (p.kinds?.length ? `it draws ${drawsWhat(p)}` : `the \`\`\`${p.fence} fence`);

/**
 * `source` is the deck; `stamp` is the code-package state (door.ts `codePackagesStamp`), which
 * changes when a package or an approval does, so the strip re-reads which packages wait on one.
 */
export function CodePackagesNotice({ source, stamp, onApproved, onWrite }: { source: string; stamp: string; onApproved: () => void; onWrite?: (label: string, updater: (s: string) => string) => void }) {
	const [rendered, setRendered] = React.useState<CodePackagesStatus>({ unapproved: [], failed: [] });
	const [open, setOpen] = React.useState(false);
	React.useEffect(() => onCodePackagesStatus(setRendered), []);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `stamp` is the signal that approvals or packages changed.
	const fromSource = React.useMemo(() => unapprovedIn(source), [source, stamp]);
	// A package the preview's render found claiming a slide counts too, so a spelling the source scan
	// misses still gets a way to approve it rather than a note pointing nowhere (the checker).
	// Keyed by kind and name: a component and a plugin may share a name, and each needs its own yes.
	const unapproved = React.useMemo(() => [...new Map([...fromSource, ...rendered.unapproved].map((p) => [`${isPlugin(p) ? 'plugin' : 'component'}/${p.name}`, p])).values()], [fromSource, rendered.unapproved]);
	// An installed plugin whose fence the deck writes and its `plugins:` list does not name: a placeholder stands in
	// the preview, and the strip offers to approve it (decision 11).
	// biome-ignore lint/correctness/useExhaustiveDependencies: `stamp` is the signal that the installed set changed.
	const offeredFromSource = React.useMemo(() => offeredIn(source), [source, stamp]);
	const offered = React.useMemo(() => [...new Map([...offeredFromSource, ...(rendered.offered ?? [])].map((p) => [p.name, p])).values()].filter((p) => !deckPluginList(source).includes(p.name)), [offeredFromSource, rendered.offered, source]);
	const status = { unapproved, failed: rendered.failed, notes: rendered.notes ?? [] };
	const row = 'flex items-center gap-2 border-b border-border px-3.5 py-1.5 text-[12px]';
	if (status.unapproved.length) {
		const p = status.unapproved[0];
		const more = status.unapproved.length - 1;
		const plugin = isPlugin(p);
		const what = `“${p.name}”${more ? ` and ${more} more` : ''}`;
		return (
			<div role="status" data-slot="code-packages" data-state="unapproved" className={`${row} flex-wrap bg-[var(--accent-soft)] text-[var(--text-heading)]`}>
				<Code2 className="size-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
				<span className="min-w-0 flex-1">
					<span className="font-semibold">This deck uses code from the {plugin ? 'plugin' : 'component'} {what}, which has not run.</span>{' '}
					<button type="button" className="underline underline-offset-2" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
						{open ? 'Hide details' : 'What it is'}
					</button>
				</span>
				<Button
					size="xs"
					variant="outline"
					className="shrink-0"
					aria-label={`Approve and run the code of ${p.name}`}
					onClick={() => {
						if (isPlugin(p)) approvePlugin(p);
						else approveCodePackage(p);
						onApproved();
					}}
				>
					Approve and run
				</Button>
				{open && (
					<p data-slot="code-packages-detail" className="basis-full pb-1 text-muted-foreground">
						{p.name}.{plugin ? `render.js (${codeRole(p)})` : 'transform.js'}, {p.bytes.toLocaleString('en-US')} bytes, sha256 <code className="break-all">{p.sha256}</code>. It runs in a sandbox with no network and no access to this page or your saved work, and it sees only {plugin ? 'the text of what it draws' : 'the slide it draws'}; what it draws is cleaned like any slide and keeps no web address the slide did not already have.{plugin && p.returns?.length ? ` ${returnsConsent(p.name, p.returns)}` : ''} Run code only from someone you trust: a flaw in the browser could let it out. Changed code asks again. The approval stays in this browser even if you undo the line.
					</p>
				)}
			</div>
		);
	}
	if (offered.length && onWrite) {
		const p = offered[0];
		const more = offered.length - 1;
		// Consent to this exact code was already given in this browser (it survives unlisting), so the only thing left to do is
		// list it: say that, and do not ask for a second yes.
		const already = isPluginApproved(p);
		return (
			<div role="status" data-slot="code-packages" data-state="offered" className={`${row} flex-wrap bg-[var(--accent-soft)] text-[var(--text-heading)]`}>
				<Sparkles className="size-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
				<span className="min-w-0 flex-1">
					<span className="font-semibold">
						{already ? <>This deck writes the {drawsWhat(p)} but does not list the plugin “{p.name}”.</> : <>The plugin “{p.name}” can draw the {drawsWhat(p)} in this deck.</>}{more ? ` ${more} more plugin${more > 1 ? 's are' : ' is'} offered after it.` : ''}
					</span>{' '}
					<button type="button" className="underline underline-offset-2" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
						{open ? 'Hide details' : 'What it is'}
					</button>
				</span>
				<Button
					size="xs"
					variant="outline"
					className="shrink-0"
					aria-label={already ? `Add the plugin ${p.name} to this deck` : `Approve and run the plugin ${p.name}`}
					onClick={() => {
						// ONE yes, two writes: the deck states what it needs (`plugins:`, so the CLI renders it the same
						// way), and this browser records consent to the code at exactly these bytes. A downloaded deck can
						// name a plugin but never carry its approval.
						onWrite(`Plugins → list ${p.name}`, (s) => writeDeckPlugins(s, [...deckPluginList(s), p.name]));
						if (!already) approvePlugin(p);
						onApproved();
					}}
				>
					{already ? 'Add to deck' : 'Approve and run'}
				</Button>
				{open && (
					<p data-slot="code-packages-detail" className="basis-full pb-1 text-muted-foreground">
						{p.name}.render.js ({codeRole(p)}), {p.bytes.toLocaleString('en-US')} bytes, sha256 <code className="break-all">{p.sha256}</code>. This deck does not list it under <code>plugins:</code>, so what it draws shows a placeholder. Approving adds <code>{p.name}</code> to the deck's <code>plugins:</code> line and lets its code run in this browser: in a sandbox with no network and no access to this page or your saved work, seeing only the text of what it draws.{p.returns?.length ? ` ${returnsConsent(p.name, p.returns)}` : ''} Run code only from someone you trust. Changed code asks again.
					</p>
				)}
			</div>
		);
	}
	if (status.failed.length) {
		const f = status.failed[0];
		// One line, cut to the width: the title carries the whole reason, which the block's own note also shows.
		const said = `The code of “${f.name}” did not draw slide ${f.slide}${status.failed.length > 1 ? ` and ${status.failed.length - 1} more` : ''}: ${f.why}`;
		return (
			<div role="status" data-slot="code-packages" data-state="failed" className={`${row} text-muted-foreground`}>
				<Code2 className="size-3.5 shrink-0" aria-hidden />
				<span className="min-w-0 flex-1 truncate" title={said}>
					{said}
				</span>
			</div>
		);
	}
	if (status.notes.length) {
		// A block the door left as code, and why (a slide a shipped pass rebuilds, a block too long, past the allowance).
		return (
			<div role="status" data-slot="code-packages" data-state="notes" className={`${row} text-muted-foreground`}>
				<Code2 className="size-3.5 shrink-0" aria-hidden />
				<span className="min-w-0 flex-1 truncate">{status.notes[0].replace(/^warning: /, '')}{status.notes.length > 1 ? ` (and ${status.notes.length - 1} more)` : ''}</span>
			</div>
		);
	}
	return null;
}
