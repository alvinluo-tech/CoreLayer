import { Brain, ListTodo, Play, ShieldCheck, FolderKanban, Bot } from 'lucide-react';
import { useShellStore } from '@/stores/shellStore';
import { useTaskStore } from '@/stores/taskStore';
import { useRunStore } from '@/stores/runStore';
import { useMemoryStore } from '@/stores/memoryStore';
import { useApprovalStore } from '@/stores/approvalStore';
import { useAgentStore } from '@/stores/agentStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { RightPanel } from '@/components/right-panel/RightPanel';
import { EmptyState } from '@/components/ui/agent-os/EmptyState';

// ---- View-specific inspector content ----

function TasksInspector() {
  const tasks = useTaskStore((s) => s.tasks);
  const selectedId = useTaskStore((s) => s.selectedTaskId);
  const task = tasks.find((t) => t.id === selectedId);

  if (!task) {
    return (
      <EmptyState
        icon={ListTodo}
        title="NO TASK SELECTED"
        message="Select a task from the list to view its details here."
      />
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div
        style={{
          fontFamily: 'var(--font-hud)',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        {task.title}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 10,
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
        }}
      >
        {task.status}
      </div>
    </div>
  );
}

function RunsInspector() {
  const runs = useRunStore((s) => s.runs);
  const selectedId = useRunStore((s) => s.selectedRunId);
  const run = runs.find((r) => r.id === selectedId);

  if (!run) {
    return (
      <EmptyState
        icon={Play}
        title="NO RUN SELECTED"
        message="Select a run from the list to view its details here."
      />
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div
        style={{
          fontFamily: 'var(--font-hud)',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        Run {run.id.slice(0, 8)}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 10,
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
        }}
      >
        {run.status} — {run.mode}
      </div>
    </div>
  );
}

function MemoryInspector() {
  const memories = useMemoryStore((s) => s.memories);
  const selectedId = useMemoryStore((s) => s.selectedId);
  const memory = memories.find((m) => m.id === selectedId);

  if (!memory) {
    return (
      <EmptyState
        icon={Brain}
        title="NO MEMORY SELECTED"
        message="Select a memory from the list to view its details here."
      />
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div
        style={{
          fontFamily: 'var(--font-hud)',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        {memory.key}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 11,
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
        }}
      >
        {memory.value}
      </div>
    </div>
  );
}

function ApprovalsInspector() {
  const approvals = useApprovalStore((s) => s.approvals);
  const selectedId = useApprovalStore((s) => s.selectedId);
  const approval = approvals.find((a) => a.id === selectedId);

  if (!approval) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="NO APPROVAL SELECTED"
        message="Select an approval from the list to view its details here."
      />
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div
        style={{
          fontFamily: 'var(--font-hud)',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        {approval.toolName}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 10,
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
        }}
      >
        {approval.status} — {approval.risk}
      </div>
    </div>
  );
}

function AgentsInspector() {
  const agents = useAgentStore((s) => s.agents);
  const selectedId = useAgentStore((s) => s.selectedId);
  const agent = agents.find((a) => a.id === selectedId);

  if (!agent) {
    return (
      <EmptyState
        icon={Bot}
        title="NO AGENT SELECTED"
        message="Select an agent from the list to view its model, tools, and permissions."
      />
    );
  }

  const tagStyle = {
    fontFamily: 'var(--font-data)',
    fontSize: 9,
    padding: '2px 6px',
    borderRadius: 4,
    background: 'rgba(0,212,255,0.08)',
    color: 'var(--cyan)',
    border: '1px solid rgba(0,212,255,0.15)',
  };

  return (
    <div className="p-4 space-y-3">
      <div
        style={{
          fontFamily: 'var(--font-hud)',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        {agent.name}
        {agent.isDefault && <span style={{ ...tagStyle, marginLeft: 8 }}>DEFAULT</span>}
      </div>
      {agent.description && (
        <div
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {agent.description}
        </div>
      )}
      {agent.skills && agent.skills.length > 0 && (
        <div>
          <div
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 9,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            Skills
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {agent.skills.map((s) => (
              <span key={s} style={tagStyle}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
      {agent.tools && agent.tools.length > 0 && (
        <div>
          <div
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 9,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            Tools
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {agent.tools.map((t) => (
              <span key={t} style={tagStyle}>
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
      {agent.permissions && agent.permissions.length > 0 && (
        <div>
          <div
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 9,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            Permissions
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {agent.permissions.map((p) => (
              <span
                key={p}
                style={{
                  ...tagStyle,
                  background: 'rgba(255,184,0,0.08)',
                  color: 'var(--amber)',
                  border: '1px solid rgba(255,184,0,0.15)',
                }}
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectsInspector() {
  const currentProject = useWorkspaceStore((s) => s.currentProject);
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);

  if (!currentProject) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="NO PROJECT SELECTED"
        message="Select a project to view its metadata and settings."
      />
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div
        style={{
          fontFamily: 'var(--font-hud)',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        {currentProject.name}
      </div>
      {currentProject.description && (
        <div
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {currentProject.description}
        </div>
      )}
      <div
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 10,
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
        }}
      >
        {currentProject.status}
      </div>
      {currentWorkspace && (
        <div style={{ fontFamily: 'var(--font-data)', fontSize: 9, color: 'var(--text-tertiary)' }}>
          Workspace: {currentWorkspace.name}
        </div>
      )}
    </div>
  );
}

// ---- Main Inspector Pane ----

export function InspectorPane() {
  const activeView = useShellStore((s) => s.activeView);
  const inspectorOpen = useShellStore((s) => s.inspectorOpen);

  if (!inspectorOpen) return null;

  // Assistant view: show existing RightPanel
  if (activeView === 'assistant') {
    return <RightPanel />;
  }

  // View-specific inspectors
  if (activeView === 'tasks') return <TasksInspector />;
  if (activeView === 'runs') return <RunsInspector />;
  if (activeView === 'memory') return <MemoryInspector />;
  if (activeView === 'approvals') return <ApprovalsInspector />;
  if (activeView === 'agents') return <AgentsInspector />;
  if (activeView === 'projects') return <ProjectsInspector />;

  return null;
}
