import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { SettingsCard } from './SettingsCard';
import { StatusBadge } from './StatusBadge';
import { Bot, RefreshCw, Play, CheckCircle2, XCircle, Terminal } from 'lucide-react';
import { jarvisClient } from '@/lib/jarvisClient';

interface AdapterDiagnostic {
  id: string;
  displayName: string;
  registered: boolean;
  available: boolean;
  version: string | null;
  reason: string | null;
  transport: string;
  executablePath: string | null;
  pathSource: 'PATH';
  installHint: string;
}

interface DryRunResult {
  adapterId: string;
  success: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function AgentRuntimesPage() {
  const [adapters, setAdapters] = useState<AdapterDiagnostic[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dryRunResults, setDryRunResults] = useState<Map<string, DryRunResult>>(new Map());
  const [dryRunning, setDryRunning] = useState<Set<string>>(new Set());

  const fetchDiagnostics = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await jarvisClient.get<{ adapters: AdapterDiagnostic[] }>(
        '/api/runtimes/coding/diagnostics'
      );
      setAdapters(result.adapters ?? []);
    } catch (err) {
      setAdapters([]);
      setError(
        err instanceof Error
          ? `Failed to fetch adapter diagnostics: ${err.message}`
          : 'Failed to fetch adapter diagnostics'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDiagnostics();
  }, [fetchDiagnostics]);

  const handleDryRun = async (adapterId: string) => {
    setDryRunning((prev) => new Set(prev).add(adapterId));
    setDryRunResults((prev) => {
      const next = new Map(prev);
      next.delete(adapterId);
      return next;
    });

    try {
      const result = await jarvisClient.post<DryRunResult>(
        `/api/runtimes/coding/${adapterId}/dry-run`
      );
      setDryRunResults((prev) => new Map(prev).set(adapterId, { ...result, adapterId }));
    } catch (err) {
      setDryRunResults((prev) =>
        new Map(prev).set(adapterId, {
          adapterId,
          success: false,
          durationMs: 0,
          stdout: '',
          stderr: err instanceof Error ? err.message : String(err),
          exitCode: -1,
        })
      );
    } finally {
      setDryRunning((prev) => {
        const next = new Set(prev);
        next.delete(adapterId);
        return next;
      });
    }
  };

