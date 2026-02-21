'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { API_BASE } from '@/lib/api';

interface ServiceAccount {
  id: string;
  email: string;
  display_name: string;
  is_primary: boolean;
  is_claude_account: boolean;
}

interface ServiceData {
  service: string;
  tier: string;
  account_count: number;
  defaults: Record<string, string>;
  accounts: ServiceAccount[];
}

async function fetchServices(): Promise<ServiceData[]> {
  const response = await fetch(`${API_BASE}/api/services`);
  if (!response.ok) {
    throw new Error(`Failed to fetch services: ${response.statusText}`);
  }
  const data = await response.json();
  return data.services || [];
}

/**
 * Hook to fetch all services with their access tiers, accounts, and defaults.
 */
export function useServicesQuery() {
  return useQuery({
    queryKey: queryKeys.services,
    queryFn: fetchServices,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Hook to update a service's access tier.
 */
export function useUpdateServiceTier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ service, tier }: { service: string; tier: string }) => {
      const response = await fetch(`${API_BASE}/api/services/${service}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      if (!response.ok) {
        throw new Error(`Failed to update service tier: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.services });
    },
  });
}
