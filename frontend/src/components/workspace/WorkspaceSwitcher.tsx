import { useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';

export function WorkspaceSwitcher() {
  const { workspaces, currentWorkspace, selectWorkspace, createWorkspace } = useWorkspaceStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createWorkspace(newName.trim());
      setNewName('');
      setIsCreating(false);
    } catch {
      // Error handled by store
    }
  };

  if (isCreating) {
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate();
            if (e.key === 'Escape') setIsCreating(false);
          }}
          placeholder="Workspace name..."
          className="flex-1 bg-transparent text-sm outline-none"
        />
        <button
          onClick={handleCreate}
          className="text-xs px-2 py-1 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30"
        >
          Create
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <select
        value={currentWorkspace?.id ?? ''}
        onChange={(e) => selectWorkspace(e.target.value)}
        className="flex-1 bg-transparent text-sm text-white outline-none cursor-pointer"
      >
        {workspaces.map((ws) => (
          <option key={ws.id} value={ws.id} className="bg-gray-800 text-white">
            {ws.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => setIsCreating(true)}
        className="text-xs px-2 py-1 rounded bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80"
      >
        +
      </button>
    </div>
  );
}
