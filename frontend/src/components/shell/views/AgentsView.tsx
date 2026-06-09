import { useEffect, useState } from 'react';
import { Loader2, XCircle, RotateCcw, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAgentStore } from '@/stores/agentStore';
import { AgentListPanel } from './AgentListPanel';
import { AgentDetailPanel } from './AgentDetailPanel';
import { AgentInspectorPanel } from './AgentInspectorPanel';
import { AgentEditPanel } from './AgentEditPanel';
import './agentsView.css';

type ViewMode = 'list' | 'edit' | 'create';

export function AgentsView() {
  const {
    agents,
    selectedId,
    isLoading,
    error,
    fetchAgents,
    createAgent,
    updateAgent,
    deleteAgent,
  } = useAgentStore();
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const selectedAgent = agents.find((a) => a.id === selectedId) ?? null;

  const handleCreate = async (data: Record<string, unknown>) => {
    await createAgent(data as unknown as Parameters<typeof createAgent>[0]);
    setViewMode('list');
  };

  const handleUpdate = async (data: Record<string, unknown>) => {
    if (selectedId) {
      await updateAgent(selectedId, data as unknown as Parameters<typeof updateAgent>[1]);
      setViewMode('list');
    }
  };

  const handleDelete = async () => {
    if (selectedId) {
      await deleteAgent(selectedId);
    }
  };

  if (isLoading && agents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--cyan)' }} />
      </div>
    );
  }

  if (error && agents.length === 0) {
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
          <Button variant="glass" size="sm" onClick={fetchAgents} className="gap-1.5">
            <RotateCcw size={12} />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (agents.length === 0 && viewMode !== 'create') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Bot size={48} className="mx-auto" style={{ color: 'var(--text-tertiary)' }} />
          <div
            style={{
              fontFamily: 'var(--font-hud)',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              letterSpacing: 1,
            }}
          >
            NO AGENTS
          </div>
          <div
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              color: 'var(--text-tertiary)',
              maxWidth: 280,
            }}
          >
            Agent profiles will appear here. Each agent has its own model, tools, skills, and
            permissions.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <AgentListPanel
        agents={agents}
        selectedId={selectedId}
        onSelect={(id) => {
          useAgentStore.getState().selectAgent(id);
          setViewMode('list');
        }}
        onCreate={() => setViewMode('create')}
        onImport={() => {}}
      />

      {selectedAgent && viewMode === 'list' ? (
        <AgentDetailPanel
          agent={selectedAgent}
          onEdit={() => setViewMode('edit')}
          onTest={() => {}}
          onUpdate={handleUpdate}
        />
      ) : selectedAgent && viewMode === 'edit' ? (
        <AgentDetailPanel
          agent={selectedAgent}
          onEdit={() => setViewMode('edit')}
          onTest={() => {}}
          onUpdate={handleUpdate}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <Bot size={32} className="mx-auto" style={{ color: 'var(--text-tertiary)' }} />
            <div
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 11,
                color: 'var(--text-tertiary)',
              }}
            >
              Select an agent to view details
            </div>
          </div>
        </div>
      )}

      {selectedAgent && (
        <AgentInspectorPanel agent={selectedAgent} onTest={() => {}} onDelete={handleDelete} />
      )}

      {(viewMode === 'create' || (viewMode === 'edit' && selectedAgent)) && (
        <AgentEditPanel
          agent={viewMode === 'edit' ? selectedAgent : null}
          onSave={viewMode === 'edit' ? handleUpdate : handleCreate}
          onClose={() => setViewMode('list')}
        />
      )}
    </div>
  );
}
