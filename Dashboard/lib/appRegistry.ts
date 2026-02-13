/**
 * App Registry - Plugin system for Custom Apps
 * 
 * Each Custom App defines a manifest.ts that registers itself here.
 * The Dock and Sidebar dynamically discover apps from this registry.
 */

import type { LucideIcon } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface AppRoute {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  /** Optional keyboard shortcut (1-9) within the app */
  shortcut?: string;
}

export interface AppContextMenuItem {
  id: string;
  label: string;
  /** Action identifier - handled by the app */
  action: string;
  icon?: LucideIcon;
  /** Keyboard shortcut */
  shortcut?: string;
  /** Separator before this item */
  separator?: boolean;
}

export interface AppBadge {
  label: string;
  type?: 'info' | 'warning' | 'error';
}

export interface AppManifest {
  /** Unique identifier (used in routes, e.g., 'my-app') */
  id: string;
  /** Display name */
  name: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Tailwind gradient classes for Dock icon background */
  gradient: string;
  /** Sub-routes within the app */
  routes: AppRoute[];
  /** Optional: Custom context menu items for this app */
  contextMenu?: AppContextMenuItem[];
  /** Optional: Dynamic badge for sidebar (async for API calls) */
  getBadge?: () => Promise<AppBadge> | AppBadge;
  /** Optional: Description shown in tooltips */
  description?: string;
}

// ============================================================================
// REGISTRY
// ============================================================================

const registry = new Map<string, AppManifest>();

/**
 * Register a Custom App manifest.
 * Called from each app's manifest.ts file.
 */
export function registerApp(manifest: AppManifest): void {
  if (registry.has(manifest.id)) {
    console.warn(`App "${manifest.id}" is already registered. Overwriting.`);
  }
  registry.set(manifest.id, manifest);
}

/**
 * Get all registered apps.
 */
export function getApps(): AppManifest[] {
  return Array.from(registry.values());
}

/**
 * Get a specific app by ID.
 */
export function getApp(id: string): AppManifest | undefined {
  return registry.get(id);
}

/**
 * Check if an app is registered.
 */
export function hasApp(id: string): boolean {
  return registry.has(id);
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the root path for an app (first route).
 */
export function getAppRootPath(manifest: AppManifest): string {
  return manifest.routes[0]?.path ?? `/${manifest.id}`;
}

/**
 * Convert manifest routes to Sidebar blueprint format.
 */
export function manifestToBlueprint(manifest: AppManifest) {
  return {
    id: manifest.id,
    name: manifest.name,
    icon: manifest.icon,
    routes: manifest.routes,
    getBadge: manifest.getBadge,
  };
}

