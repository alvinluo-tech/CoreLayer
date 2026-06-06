import { Palette, Monitor, Sparkles, Zap } from 'lucide-react';
import { SettingsCard } from './SettingsCard';
import {
  useAppearanceStore,
  type VisualMode,
  type MotionMode,
  type BackgroundFx,
  type GlowIntensity,
} from '@/stores/appearanceStore';

const modeOptions: { value: VisualMode; label: string; desc: string }[] = [
  { value: 'auto', label: 'Auto', desc: 'Focus for UI, Holo for voice' },
  { value: 'focus', label: 'Focus', desc: 'Clean, minimal, high readability' },
  { value: 'holo', label: 'Holo', desc: 'Full glow, scan lines, cinematic' },
];

const motionOptions: { value: MotionMode; label: string }[] = [
  { value: 'full', label: 'Full' },
  { value: 'reduced', label: 'Reduced' },
  { value: 'off', label: 'Off' },
];

const bgFxOptions: { value: BackgroundFx; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'grid', label: 'Grid' },
  { value: 'scanline', label: 'Scanline' },
];

const glowOptions: { value: GlowIntensity; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg p-0.5"
      style={{
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
      }}
    >
      {options.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="px-3 py-1.5 rounded-md text-xs transition-all duration-200"
            style={{
              fontFamily: 'var(--font-hud)',
              fontWeight: isActive ? 600 : 400,
              letterSpacing: 0.5,
              background: isActive ? 'rgba(0,212,255,0.1)' : 'transparent',
              color: isActive ? 'var(--cyan)' : 'var(--text-tertiary)',
              border: isActive ? '1px solid rgba(0,212,255,0.15)' : '1px solid transparent',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function AppearancePage() {
  const {
    visualMode,
    motionMode,
    backgroundFx,
    glowIntensity,
    resolvedTheme,
    setVisualMode,
    setMotionMode,
    setBackgroundFx,
    setGlowIntensity,
  } = useAppearanceStore();

  return (
    <div className="space-y-6">
      <div>
        <h2
          style={{
            fontFamily: 'var(--font-hud)',
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: 2,
            color: 'var(--text-primary)',
            textTransform: 'uppercase',
          }}
        >
          Appearance
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            letterSpacing: 1,
            color: 'var(--text-tertiary)',
            marginTop: 4,
          }}
        >
          VISUAL MODE CONFIGURATION
        </p>
      </div>

      {/* Visual Mode */}
      <SettingsCard title="Visual Mode" icon={Palette}>
        <div className="space-y-3">
          <SegmentedControl options={modeOptions} value={visualMode} onChange={setVisualMode} />
          <p
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
              letterSpacing: 0.5,
            }}
          >
            Resolved: <span style={{ color: 'var(--cyan)' }}>{resolvedTheme}</span>
            {visualMode === 'auto' && ' (auto-switches based on context)'}
          </p>
        </div>
      </SettingsCard>

      {/* Motion Mode */}
      <SettingsCard title="Motion" icon={Zap}>
        <SegmentedControl options={motionOptions} value={motionMode} onChange={setMotionMode} />
        <p
          className="mt-2"
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: 0.5,
          }}
        >
          {motionMode === 'full' && 'All animations enabled'}
          {motionMode === 'reduced' && 'Simplified transitions only'}
          {motionMode === 'off' && 'All animations disabled'}
        </p>
      </SettingsCard>

      {/* Background FX */}
      <SettingsCard title="Background Effects" icon={Monitor}>
        <SegmentedControl options={bgFxOptions} value={backgroundFx} onChange={setBackgroundFx} />
      </SettingsCard>

      {/* Glow Intensity */}
      <SettingsCard title="Glow Intensity" icon={Sparkles}>
        <SegmentedControl options={glowOptions} value={glowIntensity} onChange={setGlowIntensity} />
      </SettingsCard>
    </div>
  );
}
