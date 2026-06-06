import { Brain, ListTodo, Play, ShieldCheck, FolderKanban, Bot, MessageSquare } from 'lucide-react';
import { useShellStore } from '@/stores/shellStore';
import { useTaskStore } from '@/stores/taskStore';
import { useRunStore } from '@/stores/runStore';
import { useMemoryStore } from '@/stores/memoryStore';
import { useApprovalStore } from '@/stores/approvalStore';
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

// ---- Main Inspector Pane ----

const viewPlaceholders: Record<string, { icon: typeof Brain; title: string; message: string }> = {
  projects: {
    icon: FolderKanban,
    title: 'PROJECT INSPECTOR',
    message: 'Select a project to view its metadata, agents, and permissions.',
  },
  agents: {
    icon: Bot,
    title: 'AGENT INSPECTOR',
    message: 'Select an agent to view its model, tools, skills, and permissions.',
  },
  conversation: {
    icon: MessageSquare,
    title: 'CONVERSATION INSPECTOR',
    message: 'Conversation details will appear here.',
  },
};

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

  // Generic placeholder for other views
  const placeholder = viewPlaceholders[activeView];
  if (placeholder) {
    return (
      <EmptyState icon={placeholder.icon} title={placeholder.title} message={placeholder.message} />
    );
  }

  return null;
}
