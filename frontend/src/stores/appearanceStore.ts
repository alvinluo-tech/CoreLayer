import { create } from 'zustand';

// ——— Types ———

export type VisualMode = 'auto' | 'focus' | 'holo';
export type MotionMode = 'full' | 'reduced' | 'off';
export type BackgroundFx = 'none' | 'grid' | 'scanline';
export type GlowIntensity = 'low' | 'medium' | 'high';
export type ResolvedTheme = 'focus' | 'holo';

interface AppearanceState {
  visualMode: VisualMode;
  motionMode: MotionMode;
  backgroundFx: BackgroundFx;
  glowIntensity: GlowIntensity;
  /** Whether voice overlay is active — forces Holo in auto mode */
  voiceActive: boolean;
  /** Derived theme actually applied to <html> */
  resolvedTheme: ResolvedTheme;

  setVisualMode: (mode: VisualMode) => void;
  setMotionMode: (mode: MotionMode) => void;
  setBackgroundFx: (fx: BackgroundFx) => void;
  setGlowIntensity: (intensity: GlowIntensity) => void;
  setVoiceActive: (active: boolean) => void;
}

// ——— Constants ———

const STORAGE_KEY = 'jarvis:appearance';

// ——— Persistence helpers ———

interface PersistedAppearance {
  visualMode: VisualMode;
  motionMode: MotionMode;
  backgroundFx: BackgroundFx;
  glowIntensity: GlowIntensity;
}

function loadPersisted(): PersistedAppearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as PersistedAppearance;
    }
  } catch {
    // corrupted storage — fall back to defaults
  }
  return {
    visualMode: 'auto',
    motionMode: 'full',
    backgroundFx: 'scanline',
    glowIntensity: 'medium',
  };
}

function persist(state: AppearanceState): void {
  const data: PersistedAppearance = {
    visualMode: state.visualMode,
    motionMode: state.motionMode,
    backgroundFx: state.backgroundFx,
    glowIntensity: state.glowIntensity,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ——— Resolve theme ———

function resolveTheme(visualMode: VisualMode, voiceActive: boolean): ResolvedTheme {
  if (visualMode === 'focus') return 'focus';
  if (visualMode === 'holo') return 'holo';
  // auto: Holo when voice is active, Focus otherwise
  return voiceActive ? 'holo' : 'focus';
}

// ——— Apply to DOM ———

function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.remove('theme-focus', 'theme-holo');
  root.classList.add(`theme-${theme}`);
}

function applyMotion(mode: MotionMode): void {
  const root = document.documentElement;
  root.classList.remove('motion-full', 'motion-reduced', 'motion-off');
  root.classList.add(`motion-${mode}`);
}

// ——— Store ———

const persisted = loadPersisted();

export const useAppearanceStore = create<AppearanceState>((set) => {
  // Apply initial theme to DOM
  const initialTheme = resolveTheme(persisted.visualMode, false);
  applyTheme(initialTheme);
  applyMotion(persisted.motionMode);

  return {
    ...persisted,
    voiceActive: false,
    resolvedTheme: initialTheme,

    setVisualMode: (mode) => {
      set((state) => {
        const next = { ...state, visualMode: mode };
        next.resolvedTheme = resolveTheme(mode, state.voiceActive);
        applyTheme(next.resolvedTheme);
        persist(next);
        return next;
      });
    },

    setMotionMode: (mode) => {
      set((state) => {
        const next = { ...state, motionMode: mode };
        applyMotion(mode);
        persist(next);
        return next;
      });
    },

    setBackgroundFx: (fx) => {
      set((state) => {
        const next = { ...state, backgroundFx: fx };
        persist(next);
        return next;
      });
    },

    setGlowIntensity: (intensity) => {
      set((state) => {
        const next = { ...state, glowIntensity: intensity };
        persist(next);
        return next;
      });
    },

    setVoiceActive: (active) => {
      set((state) => {
        const next = { ...state, voiceActive: active };
        next.resolvedTheme = resolveTheme(state.visualMode, active);
        applyTheme(next.resolvedTheme);
        return next;
      });
    },
  };
});
