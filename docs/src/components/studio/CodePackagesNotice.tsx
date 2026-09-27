// The consent strip for code packages (contract note §9; docs/src/lib/code-packages/door.ts).
//
// A code package is a component whose `transform.js` someone else wrote. Its slides render as the
// engine drew them, with a note, until the user approves the code here. The strip names each
// package the deck uses that is not approved in this browser, says what the code is (its size and
// SHA-256) and what contains it, and offers the one choice. The approval is for these exact bytes:
// a package whose code changes asks again. It lives in this browser only, never in a deck or a
// backup, so no file can bring its own approval.

import { Code2 } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { approveCodePackage, type CodePackagesStatus, onCodePackagesStatus, unapprovedIn } from '@/lib/code-packages/door';

/**
 * `source` is the deck; `stamp` is the code-package state (door.ts `codePackagesStamp`), which
 * changes when a package or an approval does, so the strip re-reads which packages wait on one.
 */
export function CodePackagesNotice({ source, stamp, onApproved }: { source: string; stamp: string; onApproved: () => void }) {
	const [rendered, setRendered] = React.useState<CodePackagesStatus>({ unapproved: [], failed: [] });
	const [open, setOpen] = React.useState(false);
	React.useEffect(() => onCodePackagesStatus(setRendered), []);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `stamp` is the signal that approvals or packages changed.
	const fromSource = React.useMemo(() => unapprovedIn(source), [source, stamp]);
	// A package the preview's render found claiming a slide counts too, so a spelling the source scan
	// misses still gets a way to approve it rather than a note pointing nowhere (the checker).
	const unapproved = React.useMemo(() => [...new Map([...fromSource, ...rendered.unapproved].map((p) => [p.name, p])).values()], [fromSource, rendered.unapproved]);
	const status = { unapproved, failed: rendered.failed };
	const row = 'flex items-center gap-2 border-b border-border px-3.5 py-1.5 text-[12px]';
	if (status.unapproved.length) {
		const p = status.unapproved[0];
		const more = status.unapproved.length - 1;
		const what = `“${p.name}”${more ? ` and ${more} more` : ''}`;
		return (
			<div role="status" data-slot="code-packages" data-state="unapproved" className={`${row} flex-wrap bg-[var(--accent-soft)] text-[var(--text-heading)]`}>
				<Code2 className="size-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
				<span className="min-w-0 flex-1">
					<span className="font-semibold">This deck uses code from the component {what}, which has not run.</span>{' '}
					<button type="button" className="underline underline-offset-2" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
						{open ? 'Hide details' : 'What it is'}
					</button>
				</span>
				<Button
					size="xs"
					variant="outline"
					className="shrink-0"
					aria-label={`Run the code of ${p.name}`}
					onClick={() => {
						approveCodePackage(p);
						onApproved();
					}}
				>
					Run it
				</Button>
				{open && (
					<p data-slot="code-packages-detail" className="basis-full pb-1 text-muted-foreground">
						{p.name}.transform.js, {p.bytes.toLocaleString('en-US')} bytes, sha256 <code className="break-all">{p.sha256}</code>. It runs in a sandbox with no network and no access to this page or your saved work, and it sees only the slide it draws; what it draws is cleaned like any slide and keeps no web address the slide did not already have. Run code only from someone you trust: a flaw in the browser could let it out. Changed code asks again.
					</p>
				)}
			</div>
		);
	}
	if (status.failed.length) {
		const f = status.failed[0];
		return (
			<div role="status" data-slot="code-packages" data-state="failed" className={`${row} text-muted-foreground`}>
				<Code2 className="size-3.5 shrink-0" aria-hidden />
				<span className="min-w-0 flex-1 truncate">
					The code of “{f.name}” did not draw slide {f.slide}
					{status.failed.length > 1 ? ` and ${status.failed.length - 1} more` : ''}: {f.why}
				</span>
			</div>
		);
	}
	return null;
}
