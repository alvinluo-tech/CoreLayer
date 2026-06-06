import type { ReactNode } from 'react';

interface ShellLayoutProps {
  /** Left rail slot (56px icon nav) — Phase UI-2 */
  rail?: ReactNode;
  /** Context pane (260-300px sidebar) */
  contextPane?: ReactNode;
  /** Main work surface (flex: 1) */
  mainSurface: ReactNode;
  /** Inspector pane (340-420px right panel) */
  inspector?: ReactNode;
}

/**
 * Agent OS shell layout with up to 4 columns.
 * Preserves current 3-column layout when rail is absent.
 */
export function ShellLayout({ rail, contextPane, mainSurface, inspector }: ShellLayoutProps) {
  return (
    <div className="flex flex-1 overflow-hidden relative z-10">
      {/* Rail slot — renders nothing in Phase UI-1 */}
      {rail}

      {/* Context pane (sidebar) */}
      {contextPane}

      {/* Main work surface */}
      {mainSurface}

      {/* Inspector pane (right panel) */}
      {inspector && (
        <aside
          className="w-[340px] flex flex-col overflow-hidden"
          style={{
            background: 'rgba(4,6,14,0.6)',
            backdropFilter: 'blur(12px)',
            borderLeft: '1px solid var(--glass-border)',
          }}
        >
          {inspector}
        </aside>
      )}
    </div>
  );
}
