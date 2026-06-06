/**
 * HUD background decorations — grid, scanline, corner brackets.
 * Holo mode only (hidden via CSS in Focus mode).
 */
export function HudDecorations() {
  return (
    <>
      <div className="grid-bg" />
      <div className="scanline-overlay" />

      <div className="hud-corner tl" style={{ width: 60, height: 60 }}>
        <svg viewBox="0 0 60 60" fill="none">
          <path d="M0 20 L0 0 L20 0" stroke="rgba(0,212,255,0.15)" strokeWidth="1" />
        </svg>
      </div>
      <div className="hud-corner tr" style={{ width: 60, height: 60 }}>
        <svg viewBox="0 0 60 60" fill="none">
          <path d="M0 20 L0 0 L20 0" stroke="rgba(0,212,255,0.15)" strokeWidth="1" />
        </svg>
      </div>
      <div className="hud-corner bl" style={{ width: 60, height: 60 }}>
        <svg viewBox="0 0 60 60" fill="none">
          <path d="M0 20 L0 0 L20 0" stroke="rgba(0,212,255,0.15)" strokeWidth="1" />
        </svg>
      </div>
      <div className="hud-corner br" style={{ width: 60, height: 60 }}>
        <svg viewBox="0 0 60 60" fill="none">
          <path d="M0 20 L0 0 L20 0" stroke="rgba(0,212,255,0.15)" strokeWidth="1" />
        </svg>
      </div>
    </>
  );
}
