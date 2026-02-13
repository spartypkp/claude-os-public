'use client';

/**
 * ConversationList - Conversation-first tab bar
 *
 * Shows conversations, not sessions. Session is internal.
 * Reset counts and mode transitions visible per conversation.
 */

import type { ActiveConversation } from '@/lib/types';
import { useWindowStore } from '@/store/windowStore';
import { getRoleConfig, ROLE_CONFIGS } from '@/lib/sessionUtils';
import type { HandoffPhase } from '@/hooks/useHandoffState';
import { ClaudeLogo } from './ClaudeLogo';
import {
  Check,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * CloseConfirm - Portal-rendered confirmation popover for closing specialist sessions.
 * Renders to document.body to avoid overflow clipping and nested-button issues.
 */
function CloseConfirm({
  roleName,
  anchorRect,
  onConfirm,
  onCancel,
}: {
  roleName: string;
  anchorRect: DOMRect;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onCancel]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: anchorRect.bottom + 4,
        right: window.innerWidth - anchorRect.right,
        zIndex: 9999,
      }}
      className="w-44 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#404040] rounded-lg shadow-xl overflow-hidden"
    >
      <div className="px-3 py-2 text-[11px] text-gray-600 dark:text-[#999]">
        Close {roleName}?
      </div>
      <div className="flex border-t border-gray-100 dark:border-[#333]">
        <div
          role="button"
          onClick={onCancel}
          className="flex-1 px-3 py-1.5 text-[11px] text-gray-500 dark:text-[#888] hover:bg-gray-50 dark:hover:bg-[#252525] transition-colors cursor-pointer text-center"
        >
          Cancel
        </div>
        <div
          role="button"
          onClick={onConfirm}
          className="flex-1 px-3 py-1.5 text-[11px] font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border-l border-gray-100 dark:border-[#333] cursor-pointer text-center"
        >
          Close
        </div>
      </div>
    </div>,
    document.body,
  );
}

import { API_BASE } from '@/lib/api';

// Activity indicator - unified for Chief and Specialists
function ActivityIndicator({ isActive, handoffPhase }: { isActive: boolean; handoffPhase?: HandoffPhase }) {
  // Handoff in progress — show spinning refresh icon
  if (handoffPhase) {
    return (
      <span className="flex items-center">
        <RefreshCw className="w-3 h-3 text-[#da7756] animate-spin" />
      </span>
    );
  }

  if (isActive) {
    return (
      <span className="flex items-center gap-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-[#da7756] animate-pulse" />
        <span className="w-1.5 h-1.5 rounded-full bg-[#da7756] animate-pulse" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-[#da7756] animate-pulse" style={{ animationDelay: '300ms' }} />
      </span>
    );
  }

  return (
    <span className="text-[10px] text-gray-400 dark:text-[#666] font-mono">
      zzz
    </span>
  );
}

function getIsActive(conversation: ActiveConversation | null): boolean {
  if (!conversation) return false;
  const state = conversation.current_state;
  return state === 'active' || state === 'tool_active';
}

// Format mode for display in status bar
function formatMode(mode: string | null | undefined): string | null {
  if (!mode || mode === 'interactive') return null;

  const modeMap: Record<string, string> = {
    'preparation': 'Prep',
    'implementation': 'Impl',
    'verification': 'Verif',
  };

  return modeMap[mode] || mode.charAt(0).toUpperCase() + mode.slice(1);
}

function renderRoleIcon(roleSlug: string, className: string) {
  const config = getRoleConfig(roleSlug);
  if (config.isLogo) return <ClaudeLogo className={className} />;
  const Icon = config.icon;
  return <Icon className={className} />;
}


// Chief tab
function ChiefTab({
  conversation,
  isSelected,
  onSelect,
  handoffPhase,
}: {
  conversation: ActiveConversation;
  isSelected: boolean;
  onSelect: () => void;
  handoffPhase?: HandoffPhase;
}) {
  const { openContextMenu } = useWindowStore();
  const isActive = getIsActive(conversation);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu(e.clientX, e.clientY, 'panel-chief', undefined, {
      panelConversationId: conversation.conversation_id,
      panelSessionId: conversation.latest_session_id,
      panelSessionRole: 'chief',
      panelSessionStatus: conversation.status_text || 'Working...',
    });
  }, [openContextMenu, conversation]);

  return (
    <button
      data-conversation-id={conversation.conversation_id}
      onClick={onSelect}
      onContextMenu={handleContextMenu}
      className={`
        group relative flex items-center gap-3 px-4 py-2.5 min-w-[140px] flex-shrink-0
        transition-all rounded-t-lg
        ${isSelected
          ? 'bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white border-t border-l border-r border-gray-200 dark:border-[#333] border-b-0 mb-[-1px] z-10'
          : 'bg-gray-200/50 dark:bg-[#252525] text-gray-600 dark:text-[#999] hover:bg-gray-200 dark:hover:bg-[#2a2a2a]'
        }
      `}
    >
      <span className="flex-shrink-0 text-[#da7756]">
        <ClaudeLogo className="w-4 h-4" />
      </span>

      <span className="font-medium text-sm">Chief</span>

      <div className="ml-auto flex-shrink-0">
        <ActivityIndicator isActive={isActive} handoffPhase={handoffPhase} />
      </div>
    </button>
  );
}

