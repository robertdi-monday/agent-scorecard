import React from 'react';
import type { Grade } from '../../config/types.js';

const GRADE_COLORS: Record<Grade, string> = {
  A: '#00CA72',
  B: '#FDAB3D',
  C: '#FF642E',
  D: '#E44258',
  F: '#BB3354',
};

interface Props {
  grade: Grade;
  score: number;
}

export function GradeWheel({ grade, score }: Props) {
  const color = GRADE_COLORS[grade];
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle
        cx="70"
        cy="70"
        r={radius}
        fill="none"
        stroke="#eee"
        strokeWidth="12"
      />
      <circle
        cx="70"
        cy="70"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 70 70)"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text
        x="70"
        y="62"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="36"
        fontWeight="bold"
        fill={color}
      >
        {grade}
      </text>
      <text
        x="70"
        y="90"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="14"
        fill="#666"
      >
        {score}/100
      </text>
    </svg>
  );
}
