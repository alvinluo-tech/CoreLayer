import { useEffect } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useWorkspaceDetailStore } from '@/stores/workspaceDetailStore';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import { WorkspaceCenter } from './WorkspaceCenter';
import { WorkspaceRightPanel } from './WorkspaceRightPanel';

export function WorkspaceView() {
  const { workspaces, currentWorkspace, selectWorkspace, loadWorkspaces } = useWorkspaceStore();
  const { detail, isLoading, fetchDetail } = useWorkspaceDetailStore();

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (currentWorkspace) {
      fetchDetail(currentWorkspace.id);
    }
  }, [currentWorkspace, fetchDetail]);

  return (
    <div className="flex h-full" style={{ background: 'var(--bg-primary)' }}>
      <WorkspaceSidebar
        selectedId={currentWorkspace?.id ?? null}
        onSelect={selectWorkspace}
        onCreate={() => {}}
      />

      {isLoading && !detail ? (
        <div
          className="flex-1 flex items-center justify-center"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <span style={{ fontFamily: 'var(--font-data)', fontSize: 12 }}>Loading...</span>
        </div>
      ) : detail ? (
        <>
          <WorkspaceCenter detail={detail} />
          <WorkspaceRightPanel detail={detail} />
        </>
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
  );
}
