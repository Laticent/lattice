import type * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { fmtTok } from './ChatCost';
import { callLabel } from './chat-trace';
import type { ChatTrace, ChatUsage } from './studio-store';

// "Show work": what the Architect did to produce one reply, past the three dots.
//
// Everything here was already on the wire or in the agent loop — the model's thinking streams
// beside its answer, each command's arguments and result pass through `runAgentLoop`, and every
// response carries its own usage — so showing it costs no request and no credit. The trace is
// saved with the reply (chat-trace.ts bounds it), which is why the dialog works after a reload.
//
// Commands are native <details>: the summary line is the clickable link, the body is the
// arguments the model sent and what came back. Native because it is keyboard- and
// screen-reader-complete for free, and a custom disclosure would be a second one to maintain.

const PARTS: { key: keyof ChatTrace['sent']; label: string; hint: string }[] = [
	{ key: 'primer', label: 'Lattice primer', hint: 'Fixed instructions; read from cache after the first turn' },
	{ key: 'deck', label: 'Your deck', hint: 'The deck brief and its source' },
	{ key: 'history', label: 'Conversation', hint: 'Earlier messages in this thread' },
	{ key: 'tools', label: 'Tool definitions', hint: 'The commands the Architect may run' },
	{ key: 'docs', label: 'Reference documents', hint: 'Files you attached to the chat' },
	{ key: 'photos', label: 'Photos and video', hint: 'Attached media' },
];

/** Renders the model's own markdown (its thinking and its prose). The host passes the chat's renderer, so this dialog adds no second
 *  sanitizer: model text reaches markup only through the one sink the chat already has. */
export type RenderMarkdown = (text: string) => React.ReactNode;

export function ChatTraceDialog({ trace, usage, open, onOpenChange, renderMarkdown }: { trace: ChatTrace; usage?: ChatUsage; open: boolean; onOpenChange: (v: boolean) => void; renderMarkdown?: RenderMarkdown }) {
	const md = (t: string) => renderMarkdown?.(t) ?? <p className="whitespace-pre-wrap">{t}</p>;
	const total = PARTS.reduce((n, p) => n + (trace.sent[p.key] || 0), 0);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl" data-testid="chat-trace">
				<DialogHeader>
					<DialogTitle>Show work</DialogTitle>
					<DialogDescription>What the Architect sent, thought and ran for this reply. Reading this costs nothing.</DialogDescription>
				</DialogHeader>

				<section aria-label="What was sent" className="flex flex-col gap-1.5">
					<h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sent to the model</h3>
					{PARTS.filter((p) => trace.sent[p.key] > 0).map((p) => (
						<div key={p.key} title={p.hint} className="grid grid-cols-[8.5rem_1fr_3.5rem] items-center gap-2 text-[12px]">
							<span className="truncate text-muted-foreground">{p.label}</span>
							<span className="h-[5px] overflow-hidden rounded-full bg-border" aria-hidden>
								<span className="block h-full rounded-full bg-primary" style={{ width: `${total ? (trace.sent[p.key] / total) * 100 : 0}%` }} />
							</span>
							<span className="text-right font-semibold tabular-nums">{fmtTok(trace.sent[p.key])}</span>
						</div>
					))}
					<p className="text-[10.5px] leading-snug text-muted-foreground">
						Estimated from text length, for the first call.{usage ? ` The provider billed ${fmtTok(usage.prompt)} input tokens on the last call.` : ''}
					</p>
				</section>

				<section aria-label="Steps" className="flex flex-col gap-2">
					<h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
						{trace.rounds.length} model call{trace.rounds.length === 1 ? '' : 's'}
					</h3>
					{trace.rounds.map((r, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: a saved trace is append-only — index is stable identity.
						<div key={i} className="flex flex-col gap-1.5 rounded-lg border border-border p-2.5 text-[12px]">
							<div className="flex items-baseline justify-between gap-2 text-muted-foreground">
								<span className="font-semibold text-foreground">Call {i + 1}</span>
								<span className="tabular-nums">
									${r.cost.toFixed(r.cost < 0.1 ? 3 : 2)} · {fmtTok(r.prompt)} in · {fmtTok(r.completion)} out
								</span>
							</div>
							{r.reasoning && (
								<details className="group">
									<summary className="cursor-pointer text-[var(--accent)] hover:underline">Thinking</summary>
									<div className="mt-1 rounded-md bg-muted/50 p-2 text-[11.5px] leading-snug text-muted-foreground">{md(r.reasoning)}</div>
								</details>
							)}
							{r.text && <div className="text-[11.5px] leading-snug">{md(r.text)}</div>}
							{r.calls.map((c, j) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: a call's position within its round is its identity.
								<details key={j} className="rounded-md bg-muted/40 px-2 py-1">
									<summary className="cursor-pointer font-medium text-[var(--accent)] hover:underline">{callLabel(c.name)}</summary>
									<Detail label="Sent" body={c.args} />
									<Detail label="Came back" body={c.result} />
								</details>
							))}
						</div>
					))}
				</section>
				{usage && (
					<p className={cn('text-[11px] text-muted-foreground')}>
						Total ${usage.cost.toFixed(usage.cost < 0.1 ? 3 : 2)}
						{usage.reasoning ? ` · ${fmtTok(usage.reasoning)} thinking tokens` : ''}
					</p>
				)}
			</DialogContent>
		</Dialog>
	);
}

function Detail({ label, body }: { label: string; body: string }) {
	if (!body) return null;
	return (
		<div className="mt-1">
			<div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
			<pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-background p-1.5 font-mono text-[11px] leading-snug">{body}</pre>
		</div>
	);
}
