import { WifiOff, RefreshCw } from 'lucide-react';

interface DaemonDisconnectedBannerProps {
  onReconnect?: () => void;
}

export function DaemonDisconnectedBanner({ onReconnect }: DaemonDisconnectedBannerProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-destructive text-xs">
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">本地运行时已断开连接</span>
      {onReconnect && (
        <button
          onClick={onReconnect}
          className="flex items-center gap-1 hover:bg-destructive/10 px-2 py-1 rounded transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          重新连接
        </button>
      )}
    </div>
  );
}
