'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ==========================================
// DARK SOULS PRIORITY NOTIFICATION
// ==========================================
// Full-screen overlay with gold text animation
// Triggered by 'priority-completed' CustomEvent

type Phase = 'idle' | 'backdrop' | 'text' | 'hold' | 'fadeout';

const GOLD = '#c8aa6e';
const GOLD_GLOW = 'rgba(200, 170, 110, 0.6)';

export function DarkSoulsNotification() {
	const [phase, setPhase] = useState<Phase>('idle');
	const [priorityText, setPriorityText] = useState('');
	const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const fontLoadedRef = useRef(false);

	const dismiss = useCallback(() => {
		if (phase === 'idle') return;
		clearTimeout(timerRef.current);
		setPhase('fadeout');
		timerRef.current = setTimeout(() => setPhase('idle'), 1000);
	}, [phase]);

	// Load Cinzel font on first trigger
	const ensureFont = useCallback(() => {
		if (fontLoadedRef.current) return;
		fontLoadedRef.current = true;
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&display=swap';
		document.head.appendChild(link);
	}, []);

	// Listen for priority-completed events
	useEffect(() => {
		const handler = (e: Event) => {
			const detail = (e as CustomEvent).detail;
			const text = typeof detail === 'string' ? detail : detail?.text || '';
			setPriorityText(text);
			ensureFont();

			// Clear any existing animation
			clearTimeout(timerRef.current);

			// Start animation sequence
			setPhase('backdrop');
			timerRef.current = setTimeout(() => {
				setPhase('text');
				timerRef.current = setTimeout(() => {
					setPhase('hold');
					timerRef.current = setTimeout(() => {
						setPhase('fadeout');
						timerRef.current = setTimeout(() => {
							setPhase('idle');
						}, 1000);
					}, 2000);
				}, 1000);
			}, 500);
		};

		window.addEventListener('priority-completed', handler);
		return () => {
			window.removeEventListener('priority-completed', handler);
			clearTimeout(timerRef.current);
		};
	}, [ensureFont]);

	if (phase === 'idle') return null;

	const showText = phase === 'text' || phase === 'hold' || phase === 'fadeout';
	const fadingOut = phase === 'fadeout';

	return (
		<div
			onClick={dismiss}
			style={{
				position: 'fixed',
				inset: 0,
				zIndex: 99999,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				cursor: 'pointer',
				// Backdrop
				backgroundColor: fadingOut ? 'transparent' : 'rgba(0, 0, 0, 0.75)',
				transition: 'background-color 1s ease',
			}}
		>
			{/* Main title */}
			<div
				style={{
					fontFamily: "'Cinzel', Georgia, 'Times New Roman', serif",
					fontWeight: 900,
					fontSize: 'clamp(2.5rem, 6vw, 5rem)',
					color: GOLD,
					letterSpacing: '0.15em',
					textTransform: 'uppercase',
					textShadow: `
						0 0 10px ${GOLD_GLOW},
						0 0 30px rgba(200, 170, 110, 0.4),
						0 0 60px rgba(200, 170, 110, 0.2),
						0 2px 4px rgba(0, 0, 0, 0.8)
					`,
					opacity: showText ? (fadingOut ? 0 : 1) : 0,
					transform: showText && !fadingOut ? 'scale(1)' : 'scale(0.85)',
					transition: fadingOut
						? 'opacity 1s ease, transform 1s ease'
						: 'opacity 1s ease-out, transform 1s ease-out',
					userSelect: 'none',
					textAlign: 'center',
					padding: '0 2rem',
				}}
			>
				ENEMY FELLED
			</div>

			{/* Decorative line */}
			<div
				style={{
					width: 'clamp(100px, 20vw, 200px)',
					height: 1,
					background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
					margin: '1.5rem 0',
					opacity: showText ? (fadingOut ? 0 : 0.6) : 0,
					transition: fadingOut
						? 'opacity 1s ease'
						: 'opacity 1.2s ease-out 0.2s',
				}}
			/>

			{/* Priority text */}
			{priorityText && (
				<div
					style={{
						fontFamily: "'Cinzel', Georgia, 'Times New Roman', serif",
						fontWeight: 700,
						fontSize: 'clamp(0.9rem, 2vw, 1.3rem)',
						color: GOLD,
						letterSpacing: '0.08em',
						textShadow: `
							0 0 8px ${GOLD_GLOW},
							0 0 20px rgba(200, 170, 110, 0.3),
							0 1px 3px rgba(0, 0, 0, 0.8)
						`,
						opacity: showText ? (fadingOut ? 0 : 0.8) : 0,
						transition: fadingOut
							? 'opacity 1s ease'
							: 'opacity 1s ease-out 0.3s',
						userSelect: 'none',
						textAlign: 'center',
						padding: '0 3rem',
						maxWidth: '80vw',
					}}
				>
					{priorityText}
				</div>
			)}
		</div>
	);
}

export default DarkSoulsNotification;
