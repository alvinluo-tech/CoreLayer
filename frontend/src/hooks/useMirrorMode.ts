import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/logger';

interface Monitor {
  name?: string;
  size: { width: number; height: number };
  position: { x: number; y: number };
  workArea?: { size?: { width: number; height: number }; position?: { x: number; y: number } };
  scaleFactor?: number;
}

interface PhysicalRect {
  size: { width: number; height: number } | null;
  position: { x: number; y: number } | null;
}

export function useMirrorMode() {
  const [isMirrorMode, setIsMirrorMode] = useState(false);
  const isMirrorModeRef = useRef(false);
  const activeMonitorRef = useRef<Monitor | null>(null);
  const startupBoundsRef = useRef<PhysicalRect | null>(null);
  const originalBoundsRef = useRef<PhysicalRect | null>(null);
  const isProgrammaticFocusRef = useRef(false);

  useEffect(() => {
    isMirrorModeRef.current = isMirrorMode;
  }, [isMirrorMode]);

  // Capture startup monitor and bounds
  useEffect(() => {
    const capture = async () => {
      try {
        const { currentMonitor, getCurrentWindow } = await import('@tauri-apps/api/window');
        const monitor = await currentMonitor();
        if (monitor) {
          activeMonitorRef.current = monitor as Monitor;
          logger.debug('[MirrorMode] Captured startup monitor:', monitor.name);
        }
        const appWindow = getCurrentWindow();
        const size = await appWindow.outerSize().catch(() => null);
        const position = await appWindow.outerPosition().catch(() => null);
        if (size && position && size.width > 100 && size.height > 100) {
          startupBoundsRef.current = { size, position };
        }
      } catch (e) {
        console.warn('Failed to capture startup monitor and bounds:', e);
      }
    };
    capture();
  }, []);

  const enterMirrorMode = useCallback(async () => {
    try {
      const { getCurrentWindow, currentMonitor } = await import('@tauri-apps/api/window');
      const { PhysicalSize, PhysicalPosition } = await import('@tauri-apps/api/dpi');
      const appWindow = getCurrentWindow();

      isProgrammaticFocusRef.current = true;
      setTimeout(() => {
        isProgrammaticFocusRef.current = false;
      }, 1000);

      const isMinimized = await appWindow.isMinimized().catch(() => false);
      if (!isMinimized && !originalBoundsRef.current) {
        const size = await appWindow.outerSize().catch(() => null);
        const position = await appWindow.outerPosition().catch(() => null);
        if (size && position && size.width > 100 && size.height > 100) {
          originalBoundsRef.current = { size, position };
        }
      }

      await appWindow.show().catch(() => {});
      await appWindow.unminimize().catch(() => {});

      const ASSISTANT_WIDTH = 360;
      const ASSISTANT_HEIGHT = 440;
      const MARGIN_RIGHT = 24;
      const MARGIN_BOTTOM = 24;

      let monitor: Monitor | null = (await currentMonitor().catch(() => null)) as Monitor | null;
      if (!monitor) monitor = activeMonitorRef.current;
      if (!monitor) {
        try {
          const { primaryMonitor } = await import('@tauri-apps/api/window');
          monitor = (await primaryMonitor()) as Monitor | null;
        } catch {
          /* fallback */
        }
      }

      if (monitor) {
        const workArea = monitor.workArea || { position: { x: 0, y: 0 }, size: monitor.size };
        const scaleFactor = monitor.scaleFactor || 1;
        const workWidthPhysical = workArea.size?.width ?? monitor.size.width;
        const workHeightPhysical = workArea.size?.height ?? monitor.size.height;
        const workXPhysical = workArea.position?.x ?? monitor.position.x;
        const workYPhysical = workArea.position?.y ?? monitor.position.y;

        const assistantWidthPhysical = Math.round(ASSISTANT_WIDTH * scaleFactor);
        const assistantHeightPhysical = Math.round(ASSISTANT_HEIGHT * scaleFactor);
        const marginRightPhysical = Math.round(MARGIN_RIGHT * scaleFactor);
        const marginBottomPhysical = Math.round(MARGIN_BOTTOM * scaleFactor);

        const x = Math.max(
          workXPhysical,
          workXPhysical + workWidthPhysical - assistantWidthPhysical - marginRightPhysical
        );
        const y = Math.max(
          workYPhysical,
          workYPhysical + workHeightPhysical - assistantHeightPhysical - marginBottomPhysical
        );

        await appWindow.setDecorations(false).catch(() => {});
        await appWindow.setAlwaysOnTop(true).catch(() => {});
        await appWindow
          .setSize(new PhysicalSize(assistantWidthPhysical, assistantHeightPhysical))
          .catch(() => {});
        await appWindow.setPosition(new PhysicalPosition(x, y)).catch(() => {});

        setTimeout(async () => {
          await appWindow
            .setSize(new PhysicalSize(assistantWidthPhysical, assistantHeightPhysical))
            .catch(() => {});
          await appWindow.setPosition(new PhysicalPosition(x, y)).catch(() => {});
        }, 100);
      }

      setIsMirrorMode(true);
      logger.debug('[MirrorMode] Entered mirror mode.');
    } catch (err) {
      console.warn('Failed to enter mirror mode:', err);
    }
  }, []);

  const exitMirrorMode = useCallback(async (shouldMinimize = false) => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();

      await appWindow.setDecorations(false).catch(() => {});
      await appWindow.setAlwaysOnTop(false).catch(() => {});

      let targetSize = originalBoundsRef.current?.size;
      const targetPosition = originalBoundsRef.current?.position;

      if (!targetSize) {
        if (startupBoundsRef.current?.size) {
          targetSize = startupBoundsRef.current.size;
        } else {
          const { LogicalSize } = await import('@tauri-apps/api/dpi');
          targetSize = new LogicalSize(1200, 800);
        }
      }

      // Tauri setSize/setPosition accept PhysicalSize/LogicalSize — stored objects are compatible at runtime
      if (targetSize)
        await appWindow
          .setSize(targetSize as unknown as Parameters<typeof appWindow.setSize>[0])
          .catch(() => {});
      if (targetPosition) {
        await appWindow
          .setPosition(targetPosition as unknown as Parameters<typeof appWindow.setPosition>[0])
          .catch(() => {});
      } else {
        await appWindow.center().catch(() => {});
      }

      originalBoundsRef.current = null;

      if (shouldMinimize) {
        await appWindow.minimize().catch(() => {});
      } else {
        await appWindow.unminimize().catch(() => {});
        await appWindow.show().catch(() => {});
        await appWindow.setFocus().catch(() => {});
      }

      setIsMirrorMode(false);
    } catch (err) {
      console.warn('Failed to exit mirror mode:', err);
    }
  }, []);

  return {
    isMirrorMode,
    isMirrorModeRef,
    isProgrammaticFocusRef,
    activeMonitorRef,
    enterMirrorMode,
    exitMirrorMode,
  };
}
