import type { ChatTrace, ChatTraceCall } from './studio-store';

// What "Show work" keeps of a reply, bounded so a long thread stays a few hundred kilobytes.
//
// A reply is saved with the rest of its deck's chat in localStorage (60 messages, ~5 MB for the
// whole origin), and an `edit_slides` call carries whole slides as arguments. So every field has a
// ceiling, reasoning is the first thing cut when a trace is over budget, and the author's own
// words and the model's answer are never touched (they live on the message itself).

const ARGS_MAX = 1200;
const RESULT_MAX = 600;
const REASONING_MAX = 2000;
const TEXT_MAX = 800;
/** A whole reply's trace, serialized. Measured: a six-round edit turn with long arguments is ~7 KB at these caps. */
export const TRACE_MAX_CHARS = 8000;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** A tool call as the trace keeps it. */
export function traceCall(name: string, args: string, result: string): ChatTraceCall {
	return { name, args: clip(args ?? '', ARGS_MAX), result: clip(String(result ?? '').replace(/\s+/g, ' ').trim(), RESULT_MAX) };
}

/** Clip every field, then cut reasoning (oldest round first) and finally arguments until the trace fits. */
export function boundTrace(trace: ChatTrace): ChatTrace {
	const out: ChatTrace = {
		sent: trace.sent,
		rounds: trace.rounds.map((r) => ({
			...r,
			...(r.reasoning ? { reasoning: clip(r.reasoning.trim(), REASONING_MAX) } : {}),
			...(r.text ? { text: clip(r.text.trim(), TEXT_MAX) } : {}),
			calls: r.calls.map((c) => traceCall(c.name, c.args, c.result)),
		})),
	};
	const size = () => JSON.stringify(out).length;
	for (const r of out.rounds) {
		if (size() <= TRACE_MAX_CHARS) break;
		if (r.reasoning) delete r.reasoning;
	}
	for (const r of out.rounds) {
		if (size() <= TRACE_MAX_CHARS) break;
		for (const c of r.calls) c.args = clip(c.args, 200);
	}
	return out;
}

/** A command's name as a sentence fragment for the drawer ("read_slides" -> "Read slides"). */
export function callLabel(name: string): string {
	const w = name.replace(/_/g, ' ').trim();
	return w.charAt(0).toUpperCase() + w.slice(1);
}
