import { describe, it, expect, beforeEach } from 'vitest';
import { useDataPanelStore } from './dataPanelStore';

describe('dataPanelStore', () => {
  beforeEach(() => {
    useDataPanelStore.setState({
      entries: [],
      activeId: null,
      isVisible: false,
      dismissedAt: null,
    });
  });

  it('should start with empty state', () => {
    const state = useDataPanelStore.getState();
    expect(state.entries).toEqual([]);
    expect(state.activeId).toBeNull();
    expect(state.isVisible).toBe(false);
  });

  it('addEntry should add entry and make panel visible', () => {
    useDataPanelStore.getState().addEntry({
      toolCallId: 'tc-1',
      toolName: 'list_tasks',
      title: 'Tasks',
      data: [{ title: 'Test' }],
    });

    const state = useDataPanelStore.getState();
    expect(state.entries).toHaveLength(1);
    expect(state.activeId).toBe('tc-1');
    expect(state.isVisible).toBe(true);
  });

  it('addEntry should replace existing entry with same toolCallId', () => {
    const { addEntry } = useDataPanelStore.getState();
    addEntry({ toolCallId: 'tc-1', toolName: 'list_tasks', title: 'Tasks', data: [1] });
    addEntry({ toolCallId: 'tc-1', toolName: 'list_tasks', title: 'Updated', data: [2] });

    expect(useDataPanelStore.getState().entries).toHaveLength(1);
    expect(useDataPanelStore.getState().entries[0]?.title).toBe('Updated');
  });

  it('dismiss should hide panel and record timestamp', () => {
    const { addEntry, dismiss } = useDataPanelStore.getState();
    addEntry({ toolCallId: 'tc-1', toolName: 'a', title: 'A', data: [] });
    dismiss();

    const state = useDataPanelStore.getState();
    expect(state.isVisible).toBe(false);
    expect(state.dismissedAt).not.toBeNull();
  });

  it('clearAll should reset everything', () => {
    const { addEntry, clearAll } = useDataPanelStore.getState();
    addEntry({ toolCallId: 'tc-1', toolName: 'a', title: 'A', data: [] });
    addEntry({ toolCallId: 'tc-2', toolName: 'b', title: 'B', data: [] });
    clearAll();

    const state = useDataPanelStore.getState();
    expect(state.entries).toEqual([]);
    expect(state.isVisible).toBe(false);
    expect(state.activeId).toBeNull();
  });

  it('show should re-show a dismissed panel', () => {
    const { addEntry, dismiss, show } = useDataPanelStore.getState();
    addEntry({ toolCallId: 'tc-1', toolName: 'a', title: 'A', data: [] });
    dismiss();
    show();

    expect(useDataPanelStore.getState().isVisible).toBe(true);
  });
});
