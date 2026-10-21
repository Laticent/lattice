import { ArrowLeftRight, ArrowUp, Check, ChevronDown, Copy, Crown, Eye, Headphones, Link2, LogOut, Mic, MicOff, MoreHorizontal, Pencil, PhoneOff, Presentation, Server, Share2, Sparkles, UserMinus, UsersRound, Volume2, VolumeX, Wifi, X } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cleanName } from '@/lib/tavola';
import { cn } from '@/lib/utils';
import { CHAT_COMPOSER_FIELD, CHAT_COMPOSER_ROW, CHAT_COMPOSER_TOOLS } from '../panel-shells';
import { LiveAvatar } from './LiveAvatar';
import { elapsed, type LiveActions, type LiveChatLine, type LiveNote, type LivePerson, type LiveView, liveColor, qualityLine, SLIDE_REF } from './live-model';

// The Live panel — the collaboration PORTAL, not the workspace (§5.2 of
// engineering/decisions/2026-10-06-studio-live-collaboration.md). It is narrow on purpose:
// the editor and preview are where the work happens, and they carry the presence
// (carets, navigator avatars). Section order follows the ask: who (waiting, then
// present, with your own call controls on your own row), then text.

const SECTION = 'px-3.5 pt-3 pb-1 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground';
/** A finger needs a bigger target than a cursor: the row's icon buttons grow to 40 px on touch. */
const TOUCH = 'pointer-coarse:size-10';

/** The connection to a person: an icon in the row, the words in the person's menu (what the
 *  two-network check screenshots on a phone, where a hover title cannot be read). */
const LINK_LABEL = { local: 'On the same network', direct: 'Direct across networks', relay: 'Through a relay server' } as const;
const LINK_ICON = { local: Wifi, direct: ArrowLeftRight, relay: Server } as const;

/** What someone is doing, in a few words: presenting, then their view, then their panel (§7.6). */
function doingLabel(p: LivePerson): string | null {
	const d = p.doing;
	if (!d) return null;
	if (d.presenting) return 'presenting';
	if (d.asking) return 'asking the AI';
	if (d.view === 'article') return 'reading';
	if (d.view === 'fabricate') return 'in Fabricate';
	return d.panel === 'coach' ? 'in Coach' : d.panel === 'lenses' ? 'in Views' : d.panel === 'library' ? 'in Library' : null;
}

function whereLabel(p: LivePerson): string {
	if (p.away) return 'Reconnecting…';
	const doing = doingLabel(p);
	const tail = `${p.editing ? ' · editing' : ''}${doing ? ` · ${doing}` : ''}${p.at ? ` · ${p.at}` : ''}${p.changed ? ` · ${p.changed}` : ''}`;
	if (p.slideHidden) return `Slide hidden${tail}`;
	if (p.slide === null) return doing ? `Arriving… · ${doing}` : 'Arriving…';
	return `Slide ${p.slide + 1}${tail}`;
}


/**
 * A level slider, 0–200 % in 10 % steps. Used for how loud you hear one person, and for how loud you send.
 * Past 100 % the sound is amplified (a quiet phone, a quiet voice). It sits in a popover, not a menu: a
 * slider is not a menu item, and `onKeyDown` keeps the popover's arrow keys from eating its own.
 */
function LevelSlider({ id, label, value, onChange, disabled = false, hint, attr }: { id: string; label: string; value: number; onChange: (v: number) => void; disabled?: boolean; hint?: string; attr: string }) {
	const pct = Math.round(value * 100);
	const hintId = `${id}-hint`;
	return (
		<div className="flex flex-col gap-1 py-1 text-[11px] text-muted-foreground" {...{ [attr]: '' }}>
			<label htmlFor={id} className="flex items-center justify-between">
				<span>{label}</span>
				<span className="tabular-nums" aria-hidden>
					{pct} %
				</span>
			</label>
			<input
				id={id}
				type="range"
				min={0}
				max={200}
				step={10}
				value={pct}
				disabled={disabled}
				aria-valuetext={`${pct} percent`}
				aria-describedby={hint ? hintId : undefined}
				onChange={(e) => onChange(Number(e.target.value) / 100)}
				onKeyDown={(e) => e.stopPropagation()}
				className="h-5 w-full cursor-pointer accent-foreground disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-8"
			/>
			{hint && (
				<span id={hintId} className="leading-snug">
					{hint}
				</span>
			)}
		</div>
	);
}

/** How loud you hear one person. */
function VolumeSlider({ p, actions }: { p: LivePerson; actions: LiveActions }) {
	return <LevelSlider id={`live-volume-${p.id}`} label="Volume" value={p.volume ?? 1} onChange={(v) => actions.setVolume(p.id, v)} attr="data-live-volume" />;
}

/**
 * How loud you hear one person, and how their audio is arriving. ALWAYS on their row while calls are
 * available (a control that appears only in some states reads as missing: on the owner's iPhone, alone
 * in a session, there was nothing to find). What is inside says what is possible right now: the slider
 * when you are both on the call, otherwise why not. A popover rather than a menu item, because a slider
 * is not a menu item (axe `aria-required-children`), and a popover holds one properly.
 */
function PersonAudio({ p, view, actions }: { p: LivePerson; view: LiveView; actions: LiveActions }) {
	const live = p.volume !== undefined;
	const Glyph = live && (p.volume ?? 1) === 0 ? VolumeX : Volume2;
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="ghost" size="icon" className={cn('size-6 shrink-0', TOUCH, !live && 'text-muted-foreground/60')} aria-label={`Volume for ${p.name}`} data-live-volume-button data-live-available={live}>
					<Glyph className="size-3.5" />
				</Button>
			</PopoverTrigger>
			<LivePopoverContent align="end" className="w-60 p-3" data-live-person-audio>
				<div className="mb-1 text-[12px] font-semibold text-foreground">{p.name}</div>
				{live ? (
					<>
						<VolumeSlider p={p} actions={actions} />
						{p.quality && qualityLine(p.quality) && (
							<div className="mt-2 flex flex-col gap-0.5 text-[11px] text-muted-foreground" data-live-quality>
								<span>Audio: {qualityLine(p.quality)}</span>
								{p.quality.sendKbps !== undefined && <span>You send {Math.round(p.quality.sendKbps)} kbit/s</span>}
							</div>
						)}
					</>
				) : (
					<div className="flex flex-col gap-2 text-[11.5px] leading-snug text-muted-foreground" data-live-audio-unavailable>
						<span>{!view.call.inCall ? 'Join the call to hear and adjust people.' : `${p.name} isn't on the call yet.`}</span>
						{!view.call.inCall && (
							<Button size="sm" onClick={actions.toggleMic} className="self-start">
								Join audio
							</Button>
						)}
					</div>
				)}
			</LivePopoverContent>
		</Popover>
	);
}

