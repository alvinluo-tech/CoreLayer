import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { ProjectCard } from './ProjectCard';

export function ProjectList() {
  const {
    projects,
    currentProject,
    selectProject,
    createProject,
    deleteProject,
    deleteProjects,
    isLoading,
  } = useWorkspaceStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);

  const toggleMultiSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === projects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(projects.map((p) => p.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (
      !window.confirm(
        `Delete ${selectedIds.size} project${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`
      )
    ) {
      return;
    }
    await deleteProjects(Array.from(selectedIds));
    setSelectedIds(new Set());
    setIsMultiSelectMode(false);
  };

  const exitMultiSelect = () => {
    setSelectedIds(new Set());
    setIsMultiSelectMode(false);
  };

  const handleDelete = async (id: string) => {
    const proj = projects.find((p) => p.id === id);
    if (!proj) return;
    if (!window.confirm(`Delete project "${proj.name}"? This cannot be undone.`)) return;
    await deleteProject(id);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const project = await createProject({ name: newName.trim() });
      setNewName('');
      setIsCreating(false);
      selectProject(project.id);
    } catch {
      // Error handled by store
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-[10px] uppercase tracking-wider text-white/30 font-medium">
          Projects
        </span>
        <div className="flex items-center gap-1.5">
          {isMultiSelectMode ? (
            <button
              onClick={exitMultiSelect}
              className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
            >
              Cancel
            </button>
          ) : (
            projects.length > 1 && (
              <button
                onClick={() => setIsMultiSelectMode(true)}
                className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
              >
                Select
              </button>
            )
          )}
          <button
            onClick={() => setIsCreating(true)}
            className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
          >
            + New
          </button>
        </div>
      </div>

      {/* Batch delete toolbar */}
      {isMultiSelectMode && (
        <div
          className="mx-3 my-1 flex items-center justify-between px-3 py-1.5 rounded"
          style={{
            background: 'rgba(255,61,90,0.06)',
            border: '1px solid rgba(255,61,90,0.15)',
          }}
        >
          <div className="flex items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={projects.length > 0 && selectedIds.size === projects.length}
              onChange={toggleSelectAll}
              style={{
                width: 13,
                height: 13,
                accentColor: 'var(--cyan)',
                cursor: 'pointer',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                color: 'var(--rose)',
              }}
            >
              Selected {selectedIds.size}
            </span>
          </div>
          {selectedIds.size > 0 && (
            <button
              onClick={handleBatchDelete}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors"
              style={{
                fontFamily: 'var(--font-data)',
                color: 'var(--rose)',
                background: 'rgba(255,61,90,0.1)',
                border: '1px solid rgba(255,61,90,0.2)',
              }}
            >
              <Trash2 size={10} />
              Delete
            </button>
          )}
        </div>
      )}

      {isCreating && (
        <div className="px-3 py-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setIsCreating(false);
            }}
            placeholder="Project name..."
            className="w-full bg-white/[0.05] text-sm text-white rounded px-2 py-1 outline-none border border-white/10 focus:border-cyan-500/50"
          />
        </div>
      )}

      {isLoading && projects.length === 0 && (
        <div className="px-3 py-2 text-xs text-white/30">Loading...</div>
      )}

      {!isLoading && projects.length === 0 && !isCreating && (
        <div className="px-3 py-2 text-xs text-white/30">No projects yet</div>
      )}

      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          isSelected={project.id === currentProject?.id}
          isMultiSelected={isMultiSelectMode && selectedIds.has(project.id)}
          onSelect={isMultiSelectMode ? toggleMultiSelect : selectProject}
          onDelete={isMultiSelectMode ? undefined : handleDelete}
          onToggleSelect={isMultiSelectMode ? toggleMultiSelect : undefined}
        />
      ))}
    </div>
  );
}