// Phase accent color for autonomous specialist tabs
const PHASE_ACCENT: Record<string, string> = {
  preparation: '#60a5fa',
  implementation: '#f59e0b',
  verification: '#34d399',
};

// Specialist tab
function SpecialistTab({
  conversation,
  isSelected,
  onSelect,
  onClose,
  handoffPhase,
}: {
  conversation: ActiveConversation;
  isSelected: boolean;
  onSelect: () => void;
  onClose?: () => void;
  handoffPhase?: HandoffPhase;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closeAnchorRect, setCloseAnchorRect] = useState<DOMRect | null>(null);
  const { openContextMenu } = useWindowStore();
  const role = conversation.role || 'builder';
  const roleConfig = getRoleConfig(role);
  const roleName = roleConfig.label;
  const isActive = getIsActive(conversation);
  const phaseColor = conversation.mode ? PHASE_ACCENT[conversation.mode] : undefined;

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu(e.clientX, e.clientY, 'panel-specialist', undefined, {
      panelConversationId: conversation.conversation_id,
      panelSessionId: conversation.latest_session_id,
      panelSessionRole: role,
      panelSessionStatus: conversation.status_text || 'Working...',
    });
  }, [openContextMenu, conversation, role]);

  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setCloseAnchorRect(rect);
    setShowCloseConfirm(true);
  };

  return (
    <>
      <button
        data-conversation-id={conversation.conversation_id}
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`
          group relative flex items-center gap-2 px-3 py-2 text-xs font-medium self-end
          transition-colors min-w-[100px] max-w-[140px] flex-shrink-0 rounded-t-lg
          ${isSelected
            ? 'bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white border-t border-l border-r border-gray-200 dark:border-[#333] border-b-0 mb-[-1px] z-10'
            : 'bg-gray-200/50 dark:bg-[#252525] text-gray-600 dark:text-[#999] hover:bg-gray-200 dark:hover:bg-[#2a2a2a]'
          }
        `}
      >
        {/* Phase accent stripe — top edge colored by current specialist phase */}
        {phaseColor && (
          <div
            className="absolute top-0 left-0 right-0 h-[2px]"
            style={{ backgroundColor: phaseColor }}
          />
        )}

        <span className="flex-shrink-0 text-[#da7756]">
          {renderRoleIcon(role, 'w-3.5 h-3.5')}
        </span>

        <span className="truncate flex-1 text-left">{roleName}</span>

        <div className="flex-shrink-0 flex items-center gap-1.5">
          <ActivityIndicator isActive={isActive} handoffPhase={handoffPhase} />

          {onClose && (isHovered || isSelected) && (
            <span
              onClick={handleCloseClick}
              className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-[#444]"
            >
              <X className="w-3 h-3" />
            </span>
          )}
        </div>
      </button>

      {/* Close confirmation popover — portaled to body */}
      {showCloseConfirm && onClose && closeAnchorRect && (
        <CloseConfirm
          roleName={roleName}
          anchorRect={closeAnchorRect}
          onConfirm={() => {
            setShowCloseConfirm(false);
            onClose();
          }}
          onCancel={() => setShowCloseConfirm(false)}
        />
      )}
    </>
  );
}

