import { useState, useEffect, useCallback } from 'react';
import type { AgentConfig } from '../../config/types.js';
import { mapApiResponseToConfig } from '../../mapper/api-to-config.js';
import type { InternalAgentResponse } from '../../mapper/api-types.js';

export interface UseAgentConfigResult {
  agents: AgentConfig[];
  selected: AgentConfig | null;
  selectAgent: (index: number) => void;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function getCsrfToken(): string {
  const meta = document.querySelector('meta[name="csrf-token"]');
  if (meta) return meta.getAttribute('content') || '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).__CSRF_TOKEN__ || '';
}

async function fetchAgents(): Promise<InternalAgentResponse[]> {
  const res = await fetch('/monday-agents/agent-management/agents-by-user', {
    credentials: 'include',
    headers: {
      'x-csrf-token': getCsrfToken(),
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Agent fetch failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function useAgentConfig(): UseAgentConfigResult {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [rawAgents, setRawAgents] = useState<InternalAgentResponse[]>([]);
  const [selected, setSelected] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await fetchAgents();
      setRawAgents(raw);
      const mapped = raw.map(mapApiResponseToConfig);
      setAgents(mapped);
      if (mapped.length === 1) {
        setSelected(mapped[0]);
      } else {
        setSelected(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectAgent = useCallback(
    (index: number) => {
      if (index >= 0 && index < agents.length) {
        setSelected(agents[index]);
      }
    },
    [agents],
  );

  return { agents, selected, selectAgent, loading, error, refresh: load };
}
