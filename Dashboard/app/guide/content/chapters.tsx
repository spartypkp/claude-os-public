import { BigPicture } from '../components/diagrams/BigPicture';
import { TeamHub } from '../components/diagrams/TeamHub';
import { MemoryLayers } from '../components/diagrams/MemoryLayers';
import { SpecialistLoop } from '../components/diagrams/SpecialistLoop';
import { DayTimeline } from '../components/diagrams/DayTimeline';
import { MorningReset } from '../components/diagrams/MorningReset';
import { Subagents } from '../components/diagrams/Subagents';
import { DecisionMatrix } from '../components/diagrams/DecisionMatrix';
import { AppBuildFlow } from '../components/diagrams/AppBuildFlow';
import type { ChapterData, PartData } from './types';

// ============================================================================
// PARTS
// ============================================================================

export const parts: PartData[] = [
	{
		number: 1,
		label: 'Part 1',
		title: 'Foundation',
		teaser: 'What Claude OS is, what you see, and what a day looks like.',
	},
	{
		number: 2,
		label: 'Part 2',
		title: 'The Team',
		teaser: 'Chief orchestrates. Specialists go deep. Subagents run in parallel.',
	},
	{
		number: 3,
		label: 'Part 3',
		title: 'Memory',
		teaser: 'How Claude remembers across sessions, and what happens every morning.',
	},
	{
		number: 4,
		label: 'Part 4',
		title: 'Connected',
		teaser: 'Email, calendar, contacts, and Claude in your pocket.',
	},
	{
		number: 5,
		label: 'Part 5',
		title: 'Automation',
		teaser: 'Skills, scheduling, and work that happens while you sleep.',
	},
	{
		number: 6,
		label: 'Part 6',
		title: 'Apps',
		teaser: 'Built-in tools and custom apps that connect your data to Claude.',
	},
	{
		number: 7,
		label: 'Part 7',
		title: 'Extending',
		teaser: 'Create your own roles and skills.',
	},
	{
		number: 8,
		label: 'Part 8',
		title: 'Philosophy',
		teaser: 'The principles that make it work.',
	},
];

// ============================================================================
// CHAPTERS
// ============================================================================

