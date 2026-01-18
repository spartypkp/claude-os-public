/**
 * Priorities Query Hook - React Query for priority data.
 * 
 * Jan 2026 Architecture Overhaul:
 * Cache is automatically invalidated by SSE events.
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

interface Priority {
  id: string;
  content: string;
  level: 'critical' | 'medium' | 'low';
  completed: boolean;
  position: number;
  created_at: string;
}

interface PrioritiesResponse {
  date: string;
  priorities: {
    critical: Priority[];
    medium: Priority[];
    low: Priority[];
  };
  count: number;
  timestamp: string;
}

async function fetchPriorities(date?: string): Promise<PrioritiesResponse> {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  
  const url = `${API_BASE}/api/priorities${params.toString() ? `?${params}` : ''}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch priorities: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Hook to fetch priorities for a date.
 */
export function usePrioritiesQuery(date?: string) {
  return useQuery({
    queryKey: date ? queryKeys.prioritiesByDate(date) : queryKeys.priorities,
    queryFn: () => fetchPriorities(date),
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Hook to create a priority.
 */
export function useCreatePriority() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { content: string; level?: string; date?: string }) => {
      const response = await fetch(`${API_BASE}/api/priorities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create priority: ${response.statusText}`);
      }
      return response.json();
    },
    // SSE will invalidate, but we can also do optimistic update
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.priorities });
    },
  });
}

/**
 * Hook to complete a priority.
 */
export function useCompletePriority() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (priorityId: string) => {
      const response = await fetch(`${API_BASE}/api/priorities/${priorityId}/complete`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to complete priority: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.priorities });
    },
  });
}

/**
 * Hook to delete a priority.
 */
export function useDeletePriority() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (priorityId: string) => {
      const response = await fetch(`${API_BASE}/api/priorities/${priorityId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete priority: ${response.statusText}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.priorities });
    },
  });
}

