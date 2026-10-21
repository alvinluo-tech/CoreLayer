/**
 * Probe an ACP agent through `acpx` and cache what it reports about itself.
 *
 * A registry that only says "installed" cannot tell the difference between an
 * agent that is ready, one that still needs a login, and one whose launch
 * command is broken. Those three need different actions from the user, so the
 * capability facts are measured once per launch configuration and cached by a
 * fingerprint of that configuration.
 *
 * The probe runs `acpx <agent> sessions ensure`, which performs the full ACP
 * handshake (`initialize` + `session/new`) and no prompt turn, so it costs no
 * model tokens.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { locateAcpxRuntime, type AcpxRuntimeLocation } from "./acpx-runtime.js";

export type AcpAgentStatus = "ready" | "needs_auth" | "unreachable" | "unknown";

export interface AcpCapabilitySnapshot {
  agent: string;
  status: AcpAgentStatus;
  /** One line for a human: why the status is not `ready`. */
  detail: string;
  /** Hash of (command, cwd) the snapshot was measured under. */
  fingerprint: string;
  measuredAt: number;
  /** Agent name and version when the handshake reported them. */
  agentInfo?: { name?: string; version?: string };
}

export interface ProbeOptions {
  agent: string;
  cwd: string;
  /** Model to pin for the handshake; Claude Code requires an explicit one. */
  model?: string;
  timeoutMs?: number;
}

const DEFAULT_PROBE_TIMEOUT_MS = 60_000;
const snapshots = new Map<string, AcpCapabilitySnapshot>();

export function acpLaunchFingerprint(agent: string, cwd: string): string {
  return createHash("sha256").update(`${agent}\u0000${cwd}`).digest("hex").slice(0, 16);
}

/**
 * Measure one agent. The result is cached under the launch fingerprint, so a
 * repeated probe of the same configuration costs nothing.
 */
export async function probeAcpAgent(options: ProbeOptions): Promise<AcpCapabilitySnapshot> {
  const fingerprint = acpLaunchFingerprint(options.agent, options.cwd);
  const cached = snapshots.get(fingerprint);
  if (cached) return cached;

  const runtime = locateAcpxRuntime();
  if (!runtime) {
    return remember({
      agent: options.agent,
      status: "unreachable",
      detail: "acpx not found; install it with `npm install acpx`",
      fingerprint,
      measuredAt: Date.now(),
    });
  }

  const { stdout, stderr, code } = await runProbe(runtime, options);
  const snapshot = interpretProbe({
    agent: options.agent,
    fingerprint,
    exitCode: code,
    stdout,
    stderr,
  });
  return remember(snapshot);
}

/** Test seam: the cache is process-wide, like the launch configuration it keys on. */
export function resetAcpCapabilityCache(): void {
  snapshots.clear();
}

export function interpretProbe(input: {
  agent: string;
  fingerprint: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}): AcpCapabilitySnapshot {
  const combined = `${input.stdout}\n${input.stderr}`.trim();
  const measuredAt = Date.now();
  const base = { agent: input.agent, fingerprint: input.fingerprint, measuredAt };

  if (input.exitCode === 0) {
    return {
      ...base,
      status: "ready",
      detail: describeSession(combined),
      agentInfo: readAgentInfo(combined),
    };
  }

  // A handshake that completes but reports missing credentials is a different
  // user action from one that never started.
  if (/auth|login|sign in|unauthori[sz]ed|api[_ -]?key|credential/i.test(combined)) {
    return { ...base, status: "needs_auth", detail: firstMeaningfulLine(combined) };
  }

  return {
    ...base,
    status: "unreachable",
    detail: firstMeaningfulLine(combined) || `acpx exited with code ${input.exitCode}`,
  };
}

function remember(snapshot: AcpCapabilitySnapshot): AcpCapabilitySnapshot {
  snapshots.set(snapshot.fingerprint, snapshot);
  return snapshot;
}

function runProbe(
  runtime: AcpxRuntimeLocation,
  options: ProbeOptions,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  // Claude Code reads the user's ~/.claude/settings.json over the parent env,
  // so the probe is isolated exactly like a real run; otherwise the handshake
  // could succeed against a model the run would never use.
  let configDir: string | undefined;
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (options.agent === "claude") {
    try {
      configDir = mkdtempSync(join(tmpdir(), "jarvis-acp-probe-"));
      writeFileSync(join(configDir, "settings.json"), "{}\n", "utf-8");
      env.CLAUDE_CONFIG_DIR = configDir;
    } catch {
      configDir = undefined;
    }
  }
  if (options.model) env.ANTHROPIC_MODEL = options.model;

  const args = [
    ...runtime.prefixArgs,
    "--cwd",
    options.cwd,
    ...(options.model ? ["--model", options.model] : []),
    options.agent,
    "sessions",
    "ensure",
  ];

  return new Promise((resolve) => {
    execFile(
      runtime.command,
      args,
      {
        cwd: options.cwd,
        env,
        timeout: options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (configDir) {
          try {
            rmSync(configDir, { recursive: true, force: true });
          } catch {
            // Best effort; a stale temp dir is harmless.
          }
        }
        const exitCode = error && "code" in error && typeof error.code === "number" ? error.code : error ? 1 : 0;
        resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), code: exitCode });
      },
    );
  });
}

function describeSession(output: string): string {
  const info = readAgentInfo(output);
  if (info?.name) return `${info.name}${info.version ? ` ${info.version}` : ""}`;
  const line = firstMeaningfulLine(output);
  return line || "handshake completed";
}

function readAgentInfo(output: string): { name?: string; version?: string } | undefined {
  const name = output.match(/"agentInfo"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/)?.[1];
  const version = output.match(/"agentInfo"\s*:\s*\{[^}]*"version"\s*:\s*"([^"]+)"/)?.[1];
  if (!name && !version) return undefined;
  return { name, version };
}

function firstMeaningfulLine(output: string): string {
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("{")) continue;
    return line.slice(0, 300);
  }
  const json = output.trim();
  return json ? json.slice(0, 300) : "";
}