export const chapters: ChapterData[] = [
	// ── PART 1: FOUNDATION ──────────────────────────────────────────────
	{
		id: 'what-is-claude-os',
		chapterNumber: 1,
		part: 1,
		partLabel: 'Foundation',
		headline: 'Not a chat window. A life operating system.',
		visual: <BigPicture />,
		copy: [
			'Most AI tools give you a chat window. You ask, it answers, you close the tab, it forgets everything. Claude OS works differently.',
			"It's a system that runs on your machine. Claude reads files to remember what's happening in your life. It delegates focused work to specialists. It manages your day, your email, your calendar, and compounds over time. The more you use it, the more useful it gets.",
			"The core insight: Claude has no built-in memory. So we gave it one. Files that persist, patterns that accumulate, a relationship that builds.",
		],
		underTheHood: {
			headline: 'What "runs on your machine" means technically',
			copy: [
				"Claude OS is a local system: a Next.js Dashboard, a FastAPI backend, and Claude Code sessions running in tmux. Everything lives on your filesystem. No cloud sync, no external dependencies beyond the Claude API.",
				"At session start, hooks load context files (TODAY.md, MEMORY.md, IDENTITY.md) so Claude knows who you are and what's happening. The Dashboard reads the same files Claude reads. One source of truth, two interfaces.",
				"Local-first means your data stays on your machine. Memory files, email classifications, calendar events, contact enrichments. Claude reads them. You own them.",
			],
		},
	},
	{
		id: 'the-dashboard',
		chapterNumber: 2,
		part: 1,
		partLabel: 'Foundation',
		headline: 'A desktop for your life system.',
		visual: (
			<div
				className="rounded-xl overflow-hidden"
				style={{
					backgroundColor: '#1a1a1a',
					border: '1px solid rgba(245, 240, 232, 0.06)',
					height: '320px',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				<p className="text-sm font-mono" style={{ color: 'rgba(245, 240, 232, 0.2)' }}>
					[Dashboard screenshot placeholder]
				</p>
			</div>
		),
		copy: [
			"The Dashboard is the visual layer of Claude OS. It's a desktop environment: apps open as windows, you drag them around, close them, layer them. It runs in your browser at localhost:3000.",
			"Everything the Dashboard shows comes from the same files Claude reads. When Claude writes to your calendar, it appears here. When you open the Mail app, Claude has access to the same data. One source of truth, two interfaces.",
		],
		underTheHood: {
			headline: 'Architecture',
			copy: [
				"The Dashboard is a Next.js app with a custom window manager. Core apps (Finder, Calendar, Mail, Contacts) open as draggable, resizable windows on a desktop canvas. Custom apps open as fullscreen routes.",
				"Live updates come through Server-Sent Events from the FastAPI backend. When Claude writes to a file or updates the database, the Dashboard reflects it in real time.",
			],
		},
	},
	{
		id: 'a-day-with-claude-os',
		chapterNumber: 3,
		part: 1,
		partLabel: 'Foundation',
		headline: 'From morning brief to evening check-in.',
		visual: <DayTimeline />,
		copy: [
			"Claude OS shapes your day before you're awake. At 6 AM, a morning reset runs automatically: it archives yesterday, reads your email, consolidates memory, builds your schedule, and sends a brief to your phone.",
			"You wake up knowing what matters. Chief is already running, holding context from yesterday, ready to pick up where you left off. When something needs real depth, a complex task, a document to write, something to research, Chief spawns a specialist. That specialist works autonomously, then hands results back.",
			"At 8 PM, an evening check-in closes the loop: what happened, what's open, what to carry forward.",
		],
		underTheHood: {
			headline: 'Session lifecycle',
			copy: [
				"The cron scheduler checks SCHEDULE.md every 60 seconds. Morning reset is a skill that runs a multi-step process: archive, consolidate, triage, schedule, brief, deliver.",
				"Chief persists all day in a tmux window. Specialists spawn into their own windows, run through a 3-phase loop (preparation, implementation, verification), and close when done. The filesystem is the communication layer between them.",
			],
		},
	},

	// ── PART 2: THE TEAM ────────────────────────────────────────────────
	{
		id: 'chief',
		chapterNumber: 4,
		part: 2,
		partLabel: 'The Team',
		headline: 'The one who orchestrates.',
		visual: <TeamHub />,
		copy: [
			"Chief runs all day. Every day. It's the constant: the Claude instance that holds context from the morning brief through the evening check-in, that knows what's urgent, what can wait, what you've been avoiding.",
			"Chief doesn't go deep on things. That's not its job. When something needs depth, building a feature, researching a topic, writing a document, Chief writes a spec and spawns a specialist. Chief manages. Specialists execute.",
			"The relationship matters: Chief knows you. Your patterns, your blind spots, what you said you'd do yesterday. That's what makes it useful.",
		],
		underTheHood: {
			headline: 'How Chief works',
			copy: [
				"Chief reads TODAY.md, MEMORY.md, and IDENTITY.md at session start. It has access to all MCP tools: calendar, email, contacts, team management, scheduling.",
				"The team() tool lets Chief spawn specialists, send them messages, check their progress, and close them. Specialists can message Chief back via team(\"reply\"). The filesystem (Desktop/) is where they exchange artifacts.",
			],
		},
	},
	{
		id: 'specialists',
		chapterNumber: 5,
		part: 2,
		partLabel: 'The Team',
		headline: 'Experts on demand.',
		visual: <SpecialistLoop />,
		copy: [
			"Specialists are full Claude instances with domain expertise. Builder has read thousands of codebases. Researcher knows how to work multiple sources simultaneously. Writer thinks about argument structure before sentences. They're not task runners: they're consultants.",
			"When Chief spawns a Builder, that Builder reads the actual code before touching anything. It might agree with the plan Chief wrote, or discover something Chief couldn't see from the outside and recommend a completely different approach. That's the design.",
			"Every autonomous specialist runs in three phases: preparation (investigate and plan), implementation (build), verification (fresh eyes checking the work). The verifier has zero context about what was hard. It just checks the output.",
		],
		underTheHood: {
			headline: 'The autonomous loop',
			copy: [
				"Each phase is a fresh Claude session. Preparation reads the spec, investigates, and produces a plan with verification criteria. Implementation executes the plan with freedom to adapt. Verification checks the output against criteria.",
				"If verification fails, implementation loops (up to 10 iterations). The fresh-eyes principle means the verifier judges the output, not the effort. This catches things the implementer is too close to see.",
				"Interactive mode is different: you open a specialist directly from the Dashboard for real-time collaboration. No 3-phase loop, just a conversation with a domain expert.",
			],
		},
	},
	{
		id: 'subagents',
		chapterNumber: 6,
		part: 2,
		partLabel: 'The Team',
		headline: 'Background workers that run in parallel.',
		visual: <Subagents />,
		copy: [
			"Some questions don't need a full specialist. They need a quick answer from the right source.",
			"Subagents are lightweight background tasks. They run while you keep working. A web researcher finds what you need from external sources. A data scientist finds the actual numbers behind a claim. A practitioner finds what real engineers say in post-mortems, not what the docs say.",
			"The Pincer pattern: spawn five subagents simultaneously from different angles, empirical evidence, official consensus, practitioner wisdom, critical analysis, user perspective, and synthesize. Answers you couldn't get from any single source.",
		],
		underTheHood: {
			headline: 'Subagents vs specialists',
			copy: [
				"Subagents use Claude Code's native Task tool. They're lightweight sessions without full MCP access (except foreground agents like entity-search). They run in the background while Chief or a specialist continues working.",
				"Available types include: web-research (external sources), data-scientist (quantitative evidence), best-practices (official standards), practitioner (field wisdom), skeptic (critical analysis), and ux-perspective (user experience lens).",
				"The Pincer pattern spawns all five simultaneously on a hard design decision. Each returns a different type of evidence. Synthesizing all five gives a view no single agent could produce.",
			],
		},
	},

	// ── PART 3: MEMORY ──────────────────────────────────────────────────
	{
		id: 'how-claude-remembers',
		chapterNumber: 7,
		part: 3,
		partLabel: 'Memory',
		headline: 'Memory that lives in files.',
		visual: <MemoryLayers />,
		copy: [
			"Claude has no built-in memory. Every conversation starts blank. Claude OS solves this with files.",
			"TODAY.md is your daily working memory: your schedule, priorities, what happened, what's still open. MEMORY.md holds patterns that have proven true over time. IDENTITY.md holds the stable facts: who you are, what you care about, how you work.",
			"Every time Chief starts a session, it reads these files. That's how it knows what you were working on yesterday, what's urgent today, what pattern to watch for. When something new matters, it writes it down immediately. The filesystem is the memory.",
			"One important framing: memory entries are hypotheses, not facts. Claude observes patterns, notes them, and challenges them when reality disagrees. The files can be wrong. Reality is always ground truth.",
		],
		underTheHood: {
			headline: 'The memory hierarchy',
			copy: [
				"TODAY.md resets daily. It has sections for context (calendar, priorities), timeline (append-only event log), email intel, notes, and open loops. Chief writes to it throughout the day.",
				"MEMORY.md has two tiers: Current State (clears weekly, active threads and waiting items) and Stable Patterns (rarely changes, proven through repeated observation). The bar for Stable Patterns: would this survive a complete memory reset?",
				"IDENTITY.md holds permanent facts. Hooks load all three files automatically at session start, so every Claude instance begins with full context.",
			],
		},
	},
	{
		id: 'the-morning-reset',
		chapterNumber: 8,
		part: 3,
		partLabel: 'Memory',
		headline: 'Every morning, this happens automatically.',
		visual: <MorningReset />,
		copy: [
			"At 6 AM, a morning reset runs. You're probably asleep.",
			"Yesterday's work gets archived. A Curator specialist audits memory: promotes new patterns, removes stale ones, resolves contradictions. Email gets triaged: action items surface, noise stays buried. Your day gets scheduled with time blocks. A brief gets written: what matters, what's coming, one thing to keep in mind.",
			"By the time you wake up, a message is waiting on your phone. The day is already organized.",
		],
		underTheHood: {
			headline: 'Step by step',
			copy: [
				"The morning reset is a skill (a repeatable workflow prompt) triggered by the cron scheduler. It runs as a specialist session.",
				"Archive moves yesterday's TODAY.md to Desktop/logs/. Curator reads MEMORY.md and TODAY.md, cross-references reality, and makes updates. Email triage processes the classification queue. Schedule reads priorities and builds time-blocked calendar events. The brief summarizes everything and gets sent via Telegram.",
			],
		},
	},

	// ── PART 4: CONNECTED ───────────────────────────────────────────────
	{
		id: 'email-inbox',
		chapterNumber: 9,
		part: 4,
		partLabel: 'Connected',
		headline: 'Email that sorts itself.',
		visual: (
			<div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-w-lg mx-auto">
				{[
					{ label: 'Action Needed', color: '#da7756', count: '3' },
					{ label: 'Heads Up', color: 'rgba(245, 240, 232, 0.6)', count: '7' },
					{ label: 'FYI', color: 'rgba(245, 240, 232, 0.4)', count: '12' },
					{ label: 'Noise', color: 'rgba(245, 240, 232, 0.2)', count: '48' },
				].map((zone, i) => (
					<div
						key={i}
						className="rounded-lg px-3 py-3 text-center"
						style={{ backgroundColor: 'rgba(245, 240, 232, 0.03)', border: `1px solid ${i === 0 ? 'rgba(218, 119, 86, 0.2)' : 'rgba(245, 240, 232, 0.06)'}` }}
					>
						<p className="text-lg font-mono font-medium" style={{ color: zone.color }}>{zone.count}</p>
						<p className="text-xs mt-1" style={{ color: 'rgba(245, 240, 232, 0.35)' }}>{zone.label}</p>
					</div>
				))}
			</div>
		),
		copy: [
			"The email classifier runs continuously. Every email that arrives gets categorized: does this need action? Is it worth knowing? Is it useful but not urgent? Is it noise?",
			"By morning, the important emails are waiting in the brief. Action needed at the top. Noise never surfaces. You don't triage: you just see what matters.",
			"You can teach it. If something gets miscategorized, you correct it once. The rule persists. Over time, your inbox learns your actual priorities.",
		],
		underTheHood: {
			headline: 'Classification pipeline',
			copy: [
				"The classifier uses an LLM to categorize each email into four zones: action_needed, heads_up, fyi, noise. It runs on new emails as they arrive via IMAP polling.",
				"Sender rules let you override classification per-sender or per-domain. Corrections create persistent rules so the same mistake doesn't happen twice.",
				"The morning brief draft accumulates overnight as emails arrive, so Chief has a pre-built summary ready when the morning reset runs.",
			],
		},
	},
	{
		id: 'calendar-contacts',
		chapterNumber: 10,
		part: 4,
		partLabel: 'Connected',
		headline: 'Claude manages your time and relationships.',
		visual: (
			<div className="flex flex-col md:flex-row gap-4 max-w-lg mx-auto">
				<div className="flex-1 rounded-lg p-4" style={{ backgroundColor: 'rgba(245, 240, 232, 0.03)', border: '1px solid rgba(245, 240, 232, 0.06)' }}>
					<p className="text-xs font-mono mb-3" style={{ color: 'rgba(218, 119, 86, 0.5)' }}>Calendar</p>
					{['10:00  Deep work', '11:30  Review doc', '2:00  Research'].map((item, i) => (
						<div key={i} className="flex items-center gap-2 py-1.5" style={{ borderTop: i > 0 ? '1px solid rgba(245, 240, 232, 0.04)' : 'none' }}>
							<span className="text-xs font-mono" style={{ color: 'rgba(218, 119, 86, 0.4)' }}>{item.split('  ')[0]}</span>
							<span className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.5)' }}>{item.split('  ')[1]}</span>
						</div>
					))}
				</div>
				<div className="flex-1 rounded-lg p-4" style={{ backgroundColor: 'rgba(245, 240, 232, 0.03)', border: '1px solid rgba(245, 240, 232, 0.06)' }}>
					<p className="text-xs font-mono mb-3" style={{ color: 'rgba(218, 119, 86, 0.5)' }}>Contact</p>
					<p className="text-sm mb-1" style={{ color: 'rgba(245, 240, 232, 0.7)' }}>Sarah Chen</p>
					<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.35)' }}>Last email: Feb 20</p>
					<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.35)' }}>Note: Follow up on proposal</p>
				</div>
			</div>
		),
		copy: [
			"When you mention a meeting, Claude adds it to your calendar. When you mention someone you need to follow up with, it finds them in your contacts, logs the note, and adds the follow-up to your open loops.",
			"Calendar events are time-blocked by default: your schedule is built in chunks, not scattered fragments. Chief builds it in the morning and reshuffles when plans change mid-day.",
			"Contacts aren't just a phone book. Claude enriches them from email history and conversation context. When someone comes up, Claude already knows who they are and what you last discussed.",
		],
		underTheHood: {
			headline: 'MCP tools',
			copy: [
				"The calendar() and contact() MCP tools give Claude read/write access to your calendar and contacts database. Events are stored locally in SQLite.",
				"Contact enrichment pulls context from email history: when was the last email exchange, what was discussed, any noted follow-ups. This happens automatically when a name comes up in conversation.",
			],
		},
	},
	{
		id: 'on-your-phone',
		chapterNumber: 11,
		part: 4,
		partLabel: 'Connected',
		headline: 'Claude in your pocket.',
		visual: (
			<div className="max-w-[280px] mx-auto">
				<div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(245, 240, 232, 0.08)' }}>
					<div className="px-4 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(245, 240, 232, 0.06)' }}>
						<div className="w-6 h-6 rounded-full" style={{ backgroundColor: 'rgba(218, 119, 86, 0.2)' }} />
						<span className="text-xs font-medium" style={{ color: 'rgba(245, 240, 232, 0.7)' }}>Claude OS</span>
					</div>
					<div className="p-3 space-y-2">
						<div className="rounded-lg px-3 py-2 max-w-[85%]" style={{ backgroundColor: 'rgba(218, 119, 86, 0.1)' }}>
							<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.7)' }}>Good morning. 3 priorities today: ship the feature, review Sarah's doc, prep for Thursday.</p>
						</div>
						<div className="rounded-lg px-3 py-2 max-w-[75%] ml-auto" style={{ backgroundColor: 'rgba(245, 240, 232, 0.08)' }}>
							<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.6)' }}>What's my schedule?</p>
						</div>
						<div className="rounded-lg px-3 py-2 max-w-[85%]" style={{ backgroundColor: 'rgba(218, 119, 86, 0.1)' }}>
							<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.7)' }}>10-11:30 deep work, 11:30 doc review, 2pm research block, 4pm open.</p>
						</div>
					</div>
				</div>
			</div>
		),
		copy: [
			"Claude OS lives on your computer. But you're not always at your computer.",
			"Connect Telegram and Claude can reach you anywhere. The morning brief arrives as a message. You can reply from your phone: ask a question, give a directive, check your schedule, and Claude responds.",
			"It's not a mobile app. It's a direct line to Chief, wherever you are.",
		],
		underTheHood: {
			headline: 'Telegram integration',
			copy: [
				"You create a Telegram bot via @BotFather and configure the credentials in Claude OS. The telegram() MCP tool handles send, read, and info operations.",
				"Auto-forwarding pipes Chief's key updates to your DM. You can reply directly, and Chief receives the message as part of its conversation context.",
			],
		},
	},

	// ── PART 5: AUTOMATION ──────────────────────────────────────────────
	{
		id: 'skills',
		chapterNumber: 12,
		part: 5,
		partLabel: 'Automation',
		headline: 'Teach Claude your patterns.',
		visual: (
			<div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-w-xl mx-auto">
				{[
					{ name: 'Morning Reset', trigger: 'Runs at 6 AM' },
					{ name: 'Evening Check-in', trigger: 'Closes the day at 8 PM' },
					{ name: 'Audit', trigger: 'System accuracy check' },
					{ name: 'Cleanup', trigger: 'Organize and declutter' },
					{ name: 'Setup', trigger: 'Initial configuration' },
					{ name: 'Create Role', trigger: 'Build a new specialist' },
					{ name: 'Create Skill', trigger: 'Encode a new workflow' },
					{ name: 'Build App', trigger: 'Generate a custom app' },
					{ name: 'Temporal Parliament', trigger: 'Resolve a tough decision' },
				].map((skill, i) => (
					<div
						key={i}
						className="rounded-lg px-3 py-2.5"
						style={{ backgroundColor: 'rgba(245, 240, 232, 0.03)', border: '1px solid rgba(245, 240, 232, 0.06)' }}
					>
						<p className="text-sm font-medium mb-0.5" style={{ color: 'rgba(245, 240, 232, 0.7)' }}>{skill.name}</p>
						<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.3)' }}>{skill.trigger}</p>
					</div>
				))}
			</div>
		),
		copy: [
			"Skills are repeatable workflows. Instead of explaining what you want every time, you invoke a skill.",
			"Some skills run automatically: morning reset at 6 AM, evening check-in at 8 PM. Some you trigger: start an audit, clean up the desktop, build a new app. Some are conversational: temporal parliament convenes multiple perspectives to resolve a decision you're stuck on.",
			"You can create your own. Describe a workflow you repeat. A skill gets built. Next time, one command runs the whole thing.",
		],
		underTheHood: {
			headline: 'SKILL.md files',
			copy: [
				"Skills live in .claude/skills/[name]/SKILL.md. Each defines a trigger (when to invoke), steps (what to do), and output format. Claude matches invocations to skills by description.",
				"The /create-skill workflow builds a new skill through a guided conversation. You describe the process, it generates the SKILL.md file, and it's immediately available.",
			],
		},
	},
	{
		id: 'scheduling-automation',
		chapterNumber: 13,
		part: 5,
		partLabel: 'Automation',
		headline: 'Work that happens while you sleep.',
		visual: (
			<div className="max-w-md mx-auto">
				<div className="rounded-lg px-4 py-3" style={{ backgroundColor: '#0d0d0d', border: '1px solid rgba(245, 240, 232, 0.06)' }}>
					<p className="text-xs font-mono mb-2" style={{ color: 'rgba(218, 119, 86, 0.5)' }}>SCHEDULE.md</p>
					<div className="space-y-1 font-mono text-xs" style={{ color: 'rgba(245, 240, 232, 0.4)' }}>
						<p><span style={{ color: 'rgba(218, 119, 86, 0.5)' }}>0 1 * * *</span> | spawn curator | overnight-cleanup</p>
						<p><span style={{ color: 'rgba(218, 119, 86, 0.5)' }}>0 4 * * *</span> | spawn idea | dream-mode</p>
						<p><span style={{ color: 'rgba(218, 119, 86, 0.5)' }}>0 6 * * *</span> | spawn chief | morning-reset</p>
						<p><span style={{ color: 'rgba(218, 119, 86, 0.5)' }}>*/15 * * * *</span> | inject chief | [WAKE]</p>
					</div>
				</div>
			</div>
		),
		copy: [
			"SCHEDULE.md is the source of truth for automation. A simple markdown file with cron expressions. Claude OS checks it every 60 seconds.",
			"You can schedule anything: recurring specialists that run overnight, one-off reminders that fire once and disappear, background tasks that prep your day before you're awake. The heartbeat queue lets you set temporary focus directives, \"keep me on X until 4 PM,\" that Chief checks every 15 minutes and removes when they expire.",
			"You're not configuring a cron daemon. You're writing markdown.",
		],
		underTheHood: {
			headline: 'Three action types',
			copy: [
				"inject sends text into a live Claude session's tmux pane (e.g., [WAKE] to Chief every 15 min). spawn launches a specialist session (e.g., morning reset, overnight cleanup). exec runs a registered Python function (e.g., database vacuum).",
				"Entries can be recurring (cron expressions) or one-off (ISO datetime, auto-removed after firing). HEARTBEAT.md is a queue of temporary items Chief checks on each [WAKE] pulse.",
			],
		},
	},

	// ── PART 6: APPS ────────────────────────────────────────────────────
	{
		id: 'built-in-apps',
		chapterNumber: 14,
		part: 6,
		partLabel: 'Apps',
		headline: 'A desktop full of connected tools.',
		visual: (
			<div className="grid grid-cols-3 md:grid-cols-5 gap-3 max-w-lg mx-auto">
				{[
					{ name: 'Finder', color: 'from-blue-400 to-blue-600' },
					{ name: 'Calendar', color: 'from-red-400 to-red-600' },
					{ name: 'Mail', color: 'from-sky-400 to-blue-600' },
					{ name: 'Contacts', color: 'from-green-400 to-green-600' },
					{ name: 'Observatory', color: 'from-violet-400 to-purple-600' },
				].map((app, i) => (
					<div key={i} className="flex flex-col items-center gap-1.5">
						<div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${app.color} shadow-lg`} />
						<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.4)' }}>{app.name}</p>
					</div>
				))}
			</div>
		),
		copy: [
			"Claude OS ships with a set of core apps that open as windows on the Desktop.",
			"Finder navigates your Desktop filesystem, the same files Claude reads, displayed as a browser with keyboard navigation. Calendar shows your week view. Mail surfaces your triage queue. Contacts is your enriched relationship graph. Settings controls integrations and model assignments.",
			"Observatory is the interesting one: real-time analytics showing how the system is being used. Which specialists are running, which tools are being called, session frequency. A live window into what's happening under the surface.",
		],
		underTheHood: {
			headline: 'Window manager',
			copy: [
				"Core apps render as draggable, resizable windows on the Desktop canvas, managed by a Zustand store. Each window has a type, position, size, and z-index.",
				"The Dock at the bottom launches apps, shows running indicators, and manages minimized windows with macOS-style magnification on hover.",
			],
		},
	},
	{
		id: 'custom-apps',
		chapterNumber: 15,
		part: 6,
		partLabel: 'Apps',
		headline: 'Build an app for your actual situation.',
		visual: (
			<div className="flex flex-col md:flex-row gap-4 max-w-lg mx-auto items-center">
				<div className="flex-1 rounded-lg p-4 text-center" style={{ backgroundColor: 'rgba(245, 240, 232, 0.03)', border: '1px solid rgba(245, 240, 232, 0.06)' }}>
					<p className="text-2xl mb-1" style={{ color: 'rgba(245, 240, 232, 0.15)' }}>spreadsheet</p>
					<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.25)' }}>Disconnected from Claude</p>
				</div>
				<svg width="24" height="24" viewBox="0 0 24 24" className="shrink-0 rotate-90 md:rotate-0">
					<path d="M6 12 L16 12 M13 9 L16 12 L13 15" stroke="#da7756" strokeWidth="1.5" fill="none" />
				</svg>
				<div className="flex-1 rounded-lg p-4 text-center" style={{ backgroundColor: 'rgba(218, 119, 86, 0.06)', border: '1px solid rgba(218, 119, 86, 0.15)' }}>
					<p className="text-2xl mb-1" style={{ color: 'rgba(218, 119, 86, 0.4)' }}>custom app</p>
					<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.4)' }}>Claude reads, writes, surfaces</p>
				</div>
			</div>
		),
		copy: [
			"The most useful apps are the ones built for your specific situation. Not a generic todo list, but a todo list that Claude reads from and writes to, that surfaces in your morning brief, that you can ask Claude to update in conversation.",
			"Custom apps connect your data to Claude. Claude can query the app, update it, find patterns, surface things worth knowing, because the data is in the system, not in a spreadsheet somewhere Claude can't see.",
			"Building one takes an afternoon. You describe what you want. A Builder specialist writes the backend, the database schema, the MCP tools, the frontend. You use it the same day.",
		],
		underTheHood: {
			headline: 'What "connected to Claude" means',
			copy: [
				"Every custom app generates MCP tools: functions Claude can call to query, create, update, and delete data. When Claude classifies an email as action_needed, that's an MCP tool writing to the email app's database.",
				"The pattern: SQLite for storage, FastAPI for the API, MCP tools for Claude's interface, React for the human interface. All reading from the same database.",
			],
		},
	},
	{
		id: 'build-your-own-app',
		chapterNumber: 16,
		part: 6,
		partLabel: 'Apps',
		headline: 'From idea to running app in an afternoon.',
		visual: <AppBuildFlow />,
		copy: [
			"Custom apps follow a pattern. You write a spec describing what you want to track, what Claude should be able to do with the data, and what the interface should show. One page, plain language.",
			"A Builder specialist reads the spec, builds the full stack: SQLite database, FastAPI endpoints, MCP tools so Claude can query and update the data, React frontend that opens as a Dashboard window. Then it restarts the services. The app exists.",
			"The spec is the hardest part, and it's one page.",
		],
		underTheHood: {
			headline: 'APP-SPEC.md format',
			copy: [
				"A spec defines: the data model (what to store), MCP tools (what Claude can do), API routes (how the frontend talks to the backend), and UI (what the human sees).",
				"The /build-app skill walks you through writing a spec. You describe the problem, it asks clarifying questions, generates the APP-SPEC.md, then spawns a Builder to build it.",
			],
			codeSnippets: [
				{
					label: 'Example spec structure',
					language: 'markdown',
					code: `# My App — App Spec
Route: /my-app

## Data Model
- items: id, name, status, created_at

## MCP Tools
- my_app("list") — get all items
- my_app("create", name=...) — add item

## UI
- Table view with status filters`,
				},
			],
		},
	},

	// ── PART 7: EXTENDING ───────────────────────────────────────────────
	{
		id: 'custom-roles',
		chapterNumber: 17,
		part: 7,
		partLabel: 'Extending',
		headline: 'Create a specialist for your domain.',
		visual: (
			<div className="max-w-md mx-auto">
				<div className="rounded-lg px-4 py-3" style={{ backgroundColor: '#0d0d0d', border: '1px solid rgba(245, 240, 232, 0.06)' }}>
					<p className="text-xs font-mono mb-2" style={{ color: 'rgba(218, 119, 86, 0.5)' }}>roles/trainer/role.md</p>
					<div className="space-y-1 font-mono text-xs" style={{ color: 'rgba(245, 240, 232, 0.4)' }}>
						<p style={{ color: 'rgba(218, 119, 86, 0.4)' }}>---</p>
						<p>name: Trainer</p>
						<p>slug: trainer</p>
						<p style={{ color: 'rgba(218, 119, 86, 0.4)' }}>---</p>
						<p>&nbsp;</p>
						<p style={{ color: 'rgba(245, 240, 232, 0.25)' }}># Trainer</p>
						<p style={{ color: 'rgba(245, 240, 232, 0.25)' }}>You are an AI tutor specialized in</p>
						<p style={{ color: 'rgba(245, 240, 232, 0.25)' }}>technical interview preparation...</p>
					</div>
				</div>
			</div>
		),
		copy: [
			"The seven base roles cover a lot. But your situation might need something specific: an interviewer role that focuses on technical assessment, a coach role that knows your training plan, a domain-expert role for a specific codebase.",
			"Custom roles are markdown files in .claude/roles/. They define who the specialist is, what they know, how they approach their work, and what phase guidance they follow in the autonomous loop. Add a file, get a new specialist.",
		],
		underTheHood: {
			headline: 'Role file format',
			copy: [
				"Each role has frontmatter (name, slug) and a markdown body that defines the specialist's identity, domain expertise, available tools, and how they operate in each phase of the autonomous loop.",
				"The /create-role skill walks you through building one. You describe the domain, it generates the role file. The role is immediately available for Chief to spawn.",
			],
		},
	},
	{
		id: 'custom-skills',
		chapterNumber: 18,
		part: 7,
		partLabel: 'Extending',
		headline: 'Encode a workflow you repeat.',
		visual: (
			<div className="flex flex-col md:flex-row gap-4 max-w-lg mx-auto items-center">
				<div className="flex-1">
					<p className="text-xs font-mono mb-2" style={{ color: 'rgba(245, 240, 232, 0.25)' }}>Before</p>
					<div className="rounded-lg p-3 space-y-1.5" style={{ backgroundColor: 'rgba(245, 240, 232, 0.03)', border: '1px solid rgba(245, 240, 232, 0.06)' }}>
						<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.4)' }}>"First check the email queue..."</p>
						<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.4)' }}>"Then triage by priority..."</p>
						<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.4)' }}>"Draft responses for action items..."</p>
						<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.4)' }}>"Update the brief..."</p>
					</div>
				</div>
				<svg width="24" height="24" viewBox="0 0 24 24" className="shrink-0 rotate-90 md:rotate-0">
					<path d="M6 12 L16 12 M13 9 L16 12 L13 15" stroke="#da7756" strokeWidth="1.5" fill="none" />
				</svg>
				<div className="flex-1">
					<p className="text-xs font-mono mb-2" style={{ color: 'rgba(218, 119, 86, 0.5)' }}>After</p>
					<div className="rounded-lg p-3" style={{ backgroundColor: 'rgba(218, 119, 86, 0.06)', border: '1px solid rgba(218, 119, 86, 0.15)' }}>
						<p className="text-sm font-mono" style={{ color: '#da7756' }}>/email-triage</p>
						<p className="text-xs mt-1" style={{ color: 'rgba(245, 240, 232, 0.35)' }}>One command. Entire workflow.</p>
					</div>
				</div>
			</div>
		),
		copy: [
			"When you find yourself explaining the same multi-step process more than twice, it's probably a skill.",
			"Skills are markdown files in .claude/skills/. They define a trigger (when to invoke), steps (what to do in order), and output (what to produce). The /create-skill workflow builds one through a guided conversation. Next time, one command runs the whole process.",
		],
		underTheHood: {
			headline: 'SKILL.md format',
			copy: [
				"Each skill has a name, description (for trigger matching), and a step-by-step prompt that Claude follows when the skill is invoked.",
				"Skills can be invoked explicitly (/skill-name) or matched by description. They can use any MCP tool, spawn subagents, and produce artifacts. The /create-skill workflow generates the file for you.",
			],
		},
	},

	// ── PART 8: PHILOSOPHY ──────────────────────────────────────────────
	{
		id: 'the-relationship',
		chapterNumber: 19,
		part: 8,
		partLabel: 'Philosophy',
		headline: 'Partner, not assistant.',
		visual: (
			<div className="flex flex-col md:flex-row gap-6 max-w-lg mx-auto">
				<div className="flex-1 rounded-lg p-4" style={{ backgroundColor: 'rgba(218, 119, 86, 0.04)', border: '1px solid rgba(218, 119, 86, 0.12)' }}>
					<p className="text-xs font-mono uppercase tracking-[0.15em] mb-3" style={{ color: '#da7756' }}>Claude surfaces</p>
					<div className="space-y-1.5">
						<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.5)' }}>Delegates to specialists</p>
						<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.5)' }}>Maintains the system</p>
						<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.5)' }}>Acts on routine operations</p>
						<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.5)' }}>Surfaces uncertainty</p>
					</div>
				</div>
				<div className="flex-1 rounded-lg p-4" style={{ backgroundColor: 'rgba(245, 240, 232, 0.03)', border: '1px solid rgba(245, 240, 232, 0.08)' }}>
					<p className="text-xs font-mono uppercase tracking-[0.15em] mb-3" style={{ color: 'rgba(245, 240, 232, 0.5)' }}>You decide</p>
					<div className="space-y-1.5">
						<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.5)' }}>Strategic priorities</p>
						<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.5)' }}>Commitments to others</p>
						<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.5)' }}>Ambiguous judgment calls</p>
						<p className="text-xs" style={{ color: 'rgba(245, 240, 232, 0.5)' }}>What matters</p>
					</div>
				</div>
			</div>
		),
		copy: [
			"The distinction matters: an assistant does what you ask. A partner helps you figure out what you should be asking.",
			"Claude surfaces. You decide. Repeatedly, forever. Claude handles complexity so you can focus on what actually requires your judgment. Not to replace judgment, but to protect the space where good judgment happens.",
			"The risk of getting this wrong is real. If Claude makes too many decisions, your capabilities atrophy. The goal is cognitive load reduction, not cognitive replacement. Remove noise so you can focus on signal. Never remove the signal itself.",
		],
		underTheHood: {
			headline: 'The Future Test',
			copy: [
				'Before acting, Claude asks: "Would you approve of this looking back tomorrow?" Not "would you be unsurprised now," but retrospective approval.',
				"Some things Claude always asks before doing: sending messages, deleting files, making commitments on your behalf, pushing to shared repos. These affect others or are hard to reverse. Everything else, Claude acts and mentions what it did.",
			],
		},
	},
	{
		id: 'operating-principles',
		chapterNumber: 20,
		part: 8,
		partLabel: 'Philosophy',
		headline: 'How it makes decisions.',
		visual: <DecisionMatrix />,
		copy: [
			"Claude OS operates by a set of principles, not rules. Rules break when situations get complex. Principles generalize.",
			"Reality beats files. When a file says one thing and reality says another, the file is wrong. Always update toward reality.",
			"Uncertainty is strength. False confidence causes worse errors than admitted uncertainty. If Claude isn't sure, it says so.",
			"Reversible over irreversible. When acting under uncertainty, prefer actions that can be undone.",
		],
		underTheHood: {
			headline: 'Decision authority',
			copy: [
				"The confidence/stakes matrix governs how Claude acts. High confidence + low stakes = just do it. Low confidence + high stakes = present full trade-offs and let you decide.",
				"Bright lines are non-negotiable: always ask before sending messages, deleting files, making commitments, or pushing code. These affect others or are hard to reverse.",
			],
		},
	},
];
