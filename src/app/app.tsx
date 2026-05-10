import React, { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useAgentConfig } from './hooks/useAgentConfig.js';
import { useAudit } from './hooks/useAudit.js';
import { AgentPicker } from './components/AgentPicker.js';
import { ScoreCard } from './components/ScoreCard.js';
import { RuleResults } from './components/RuleResults.js';
import { SimulationResults } from './components/SimulationResults.js';
import { RecommendationPanel } from './components/RecommendationPanel.js';

declare const mondaySdk: (() => {
  init: () => void;
}) & Record<string, unknown>;

function App() {
  const sdkInitialized = useRef(false);
  useEffect(() => {
    if (!sdkInitialized.current && typeof mondaySdk !== 'undefined') {
      mondaySdk().init();
      sdkInitialized.current = true;
    }
  }, []);

  const { agents, selected, selectAgent, loading, error, refresh } =
    useAgentConfig();
  const { report, loading: auditing } = useAudit(selected);

  if (loading) {
    return <CenteredMessage>Loading agents...</CenteredMessage>;
  }

  if (error) {
    return (
      <CenteredMessage>
        <div style={{ color: '#d83a52' }}>{error}</div>
        <button
          onClick={refresh}
          style={{
            marginTop: 12,
            padding: '8px 20px',
            borderRadius: 8,
            border: '1px solid #d0d4e4',
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </CenteredMessage>
    );
  }

  if (agents.length === 0) {
    return (
      <CenteredMessage>
        <div>No agents found.</div>
        <div style={{ fontSize: 13, color: '#777', marginTop: 8 }}>
          Create an agent in{' '}
          <a
            href="https://monday.monday.com/apps/manage/agent-builder"
            target="_blank"
            rel="noopener noreferrer"
          >
            Agent Builder
          </a>{' '}
          to get started.
        </div>
      </CenteredMessage>
    );
  }

  const selectedIndex = selected
    ? agents.findIndex((a) => a.agentId === selected.agentId)
    : -1;

  return (
    <div
      style={{
        maxWidth: 900,
        margin: '0 auto',
        padding: 24,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {agents.length > 1 && (
        <div style={{ marginBottom: 20 }}>
          <AgentPicker
            agents={agents}
            selectedIndex={selectedIndex}
            onSelect={selectAgent}
            onRefresh={refresh}
          />
        </div>
      )}

      {auditing && <CenteredMessage>Running audit...</CenteredMessage>}

      {report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <ScoreCard report={report} />
          <RuleResults results={report.layers.configAudit.results} />
          {report.layers.simulation && (
            <SimulationResults results={report.layers.simulation.results} />
          )}
          <RecommendationPanel recommendations={report.recommendations} />
        </div>
      )}
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 300,
        fontSize: 15,
        color: '#333',
      }}
    >
      {children}
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
