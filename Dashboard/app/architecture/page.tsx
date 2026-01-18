"use client";

import React from 'react';

export default function ArchitecturePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Claude OS Architecture
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            A life management system where Claude is the operating system
          </p>
        </div>

        {/* Main Architecture Diagram */}
        <div className="space-y-8">

          {/* Layer 1: Knowledge Foundation */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border-2 border-blue-200 dark:border-blue-800">
            <div className="text-center mb-4">
              <h2 className="text-xl font-semibold text-blue-600 dark:text-blue-400">
                Knowledge Foundation
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Persistent context that makes Claude effective</p>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <SpecBox title="LIFE-SPEC.md" desc="Goals & Strategy" color="blue" />
              <SpecBox title="MEMORY.md" desc="Learned Patterns" color="blue" />
              <SpecBox title="TODAY.md" desc="Daily Context" color="blue" />
              <SpecBox title="IDENTITY.md" desc="Who You Are" color="blue" />
            </div>
          </div>

          {/* Arrow Down */}
          <div className="flex justify-center">
            <svg width="40" height="40" viewBox="0 0 40 40" className="text-gray-400">
              <path d="M20 0 L20 30 M10 20 L20 30 L30 20" stroke="currentColor" strokeWidth="3" fill="none" />
            </svg>
          </div>

          {/* Layer 2: Claude Team */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border-2 border-purple-200 dark:border-purple-800">
            <div className="text-center mb-4">
              <h2 className="text-xl font-semibold text-purple-600 dark:text-purple-400">
                Claude Team
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Orchestrated intelligence at every level</p>
            </div>

            <div className="space-y-6">
              {/* Chief */}
              <div className="flex justify-center">
                <TeamBox
                  title="Chief"
                  desc="Orchestrates daily work, delegates to specialists"
                  color="purple"
                  size="large"
                />
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <svg width="40" height="30" viewBox="0 0 40 30" className="text-gray-400">
                  <path d="M20 0 L20 20 M10 10 L20 20 L30 10" stroke="currentColor" strokeWidth="2" fill="none" />
                </svg>
              </div>

              {/* Specialists */}
              <div className="grid grid-cols-4 gap-4">
                <TeamBox title="Builder" desc="Infrastructure & Apps" color="purple" />
                <TeamBox title="Deep Work" desc="Research & Analysis" color="purple" />
                <TeamBox title="Idea" desc="Brainstorming" color="purple" />
                <TeamBox title="Project" desc="External Code" color="purple" />
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <svg width="40" height="30" viewBox="0 0 40 30" className="text-gray-400">
                  <path d="M20 0 L20 20 M10 10 L20 20 L30 10" stroke="currentColor" strokeWidth="2" fill="none" />
                </svg>
              </div>

              {/* Workers */}
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                <div className="text-center mb-3">
                  <h3 className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                    Workers (Background Tasks)
                  </h3>
                </div>
                <div className="flex justify-center gap-2 flex-wrap">
                  <WorkerBadge>Recall</WorkerBadge>
                  <WorkerBadge>Research</WorkerBadge>
                  <WorkerBadge>Contact Update</WorkerBadge>
                  <WorkerBadge>File Organize</WorkerBadge>
                  <WorkerBadge>Doc Update</WorkerBadge>
                </div>
              </div>
            </div>
          </div>

          {/* Arrow Down */}
          <div className="flex justify-center">
            <svg width="40" height="40" viewBox="0 0 40 40" className="text-gray-400">
              <path d="M20 0 L20 30 M10 20 L20 30 L30 20" stroke="currentColor" strokeWidth="3" fill="none" />
            </svg>
          </div>

          {/* Layer 3: Integrations & Apps */}
          <div className="grid grid-cols-2 gap-6">
            {/* Integrations */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border-2 border-green-200 dark:border-green-800">
              <div className="text-center mb-4">
                <h2 className="text-xl font-semibold text-green-600 dark:text-green-400">
                  System Integrations
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Native platform connections</p>
              </div>
              <div className="space-y-2">
                <IntegrationBox icon="📅" title="Calendar" desc="Apple Calendar + Google" />
                <IntegrationBox icon="👤" title="Contacts" desc="Unified contact database" />
                <IntegrationBox icon="✉️" title="Email" desc="Multi-account mail access" />
                <IntegrationBox icon="💬" title="Messages" desc="iMessage integration" />
              </div>
            </div>

            {/* Custom Apps */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 border-2 border-orange-200 dark:border-orange-800">
              <div className="text-center mb-4">
                <h2 className="text-xl font-semibold text-orange-600 dark:text-orange-400">
                  Custom Applications
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Purpose-built for your life domains</p>
              </div>
              <div className="space-y-2">
                <AppBox title="Job Search" desc="Interview prep, pipeline, opportunities" />
                <AppBox title="Accelr8" desc="Property management" />
                <AppBox title="Spotr" desc="Habit tracking" />
              </div>
              <div className="mt-4 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                  Generated from APP-SPEC.md blueprints
                </p>
              </div>
            </div>
          </div>

          {/* Arrow Down */}
          <div className="flex justify-center">
            <svg width="40" height="40" viewBox="0 0 40 40" className="text-gray-400">
              <path d="M20 0 L20 30 M10 20 L20 30 L30 20" stroke="currentColor" strokeWidth="3" fill="none" />
            </svg>
          </div>

          {/* Layer 4: Dashboard */}
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg shadow-xl p-8 text-white">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">
                Dashboard
              </h2>
              <p className="text-indigo-100 mb-6">
                macOS-inspired visual interface — your window into Claude OS
              </p>
              <div className="grid grid-cols-3 gap-4 max-w-3xl mx-auto">
                <DashFeature icon="🪟" title="Windows" desc="Claude Finder, Calendar, Settings" />
                <DashFeature icon="🎯" title="Widgets" desc="Priorities, Sessions, Events" />
                <DashFeature icon="💬" title="Live Chat" desc="Talk to any Claude instance" />
              </div>
            </div>
          </div>

        </div>

        {/* Footer Note */}
        <div className="mt-12 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>Everything runs locally. Files are the source of truth. Claude is the intelligence layer.</p>
        </div>
      </div>
    </div>
  );
}

// Component helpers
function SpecBox({ title, desc, color }: { title: string; desc: string; color: 'blue' }) {
  const colors = {
    blue: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
  };

  return (
    <div className={`${colors[color]} border rounded-lg p-4 text-center`}>
      <div className="font-mono text-sm font-semibold text-gray-900 dark:text-white mb-1">
        {title}
      </div>
      <div className="text-xs text-gray-600 dark:text-gray-400">
        {desc}
      </div>
    </div>
  );
}

function TeamBox({ title, desc, color, size = "normal" }: { title: string; desc: string; color: 'purple'; size?: string }) {
  const isLarge = size === "large";
  const colors = {
    purple: "bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700",
  };

  return (
    <div className={`${colors[color]} border-2 rounded-lg p-4 text-center ${isLarge ? 'max-w-md' : ''}`}>
      <div className={`font-semibold text-gray-900 dark:text-white mb-1 ${isLarge ? 'text-lg' : 'text-sm'}`}>
        {title}
      </div>
      <div className="text-xs text-gray-600 dark:text-gray-400">
        {desc}
      </div>
    </div>
  );
}

function WorkerBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3 py-1 bg-purple-100 dark:bg-purple-800/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium">
      {children}
    </span>
  );
}

function IntegrationBox({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
      <div className="text-2xl">{icon}</div>
      <div>
        <div className="font-semibold text-sm text-gray-900 dark:text-white">{title}</div>
        <div className="text-xs text-gray-600 dark:text-gray-400">{desc}</div>
      </div>
    </div>
  );
}

function AppBox({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
      <div className="font-semibold text-sm text-gray-900 dark:text-white">{title}</div>
      <div className="text-xs text-gray-600 dark:text-gray-400">{desc}</div>
    </div>
  );
}

function DashFeature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl mb-2">{icon}</div>
      <div className="font-semibold text-white mb-1">{title}</div>
      <div className="text-xs text-indigo-200">{desc}</div>
    </div>
  );
}
