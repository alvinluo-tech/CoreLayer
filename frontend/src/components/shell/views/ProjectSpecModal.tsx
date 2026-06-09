import { X, FileText } from 'lucide-react';

interface ProjectSpecModalProps {
  goal: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ProjectSpecModal({ goal, onConfirm, onCancel }: ProjectSpecModalProps) {
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
          <SpecSection title="Goal" content={goal} />
          <SpecSection
            title="Summary"
            content="AI-powered workspace for coordinated agent execution."
          />
          <SpecSection
            title="Non-Goals"
            content="No manual task management. Agents handle planning and execution autonomously."
          />
          <SpecSection title="Tech Stack" content="TypeScript, React, Hono, SQLite, Drizzle ORM" />
          <SpecSection
            title="Constraints"
            content="Single-user desktop app. Local-first. No external dependencies required."
          />
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
            onClick={onConfirm}
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

function SpecSection({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <div className="hud-label" style={{ marginBottom: 4 }}>
        {title}
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
        {content}
      </div>
    </div>
  );
}