  const availableCount = adapters.filter((a) => a.available).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
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
            Agent Runtimes
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
            {availableCount}/{adapters.length} ADAPTERS READY
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchDiagnostics}
          disabled={isLoading}
          className="gap-1.5"
          style={{ color: 'var(--text-secondary)' }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span style={{ fontFamily: 'var(--font-data)', fontSize: 10, letterSpacing: 0.5 }}>
            RE-CHECK
          </span>
        </Button>
      </div>

      {error && (
        <div
          className="p-3 rounded-lg text-sm"
          style={{
            background: 'rgba(255,61,90,0.08)',
            border: '1px solid rgba(255,61,90,0.15)',
            color: 'var(--rose)',
            fontFamily: 'var(--font-data)',
            fontSize: 10,
          }}
        >
          {error}
        </div>
      )}

      {/* Adapter Table */}
      <SettingsCard title="Adapters" icon={Bot}>
        {error ? (
          <div className="space-y-2">
            <p
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                color: 'var(--text-tertiary)',
                lineHeight: 1.6,
              }}
            >
              Diagnostics API is unreachable. Re-check after restarting the daemon or rebuilding the
              sidecar.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchDiagnostics}
              disabled={isLoading}
              className="gap-1"
              style={{ color: 'var(--cyan)' }}
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
              <span style={{ fontFamily: 'var(--font-data)', fontSize: 9 }}>RETRY</span>
            </Button>
          </div>
        ) : adapters.length === 0 && !isLoading ? (
          <p
            style={{ fontFamily: 'var(--font-data)', fontSize: 10, color: 'var(--text-tertiary)' }}
          >
            Diagnostics returned no adapters. Expected Claude Code, Codex, and OpenCode.
          </p>
        ) : (
          <div className="space-y-2">
            {/* Table Header */}
            <div
              className="grid gap-4 px-3 py-2"
              style={{
                gridTemplateColumns: '1.5fr 0.8fr 1fr 1.5fr 0.8fr',
                fontFamily: 'var(--font-hud)',
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: 1.5,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                borderBottom: '1px solid var(--glass-border)',
              }}
            >
              <span>Adapter</span>
              <span>Status</span>
              <span>Version</span>
              <span>Path</span>
              <span className="text-right">Actions</span>
            </div>

            {/* Table Rows */}
            {adapters.map((adapter) => {
              const dryResult = dryRunResults.get(adapter.id);
              const isDryRunning = dryRunning.has(adapter.id);
              const statusLabel = !adapter.registered
                ? 'Not Registered'
                : adapter.available
                  ? 'Ready'
                  : 'Missing';

              return (
                <div key={adapter.id}>
                  <div
                    className="grid gap-4 px-3 py-3 items-center rounded-lg transition-colors"
                    style={{
                      gridTemplateColumns: '1.5fr 0.8fr 1fr 1.5fr 0.8fr',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid transparent',
                    }}
                  >
                    {/* Adapter Name */}
                    <div>
                      <span
                        style={{
                          fontFamily: 'var(--font-hud)',
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          letterSpacing: 0.5,
                        }}
                      >
                        {adapter.displayName}
                      </span>
                      <span
                        className="ml-2"
                        style={{
                          fontFamily: 'var(--font-data)',
                          fontSize: 9,
                          color: 'var(--text-tertiary)',
                        }}
                      >
                        ({adapter.id})
                      </span>
                    </div>

                    {/* Status */}
                    <StatusBadge
                      status={adapter.available ? 'healthy' : 'error'}
                      label={statusLabel}
                    />

                    {/* Version */}
                    <span
                      style={{
                        fontFamily: 'var(--font-data)',
                        fontSize: 10,
                        color: adapter.version ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                        letterSpacing: 0.5,
                      }}
                    >
                      {adapter.version ?? '-'}
                    </span>

                    {/* Path */}
                    <span
                      style={{
                        fontFamily: 'var(--font-data)',
                        fontSize: 9,
                        color: adapter.executablePath
                          ? 'var(--text-secondary)'
                          : 'var(--text-tertiary)',
                        letterSpacing: 0.5,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={adapter.executablePath ?? ''}
                    >
                      {adapter.executablePath
                        ? `${adapter.pathSource}: ${adapter.executablePath}`
                        : `${adapter.pathSource}: Not found`}
                    </span>

                    {/* Actions */}
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDryRun(adapter.id)}
                        disabled={!adapter.available || isDryRunning}
                        className="gap-1"
                        style={{
                          color: adapter.available ? 'var(--cyan)' : 'var(--text-tertiary)',
                        }}
                      >
                        {isDryRunning ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                        <span
                          style={{
                            fontFamily: 'var(--font-data)',
                            fontSize: 9,
                            letterSpacing: 0.5,
                          }}
                        >
                          DRY RUN
                        </span>
                      </Button>
                    </div>
                  </div>

                  {/* Install Hint (shown when adapter is missing) */}
                  {!adapter.available && (adapter.reason || adapter.installHint) && (
                    <div
                      className="mx-3 mb-2 px-3 py-2 rounded-md"
                      style={{
                        background: 'rgba(255,184,0,0.06)',
                        border: '1px solid rgba(255,184,0,0.12)',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-data)',
                          fontSize: 9,
                          color: 'var(--amber)',
                          letterSpacing: 0.5,
                        }}
                      >
                        {adapter.reason ? `${adapter.reason} ` : ''}
                        {adapter.installHint ? `Install: ${adapter.installHint}` : ''}
                      </span>
                    </div>
                  )}

                  {/* Dry Run Result */}
                  {dryResult && (
                    <div
                      className="mx-3 mb-2 p-3 rounded-md"
                      style={{
                        background: dryResult.success
                          ? 'rgba(0,230,138,0.06)'
                          : 'rgba(255,61,90,0.06)',
                        border: `1px solid ${dryResult.success ? 'rgba(0,230,138,0.12)' : 'rgba(255,61,90,0.12)'}`,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        {dryResult.success ? (
                          <CheckCircle2
                            className="h-3.5 w-3.5"
                            style={{ color: 'var(--emerald)' }}
                          />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" style={{ color: 'var(--rose)' }} />
                        )}
                        <span
                          style={{
                            fontFamily: 'var(--font-hud)',
                            fontSize: 10,
                            fontWeight: 600,
                            color: dryResult.success ? 'var(--emerald)' : 'var(--rose)',
                            letterSpacing: 0.5,
                          }}
                        >
                          {dryResult.success ? 'DRY RUN PASSED' : 'DRY RUN FAILED'}
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-data)',
                            fontSize: 9,
                            color: 'var(--text-tertiary)',
                          }}
                        >
                          {dryResult.durationMs}ms · exit {dryResult.exitCode}
                        </span>
                      </div>
                      {(dryResult.stdout || dryResult.stderr) && (
                        <div
                          className="mt-1.5 p-2 rounded"
                          style={{
                            background: 'rgba(0,0,0,0.3)',
                            fontFamily: 'var(--font-data)',
                            fontSize: 9,
                            letterSpacing: 0.3,
                            color: 'var(--text-secondary)',
                            maxHeight: 80,
                            overflow: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                          }}
                        >
                          {dryResult.stdout || dryResult.stderr}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SettingsCard>

      {/* Info Section */}
      <SettingsCard title="About" icon={Terminal}>
        <div className="space-y-2">
          <p
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              letterSpacing: 0.3,
            }}
          >
            Agent Runtimes are external CLI tools that Jarvis delegates coding tasks to. Each
            adapter is discovered from your system PATH by default.
          </p>
          <p
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
              lineHeight: 1.6,
              letterSpacing: 0.3,
            }}
          >
            Use Dry Run to verify that an adapter can start and respond. If an adapter shows
            "Missing", install it and restart Jarvis so the daemon inherits the updated PATH.
          </p>
        </div>
      </SettingsCard>
    </div>
  );
}
