import { useState, useEffect, useCallback } from 'react';
import type { AgentConfig } from '../../config/types.js';
import { mapApiResponseToConfig } from '../../mapper/api-to-config.js';
import type { InternalAgentResponse } from '../../mapper/api-types.js';

export type ConfigSource = 'api' | 'manual';

export interface UseAgentConfigResult {
  agents: AgentConfig[];
  selected: AgentConfig | null;
  selectAgent: (index: number) => void;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  source: ConfigSource;
  loadFromJson: (json: string) => string | null;
  reset: () => void;
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
  const body = await res.text();
  if (body.trimStart().startsWith('<')) {
    throw new Error('API returned HTML — internal endpoint not available');
  }
  return JSON.parse(body);
}

export function useAgentConfig(): UseAgentConfigResult {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [selected, setSelected] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<ConfigSource>('api');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await fetchAgents();
      const mapped = raw.map(mapApiResponseToConfig);
      setAgents(mapped);
      setSource('api');
      if (mapped.length === 1) {
        setSelected(mapped[0]);
      } else {
        setSelected(null);
      }
    } catch {
      setSource('manual');
      setAgents([]);
      setSelected(null);
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

  const loadFromJson = useCallback((json: string): string | null => {
    try {
      const parsed = JSON.parse(json);
      const config: AgentConfig = {
        agentId: parsed.agentId || 'manual-agent',
        agentName: parsed.agentName || 'Imported Agent',
        kind: parsed.kind || 'PERSONAL',
        state: parsed.state || 'ACTIVE',
        instructions: parsed.instructions || { goal: '', plan: '', userPrompt: '' },
        knowledgeBase: parsed.knowledgeBase || { files: [] },
        tools: parsed.tools || [],
        triggers: parsed.triggers || [],
        permissions: parsed.permissions || {
          scopeType: 'board',
          connectedBoards: [],
          connectedDocs: [],
        },
        skills: parsed.skills || [],
      };
      setAgents([config]);
      setSelected(config);
      setSource('manual');
      setError(null);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Invalid JSON';
    }
  }, []);

  const reset = useCallback(() => {
    setAgents([]);
    setSelected(null);
    setSource('manual');
    setError(null);
  }, []);

  return {
    agents,
    selected,
    selectAgent,
    loading,
    error,
    refresh: load,
    source,
    loadFromJson,
    reset,
  };
}
