import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useWorkspaceDetailStore } from '@/stores/workspaceDetailStore';
import { jarvisClient } from '@/lib/jarvisClient';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import { WorkspaceCenter } from './WorkspaceCenter';
import { WorkspaceRightPanel } from './WorkspaceRightPanel';
import { AgentTeamProposalModal } from './AgentTeamProposalModal';
import { ProjectSpecModal, type SpecData } from './ProjectSpecModal';
import { useAgentStore } from '@/stores/agentStore';
import './workspaceView.css';

interface ProposedAgent {
  id: string;
  name: string;
  role: string;
  reason: string;
  risk: 'low' | 'medium' | 'high';
  permissions: string[];
}

export function WorkspaceView() {
  const { workspaces, currentWorkspace, selectWorkspace, loadWorkspaces, createWorkspace } =
    useWorkspaceStore();
  const { detail, isLoading, fetchDetail, clearDetail } = useWorkspaceDetailStore();
  const { agents: allAgents, fetchAgents } = useAgentStore();

  // New workspace flow state
  const [goal, setGoal] = useState('');
  const [showGoalInput, setShowGoalInput] = useState(false);
  const [showSpecModal, setShowSpecModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [editedSpec, setEditedSpec] = useState<SpecData | null>(null);
  const [proposedAgents, setProposedAgents] = useState<ProposedAgent[]>([]);
  const [teamWarnings, setTeamWarnings] = useState<string[]>([]);
  const [isProposing, setIsProposing] = useState(false);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    if (currentWorkspace) {
      fetchDetail(currentWorkspace.id);
    } else {
      clearDetail();
    }
  }, [currentWorkspace, fetchDetail, clearDetail]);

  useEffect(() => {
    if (!currentWorkspace) return;
    const interval = window.setInterval(() => {
      fetchDetail(currentWorkspace.id);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [currentWorkspace, fetchDetail]);

  const handleCreateWorkspace = async () => {
    if (!goal.trim()) return;
    setIsProposing(true);
    try {
      const resp = await jarvisClient.post<{
        data: { spec: SpecData; agents: ProposedAgent[]; warnings: string[] };
      }>('/api/agent-broker/propose-team', { goal: goal.trim(), maxAgents: 5 });
      setEditedSpec(resp.data.spec);
      setProposedAgents(resp.data.agents);
      setTeamWarnings(resp.data.warnings || []);
      setShowGoalInput(false);
      setShowSpecModal(true);
    } catch {
      // Fallback
      setEditedSpec({
        summary: '',
        nonGoals: [],
        techStack: '',
        constraints: [],
        milestones: [],
      });
      setProposedAgents([]);
      setTeamWarnings([]);
      setShowGoalInput(false);
      setShowSpecModal(true);
    } finally {
      setIsProposing(false);
    }
  };

  const handleConfirmSpec = (spec: SpecData) => {
    setEditedSpec(spec);
    setShowSpecModal(false);
    setShowTeamModal(true);
  };

  const handleAddProposedAgent = (agentId: string) => {
    const agent = allAgents.find((a) => a.id === agentId);
    if (!agent) return;
    if (proposedAgents.some((a) => a.id === agentId)) return;
    setProposedAgents([
      ...proposedAgents,
      {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        reason: 'Manually added to the team.',
        risk: 'low',
        permissions: agent.permissions || [],
      },
    ]);
  };

  const handleRemoveProposedAgent = (agentId: string) => {
    setProposedAgents(proposedAgents.filter((a) => a.id !== agentId));
  };

  const handleConfirmTeam = async (selectedAgentIds: string[]) => {
    setShowTeamModal(false);
    setIsProposing(true);
    try {
      // Use the full orchestrator pipeline: goal → workspace → spec → tasks → agents
      const resp = await jarvisClient.post<{ data: { workspace: { id: string } } }>(
        '/api/workspaces/from-goal',
        {
          goal: goal.trim(),
          spec: editedSpec,
          agentIds: selectedAgentIds,
        }
      );
      setGoal('');
      setEditedSpec(null);
      setProposedAgents([]);
      await loadWorkspaces();
      selectWorkspace(resp.data.workspace.id);
    } catch {
      // Fallback: create workspace directly
      const ws = await createWorkspace('Workspace', goal.trim());
      setGoal('');
      setEditedSpec(null);
      setProposedAgents([]);
      selectWorkspace(ws.id);
    } finally {
      setIsProposing(false);
    }
  };

  return (
    <div
      className="flex-1 flex h-full"
      style={{
        background: 'var(--bg-void)',
        gridTemplateColumns: '260px 1fr 280px',
      }}
    >
      <WorkspaceSidebar
        selectedId={currentWorkspace?.id ?? null}
        onSelect={selectWorkspace}
        onCreate={() => setShowGoalInput(true)}
      />

      {/* Middle column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {showGoalInput ? (
          <div
            className="flex-1 flex flex-col items-center justify-center gap-3"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <div className="flex flex-col items-center gap-3 px-4" style={{ maxWidth: 400 }}>
              <span
                style={{
                  fontFamily: 'var(--font-hud)',
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                }}
              >
                What do you want to build?
              </span>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Describe your project goal..."
                rows={3}
                autoFocus
                style={{
                  width: '100%',
                  fontFamily: 'var(--font-data)',
                  fontSize: 12,
                  color: 'var(--text-primary)',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 6,
                  padding: '8px 10px',
                  outline: 'none',
                  resize: 'vertical',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleCreateWorkspace();
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowGoalInput(false)}
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
                  onClick={handleCreateWorkspace}
                  disabled={!goal.trim() || isProposing}
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 11,
                    color: goal.trim() && !isProposing ? 'var(--cyan)' : 'var(--text-tertiary)',
                    background:
                      goal.trim() && !isProposing
                        ? 'rgba(0,212,255,0.08)'
                        : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${goal.trim() && !isProposing ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 6,
                    padding: '6px 14px',
                    cursor: goal.trim() && !isProposing ? 'pointer' : 'not-allowed',
                  }}
                >
                  {isProposing ? 'Proposing...' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        ) : isLoading && !detail ? (
          <div
            className="flex-1 flex items-center justify-center"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <span style={{ fontFamily: 'var(--font-data)', fontSize: 12 }}>Loading...</span>
          </div>
        ) : detail ? (
          <WorkspaceCenter
            detail={detail}
            onShowSpec={() => setShowSpecModal(true)}
            onShowProposal={() => setShowTeamModal(true)}
          />
        ) : (
          <div
            className="flex-1 flex flex-col items-center justify-center gap-3"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <span style={{ fontFamily: 'var(--font-hud)', fontSize: 14, fontWeight: 500 }}>
              {workspaces.length === 0 ? 'No workspaces yet' : 'Select a workspace'}
            </span>
            <span style={{ fontFamily: 'var(--font-data)', fontSize: 11 }}>
              {workspaces.length === 0
                ? 'Create a workspace to get started'
                : 'Choose a workspace from the sidebar'}
            </span>
          </div>
        )}
      </div>

      {/* Right column */}
      <WorkspaceRightPanel detail={detail} />

      {showSpecModal && (
        <ProjectSpecModal
          goal={goal}
          spec={editedSpec}
          onConfirm={handleConfirmSpec}
          onCancel={() => setShowSpecModal(false)}
        />
      )}

      {showTeamModal && (
        <AgentTeamProposalModal
          agents={proposedAgents}
          warnings={teamWarnings}
          onConfirm={handleConfirmTeam}
          onCancel={() => setShowTeamModal(false)}
          allAgents={allAgents}
          onAddAgent={handleAddProposedAgent}
          onRemoveAgent={handleRemoveProposedAgent}
        />
      )}
    </div>
  );
}
