import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { fmtTok } from './ChatCost';
import { callLabel, num } from './chat-trace';
import type { ChatTrace, ChatUsage } from './studio-store';

// "Show work": what the Architect did to produce one reply, past the three dots.
//
// Everything here was already on the wire or in the agent loop — the model's thinking streams
// beside its answer, each command's arguments and result pass through `runAgentLoop`, and every
// response carries its own usage — so showing it costs no request and no credit. The trace is
// saved with the reply (chat-trace.ts bounds it), which is why the dialog works after a reload.
//
// On a phone it opens as a bottom sheet that fills most of the screen and scrolls inside itself; wider
// screens keep the centered dialog. Either way the page behind does not move, which is the point: the
// reply in the transcript carries one line, and everything else lives here.
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

/** True on a phone-width screen. False where `matchMedia` is missing (jsdom, old engines), so those get the dialog. */
function useNarrow(): boolean {
	const query = '(max-width: 639px)';
	const [narrow, setNarrow] = React.useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches);
	React.useEffect(() => {
		if (typeof window.matchMedia !== 'function') return;
		const mq = window.matchMedia(query);
		const on = () => setNarrow(mq.matches);
		on();
		mq.addEventListener?.('change', on);
		return () => mq.removeEventListener?.('change', on);
	}, []);
	return narrow;
}

export function ChatTraceDialog({ trace, usage, open, onOpenChange, renderMarkdown }: { trace: ChatTrace; usage?: ChatUsage; open: boolean; onOpenChange: (v: boolean) => void; renderMarkdown?: RenderMarkdown }) {
	const narrow = useNarrow();
	const intro = 'What the Architect sent, thought and ran for this reply. Reading this costs nothing.';
	const body = <TraceBody trace={trace} usage={usage} renderMarkdown={renderMarkdown} />;
	if (narrow) {
		return (
			<Sheet open={open} onOpenChange={onOpenChange}>
				<SheetContent side="bottom" className="max-h-[88dvh] gap-0 overflow-hidden rounded-t-2xl" data-testid="chat-trace">
					<div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border" aria-hidden />
					<SheetHeader className="shrink-0 pb-2">
						<SheetTitle>Show work</SheetTitle>
						<SheetDescription>{intro}</SheetDescription>
					</SheetHeader>
					<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{body}</div>
				</SheetContent>
			</Sheet>
		);
	}
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl" data-testid="chat-trace">
				<DialogHeader>
					<DialogTitle>Show work</DialogTitle>
					<DialogDescription>{intro}</DialogDescription>
				</DialogHeader>
				{body}
			</DialogContent>
		</Dialog>
	);
}

function TraceBody({ trace, usage, renderMarkdown }: { trace: ChatTrace; usage?: ChatUsage; renderMarkdown?: RenderMarkdown }) {
	const md = (t: string) => renderMarkdown?.(t) ?? <p className="whitespace-pre-wrap">{t}</p>;
	const sent = trace.sent ?? ({} as ChatTrace['sent']);
	const rounds = Array.isArray(trace.rounds) ? trace.rounds : [];
	const total = PARTS.reduce((n, p) => n + num(sent[p.key]), 0);
	return (
		<>
				<section aria-label="What was sent" className="flex flex-col gap-1.5">
					<h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sent to the model</h3>
					{PARTS.filter((p) => num(sent[p.key]) > 0).map((p) => (
						<div key={p.key} title={p.hint} className="grid grid-cols-[8.5rem_1fr_3.5rem] items-center gap-2 text-[12px]">
							<span className="truncate text-muted-foreground">{p.label}</span>
							<span className="h-[5px] overflow-hidden rounded-full bg-border" aria-hidden>
								<span className="block h-full rounded-full bg-primary" style={{ width: `${total ? (num(sent[p.key]) / total) * 100 : 0}%` }} />
							</span>
							<span className="text-right font-semibold tabular-nums">{fmtTok(num(sent[p.key]))}</span>
						</div>
					))}
					<p className="text-[10.5px] leading-snug text-muted-foreground">
						Estimated from text length, for the first call.{usage && !usage.estimated ? ` The provider billed ${fmtTok(num(usage.prompt))} input tokens on the last call.` : ''}
					</p>
				</section>

				<section aria-label="Steps" className="flex flex-col gap-2">
					<h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
						{rounds.length} model call{rounds.length === 1 ? '' : 's'}
					</h3>
					{rounds.map((r, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: a saved trace is append-only — index is stable identity.
						<div key={i} className="flex flex-col gap-1.5 rounded-lg border border-border p-2.5 text-[12px]">
							<div className="flex items-baseline justify-between gap-2 text-muted-foreground">
								<span className="font-semibold text-foreground">Call {i + 1}</span>
								<span className="tabular-nums">
									${num(r.cost).toFixed(num(r.cost) < 0.1 ? 3 : 2)} · {fmtTok(num(r.prompt))} in · {fmtTok(num(r.completion))} out
								</span>
							</div>
							{r.reasoning && (
								<details className="group">
									<summary className="cursor-pointer truncate text-[var(--accent)] hover:underline">
										<span>Thinking</span>
										{snippet(r.reasoning) && <span className="font-normal text-muted-foreground"> · {snippet(r.reasoning)}</span>}
									</summary>
									<Thinking text={r.reasoning} md={md} />
								</details>
							)}
							{r.text && <div className="text-[11.5px] leading-snug">{md(r.text)}</div>}
							{(Array.isArray(r.calls) ? r.calls : []).map((c, j) => (
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
						Total ${num(usage.cost).toFixed(num(usage.cost) < 0.1 ? 3 : 2)}
						{num(usage.reasoning) ? ` · ${fmtTok(num(usage.reasoning))} thinking tokens` : ''}
					</p>
				)}
		</>
	);
}

/** The first line of a thought with its markdown marks removed, for the one-line summary above the full text. Only list markers and
 *  heading or quote marks come off the front, so "3 slides need work" and "-1.5% is bad" keep their first characters. Empty when the
 *  thought has no letter or digit in it. Cuts by code point. */
export function snippet(text: unknown, max = 80): string {
	if (typeof text !== 'string') return '';
	const line =
		text
			.split('\n')
			.map((l) =>
				l
					.replace(/[*_`]/g, '')
					.replace(/^\s*(?:[>#]+|[-+]|\d+[.)])\s+/, '')
					.trim(),
			)
			.find((l) => /[\p{L}\p{N}]/u.test(l)) ?? '';
	const chars = Array.from(line);
	return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : line;
}

/** The model's thinking, formatted, with a button in its corner to read the exact characters instead. Formatted is the default
 *  because providers often send markdown headings and lists; raw is one click away for anyone checking what the model wrote. */
function Thinking({ text, md }: { text: string; md: (t: string) => React.ReactNode }) {
	const [raw, setRaw] = React.useState(false);
	return (
		<div className="mt-1 rounded-md bg-muted/50 p-2 text-[11.5px] leading-snug text-muted-foreground">
			<button
				type="button"
				onClick={() => setRaw((v) => !v)}
				aria-pressed={raw}
				title={raw ? 'Show formatted' : 'Show the exact text'}
				className="float-right mb-1 ml-2 rounded border border-border bg-background px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground hover:border-[var(--accent)] hover:text-foreground aria-pressed:border-[var(--accent)] aria-pressed:text-foreground"
			>
				{raw ? 'Formatted' : 'Raw'}
			</button>
			{raw ? <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-snug">{text}</pre> : md(text)}
		</div>
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