/** One thing you can choose to show the others: a label, what it means, and a switch. */
function ShareRow({ id, label, note, checked, onChange }: { id: string; label: string; note: string; checked: boolean; onChange: (on: boolean) => void }) {
	return (
		<div className="flex flex-col gap-0.5">
			<div className="flex items-center justify-between gap-3 text-[12px] text-foreground">
				<label htmlFor={id}>{label}</label>
				<Switch id={id} checked={checked} onCheckedChange={onChange} aria-describedby={`${id}-note`} />
			</div>
			<span id={`${id}-note`} className="text-[11px] leading-snug text-muted-foreground">
				{note}
			</span>
		</div>
	);
}

/** Copies the connection timeline for a bug report, and says whether it reached the clipboard. */
function CopyLog({ onCopy }: { onCopy: () => Promise<boolean> }) {
	const [state, setState] = React.useState<'idle' | 'copied' | 'failed'>('idle');
	return (
		<div className="flex flex-col gap-1">
			<Button
				type="button"
				variant="secondary"
				size="sm"
				className={cn('h-8 self-start', TOUCH)}
				onClick={() => {
					void onCopy().then((ok) => {
						setState(ok ? 'copied' : 'failed');
						window.setTimeout(() => setState('idle'), 3000);
					});
				}}
			>
				{state === 'copied' ? 'Copied' : 'Copy connection log'}
			</Button>
			<span className="text-[11px] leading-snug text-muted-foreground" role="status">
				{state === 'failed' ? 'Could not copy. Allow clipboard access and try again.' : 'State changes, restarts and the path each link took. Paste it into a bug report.'}
			</span>
		</div>
	);
}

/**
 * Your name, changed on Save (Enter): one change is one roster update for everyone, so not per keystroke. The
 * host decides (it cleans the name, refuses one another person already has, and ignores a second change inside
 * a second), so when the roster has not shown the new name after a moment the field says so instead of
 * leaving a Save that seems to have worked.
 */
function NameField({ name, onSave }: { name: string; onSave: (name: string) => void }) {
	const [draft, setDraft] = React.useState(name);
	const [refused, setRefused] = React.useState(false);
	const focused = React.useRef(false);
	const asked = React.useRef<string | null>(null);
	const clean = cleanName(draft);
	// The roster is the truth: follow it, but never wipe what the person is typing right now.
	React.useEffect(() => {
		if (!focused.current) setDraft(name);
		if (asked.current !== null && name === asked.current) {
			asked.current = null;
			setRefused(false);
		}
	}, [name]);
	const dirty = draft.trim() !== '' && clean !== name;
	return (
		<form
			className="flex flex-col gap-1"
			data-live-name
			onSubmit={(e) => {
				e.preventDefault();
				if (!dirty) return;
				const want = clean;
				asked.current = want;
				setRefused(false);
				onSave(want);
				window.setTimeout(() => {
					if (asked.current === want) setRefused(true);
				}, 2500);
			}}
		>
			<label htmlFor="live-your-name" className="text-[12px] text-foreground">
				Your name
			</label>
			<div className="flex gap-2">
				<Input
					id="live-your-name"
					value={draft}
					maxLength={40}
					autoComplete="off"
					aria-describedby={refused ? 'live-your-name-note' : undefined}
					onFocus={() => {
						focused.current = true;
					}}
					onBlur={() => {
						focused.current = false;
					}}
					onChange={(e) => {
						setDraft(e.target.value);
						setRefused(false);
					}}
					className="h-8 flex-1 text-[12px]"
				/>
				<Button type="submit" size="sm" variant="secondary" disabled={!dirty} className={cn('h-8 shrink-0', TOUCH)}>
					Save
				</Button>
			</div>
			{refused && (
				<span id="live-your-name-note" role="status" className="text-[11px] leading-snug text-muted-foreground">
					The name did not change. Someone here may already have it, or you changed it twice within a second. Try another.
				</span>
			)}
		</form>
	);
}

/**
 * The ⋯ on your own row, like everyone else's: your settings that are not about audio (the "Me" scope, note
 * §12.3). What the others see of you is yours to choose, and it is on your row always, alone in a session too.
 */
function YourSettings({ view, actions }: { view: LiveView; actions: LiveActions }) {
	const sh = view.share;
	const me = view.people.find((p) => p.me);
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="ghost" size="icon" className={cn('size-6 shrink-0', TOUCH)} aria-label="Your settings" title="Your settings" data-live-your-settings-button>
					<MoreHorizontal className="size-3.5" />
				</Button>
			</PopoverTrigger>
			{/* Focus the popover itself, not its first field: the first field is the Name input, and focusing it opens the keyboard on a phone every time this opens. The next Tab still enters the popover, so a keyboard user is not left outside it. */}
			<LivePopoverContent align="end" onOpenAutoFocus={(e) => {
					e.preventDefault();
					(e.target as HTMLElement | null)?.focus?.({ preventScroll: true });
				}} className="max-h-[min(75vh,var(--radix-popover-content-available-height))] w-72 overflow-y-auto p-3" data-live-your-settings>
				<div className="mb-2 text-[12px] font-semibold text-foreground">Your settings</div>
				{me && (
					<div className="mb-3">
						<NameField name={me.name} onSave={actions.rename} />
					</div>
				)}
				<div className="flex flex-col gap-3" data-live-share>
					<div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">What others see</div>
					<ShareRow id="live-share-cursor" label="Show my cursor" note="Others see where you are in the editor. That shows roughly where you are working even when your slide is hidden." checked={sh.cursor} onChange={(on) => actions.setShare({ cursor: on })} />
					<ShareRow id="live-share-slide" label="Show my slide" note="Others see which slide you are on, and can jump to it." checked={sh.slide} onChange={(on) => actions.setShare({ slide: on })} />
					<ShareRow id="live-share-typing" label="Show when I'm typing" note="Others see when you type in the editor and in the chat." checked={sh.typing} onChange={(on) => actions.setShare({ typing: on })} />
					<ShareRow id="live-share-doing" label="Show what I'm doing" note="Others see the panel or view you have open, the settings panel and section, the settings row you are in, whether you are presenting, and when you are asking the AI. What you type or pick there, and what you ask, never shows unless you share it. On a desktop, someone following you opens the same panels and Present (never Fabricate or Setup, and never while they type)." checked={sh.doing} onChange={(on) => actions.setShare({ doing: on })} />
					<ShareRow id="live-share-pointer" label="Show my pointer" note="Others on your slide see your mouse pointer over it, and where you click. It can never click anything of theirs. Hiding your slide hides it too." checked={sh.pointer} onChange={(on) => actions.setShare({ pointer: on })} />
				</div>
				<div className="mt-3 flex flex-col gap-3 border-t border-border pt-3" data-live-connection>
					<div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Connection</div>
					<CopyLog onCopy={actions.copyLog} />
				</div>
			</LivePopoverContent>
		</Popover>
	);
}

