import { describe, it, expect, beforeEach } from 'vitest';
import { usePaletteStore } from './paletteStore.js';

describe('usePaletteStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    usePaletteStore.setState({
      isOpen: false,
      query: '',
      selectedIndex: 0,
    });
  });

  it('has correct initial state', () => {
    const state = usePaletteStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.query).toBe('');
    expect(state.selectedIndex).toBe(0);
  });

  it('open: sets isOpen=true and resets query and selectedIndex', () => {
    // Set some non-default state first
    usePaletteStore.setState({ query: 'old', selectedIndex: 5 });
    usePaletteStore.getState().open();

    const state = usePaletteStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.query).toBe('');
    expect(state.selectedIndex).toBe(0);
  });

  it('close: sets isOpen=false and resets query and selectedIndex', () => {
    usePaletteStore.setState({ isOpen: true, query: 'test', selectedIndex: 3 });
    usePaletteStore.getState().close();

    const state = usePaletteStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.query).toBe('');
    expect(state.selectedIndex).toBe(0);
  });

  it('toggle from closed state opens', () => {
    usePaletteStore.setState({ isOpen: false });
    usePaletteStore.getState().toggle();

    expect(usePaletteStore.getState().isOpen).toBe(true);
    expect(usePaletteStore.getState().query).toBe('');
    expect(usePaletteStore.getState().selectedIndex).toBe(0);
  });

  it('toggle from open state closes', () => {
    usePaletteStore.setState({ isOpen: true, query: 'test', selectedIndex: 2 });
    usePaletteStore.getState().toggle();

    const state = usePaletteStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.query).toBe('');
    expect(state.selectedIndex).toBe(0);
  });

  it('setQuery resets selectedIndex to 0', () => {
    usePaletteStore.setState({ selectedIndex: 5 });
    usePaletteStore.getState().setQuery('new query');

    const state = usePaletteStore.getState();
    expect(state.query).toBe('new query');
    expect(state.selectedIndex).toBe(0);
  });

  it('setSelectedIndex sets the index', () => {
    usePaletteStore.getState().setSelectedIndex(7);
    expect(usePaletteStore.getState().selectedIndex).toBe(7);
  });

  it('moveUp clamps at 0', () => {
    usePaletteStore.setState({ selectedIndex: 0 });
    usePaletteStore.getState().moveUp();
    expect(usePaletteStore.getState().selectedIndex).toBe(0);
  });

  it('moveUp decrements selectedIndex', () => {
    usePaletteStore.setState({ selectedIndex: 3 });
    usePaletteStore.getState().moveUp();
    expect(usePaletteStore.getState().selectedIndex).toBe(2);
  });

  it('moveDown increments selectedIndex', () => {
    usePaletteStore.setState({ selectedIndex: 0 });
    usePaletteStore.getState().moveDown();
    expect(usePaletteStore.getState().selectedIndex).toBe(1);
  });
});
