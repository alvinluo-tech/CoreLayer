import type { Project } from '@/stores/workspaceStore';

interface ProjectCardProps {
  project: Project;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const statusColors = {
  active: 'bg-emerald-500/20 text-emerald-300',
  archived: 'bg-yellow-500/20 text-yellow-300',
  completed: 'bg-blue-500/20 text-blue-300',
};

export function ProjectCard({ project, isSelected, onSelect }: ProjectCardProps) {
  return (
    <button
      onClick={() => onSelect(project.id)}
      className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
        isSelected
          ? 'bg-cyan-500/10 border border-cyan-500/30'
          : 'bg-white/[0.03] border border-transparent hover:bg-white/[0.06]'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-white/90 truncate">{project.name}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusColors[project.status]}`}>
          {project.status}
        </span>
      </div>
      {project.description && (
        <p className="text-xs text-white/40 truncate">{project.description}</p>
      )}
    </button>
  );
}
