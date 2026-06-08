#!/usr/bin/env node
/**
 * Smoke test: build sidecar, start it, verify /health responds, then kill it.
 *
 * Usage: node scripts/smoke-test-sidecar.mjs
 * Exit 0 = pass, Exit 1 = fail.
 */

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const binariesDir = join(root, "frontend", "src-tauri", "binaries");

// ─── Step 1: Build sidecar ─────────────────────────────────────────────────
console.log("[smoke-test] Building sidecar...");
try {
  execFileSync("node", ["scripts/build-daemon-sidecar.mjs"], {
    cwd: root,
    stdio: "inherit",
    timeout: 300_000,
  });
} catch (err) {
  console.error(`[smoke-test] FAIL: sidecar build failed: ${err.message}`);
  process.exit(1);
}

// Find the sidecar binary (platform-specific name)
const isWin = process.platform === "win32";
const exeExt = isWin ? ".exe" : "";
const possibleNames = [
  `jarvis-daemon${exeExt}`,
  // Try target-triple variants
  `jarvis-daemon-x86_64-pc-windows-msvc${exeExt}`,
  `jarvis-daemon-aarch64-apple-darwin${exeExt}`,
  `jarvis-daemon-x86_64-apple-darwin${exeExt}`,
  `jarvis-daemon-x86_64-unknown-linux-gnu${exeExt}`,
  `jarvis-daemon-aarch64-unknown-linux-gnu${exeExt}`,
];

let sidecarPath = null;
for (const name of possibleNames) {
  const candidate = join(binariesDir, name);
  if (existsSync(candidate)) {
    sidecarPath = candidate;
    break;
  }
}

if (!sidecarPath) {
  console.error(`[smoke-test] FAIL: no sidecar binary found in ${binariesDir}`);
  process.exit(1);
}

console.log(`[smoke-test] Sidecar binary: ${sidecarPath}`);

// ─── Step 2: Prepare environment ────────────────────────────────────────────
const testDir = mkdtempSync(join(tmpdir(), "jarvis-smoke-"));
const port = 0; // let OS pick a free port via the sidecar

const env = {
  ...process.env,
  DAEMON_HOST: "127.0.0.1",
  DAEMON_PORT: "0", // sidecar should allocate a free port
  JARVIS_RUNTIME_MODE: "sidecar",
  JARVIS_APP_DATA_DIR: testDir,
  JARVIS_SIDECAR_MODULE_ROOT: binariesDir,
};

console.log(`[smoke-test] Test dir: ${testDir}`);
console.log(`[smoke-test] Starting sidecar...`);

// ─── Step 3: Spawn sidecar ──────────────────────────────────────────────────
let child = null;
let healthUrl = null;

function cleanup() {
  if (child) {
    console.log("[smoke-test] Killing sidecar process...");
    try {
      child.kill("SIGTERM");
    } catch {}
    try {
      child.wait?.();
    } catch {}
  }
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {}
}

process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(1); });
process.on("SIGTERM", () => { cleanup(); process.exit(1); });

try {
  child = spawn(sidecarPath, [], {
    cwd: binariesDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  child.stdout?.on("data", (data) => {
    const line = data.toString().trim();
    if (line) console.log(`[daemon:stdout] ${line}`);
  });

  child.stderr?.on("data", (data) => {
    const line = data.toString().trim();
    if (line) console.log(`[daemon:stderr] ${line}`);
    // Try to extract port from stderr output (common pattern: "Listening on :3456")
    const portMatch = line.match(/(?:Listening on|Server running at|started on).*?:(\d+)/i);
    if (portMatch && !healthUrl) {
      healthUrl = `http://127.0.0.1:${portMatch[1]}/health`;
    }
  });

  child.on("error", (err) => {
    console.error(`[smoke-test] FAIL: sidecar spawn error: ${err.message}`);
    cleanup();
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (!healthUrl) {
      console.error(`[smoke-test] FAIL: sidecar exited before health check (code=${code}, signal=${signal})`);
      cleanup();
      process.exit(1);
    }
  });
} catch (err) {
  console.error(`[smoke-test] FAIL: could not spawn sidecar: ${err.message}`);
  cleanup();
  process.exit(1);
}

// ─── Step 4: Poll /health ──────────────────────────────────────────────────
const TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;
const startTime = Date.now();

// Also try to read the port from a known file or default
async function tryHealthCheck(url) {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return resp.ok;
  } catch {
    return false;
  }
}

console.log("[smoke-test] Waiting for daemon health...");

// If we didn't get port from output, try common defaults
const fallbackPorts = [3001, 3002, 3003, 3004, 3005];
let resolved = false;

while (Date.now() - startTime < TIMEOUT_MS) {
  // Try the port extracted from output
  if (healthUrl) {
    if (await tryHealthCheck(healthUrl)) {
      console.log(`[smoke-test] PASS: health check OK at ${healthUrl}`);
      resolved = true;
      break;
    }
  }

  // Try fallback ports
  for (const p of fallbackPorts) {
    const url = `http://127.0.0.1:${p}/health`;
    if (await tryHealthCheck(url)) {
      console.log(`[smoke-test] PASS: health check OK at ${url}`);
      resolved = true;
      healthUrl = url;
      break;
    }
  }
  if (resolved) break;

  // Check if process already exited
  if (child.exitCode !== null) {
    console.error(`[smoke-test] FAIL: sidecar exited with code ${child.exitCode}`);
    cleanup();
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
}

if (!resolved) {
  console.error(`[smoke-test] FAIL: health check timed out after ${TIMEOUT_MS}ms`);
  cleanup();
  process.exit(1);
}

// ─── Step 5: Cleanup ────────────────────────────────────────────────────────
cleanup();
console.log("[smoke-test] Smoke test passed.");
process.exit(0);
