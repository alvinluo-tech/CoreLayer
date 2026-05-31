import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, RefreshCw, Terminal, Copy, X, ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  toasts: Array<{
    id: string;
    message: string;
    type: 'error' | 'warning' | 'info';
    timestamp: Date;
  }>;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    toasts: [],
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Jarvis ErrorBoundary] Fatal render crash captured:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public componentDidMount() {
    // 1. Listen to uncaught javascript errors (async/timeouts/etc)
    window.addEventListener('error', this.handleGlobalError);
    // 2. Listen to uncaught promise rejections (failed fetches, IPC/Tauri failures)
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  public componentWillUnmount() {
    window.removeEventListener('error', this.handleGlobalError);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  private handleGlobalError = (event: ErrorEvent) => {
    // Ignore errors originating from browser extensions
    if (
      event.filename &&
      (event.filename.includes('extension') || event.filename.includes('chrome-extension'))
    ) {
      return;
    }

    this.addToast(event.message || '未知脚本运行异常', 'error');
  };

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    let rawReason = event.reason;
    let message = '未捕获的后台异步操作错误';

    if (rawReason) {
      if (typeof rawReason === 'string') {
        message = rawReason;
      } else if (rawReason instanceof Error) {
        message = rawReason.message;
      } else if (typeof rawReason === 'object') {
        message = rawReason.message || JSON.stringify(rawReason);
      }
    }

    // Ignore benign developer console or extension rejections
    if (message.includes('Extension') || message.includes('React DevTools')) {
      return;
    }

    this.addToast(message, 'error');
  };

  private addToast = (message: string, type: 'error' | 'warning' | 'info' = 'error') => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast = { id, message, type, timestamp: new Date() };

    this.setState(
      (prevState) => ({
        toasts: [...prevState.toasts, newToast].slice(-5), // Keep maximum last 5 toasts
      }),
      () => {
        // Auto remove toast after 6 seconds
        setTimeout(() => {
          this.removeToast(id);
        }, 6000);
      }
    );
  };

  private removeToast = (id: string) => {
    this.setState((prevState) => ({
      toasts: prevState.toasts.filter((t) => t.id !== id),
    }));
  };

  private copyErrorLog = () => {
    const { error, errorInfo } = this.state;
    if (!error) return;

    const logText = `
=== JARVIS CORE SYSTEM RECOVERY LOG ===
Timestamp: ${new Date().toISOString()}
Error: ${error.message}
Stack: ${error.stack}
Component Stack: ${errorInfo?.componentStack || 'N/A'}
    `.trim();

    navigator.clipboard
      .writeText(logText)
      .then(() => {
        this.addToast('系统错误日志已成功复制到剪贴板', 'info');
      })
      .catch(() => {
        alert('复制失败，请手动选择复制。');
      });
  };

  private handleRestart = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      toasts: [],
    });
  };

  private handleHardReload = () => {
    window.location.reload();
  };

  public render() {
    const { hasError, error, errorInfo, toasts } = this.state;

    if (hasError) {
      // Premium Futuristic Sci-Fi Recovery Console
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-gradient-to-tr from-slate-950 via-black to-red-950 p-6 z-[9999] overflow-y-auto font-sans select-text">
          <div className="w-full max-w-3xl rounded-2xl border border-red-500/30 bg-black/60 backdrop-blur-2xl p-8 relative overflow-hidden shadow-[0_0_50px_rgba(239,68,68,0.15)] flex flex-col gap-6">
            {/* Glowing Cyber Accent */}
            <div className="absolute -top-32 -left-32 w-64 h-64 bg-red-500/10 rounded-full blur-[120px]" />
            <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-red-500/5 rounded-full blur-[120px]" />

            {/* Header */}
            <div className="flex items-center gap-4 border-b border-red-500/20 pb-4">
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500 animate-pulse">
                <AlertOctagon className="h-7 w-7" />
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-bold tracking-tight text-red-500 flex items-center gap-2">
                  <span>SYSTEM EXCEPTION RECOVERY</span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 tracking-wider">
                    Core Crashed
                  </span>
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Jarvis 核心渲染引擎遭遇致命异常，已安全隔离以防止内存泄露。
                </p>
              </div>
            </div>

            {/* Error Message */}
            <div className="p-4 rounded-xl bg-red-500/[0.03] border border-red-500/10 flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-red-400 uppercase tracking-wider font-mono">
                  Exception Signature
                </p>
                <p className="text-sm font-semibold text-slate-100 mt-1 break-words leading-relaxed">
                  {error?.message || 'Internal Rendering Crash'}
                </p>
              </div>
            </div>

            {/* Stack Trace Terminal */}
            <div className="flex-1 flex flex-col min-h-[180px] bg-zinc-950/80 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs text-zinc-400 font-mono">
                <span className="flex items-center gap-1.5 font-semibold text-red-400">
                  <Terminal className="h-3.5 w-3.5" /> console.log(error.stack)
                </span>
                <button
                  onClick={this.copyErrorLog}
                  className="flex items-center gap-1 hover:text-white transition-colors py-0.5 px-1.5 rounded hover:bg-zinc-800 font-sans"
                >
                  <Copy className="h-3 w-3" /> 复制日志
                </button>
              </div>
              <div className="flex-1 p-4 font-mono text-[11px] leading-relaxed overflow-auto text-red-400/90 whitespace-pre selection:bg-red-500/20 max-h-[300px]">
                {error?.stack || 'No call stack available.'}
                {errorInfo?.componentStack && (
                  <div className="text-zinc-500 mt-4 border-t border-zinc-800/50 pt-2">
                    <span className="text-zinc-400 font-bold">Component Structure:</span>
                    {errorInfo.componentStack}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-zinc-900 mt-2">
              <button
                onClick={this.handleRestart}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all duration-200 active:scale-[0.98]"
              >
                <RefreshCw className="h-4 w-4" /> 尝试热重载组件
              </button>
              <button
                onClick={this.handleHardReload}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-white hover:bg-slate-100 text-black transition-all duration-200 shadow-lg active:scale-[0.98]"
              >
                强制重启应用 (F5)
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Standard view with floating glassmorphic Toasts overlay
    return (
      <>
        {this.props.children}

        {/* Global Floating Glass Toast Container */}
        {toasts.length > 0 && (
          <div className="fixed top-4 right-4 z-[99999] flex flex-col gap-2 max-w-sm w-full pointer-events-none select-none font-sans">
            {toasts.map((toast) => {
              const colorMap = {
                error: {
                  border: 'border-red-500/30',
                  bar: 'bg-red-500',
                  iconBg: 'bg-red-500/10 border-red-500/20',
                  iconText: 'text-red-500',
                  label: 'text-red-400',
                  labelName: '异常 (Error)',
                },
                warning: {
                  border: 'border-amber-500/30',
                  bar: 'bg-amber-500',
                  iconBg: 'bg-amber-500/10 border-amber-500/20',
                  iconText: 'text-amber-500',
                  label: 'text-amber-400',
                  labelName: '警告 (Warning)',
                },
                info: {
                  border: 'border-blue-500/30',
                  bar: 'bg-blue-500',
                  iconBg: 'bg-blue-500/10 border-blue-500/20',
                  iconText: 'text-blue-500',
                  label: 'text-blue-400',
                  labelName: '提示 (Info)',
                },
              };
              const c = colorMap[toast.type] || colorMap.error;
              return (
                <div
                  key={toast.id}
                  className={`pointer-events-auto w-full bg-slate-950/85 backdrop-blur-xl border ${c.border} rounded-xl p-4 flex gap-3 shadow-[0_10px_30px_rgba(0,0,0,0.4)] animate-in slide-in-from-right duration-300 relative overflow-hidden`}
                >
                  <div className={`absolute top-0 bottom-0 left-0 w-1 ${c.bar}`} />

                  <div className={`p-1.5 ${c.iconBg} border rounded-lg ${c.iconText} self-start`}>
                    <AlertOctagon className="h-4 w-4" />
                  </div>

                  <div className="flex-1 min-w-0 pr-4">
                    <p
                      className={`text-[11px] uppercase tracking-wider ${c.label} font-semibold font-mono`}
                    >
                      {c.labelName}
                    </p>
                    <p className="text-xs font-medium text-slate-100 mt-1 break-words leading-relaxed select-text">
                      {toast.message}
                    </p>
                  </div>

                  <button
                    onClick={() => this.removeToast(toast.id)}
                    className="absolute top-3 right-3 text-zinc-500 hover:text-white hover:bg-zinc-800/50 p-1 rounded-md transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  }
}
