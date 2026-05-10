import React, { useState } from 'react';
import type {
  LlmReviewResultEntry,
  TailoredFixEntry,
} from '../../config/types.js';

interface Props {
  results: LlmReviewResultEntry[];
  tailoredFixes?: TailoredFixEntry[];
}

export function LlmReviewResults({ results, tailoredFixes }: Props) {
  return (
    <div>
      <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>
        LLM Review
      </h3>
      {results.map((r) => (
        <CheckRow key={r.checkId} result={r} />
      ))}
      {tailoredFixes && tailoredFixes.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>
            Tailored Fixes
          </h4>
          {tailoredFixes.map((fix, i) => (
            <FixRow key={i} fix={fix} />
          ))}
        </div>
      )}
    </div>
  );
}

function CheckRow({ result }: { result: LlmReviewResultEntry }) {
  const [expanded, setExpanded] = useState(false);
  const icon = result.passed ? '\u2705' : '\u274C';
  const barColor = result.passed ? '#00CA72' : '#E44258';
  const barWidth = `${Math.max(result.score, 2)}%`;

  return (
    <div
      style={{
        border: '1px solid #e6e9ef',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 8,
        cursor: 'pointer',
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{icon}</span>
          <span style={{ fontWeight: 500, fontSize: 13 }}>
            {result.checkId}: {result.checkName}
          </span>
          <span
            style={{
              fontSize: 11,
              padding: '2px 6px',
              borderRadius: 4,
              background:
                result.severity === 'critical'
                  ? '#fde8ec'
                  : result.severity === 'warning'
                    ? '#fff4e5'
                    : '#e8f4fd',
              color:
                result.severity === 'critical'
                  ? '#d83a52'
                  : result.severity === 'warning'
                    ? '#c47e1a'
                    : '#0073ea',
            }}
          >
            {result.severity}
          </span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {result.score}/100
        </span>
      </div>

      <div
        style={{
          height: 4,
          background: '#e6e9ef',
          borderRadius: 2,
          marginTop: 6,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: barWidth,
            background: barColor,
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      {expanded && (
        <div style={{ marginTop: 10, fontSize: 13, color: '#555' }}>
          <p style={{ margin: '4px 0' }}>{result.message}</p>
          {result.recommendation && (
            <p style={{ margin: '4px 0', color: '#0073ea' }}>
              {result.recommendation}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function FixRow({ fix }: { fix: TailoredFixEntry }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(fix.instructionText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      style={{
        border: '1px solid #d0d4e4',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 8,
        background: '#f5f6f8',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 12, color: '#777' }}>
          {fix.relatedCheck} &middot; {fix.placement}
        </span>
        <button
          onClick={handleCopy}
          style={{
            fontSize: 12,
            padding: '4px 10px',
            borderRadius: 4,
            border: '1px solid #d0d4e4',
            background: copied ? '#00CA72' : '#fff',
            color: copied ? '#fff' : '#333',
            cursor: 'pointer',
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          lineHeight: 1.5,
        }}
      >
        {fix.instructionText}
      </pre>
    </div>
  );
}