function PersonRow({ p, view, actions }: { p: LivePerson; view: LiveView; actions: LiveActions }) {
	const MicGlyph = p.mic === 'muted' ? MicOff : Mic;
	const canManage = view.isHost && !p.me && p.role !== 'host';
	const following = view.following === p.id;
	const LinkGlyph = p.link && !p.away ? LINK_ICON[p.link.kind] : null;
	return (
		<li className={cn('group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-accent', p.away && 'opacity-55')} data-live-speaking={p.mic === 'speaking'}>
			<LiveAvatar person={p} size={26} ring={p.mic === 'speaking'} />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1 truncate text-[12.5px] font-semibold text-foreground">
					<span className="truncate">{p.name}</span>
					{p.role === 'host' && <Crown className="size-3 shrink-0 text-muted-foreground" aria-label="Host" />}
					{p.role === 'view' && <Eye className="size-3 shrink-0 text-muted-foreground" aria-label="View only" />}
				</div>
				<div className="flex items-center gap-1 text-[11px] text-muted-foreground">
					{/* "You" sits here rather than beside the name: your row also carries the call buttons,
					    and in the docked column a "(you)" beside the name squeezed the name itself out. */}
					<span className="truncate">{p.me ? `You · ${whereLabel(p)}` : following ? `Following · ${whereLabel(p)}` : whereLabel(p)}</span>
					{LinkGlyph && p.link && <LinkGlyph className="size-3 shrink-0 text-muted-foreground/70" role="img" aria-label={`${LINK_LABEL[p.link.kind]} (${p.link.detail})`} data-live-link={p.link.kind} />}
				</div>
			</div>
			{view.audio && p.me && <CallControls view={view} actions={actions} />}
			{p.me && <YourSettings view={view} actions={actions} />}
			{view.audio && !p.me && p.mic !== 'off' && <MicGlyph className={cn('size-3.5 shrink-0', p.mic === 'muted' ? 'text-muted-foreground/60' : 'text-foreground')} aria-label={p.mic === 'muted' ? 'Muted' : 'Mic on'} />}
			{view.audio && !p.me && !p.away && <PersonAudio p={p} view={view} actions={actions} />}
			{!p.me && !p.away && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="size-6" aria-label={`Options for ${p.name}`}>
							<MoreHorizontal className="size-3.5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuItem onSelect={() => actions.follow(following ? null : p.id)}>
							<Eye className="size-4" /> {following ? 'Stop following' : `Follow ${p.name}`}
						</DropdownMenuItem>
						{p.slide !== null && (
							<DropdownMenuItem onSelect={() => actions.goToSlide(p.slide as number)}>
								<ArrowUp className="size-4 rotate-45" /> Go to slide {p.slide + 1}
							</DropdownMenuItem>
						)}
						{p.link && (
							<DropdownMenuLabel className="flex flex-col gap-0.5 py-1 text-[11px] font-normal text-muted-foreground" data-live-link-detail>
								<span>Connection: {LINK_LABEL[p.link.kind].toLowerCase()}</span>
								<span className="font-mono text-[10.5px]">{p.link.detail}</span>
							</DropdownMenuLabel>
						)}
						{canManage && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem onSelect={() => actions.setRole(p.id, p.role === 'edit' ? 'view' : 'edit')}>
									{p.role === 'edit' ? <Eye className="size-4" /> : <Pencil className="size-4" />}
									{p.role === 'edit' ? 'Make view-only' : 'Allow editing'}
								</DropdownMenuItem>
								<DropdownMenuItem variant="destructive" onSelect={() => actions.remove(p.id)}>
									<UserMinus className="size-4" /> Remove from session
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</li>
	);
}

/**
 * The live level of what you send, as a bar. Reads `actions.inputLevel()` on animation frames while it is
 * mounted (a popover mounts it only while open, so nothing runs otherwise). RMS speech sits low in 0–1, so
 * the bar is scaled (a square root) to move visibly at ordinary speaking volume; it is a meter, not a
 * measurement. Respects reduced motion by not animating the width change.
 */
function MicMeter({ actions, active }: { actions: LiveActions; active: boolean }) {
	const [shown, setShown] = React.useState(0);
	React.useEffect(() => {
		if (!active) {
			setShown(0);
			return;
		}
		let raf = 0;
		const tick = () => {
			setShown(Math.min(1, Math.sqrt(actions.inputLevel()) * 1.6));
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [actions, active]);
	const pct = Math.round(shown * 100);
	return (
		// biome-ignore lint/a11y/useSemanticElements: a styled bar; a native <meter> cannot be skinned the same in every engine, and role="meter" carries the same value to assistive tech.
		<div role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 w-full overflow-hidden rounded-full bg-border" data-live-meter>
			<div className={cn('h-full rounded-full bg-primary', shown > 0.9 && 'bg-destructive')} style={{ width: `${pct}%` }} />
		</div>
	);
}

/**
 * Everything about what YOU send, in one popover (the "Me" scope, note §12.3): a live level meter so you
 * can see your microphone work (alone, with nobody else on), which microphone, how loud you send, and the
 * voice mode. It is on your row before you join the call too, with the parts that need a live microphone
 * saying so, because a control that only appears in some states reads as missing.
 */
function YourAudio({ view, actions }: { view: LiveView; actions: LiveActions }) {
	const c = view.call;
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					size="icon"
					variant={c.inCall && !c.muted ? 'default' : 'outline'}
					className={cn('-ml-px h-7 w-6 rounded-l-none pointer-coarse:h-10 pointer-coarse:w-6', c.stalled && 'ring-2 ring-destructive')}
					aria-label={c.stalled ? 'Your audio: your microphone has stopped sending' : 'Your audio'}
					title={c.stalled ? 'Your microphone has stopped sending' : 'Your audio'}
					data-live-your-audio-button
					data-stalled={c.stalled}
				>
					<ChevronDown className="size-3" />
				</Button>
			</PopoverTrigger>
			<LivePopoverContent align="end" className="max-h-[min(75vh,var(--radix-popover-content-available-height))] w-72 overflow-y-auto p-3" data-live-your-audio>
				<div className="mb-2 text-[12px] font-semibold text-foreground">Your audio</div>
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-1">
						<MicMeter actions={actions} active={c.inCall && !c.muted} />
						<span className="text-[11px] leading-snug text-muted-foreground" data-live-meter-note>
							{!c.inCall ? 'Join audio to see your microphone move.' : c.muted ? 'You are muted.' : 'Say something: the bar should move.'}
						</span>
						{c.stalled && (
							<span className="text-[11px] leading-snug text-destructive" role="alert" data-live-stalled>
								Your microphone has stopped sending (the phone took the audio, for a call or Siri). Tap Unmute, or Leave call and Join audio again.
							</span>
						)}
						{!c.inCall && (
							<Button size="sm" onClick={actions.toggleMic} className="mt-1 self-start">
								<Headphones className="size-3.5" /> Join audio
							</Button>
						)}
					</div>
					{c.inCall && c.devices.length > 1 && (
						<RadioGroup value={c.device ?? ''} onValueChange={actions.pickMic} aria-label="Microphone" className="flex flex-col items-stretch gap-0.5" data-live-mic-list>
							{c.devices.map((d) => (
								<label key={d.id} htmlFor={`live-mic-${d.id}`} className="flex min-h-8 cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-[12px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring pointer-coarse:min-h-10">
									<RadioGroupItem id={`live-mic-${d.id}`} value={d.id} className="size-3.5 shrink-0 rounded-full border border-foreground data-[state=checked]:bg-foreground" />
									<span className="min-w-0 flex-1 truncate">{d.label}</span>
								</label>
							))}
						</RadioGroup>
					)}
					{!c.inCall && (
						<span className="text-[11px] leading-snug text-muted-foreground" data-live-mic-hint>
							Join audio to choose a microphone.
						</span>
					)}
					<LevelSlider
						id="live-mic-level"
						label="Mic level"
						value={c.micLevel}
						onChange={actions.setMicLevel}
						disabled={c.inCall && !c.canShapeMic}
						hint={c.inCall && !c.canShapeMic ? "This browser can't change your level." : 'How loud you are to everyone else. Above 100 % a loud voice can clip: the bar turns red.'}
						attr="data-live-mic-level"
					/>
					<div className="flex flex-col gap-1">
						<div className="flex items-center justify-between gap-3 text-[12px] text-foreground">
							<label htmlFor="live-high-fidelity">High fidelity (music)</label>
							<Switch id="live-high-fidelity" checked={c.highFidelity} disabled={!c.inCall} onCheckedChange={actions.setHighFidelity} aria-describedby="live-hifi-note" data-live-high-fidelity />
						</div>
						<span id="live-hifi-note" className="text-[11px] leading-snug text-muted-foreground">
							{c.inCall ? 'Sends 128 kbit/s with echo cancellation, noise suppression and automatic gain off. Wear headphones, or the others hear an echo.' : 'Join audio first. Then this sends 128 kbit/s with voice processing off, for music; wear headphones.'}
						</span>
					</div>
					<div className="flex flex-col gap-1" data-live-hearing>
						<div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Hearing</div>
						<LevelSlider id="live-master-volume" label="Everyone" value={c.masterVolume} onChange={actions.setMasterVolume} attr="data-live-master" hint="One volume for everyone you hear. Each person's own volume is on their row." />
						{!c.canPickOutput ? (
							<span className="text-[11px] leading-snug text-muted-foreground" data-live-output-note>
								Your browser plays through the system output; it has no speaker picker.
							</span>
						) : c.outputs.length < 2 ? (
							<span className="text-[11px] leading-snug text-muted-foreground" data-live-output-note>
								{c.inCall ? 'Only one speaker found.' : 'Join audio to list your speakers.'}
							</span>
						) : (
							<RadioGroup value={c.output ?? c.outputs[0]?.id ?? ''} onValueChange={actions.pickOutput} aria-label="Speaker" className="flex flex-col items-stretch gap-0.5" data-live-output-list>
								{c.outputs.map((d) => (
									<label key={d.id} htmlFor={`live-out-${d.id}`} className="flex min-h-8 cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-[12px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring pointer-coarse:min-h-10">
										<RadioGroupItem id={`live-out-${d.id}`} value={d.id} className="size-3.5 shrink-0 rounded-full border border-foreground data-[state=checked]:bg-foreground" />
										<span className="min-w-0 flex-1 truncate">{d.label}</span>
									</label>
								))}
							</RadioGroup>
						)}
					</div>
				</div>
			</LivePopoverContent>
		</Popover>
	);
}

/**
 * Your own call controls, on your own row (§5.8): join, or mute; the Your audio popover beside them
 * either way; and hang up once you are on the call. Being in the session is not being on the call
 * (someone can edit silently), so hanging up says "Leave call"; leaving the SESSION is the session menu's.
 */
function CallControls({ view, actions }: { view: LiveView; actions: LiveActions }) {
	const c = view.call;
	return (
		<div className="flex shrink-0 items-center gap-1" data-live-call>
			<div className="flex items-stretch">
				{c.inCall ? (
					<Button
						size="icon"
						variant={c.muted ? 'outline' : 'default'}
						onClick={actions.toggleMic}
						aria-pressed={!c.muted}
						aria-label={c.muted ? 'Unmute' : 'Mute'}
						title={c.muted ? 'Unmute' : 'Mute'}
						className={cn('size-7 rounded-r-none', TOUCH)}
					>
						{c.muted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
					</Button>
				) : (
					<Button size="sm" variant="outline" onClick={actions.toggleMic} className="h-7 shrink-0 gap-1.5 rounded-r-none px-2.5 text-[11.5px] pointer-coarse:h-10">
						<Headphones className="size-3.5" /> Join audio
					</Button>
				)}
				<YourAudio view={view} actions={actions} />
			</div>
			{c.inCall && (
				<Button size="icon" variant="outline" onClick={actions.leaveCall} aria-label="Leave call" title="Leave call" className={cn('size-7 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive', TOUCH)}>
					<PhoneOff className="size-3.5" />
				</Button>
			)}
		</div>
	);
}

/**
 * The session menu: the clock, then copy, bring everyone, and leave or end. One menu on every
 * size: in the panel's title bar on a wide screen, in the sheet's header on a phone (where the
 * panel has no title bar of its own). Leaving and ending each ask first: one stray tap would
 * otherwise drop you out of the session, or end it for everyone.
 */
function SessionMenu({ view, actions, now }: { view: LiveView; actions: LiveActions; now: number }) {
	const [confirming, setConfirming] = React.useState(false);
	// One leave or end per confirmation: a double tap would otherwise run it (and its toast) twice.
	const acted = React.useRef(false);
	const ending = view.isHost;
	return (
		<>
			<span className="size-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
			{view.startedAt !== null && <span className="font-mono text-[11px] font-normal tabular-nums tracking-normal text-muted-foreground">{elapsed(view.startedAt, now)}</span>}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" className={cn('-my-1 size-6', TOUCH)} aria-label="Session options">
						<MoreHorizontal className="size-3.5" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-52">
					<DropdownMenuItem onSelect={() => void actions.copyLink()}><Link2 className="size-4" /> Copy invite link</DropdownMenuItem>
					{view.isHost && <DropdownMenuItem onSelect={actions.bringEveryone}><Eye className="size-4" /> Bring everyone to my slide</DropdownMenuItem>}
					{view.isHost && <DropdownMenuItem onSelect={() => actions.presentToEveryone(!view.presentingToAll)} data-live-present-all><Presentation className="size-4" /> {view.presentingToAll ? 'Stop presenting to everyone' : 'Present to everyone'}</DropdownMenuItem>}
					<DropdownMenuSeparator />
					<DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
						<LogOut className="size-4" /> {ending ? 'End session for everyone…' : 'Leave session…'}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<Dialog open={confirming} onOpenChange={setConfirming}>
				<DialogContent data-live-confirm>
					<DialogHeader>
						<DialogTitle>{ending ? 'End the session for everyone?' : 'Leave the session?'}</DialogTitle>
						<DialogDescription>
							{ending
								? 'Everyone is disconnected, and the chat and the call end. Each person keeps their own copy of the deck.'
								: 'You leave the chat and the call. Your copy of the deck stays here. To come back, open the invite link again.'}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
						<Button
							variant="destructive"
							onClick={() => {
								setConfirming(false);
								if (acted.current) return;
								acted.current = true;
								(ending ? actions.end : actions.leave)();
							}}
						>
							{ending ? 'End session' : 'Leave session'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

/** Chat text with "slide 6" / "#6" turned into chips that jump the preview. */
function ChatText({ text, onSlide }: { text: string; onSlide: (i: number) => void }) {
	const parts: React.ReactNode[] = [];
	let last = 0;
	for (const m of text.matchAll(SLIDE_REF)) {
		const n = Number(m[1]);
		if (m.index > last) parts.push(text.slice(last, m.index));
		parts.push(
			<button key={m.index} type="button" onClick={() => onSlide(n - 1)} className="mx-0.5 inline-flex items-center rounded-md border border-border bg-background px-1.5 py-px text-[11px] font-semibold text-foreground hover:bg-accent">
				Slide {n}
			</button>,
		);
		last = m.index + m[0].length;
	}
	if (last < text.length) parts.push(text.slice(last));
	return <>{parts}</>;
}

/**
 * One chat line, drawn as a bubble — the Architect chat's shape, so the two chats read as one
 * product: your own lines on the right in the primary color, everyone else's on the left on the
 * muted surface with their name in their session color. A run of lines from one person shows the
 * name and the time once (session time, in the viewer's zone). A line the host has not echoed yet
 * is dimmed with "Sending…". System lines (joins, role changes) are small centered notes.
 */
/** A session time in the viewer's own zone and format ("2:05 PM", "14:05"). */
const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** A slide number as a chip that goes to it (the same chip a typed "slide 3" becomes). */
function SlideChip({ n, onSlide }: { n: number; onSlide: (i: number) => void }) {
	return (
		<button type="button" onClick={() => onSlide(n - 1)} className="mx-0.5 inline-flex items-center rounded-md border border-border bg-background px-1.5 py-px text-[11px] font-semibold text-foreground hover:bg-accent">
			Slide {n}
		</button>
	);
}

/**
 * A note in the people chat (2026-10-20 note §5.3): an AI edit someone applied, or an AI chat turn its
 * owner shared. The words around the note's strings are written here, never taken from the sender, and
 * the strings render as text.
 */
function NoteLine({ line, onSlide }: { line: Extract<LiveChatLine, { kind: 'message' }> & { note: LiveNote }; onSlide: (i: number) => void }) {
	const who = line.mine ? 'You' : line.from;
	const name = <span className="font-semibold" style={line.mine ? undefined : { color: liveColor(line.color) }}>{who}</span>;
	const note = line.note;
	if (note.k === 'ai-edit') {
		return (
			<li className={cn('py-1 text-center text-[11px] leading-relaxed text-muted-foreground', line.pending && 'opacity-60')} data-live-note="ai-edit">
				<Sparkles className="mr-1 inline size-3 align-[-1px] text-[var(--accent)]" aria-hidden />
				{name} applied an AI edit {note.slides.length === 0 ? 'to the deck settings' : note.slides.length === 1 ? 'to' : 'to slides'}
				{note.slides.map((n) => (
					<SlideChip key={n} n={n} onSlide={onSlide} />
				))}
			</li>
		);
	}
	return (
		<li className={cn('flex flex-col pt-1.5', line.mine ? 'items-end' : 'items-start', line.pending && 'opacity-60')} data-live-note="ai-turn">
			<div className="w-[92%] rounded-xl border border-border bg-background px-3 py-2 text-[12px] leading-relaxed">
				<p className="pb-1.5 text-[11px] text-muted-foreground">
					<Sparkles className="mr-1 inline size-3 align-[-1px] text-[var(--accent)]" aria-hidden />
					{name} shared from the AI chat
				</p>
				{note.ask.trim() && <p className="mb-1.5 line-clamp-3 whitespace-pre-wrap break-words border-l-2 border-border pl-2 text-muted-foreground">{note.ask}</p>}
				<div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-foreground">{note.answer}</div>
			</div>
			{line.pending && <span className="px-1 pt-0.5 text-[10.5px] text-muted-foreground">Sending…</span>}
		</li>
	);
}

function ChatLine({ line, prev, onSlide }: { line: LiveChatLine; prev: LiveChatLine | undefined; onSlide: (i: number) => void }) {
	if (line.kind === 'system') return <li className="py-0.5 text-center text-[11px] text-muted-foreground">{line.text}</li>;
	if (line.note) return <NoteLine line={{ ...line, note: line.note }} onSlide={onSlide} />;
	const run = prev?.kind === 'message' && !prev.note && prev.from === line.from && prev.mine === line.mine && line.at - prev.at < 120_000;
	const time = <time className="font-normal tabular-nums text-muted-foreground" dateTime={new Date(line.at).toISOString()}>{clock.format(line.at)}</time>;
	if (line.mine) {
		return (
			<li className={cn('flex flex-col items-end', run ? 'pt-0.5' : 'pt-1.5')}>
				{!run && <span className="px-1 pb-0.5 text-[10.5px]">{time}</span>}
				<div className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-3 py-1.5 text-[12.5px] leading-relaxed text-primary-foreground', line.pending && 'opacity-60')}>
					<ChatText text={line.text} onSlide={onSlide} />
				</div>
				{line.pending && <span className="px-1 pt-0.5 text-[10.5px] text-muted-foreground">Sending…</span>}
			</li>
		);
	}
	return (
		<li className={cn('flex flex-col items-start', run ? 'pt-0.5' : 'pt-1.5')}>
			{!run && (
				<span className="flex items-baseline gap-1.5 px-1 pb-0.5 text-[11px]">
					<span className="font-semibold" style={{ color: liveColor(line.color) }}>{line.from}</span>
					<span className="text-[10.5px]">{time}</span>
				</span>
			)}
			<div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md border border-border bg-muted px-3 py-1.5 text-[12.5px] leading-relaxed text-foreground">
				<ChatText text={line.text} onSlide={onSlide} />
			</div>
		</li>
	);
}

/** "Amina is typing…" — under the last line, above the composer. */
function TypingNote({ names }: { names: string[] }) {
	if (names.length === 0) return null;
	const who = names.length === 1 ? `${names[0]} is` : names.length === 2 ? `${names[0]} and ${names[1]} are` : 'Several people are';
	return (
		<p className="flex items-center gap-1.5 px-3.5 pb-1 text-[11px] text-muted-foreground" aria-live="polite">
			<span className="flex gap-0.5" aria-hidden>
				{[0, 1, 2].map((i) => (
					<span key={i} className="size-1 animate-pulse rounded-full bg-current" style={{ animationDelay: `${i * 160}ms` }} />
				))}
			</span>
			{who} typing…
		</p>
	);
}

function Composer({ onSend, onTyping }: { onSend: (text: string) => void; onTyping: () => void }) {
	const [draft, setDraft] = React.useState('');
	const send = () => {
		const t = draft.trim();
		if (!t) return;
		onSend(t);
		setDraft('');
	};
	return (
		<div className={CHAT_COMPOSER_ROW}>
			<Textarea
				autosize
				maxRows={4}
				rows={1}
				value={draft}
				onChange={(e) => {
					setDraft(e.target.value);
					if (e.target.value.trim()) onTyping();
				}}
				onKeyDown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
						e.preventDefault();
						send();
					}
				}}
				data-focus-ring="container"
				aria-label="Message everyone"
				placeholder="Message everyone…"
				className={CHAT_COMPOSER_FIELD}
			/>
			<span className={CHAT_COMPOSER_TOOLS}>
				{/* Keeps the keyboard up for the next message (the field keeps focus through the tap). */}
				<Button size="icon" className="size-7 rounded-lg" aria-label="Send" disabled={!draft.trim()} onMouseDown={(e) => e.preventDefault()} onClick={send}>
					<ArrowUp className="size-4" />
				</Button>
			</span>
		</div>
	);
}

/** The panel body before a session: one card, your name, one action. */
function StartCard({ actions, defaultName }: { actions: LiveActions; defaultName: string }) {
	const [name, setName] = React.useState(defaultName);
	// The button keeps the field's focus through the tap (`onMouseDown` preventDefault, the idiom
	// table-controls uses). On a phone the sheet is 54px taller while a field has focus
	// (`MOBILE_HEIGHT`); letting the tap blur the field shrank it BEFORE the click landed, so the click
	// hit the field that slid under the finger and Start did nothing (found on a 390 px run).
	const start = () => {
		if (name.trim()) actions.start(name);
	};
	return (
		<div className="flex flex-col gap-3 px-3.5 py-4">
			<div className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[12px] leading-relaxed text-muted-foreground">
				<UsersRound className="mx-auto mb-1.5 size-5 text-[var(--accent)]" />
				Edit this deck together, live. Share a link; people knock, you let them in, and everyone sees the same deck, carets and slide.
				<span className="mt-1.5 block">Up to 4 people. Edits go browser to browser.</span>
			</div>
			<label htmlFor="live-start-name" className="text-[11.5px] font-semibold text-foreground">Your name</label>
			<Input
				id="live-start-name"
				value={name}
				maxLength={40}
				autoComplete="name"
				enterKeyHint="go"
				onChange={(e) => setName(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
						e.preventDefault();
						start();
					}
				}}
				placeholder="How others will see you"
				className="h-8 text-[12.5px]"
			/>
			<Button type="button" disabled={!name.trim()} onMouseDown={(e) => e.preventDefault()} onClick={start} className="w-full gap-1.5">
				<Link2 className="size-4" /> Start live session
			</Button>
		</div>
	);
}

/**
 * The invite on one line: copy, the link itself (tap to select it), and who the link lets in.
 * The copy button shows a check for a moment, beside the toast that says the same. In a narrow
 * column (the docked panel at its default width) the link would show as "http…", so the button
 * says "Copy" and the link wraps to a line of its own, still there to select by hand if the
 * clipboard refuses. One field either way, measured by the panel's width, not the window's.
 */
function InviteRow({ view, actions, full }: { view: LiveView; actions: LiveActions; full: boolean }) {
	const [copied, setCopied] = React.useState(false);
	React.useEffect(() => {
		if (!copied) return;
		const t = setTimeout(() => setCopied(false), 2000);
		return () => clearTimeout(t);
	}, [copied]);
	return (
		<div className="flex flex-wrap items-stretch gap-y-2" data-live-invite>
			<Button
				variant="outline"
				size="sm"
				onClick={() => void actions.copyLink().then((ok) => ok && setCopied(true))}
				disabled={full || !view.link}
				aria-label="Copy invite link"
				title="Copy invite link"
				className={cn('h-8 w-9 shrink-0 gap-1.5 rounded-r-none px-0 pointer-coarse:h-10 pointer-coarse:w-11', '@max-[17rem]/live:w-auto @max-[17rem]/live:min-w-0 @max-[17rem]/live:shrink @max-[17rem]/live:flex-1 @max-[17rem]/live:justify-start @max-[17rem]/live:px-2.5')}
			>
				{copied ? <Check className="size-4" /> : <Copy className="size-4" />}
				<span className={cn('hidden truncate text-[12px]', '@max-[17rem]/live:inline')}>{full ? 'Full' : copied ? 'Copied' : 'Copy'}</span>
			</Button>
			{full || !view.link ? (
				<span className={cn('-ml-px flex h-8 min-w-0 flex-1 items-center border border-border bg-background px-2 text-[11.5px] text-muted-foreground pointer-coarse:h-10', '@max-[17rem]/live:hidden')}>{full ? 'Session full' : 'Preparing the link…'}</span>
			) : (
				<input
					readOnly
					value={view.link}
					aria-label="Invite link"
					onFocus={(e) => e.currentTarget.select()}
					className={cn(
						'-ml-px h-8 min-w-0 flex-1 truncate border border-border bg-background px-2 font-mono text-[10.5px] text-muted-foreground outline-none pointer-coarse:h-10',
						'@max-[17rem]/live:order-last @max-[17rem]/live:ml-0 @max-[17rem]/live:h-7 @max-[17rem]/live:basis-full @max-[17rem]/live:rounded-md',
					)}
				/>
			)}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="sm" className="-ml-px h-8 shrink-0 gap-1 rounded-l-none px-2 text-[11.5px] pointer-coarse:h-10" aria-label="Link permission">
						{view.linkRole === 'edit' ? 'Can edit' : 'Can view'}
						<ChevronDown className="size-3" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onSelect={() => actions.setLinkRole('edit')}><Pencil className="size-4" /> Can edit{view.linkRole === 'edit' && <Check className="ml-auto size-4" />}</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => actions.setLinkRole('view')}><Eye className="size-4" /> Can view{view.linkRole === 'view' && <Check className="ml-auto size-4" />}</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

/** The panel's own root element, so a popover can find the modal it sits in. On a phone the panel lives in a modal
 *  Sheet, whose scroll lock blocks touch scrolling in anything outside the Sheet: a popover taller than its room
 *  showed but would not scroll (owner's iPhone, 2026-10-12). So a popover goes INTO that dialog. Anywhere else it stays
 *  in `<body>`: inside the panel itself, a tap on a switch near the panel's edge reached react-resizable-panels' document
 *  handler, which focuses the resize handle, and that focus change dismissed the popover (found on the real Studio). */
const LiveRoot = React.createContext<HTMLElement | null>(null);
const useLiveRoot = () => React.useContext(LiveRoot);
function LivePopoverContent(props: React.ComponentProps<typeof PopoverContent>) {
	const dialog = useLiveRoot()?.closest<HTMLElement>('[role="dialog"]') ?? null;
	return <PopoverContent container={dialog} {...props} />;
}

export function LivePanel({ view, actions, title, now, defaultName = '', headerSlot }: { view: LiveView; actions: LiveActions; title?: string; now: number; defaultName?: string; headerSlot?: HTMLElement | null }) {
	const chatEnd = React.useRef<HTMLLIElement>(null);
	const chatCount = view.chat.length;
	React.useEffect(() => {
		if (chatCount) chatEnd.current?.scrollIntoView({ block: 'end' });
	}, [chatCount]);
	const live = view.status === 'live';
	const full = view.people.length >= view.cap;
	const [root, setRoot] = React.useState<HTMLElement | null>(null);
	return (
		<LiveRoot.Provider value={root}>
		<div ref={setRoot} className="group/live @container/live flex min-h-0 flex-1 flex-col" data-live-panel>
			{title && (
				<div className="flex items-center gap-2 border-b border-border px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
					<span>{title}</span>
					{live && (
						<>
							<span className="flex-1" />
							<SessionMenu view={view} actions={actions} now={now} />
						</>
					)}
				</div>
			)}
			{!title && live && headerSlot && createPortal(<SessionMenu view={view} actions={actions} now={now} />, headerSlot)}
			{!live ? (
				<StartCard actions={actions} defaultName={defaultName} />
			) : (
				<>
					{/* The session block scrolls rather than pushing the chat off the sheet, and on a phone it
					    folds away while you type a message: with the keyboard up there is room for the chat or
					    the roster, not both, and the composer must never sit under the keyboard. */}
					<div className="max-h-[55%] min-h-0 shrink-0 overflow-y-auto max-[699px]:group-has-[textarea:focus]/live:hidden">
						{view.isHost && (
							<div className="flex flex-col gap-2 px-3.5 pt-3">
								<InviteRow view={view} actions={actions} full={full} />
								<div className="flex items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
									<label htmlFor="live-auto-admit">Let people in automatically</label>
									<Switch id="live-auto-admit" checked={view.autoAdmit} onCheckedChange={actions.setAutoAdmit} />
								</div>
								{view.heir && view.heir !== 'you' && (
									<p className="text-[11px] leading-snug text-muted-foreground" data-live-heir>
										If you're disconnected for about half a minute, {view.heir} hosts until you're back.
									</p>
								)}
							</div>
						)}
						{view.hostAway && (
							<p className="mx-3.5 mt-3 rounded-lg border border-border bg-background px-2.5 py-2 text-[11.5px] text-muted-foreground" data-live-away-note>
								{view.heir === 'you'
									? "The host is away. You can keep editing. If they aren't back in about half a minute, you host until they return."
									: view.heir
										? `The host is away. You can keep editing. If they aren't back in about half a minute, ${view.heir} hosts until they return.`
										: "The host is away. You can keep editing; new people can't join until they return."}
							</p>
						)}
						{view.isHost && view.waiting.length > 0 && (
							<>
								<div className={SECTION}>Waiting ({view.waiting.length})</div>
								<ul className="flex flex-col gap-1 px-1.5">
									{view.waiting.map((k) => (
										<li key={k.id} className="flex items-center gap-2 rounded-lg border border-[var(--accent)] bg-background px-2 py-1.5">
											<span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-foreground">{k.name}</span>
											<Button size="icon" variant="ghost" className="size-6" onClick={() => actions.deny(k.id)} aria-label={`Deny ${k.name}`} title="Deny"><X className="size-3.5" /></Button>
											<Button size="xs" onClick={() => actions.admit(k.id)} disabled={full} aria-label={`Admit ${k.name}`}><Check /> Admit</Button>
										</li>
									))}
								</ul>
							</>
						)}
						{view.present && (
							<div className="mx-1.5 mt-2 flex items-center gap-2 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-2 py-1.5" data-live-present-join>
								<Presentation className="size-4 shrink-0 text-[var(--accent)]" />
								<span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-foreground">{view.present.by} is presenting</span>
								<Button size="xs" onClick={actions.joinPresent}>Join</Button>
							</div>
						)}
						{view.isHost && view.unshared.length > 0 && (
							<>
								<div className={SECTION}>Not shared yet ({view.unshared.length})</div>
								<p className="px-3.5 pb-1.5 text-[11px] leading-snug text-muted-foreground">
									The deck uses these from your Library. Until you share them, the others see a fallback.
									{view.unshared.some((u) => u.kind === 'component') && " A component's code isn't shared yet; sharing its name stops their editor flagging it."}
								</p>
								<ul className="flex flex-col gap-1 px-1.5" data-live-unshared>
									{view.unshared.map((u) => (
										<li key={u.key} className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5">
											<span className="flex min-w-0 flex-1 flex-col">
												<span className="text-[10.5px] text-muted-foreground">{u.kind === 'look' ? 'Session look' : u.kind === 'theme' ? 'Theme' : u.kind === 'finish' ? 'Finish' : 'Component'}</span>
												<span className="truncate text-[12.5px] font-semibold text-foreground">{u.name}</span>
											</span>
											{u.tooLarge ? (
												<span className="shrink-0 text-[11px] text-muted-foreground">Too large to share</span>
											) : (
												<Button size="xs" variant="outline" className="shrink-0" onClick={() => actions.shareRecord(u.key)} aria-label={`Share ${u.name}`}>
													<Share2 /> {u.kind === 'component' ? 'Share name' : 'Share'}
												</Button>
											)}
										</li>
									))}
								</ul>
							</>
						)}
						{view.unsharedComments > 0 && (
							<div className="mx-1.5 mt-1.5 flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5" data-live-unshared-comments>
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="text-[10.5px] text-muted-foreground">Comments written before the session</span>
									<span className="truncate text-[12.5px] font-semibold text-foreground">
										{view.unsharedComments === 1 ? '1 comment only you see' : `${view.unsharedComments} comments only you see`}
									</span>
								</span>
								<Button size="xs" variant="outline" className="shrink-0" onClick={actions.shareComments} aria-label={view.unsharedComments === 1 ? 'Share 1 comment' : `Share ${view.unsharedComments} comments`}>
									<Share2 /> Share
								</Button>
							</div>
						)}
						<div className={SECTION}>
							In this session ({view.people.length}/{view.cap})
						</div>
						<ul className="flex flex-col px-1.5">
							{view.people.map((p) => <PersonRow key={p.id} p={p} view={view} actions={actions} />)}
						</ul>
						{view.audio && view.call.denied && !view.call.inCall && (
							<p className="px-3.5 pb-2 text-[11px] leading-snug text-muted-foreground" data-live-mic-denied>
								The browser blocked the microphone. Allow it from the icon in the address bar, then join again.
							</p>
						)}
					</div>
					<div className="mt-1.5 flex min-h-0 flex-1 flex-col border-t border-border max-[699px]:group-has-[textarea:focus]/live:mt-0 max-[699px]:group-has-[textarea:focus]/live:border-t-0">
						<div className={SECTION}>Chat</div>
						<ul className="min-h-0 flex-1 overflow-y-auto px-3.5 py-1.5" aria-label="Session chat" aria-live="polite">
							{view.chat.length === 0 && <li className="text-[11.5px] text-muted-foreground">Messages go to everyone in the session. Type “slide 4” to link a slide.</li>}
							{view.chat.map((line, i) => <ChatLine key={line.id} line={line} prev={view.chat[i - 1]} onSlide={actions.goToSlide} />)}
							<li ref={chatEnd} aria-hidden />
						</ul>
						<TypingNote names={view.typing} />
						<div className="shrink-0 border-t border-border p-2.5">
							{view.canChat ? <Composer onSend={actions.sendChat} onTyping={actions.chatTyping} /> : <p className="px-1 text-[11.5px] text-muted-foreground">You can view this session, so you can read the chat but not post.</p>}
						</div>
					</div>
				</>
			)}
		</div>
		</LiveRoot.Provider>
	);
}