interface ConversationListProps {
  conversations: ActiveConversation[];
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string, role: string) => void;
  onEndConversation: (conversationId: string) => void;
  onSpawnChief: () => Promise<void>;
  onRefresh: () => void;
  onMinimize?: () => void;
  sseConnected?: boolean;
  /** Get handoff phase for a conversation */
  getHandoffPhase?: (conversationId: string) => HandoffPhase;
}

export function ConversationList({
  conversations,
  selectedConversationId,
  onSelectConversation,
  onEndConversation,
  onSpawnChief,
  onRefresh,
  onMinimize,
  sseConnected = true,
  getHandoffPhase,
}: ConversationListProps) {
  const [showSpawnDropdown, setShowSpawnDropdown] = useState(false);
  const [spawningRole, setSpawningRole] = useState<string | null>(null);
  const [spawningChief, setSpawningChief] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [hiddenRightCount, setHiddenRightCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Specialist roles for spawn dropdown (everything except chief)
  const specialistRoles = Object.entries(ROLE_CONFIGS)
    .filter(([slug]) => slug !== 'chief' && slug !== 'summarizer')
    .map(([slug, config]) => ({ slug, ...config }));

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);

    // Count tabs hidden beyond the right edge
    const rightEdge = el.scrollLeft + el.clientWidth;
    const tabs = el.querySelectorAll('[data-conversation-id]');
    let hidden = 0;
    tabs.forEach((tab) => {
      const tabRight = (tab as HTMLElement).offsetLeft + (tab as HTMLElement).offsetWidth;
      if (tabRight > rightEdge + 4) hidden++;
    });
    setHiddenRightCount(hidden);
  }, []);

  const scrollRight = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: 200, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll();
    return () => el.removeEventListener('scroll', checkScroll);
  }, [checkScroll]);

  // Re-check scroll when tab count changes
  useEffect(() => {
    checkScroll();
  }, [conversations.length, checkScroll]);

  // Auto-scroll selected tab into view
  useEffect(() => {
    if (!selectedConversationId || !scrollRef.current) return;
    const tab = scrollRef.current.querySelector(
      `[data-conversation-id="${selectedConversationId}"]`
    );
    if (tab) {
      tab.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    }
  }, [selectedConversationId]);

  // Separate Chief from Specialists (active conversations only)
  const activeConversations = conversations.filter(c => !c.ended_at);
  const chiefConversation = activeConversations.find(c => c.role === 'chief');
  const specialists = activeConversations
    .filter(c => c.role !== 'chief')
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

  const handleSpawn = async (role: string) => {
    setSpawningRole(role);
    try {
      const response = await fetch(`${API_BASE}/api/sessions/spawn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, mode: 'interactive' }),
      });
      const data = await response.json();
      if (data.success && data.conversation_id) {
        onRefresh();
        onSelectConversation(data.conversation_id, role);
      }
    } catch (err) {
      console.error('Failed to spawn specialist:', err);
    } finally {
      setSpawningRole(null);
      setShowSpawnDropdown(false);
    }
  };

  const handleSpawnChief = async () => {
    setSpawningChief(true);
    try {
      await onSpawnChief();
    } finally {
      setSpawningChief(false);
    }
  };

  const handleEndConversation = (conversationId: string) => {
    onEndConversation(conversationId);
  };

  const selectedConversation = selectedConversationId
    ? (conversations.find(c => c.conversation_id === selectedConversationId) ?? null)
    : null;

  const selectedHandoffPhase = selectedConversationId ? getHandoffPhase?.(selectedConversationId) : null;
  const isWorking = getIsActive(selectedConversation);
  const statusText = selectedConversation?.status_text || 'Ready';

  // Handoff status text
  const handoffStatusText: Record<string, string> = {
    resetting: 'Resetting session...',
    generating: 'Generating memory handoff...',
    complete: 'Handoff complete — spawning...',
  };

  return (
    <div data-testid="conversation-list" className="flex flex-col">
      <div className="flex items-end px-2 pt-1.5 bg-gray-100 dark:bg-[#1a1a1a] border-b border-gray-200 dark:border-[#333]">
        {/* Scrollable tab area */}
        <div className="flex-1 overflow-hidden relative min-w-0">
          <div
            ref={scrollRef}
            className="flex items-end gap-1 overflow-x-auto scrollbar-hide"
          >
            {chiefConversation ? (
              <ChiefTab
                conversation={chiefConversation}
                isSelected={selectedConversationId === chiefConversation.conversation_id}
                onSelect={() => onSelectConversation(chiefConversation.conversation_id, 'chief')}
                handoffPhase={getHandoffPhase?.(chiefConversation.conversation_id)}
              />
            ) : (
              <button
                onClick={handleSpawnChief}
                disabled={spawningChief}
                className={`
                  flex flex-col gap-0.5 px-4 py-2 min-w-[140px] flex-shrink-0
                  bg-gradient-to-b from-[#da7756] to-[#C15F3C] text-white
                  hover:from-[#e08566] hover:to-[#d16f4c]
                  rounded-t-lg transition-colors disabled:opacity-50
                  border-t border-l border-r border-[#da7756]/30 mb-[-1px] z-10
                `}
              >
                <div className="flex items-center gap-2">
                  {spawningChief ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ClaudeLogo className="w-4 h-4" />
                  )}
                  <span className="font-semibold text-sm">Start Chief</span>
                </div>
                <span className="text-[10px] text-white/70">Click to begin</span>
              </button>
            )}

            {specialists.map((conversation) => (
              <SpecialistTab
                key={conversation.conversation_id}
                conversation={conversation}
                isSelected={selectedConversationId === conversation.conversation_id}
                onSelect={() => onSelectConversation(conversation.conversation_id, conversation.role)}
                onClose={() => handleEndConversation(conversation.conversation_id)}
                handoffPhase={getHandoffPhase?.(conversation.conversation_id)}
              />
            ))}
          </div>

          {/* Left fade gradient */}
          {canScrollLeft && (
            <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-gray-100 dark:from-[#1a1a1a] to-transparent pointer-events-none z-20" />
          )}

          {/* Right overflow: fade + count pill */}
          {hiddenRightCount > 0 && (
            <>
              <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-100 dark:from-[#1a1a1a] to-transparent pointer-events-none z-20" />
              <button
                onClick={scrollRight}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-30
                  px-1.5 py-0.5 rounded-full text-[10px] font-medium
                  bg-gray-200 dark:bg-[#333] text-gray-600 dark:text-[#aaa]
                  hover:bg-gray-300 dark:hover:bg-[#444] transition-colors"
              >
                +{hiddenRightCount}
              </button>
            </>
          )}
        </div>

        {/* Pinned action buttons */}
        <div className="flex items-end flex-shrink-0">
          <div className="relative">
            <button
              data-testid="spawn-specialist"
              onClick={() => setShowSpawnDropdown(!showSpawnDropdown)}
              className={`
                flex items-center gap-1.5 px-2.5 py-1.5 self-end
                text-[11px] font-medium rounded-t-lg transition-colors
                text-gray-400 dark:text-[#666] hover:text-gray-600 dark:hover:text-white
                hover:bg-gray-200/70 dark:hover:bg-[#252525]
                ${showSpawnDropdown ? 'bg-gray-200/70 dark:bg-[#252525] text-gray-600 dark:text-white' : ''}
              `}
              title="New specialist"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>

            {showSpawnDropdown && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowSpawnDropdown(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#404040] rounded-lg shadow-xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100 dark:border-[#333] bg-gray-50 dark:bg-[#252525]">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-[#666]">
                      New Specialist
                    </span>
                  </div>
                  <div className="py-1">
                    {specialistRoles.map((role) => (
                      <button
                        key={role.slug}
                        onClick={() => handleSpawn(role.slug)}
                        disabled={spawningRole !== null}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors disabled:opacity-50"
                      >
                        <span className="text-[#da7756] flex-shrink-0">
                          {spawningRole === role.slug ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            renderRoleIcon(role.slug, 'w-4 h-4')
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium text-gray-900 dark:text-white">
                            {role.label}
                          </div>
                          {role.description && (
                            <div className="text-[10px] text-gray-400 dark:text-[#666] truncate">
                              {role.description}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {onMinimize && (
            <button
              data-testid="minimize-panel"
              onClick={onMinimize}
              className="flex items-center justify-center w-7 h-7 rounded-t-lg self-end
                text-gray-400 dark:text-[#555] hover:text-gray-600 dark:hover:text-[#888]
                hover:bg-gray-200/70 dark:hover:bg-[#252525] transition-colors"
              title="Minimize panel"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {selectedConversation && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-[#1e1e1e]">
          {/* LEFT: Status text with colored bar */}
          <div className="flex items-center gap-3 min-w-0">
            {selectedHandoffPhase ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-[#da7756] animate-spin flex-shrink-0" />
                <span className="text-[13px] truncate text-[#da7756]">
                  {handoffStatusText[selectedHandoffPhase]}
                </span>
              </>
            ) : (
              <>
                <div className={`w-0.5 h-4 rounded-full flex-shrink-0 ${isWorking ? 'bg-[#da7756]' : 'bg-gray-200 dark:bg-[#444]'}`} />
                <span className={`text-[13px] truncate ${isWorking ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-[#666]'}`}>
                  {statusText}
                </span>
              </>
            )}
          </div>

          {/* RIGHT: Phase bar + Session count */}
          <div className="flex items-center gap-2.5 flex-shrink-0 ml-4">
            {(() => {
              const mode = selectedConversation.mode;
              const sessionCount = selectedConversation.session_count;
              const phases = ['preparation', 'implementation', 'verification'] as const;
              const phaseIdx = phases.indexOf(mode as typeof phases[number]);
              const isSpecialist = phaseIdx >= 0;

              const phaseColors: Record<string, string> = {
                preparation: '#60a5fa',
                implementation: '#f59e0b',
                verification: '#34d399',
              };

              return (
                <>
                  {isSpecialist ? (
                    <div className="flex items-center gap-0.5">
                      {phases.map((phase, idx) => {
                        const isCompleted = idx < phaseIdx;
                        const isCurrent = idx === phaseIdx;
                        const color = phaseColors[phase];

                        return (
                          <div key={phase} className="flex items-center gap-0.5">
                            {idx > 0 && (
                              <div
                                className="w-2.5 h-px"
                                style={{
                                  backgroundColor: isCompleted || isCurrent ? color : 'var(--border-subtle)',
                                  opacity: isCompleted || isCurrent ? 0.6 : 0.3,
                                }}
                              />
                            )}
                            {isCompleted ? (
                              <Check className="w-2.5 h-2.5" style={{ color }} />
                            ) : isCurrent ? (
                              <div
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: color }}
                              />
                            ) : (
                              <div
                                className="w-1.5 h-1.5 rounded-full border"
                                style={{ borderColor: 'var(--text-muted)', opacity: 0.3 }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${isWorking ? 'bg-green-400' : 'bg-[#da7756]/40'}`} />
                      <span className="text-[10px] font-medium text-gray-500 dark:text-[#666]">
                        Interactive
                      </span>
                    </div>
                  )}
                  {sessionCount > 1 && (
                    <span className="text-[11px] text-gray-500 dark:text-[#666]">
                      {sessionCount} sessions
                    </span>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default ConversationList;
