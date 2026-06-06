import { useState } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { ProjectCard } from './ProjectCard';

export function ProjectList() {
  const { projects, currentProject, selectProject, createProject, isLoading } = useWorkspaceStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

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
        <button
          onClick={() => setIsCreating(true)}
          className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
        >
          + New
        </button>
      </div>

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
          onSelect={selectProject}
        />
      ))}
    </div>
  );
}
