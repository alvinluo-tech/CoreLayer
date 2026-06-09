import { create } from 'zustand';

export type ShellView =
  | 'assistant'
  | 'tasks'
  | 'runs'
  | 'memory'
  | 'approvals'
  | 'projects'
  | 'agents'
  | 'workspace'
  | 'control-center';

interface ShellState {
  activeView: ShellView;
  inspectorOpen: boolean;
  contextPaneOpen: boolean;
  selectedRunId?: string;
  selectedTaskId?: string;
  selectedMemoryId?: string;
  selectedApprovalId?: string;
  selectedProjectId?: string;
  selectedAgentId?: string;

  setActiveView: (view: ShellView) => void;
  setInspectorOpen: (open: boolean) => void;
  setContextPaneOpen: (open: boolean) => void;
  selectRun: (id?: string) => void;
  selectTask: (id?: string) => void;
  selectMemory: (id?: string) => void;
  selectApproval: (id?: string) => void;
  selectProject: (id?: string) => void;
  selectAgent: (id?: string) => void;
}

export const useShellStore = create<ShellState>((set) => ({
  activeView: 'assistant',
  inspectorOpen: true,
  contextPaneOpen: true,
  selectedRunId: undefined,
  selectedTaskId: undefined,
  selectedMemoryId: undefined,
  selectedApprovalId: undefined,
  selectedProjectId: undefined,
  selectedAgentId: undefined,

  setActiveView: (view) =>
    set({
      activeView: view,
      // Clear selections when switching views
      selectedRunId: undefined,
      selectedTaskId: undefined,
      selectedMemoryId: undefined,
      selectedApprovalId: undefined,
      selectedProjectId: undefined,
      selectedAgentId: undefined,
    }),

  setInspectorOpen: (open) => set({ inspectorOpen: open }),
  setContextPaneOpen: (open) => set({ contextPaneOpen: open }),
  selectRun: (id) => set({ selectedRunId: id }),
  selectTask: (id) => set({ selectedTaskId: id }),
  selectMemory: (id) => set({ selectedMemoryId: id }),
  selectApproval: (id) => set({ selectedApprovalId: id }),
  selectProject: (id) => set({ selectedProjectId: id }),
  selectAgent: (id) => set({ selectedAgentId: id }),
}));
