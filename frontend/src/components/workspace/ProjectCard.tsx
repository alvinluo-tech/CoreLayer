import { Trash2 } from 'lucide-react';
import type { Project } from '@/stores/workspaceStore';

interface ProjectCardProps {
  project: Project;
  isSelected: boolean;
  isMultiSelected?: boolean;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onToggleSelect?: (id: string) => void;
}

const statusColors = {
  active: 'bg-emerald-500/20 text-emerald-300',
  archived: 'bg-yellow-500/20 text-yellow-300',
  completed: 'bg-blue-500/20 text-blue-300',
};

export function ProjectCard({
  project,
  isSelected,
  isMultiSelected,
  onSelect,
  onDelete,
  onToggleSelect,
}: ProjectCardProps) {
  return (
    <button
      onClick={() => onSelect(project.id)}
      className={`group relative w-full text-left px-3 py-2 rounded-lg transition-colors flex gap-2 items-start ${
        isSelected
          ? 'bg-cyan-500/10 border border-cyan-500/30'
          : 'bg-white/[0.03] border border-transparent hover:bg-white/[0.06]'
      }`}
    >
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={isMultiSelected ?? false}
          onChange={(e) => {
            e.stopPropagation();
            onToggleSelect(project.id);
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 14,
            height: 14,
            accentColor: 'var(--cyan)',
            cursor: 'pointer',
            marginTop: 3,
            flexShrink: 0,
          }}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1 gap-2">
          <span className="text-sm font-medium text-white/90 truncate flex-1">{project.name}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${statusColors[project.status] || ''}`}
            >
              {project.status}
            </span>
            {onDelete && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(project.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 text-white/40 hover:text-red-400 transition-all cursor-pointer"
                title="Delete project"
              >
                <Trash2 size={11} />
              </span>
            )}
          </div>
        </div>
        {project.description && (
          <p className="text-xs text-white/40 truncate">{project.description}</p>
        )}
      </div>
    </button>
  );
}
