import React, {
  StrictMode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import { useAgentConfig } from './hooks/useAgentConfig.js';
import { useAudit } from './hooks/useAudit.js';
import { AgentPicker } from './components/AgentPicker.js';
import { ScoreCard } from './components/ScoreCard.js';
import { RuleResults } from './components/RuleResults.js';
import { SimulationResults } from './components/SimulationResults.js';
import { LlmReviewResults } from './components/LlmReviewResults.js';
import { ApiKeySettings } from './components/ApiKeySettings.js';
import { RecommendationPanel } from './components/RecommendationPanel.js';
import { exportToBoard } from './services/export-to-board.js';
import type { ScorecardReport } from '../config/types.js';

import mondaySdk from 'monday-sdk-js';

const STORAGE_KEY = 'anthropic-api-key';

const monday = mondaySdk();

function App() {
  const sdkInitialized = useRef(false);
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    if (sdkInitialized.current) return;
    window.parent.postMessage(
      { method: 'init', clientId: '', version: '' },
      '*',
    );
    sdkInitialized.current = true;

    monday.storage.instance
      .getItem(STORAGE_KEY)
      .then((res: { data: { value: string } }) => {
        if (res?.data?.value) setApiKey(res.data.value);
      })
      .catch(() => {});
  }, []);

  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    monday.storage.instance
      .setItem(STORAGE_KEY, { value: key })
      .catch(() => {});
  };

  const {
    agents,
    selected,
    selectAgent,
    loading,
    error,
    refresh,
    source,
    loadFromJson,
    reset,
  } = useAgentConfig();
  const { report, loading: auditing } = useAudit(selected, apiKey || undefined);

  if (loading) {
    return <CenteredMessage>Loading agents...</CenteredMessage>;
  }

  if (source === 'manual' && agents.length === 0) {
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
        <JsonImporter onImport={loadFromJson} />
      </div>
    );
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

      {source === 'manual' && (
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={reset}
            style={{
              padding: '6px 16px',
              borderRadius: 6,
              border: '1px solid #d0d4e4',
              background: '#fff',
              cursor: 'pointer',
              fontSize: 13,
              color: '#555',
            }}
          >
            ← New Audit
          </button>
        </div>
      )}

      <ApiKeySettings apiKey={apiKey} onChange={handleApiKeyChange} />

      {auditing && <CenteredMessage>Running audit...</CenteredMessage>}

      {report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <ScoreCard report={report} />
          <ExportButton report={report} />
          <RuleResults results={report.layers.configAudit.results} />
          {report.layers.simulation && (
            <SimulationResults results={report.layers.simulation.results} />
          )}
          {report.layers.llmReview && (
            <LlmReviewResults
              results={report.layers.llmReview.results}
              tailoredFixes={report.layers.llmReview.tailoredFixes}
            />
          )}
          <RecommendationPanel recommendations={report.recommendations} />
        </div>
      )}
    </div>
  );
}

function ExportButton({ report }: { report: ScorecardReport }) {
  const [state, setState] = useState<'idle' | 'exporting' | 'done' | 'error'>(
    'idle',
  );
  const [boardUrl, setBoardUrl] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setState('exporting');
    setErrMsg(null);
    try {
      const result = await exportToBoard(monday, report);
      setBoardUrl(result.boardUrl);
      setState('done');
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Export failed');
      setState('error');
    }
  }, [report]);

  if (state === 'done' && boardUrl) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ color: '#00854d', fontSize: 14, fontWeight: 600 }}>
          Exported!
        </span>
        <a
          href={boardUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '8px 20px',
            borderRadius: 8,
            background: '#0073ea',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Open Board
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        onClick={handleExport}
        disabled={state === 'exporting'}
        style={{
          padding: '8px 20px',
          borderRadius: 8,
          border: 'none',
          background: state === 'exporting' ? '#ccc' : '#0073ea',
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
          cursor: state === 'exporting' ? 'default' : 'pointer',
        }}
      >
        {state === 'exporting' ? 'Exporting...' : 'Export to Board'}
      </button>
      {state === 'error' && errMsg && (
        <span style={{ color: '#d83a52', fontSize: 13 }}>{errMsg}</span>
      )}
    </div>
  );
}

function JsonImporter({
  onImport,
}: {
  onImport: (json: string) => string | null;
}) {
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = () => {
    const result = onImport(text);
    if (result) setErr(result);
    else setErr(null);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        alignItems: 'center',
        marginTop: 40,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 20, color: '#333' }}>
        Agent Scorecard
      </h2>
      <p
        style={{
          margin: 0,
          color: '#666',
          fontSize: 14,
          textAlign: 'center',
          maxWidth: 500,
        }}
      >
        Paste your agent config JSON below to run the audit. Export your agent
        config from Agent Builder or use the CLI format.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='{"agentId": "...", "agentName": "...", ...}'
        style={{
          width: '100%',
          maxWidth: 600,
          height: 250,
          padding: 12,
          borderRadius: 8,
          border: '1px solid #d0d4e4',
          fontFamily: 'monospace',
          fontSize: 13,
          resize: 'vertical',
        }}
      />
      {err && <div style={{ color: '#d83a52', fontSize: 13 }}>{err}</div>}
      <button
        onClick={handleSubmit}
        disabled={!text.trim()}
        style={{
          padding: '10px 28px',
          borderRadius: 8,
          border: 'none',
          background: text.trim() ? '#0073ea' : '#ccc',
          color: '#fff',
          fontSize: 14,
          cursor: text.trim() ? 'pointer' : 'default',
          fontWeight: 600,
        }}
      >
        Run Audit
      </button>
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
