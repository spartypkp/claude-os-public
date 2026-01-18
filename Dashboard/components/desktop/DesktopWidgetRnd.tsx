'use client';

import { WidgetState } from '@/store/windowStore';
import {
	Calendar,
	Target,
	Users
} from 'lucide-react';
import { ReactNode, useCallback, useState } from 'react';
import { Rnd } from 'react-rnd';

// ==========================================
// WIDGET TYPE CONFIG
// ==========================================

export interface WidgetTypeConfig {
	title: string;
	icon: React.ComponentType<{ className?: string; }>;
	gradient: string;
	minWidth: number;
	minHeight: number;
}

const WIDGET_TYPE_CONFIG: Record<string, WidgetTypeConfig> = {
	priorities: {
		title: 'Priorities',
		icon: Target,
		gradient: 'from-red-400 to-orange-400',
		minWidth: 300,
		minHeight: 220,
	},
	calendar: {
		title: 'Today',
		icon: Calendar,
		gradient: 'from-blue-400 to-indigo-400',
		minWidth: 300,
		minHeight: 220,
	},
	sessions: {
		title: 'Claude Team',
		icon: Users,
		gradient: 'from-amber-400 to-orange-400',
		minWidth: 280,
		minHeight: 200,
	},
};

// ==========================================
// PROPS
// ==========================================

interface DesktopWidgetRndProps {
	widget: WidgetState;
	onMove: (x: number, y: number) => void;
	onResize: (width: number, height: number) => void;
	onCollapse: () => void;
	onClose: () => void;
	onContextMenu?: (e: React.MouseEvent) => void;
	children: ReactNode;
}

// ==========================================
// COMPONENT
// ==========================================

/**
 * Unified desktop widget wrapper with macOS-style chrome.
 * 
 * Features:
 * - Traffic light buttons (close, collapse)
 * - Gradient accent based on widget type
 * - Draggable header
 * - Resizable (when not collapsed)
 * - Glass effect background
 */
export function DesktopWidgetRnd({
	widget,
	onMove,
	onResize,
	onCollapse,
	onClose,
	onContextMenu,
	children,
}: DesktopWidgetRndProps) {
	const [isHoveringHeader, setIsHoveringHeader] = useState(false);

	const config = WIDGET_TYPE_CONFIG[widget.type] || WIDGET_TYPE_CONFIG.priorities;
	const Icon = config.icon;

	const handleDragStop = useCallback(
		(_e: unknown, d: { x: number; y: number; }) => {
			onMove(d.x, d.y);
		},
		[onMove]
	);

	const handleResizeStop = useCallback(
		(
			_e: unknown,
			_dir: unknown,
			ref: HTMLElement,
			_delta: unknown,
			position: { x: number; y: number; }
		) => {
			onResize(ref.offsetWidth, ref.offsetHeight);
			onMove(position.x, position.y);
		},
		[onResize, onMove]
	);

	const collapsedHeight = 36;

	return (
		<Rnd
			position={{ x: widget.x, y: widget.y }}
			size={{
				width: widget.width,
				height: widget.collapsed ? collapsedHeight : widget.height,
			}}
			minWidth={config.minWidth}
			minHeight={widget.collapsed ? collapsedHeight : config.minHeight}
			bounds="parent"
			dragHandleClassName="widget-drag-handle"
			onDragStop={handleDragStop}
			onResizeStop={handleResizeStop}
			enableResizing={!widget.collapsed}
			style={{ zIndex: 50 }}
			className="absolute"
		>
			<div
				className={`
          flex flex-col h-full rounded-xl overflow-hidden
          bg-white/95 dark:bg-[#1e1e1e]/95 backdrop-blur-2xl
          border border-black/[0.08] dark:border-white/[0.08]
          shadow-[0_2px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_20px_rgba(0,0,0,0.5)]
          transition-all duration-300
        `}
				onContextMenu={onContextMenu}
			>
				{/* Header with traffic lights */}
				<div
					className="widget-drag-handle relative flex items-center h-10 px-3 cursor-move select-none bg-gradient-to-b from-white/40 to-transparent dark:from-white/5 dark:to-transparent"
					onMouseEnter={() => setIsHoveringHeader(true)}
					onMouseLeave={() => setIsHoveringHeader(false)}
				>
					{/* Gradient accent line at top - more subtle */}
					<div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r ${config.gradient} opacity-40`} />

					{/* Traffic Lights */}
					<div className="flex items-center gap-1.5 mr-3">
						{/* Close - Red */}
						<button
							onClick={(e) => {
								e.stopPropagation();
								onClose();
							}}
							className={`
                w-3 h-3 rounded-full bg-[#ff5f57]
                hover:brightness-110 transition-all
                flex items-center justify-center group
              `}
							title="Close"
						>
							<span className={`text-[8px] text-black/60 transition-opacity ${isHoveringHeader ? 'opacity-100' : 'opacity-0'}`}>
								×
							</span>
						</button>

						{/* Collapse - Yellow */}
						<button
							onClick={(e) => {
								e.stopPropagation();
								onCollapse();
							}}
							className={`
                w-3 h-3 rounded-full bg-[#febc2e]
                hover:brightness-110 transition-all
                flex items-center justify-center group
              `}
							title={widget.collapsed ? 'Expand' : 'Collapse'}
						>
							<span className={`text-[8px] text-black/60 transition-opacity ${isHoveringHeader ? 'opacity-100' : 'opacity-0'}`}>
								−
							</span>
						</button>

						{/* Placeholder - Gray (no maximize for widgets) */}
						<div className="w-3 h-3 rounded-full bg-gray-300 dark:bg-gray-600 opacity-50" />
					</div>

					{/* Icon */}
					<div className={`mr-2.5 p-1.5 rounded-lg bg-gradient-to-br ${config.gradient} shadow-sm`}>
						<Icon className="w-3.5 h-3.5 text-white" />
					</div>

					{/* Title */}
					<span className="flex-1 text-[13px] font-semibold text-gray-800 dark:text-gray-100 truncate tracking-tight">
						{config.title}
					</span>
				</div>

				{/* Content */}
				{!widget.collapsed && (
					<div className="flex-1 overflow-auto">
						{children}
					</div>
				)}
			</div>
		</Rnd>
	);
}

export default DesktopWidgetRnd;
