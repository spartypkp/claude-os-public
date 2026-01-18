/**
 * Roles Query Hook - React Query for role metadata.
 *
 * Provides access to role configuration (icons, colors, display metadata)
 * from .claude/roles/*.md files via backend API.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

export interface RoleDisplay {
  icon: string;      // Lucide icon name (e.g., "crown", "code-2")
  color: string;     // Base color name (e.g., "amber", "cyan")
  is_logo?: boolean; // If true, use SVG logo instead of icon
}

export interface Role {
  slug: string;
  name: string;
  auto_include: string[];
  content: string;
  is_protected: boolean;
  modes: string[];
  display: RoleDisplay;
}

interface RolesResponse {
  success: boolean;
  roles: Role[];
}

async function fetchRoles(): Promise<Role[]> {
  const response = await fetch(`${API_BASE}/api/roles/`);

  if (!response.ok) {
    throw new Error(`Failed to fetch roles: ${response.statusText}`);
  }

  const data: RolesResponse = await response.json();
  return data.roles;
}

async function fetchRole(slug: string): Promise<Role> {
  const response = await fetch(`${API_BASE}/api/roles/${slug}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch role: ${response.statusText}`);
  }

  const data = await response.json();
  return data.role;
}

/**
 * Hook to fetch all roles.
 */
export function useRolesQuery() {
  return useQuery({
    queryKey: queryKeys.roles,
    queryFn: fetchRoles,
    staleTime: 5 * 60 * 1000, // 5 minutes - roles rarely change
  });
}

/**
 * Hook to fetch a single role by slug.
 */
export function useRoleQuery(slug: string) {
  return useQuery({
    queryKey: queryKeys.role(slug),
    queryFn: () => fetchRole(slug),
    staleTime: 5 * 60 * 1000,
  });
}
