import { useEffect } from 'react';
import { FolderKanban, Loader2, XCircle, Archive, CheckCircle2, Zap } from 'lucide-react';
import { useWorkspaceStore, type Project } from '@/stores/workspaceStore';
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher';
import { ProjectList } from '@/components/workspace/ProjectList';

// ---- Helpers ----

const statusIcons: Record<Project['status'], React.ReactNode> = {
  active: <Zap size={12} style={{ color: 'var(--emerald)' }} />,
  archived: <Archive size={12} style={{ color: 'var(--amber)' }} />,
  completed: <CheckCircle2 size={12} style={{ color: 'var(--cyan)' }} />,
};

const statusColors: Record<Project['status'], string> = {
  active: 'var(--emerald)',
  archived: 'var(--amber)',
  completed: 'var(--cyan)',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---- Project Detail ----

function ProjectDetail({ project }: { project: Project }) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <FolderKanban size={16} style={{ color: 'var(--cyan)' }} />
        <span
          style={{
            fontFamily: 'var(--font-hud)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          {project.name}
        </span>
        <span
          className="flex items-center gap-1"
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 9,
            color: statusColors[project.status],
            background: `${statusColors[project.status]}15`,
            padding: '2px 6px',
            borderRadius: 3,
          }}
        >
          {statusIcons[project.status]}
          {project.status}
        </span>
      </div>

      {/* Description */}
      {project.description && (
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {project.description}
        </div>
      )}

      {/* Metadata */}
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: 'auto 1fr',
          fontFamily: 'var(--font-data)',
          fontSize: 11,
        }}
      >
        <MetaLabel>Status</MetaLabel>
        <MetaValue>
          <span className="flex items-center gap-1">
            {statusIcons[project.status]}
            {project.status}
          </span>
        </MetaValue>
        <MetaLabel>Created</MetaLabel>
        <MetaValue>{formatDate(project.createdAt)}</MetaValue>
        <MetaLabel>Updated</MetaLabel>
        <MetaValue>{formatDate(project.updatedAt)}</MetaValue>
        <MetaLabel>ID</MetaLabel>
        <MetaValue>{project.id.slice(0, 12)}...</MetaValue>
      </div>

      {/* Placeholder sections */}
      <div className="space-y-3 pt-2">
        <SectionHeader>Related Data</SectionHeader>
        <div
          className="p-3"
          style={{
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 8,
            border: '1px solid var(--glass-border)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--text-tertiary)',
            }}
          >
            Task, run, and memory counts will appear here once linked to this project.
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-hud)',
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--text-tertiary)',
        letterSpacing: 1,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  );
}

function MetaLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{children}</span>;
}

function MetaValue({ children }: { children: React.ReactNode }) {
  return (
    <span className="truncate" style={{ color: 'var(--text-secondary)' }}>
      {children}
    </span>
  );
}

// ---- Empty State ----

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <FolderKanban size={48} className="mx-auto" style={{ color: 'var(--text-tertiary)' }} />
        <div
          style={{
            fontFamily: 'var(--font-hud)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            letterSpacing: 1,
          }}
        >
          NO PROJECTS
        </div>
        <div
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            maxWidth: 280,
          }}
        >
          Create a project to organize work by context with tasks, runs, and memory.
        </div>
      </div>
    </div>
  );
}

// ---- Main View ----

export function ProjectsView() {
  const { projects, currentProject, isLoading, error, loadWorkspaces } = useWorkspaceStore();

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  // Loading
  if (isLoading && projects.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--cyan)' }} />
      </div>
    );
  }

  // Error
  if (error && projects.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <XCircle size={32} className="mx-auto" style={{ color: 'var(--red)' }} />
          <div
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--text-tertiary)',
              maxWidth: 280,
            }}
          >
            {error}
          </div>
          <button
            onClick={loadWorkspaces}
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--cyan)',
              background: 'rgba(0,212,255,0.08)',
              border: '1px solid rgba(0,212,255,0.2)',
              borderRadius: 6,
              padding: '4px 12px',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left: Workspace switcher + Project list */}
      <div
        className="flex flex-col overflow-hidden"
        style={{
          width: 300,
          borderRight: '1px solid var(--glass-border)',
          background: 'rgba(4,6,14,0.4)',
          flexShrink: 0,
        }}
      >
        {/* Workspace header */}
        <div style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <div
            className="px-3 py-1.5"
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}
          >
            Workspace
          </div>
          <WorkspaceSwitcher />
        </div>

        {/* Project list */}
        <div className="flex-1 overflow-y-auto py-2">
          {projects.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <span
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 11,
                  color: 'var(--text-tertiary)',
                }}
              >
                No projects yet
              </span>
            </div>
          ) : (
            <ProjectList />
          )}
        </div>
      </div>

      {/* Right: Detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {currentProject ? <ProjectDetail project={currentProject} /> : <EmptyState />}
      </div>
    </div>
  );
}
