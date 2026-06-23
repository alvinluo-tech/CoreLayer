import { useState, useEffect } from 'react';
import { X, FileText } from 'lucide-react';

export interface SpecData {
  summary: string;
  nonGoals: string[];
  techStack: string;
  constraints: string[];
  milestones: string[];
}

interface ProjectSpecModalProps {
  goal: string;
  spec: SpecData | null;
  onConfirm: (spec: SpecData) => void;
  onCancel: () => void;
}

const inputStyle = {
  width: '100%',
  fontFamily: 'var(--font-data)',
  fontSize: 12,
  color: 'var(--text-primary)',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 6,
  padding: '8px 10px',
  outline: 'none',
};

const textareaStyle = {
  ...inputStyle,
  resize: 'vertical' as const,
};

export function ProjectSpecModal({ goal, spec, onConfirm, onCancel }: ProjectSpecModalProps) {
  const [summary, setSummary] = useState('');
  const [nonGoals, setNonGoals] = useState('');
  const [techStack, setTechStack] = useState('');
  const [constraints, setConstraints] = useState('');

  useEffect(() => {
    setSummary(spec?.summary || '');
    setNonGoals(spec?.nonGoals ? spec.nonGoals.join('\n') : '');
    setTechStack(spec?.techStack || '');
    setConstraints(spec?.constraints ? spec.constraints.join('\n') : '');
  }, [spec]);

  const handleStart = () => {
    onConfirm({
      summary,
      nonGoals: nonGoals
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
      techStack,
      constraints: constraints
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
      milestones: spec?.milestones || [],
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--glass-border)' }}
        >
          <div className="flex items-center gap-2">
            <FileText size={14} style={{ color: 'var(--cyan)' }} />
            <span
              style={{
                fontFamily: 'var(--font-hud)',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              Project Spec
            </span>
          </div>
          <button
            onClick={onCancel}
            style={{
              color: 'var(--text-tertiary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-3 space-y-3" style={{ maxHeight: 400, overflowY: 'auto' }}>
          <div>
            <div className="hud-label" style={{ marginBottom: 4 }}>
              Goal
            </div>
            <div
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 12,
                color: 'var(--text-secondary)',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid rgba(255,255,255,0.04)',
                borderRadius: 6,
                padding: '8px 10px',
                lineHeight: 1.5,
              }}
            >
              {goal}
            </div>
          </div>

          <div>
            <div className="hud-label" style={{ marginBottom: 4 }}>
              Summary
            </div>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              style={textareaStyle}
              rows={2}
            />
          </div>

          <div>
            <div className="hud-label" style={{ marginBottom: 4 }}>
              Non-Goals (One per line)
            </div>
            <textarea
              value={nonGoals}
              onChange={(e) => setNonGoals(e.target.value)}
              style={textareaStyle}
              rows={3}
            />
          </div>

          <div>
            <div className="hud-label" style={{ marginBottom: 4 }}>
              Tech Stack
            </div>
            <input
              type="text"
              value={techStack}
              onChange={(e) => setTechStack(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <div className="hud-label" style={{ marginBottom: 4 }}>
              Constraints (One per line)
            </div>
            <textarea
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              style={textareaStyle}
              rows={3}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-4 py-3"
          style={{ borderTop: '1px solid var(--glass-border)' }}
        >
          <button
            onClick={onCancel}
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--text-tertiary)',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 6,
              padding: '6px 14px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--cyan)',
              background: 'rgba(0,212,255,0.08)',
              border: '1px solid rgba(0,212,255,0.15)',
              borderRadius: 6,
              padding: '6px 14px',
              cursor: 'pointer',
            }}
          >
            Start Workspace
          </button>
        </div>
      </div>
    </div>
  );
}
