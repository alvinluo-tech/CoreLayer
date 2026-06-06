#!/usr/bin/env node
/**
 * Build the daemon as a Tauri sidecar executable.
 *
 * Production packages must not depend on a user's global Node, pnpm, tsx,
 * TypeScript, or Bun. Bun is a build-time dependency only: this script compiles
 * daemon/src/index.ts into the target-triple-named binary that Tauri expects
 * for bundle.externalBin = ["binaries/jarvis-daemon"].
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { arch, homedir, platform } from "node:os";
import { dirname, join } from "node:path";

const root = process.cwd();
const binaryBaseName = "jarvis-daemon";
const binariesDir = join(root, "frontend", "src-tauri", "binaries");
const entrypoint = join(root, "daemon", "src", "index.ts");

const targetTriple = process.env.JARVIS_SIDECAR_TARGET ?? detectTargetTriple();
const bunTarget = mapBunCompileTarget(targetTriple);
const outputPath = join(
  binariesDir,
  `${binaryBaseName}-${targetTriple}${targetTriple.includes("windows") ? ".exe" : ""}`,
);

console.log(`[build-daemon] Target triple: ${targetTriple}`);
console.log(`[build-daemon] Bun compile target: ${bunTarget}`);

mkdirSync(dirname(outputPath), { recursive: true });

const bun = resolveBunExecutable();
execFileSync(
  bun.path,
  [
    "build",
    entrypoint,
    "--compile",
    `--target=${bunTarget}`,
    "--outfile",
    outputPath,
  ],
  {
    cwd: root,
    stdio: "inherit",
    shell: bun.shell,
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
  },
);

if (!existsSync(outputPath)) {
  console.error(`[build-daemon] ERROR: sidecar binary was not created: ${outputPath}`);
  process.exit(1);
}

console.log(`[build-daemon] Created sidecar: ${outputPath}`);

function resolveBunExecutable() {
  const command = platform() === "win32" ? "where.exe" : "which";
  const commandNames = platform() === "win32" ? ["bun.cmd", "bun.exe", "bun"] : ["bun"];
  const candidates = [];

  for (const commandName of commandNames) {
    try {
      const found = execFileSync(command, [commandName], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        shell: false,
      })
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      candidates.push(...found);
    } catch {}
  }

  if (platform() === "win32") {
    candidates.push(join(homedir(), ".bun", "bin", "bun.exe"));
  }

  for (const bunPath of candidates) {
    try {
      execFileSync(bunPath, ["--version"], {
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
        shell: platform() === "win32",
      });
      return { path: bunPath, shell: platform() === "win32" };
    } catch {
      console.warn(`[build-daemon] Skipping unusable Bun executable: ${bunPath}`);
    }
  }

  throw new Error(
    "Bun is required to build the daemon sidecar. Install Bun in the build environment with: powershell -c \"irm bun.sh/install.ps1|iex\"",
  );
}

function detectTargetTriple() {
  const rustcHost = tryRustcHostTriple();
  if (rustcHost) return rustcHost;

  if (platform() === "win32" && arch() === "x64") return "x86_64-pc-windows-msvc";
  if (platform() === "darwin" && arch() === "arm64") return "aarch64-apple-darwin";
  if (platform() === "darwin" && arch() === "x64") return "x86_64-apple-darwin";
  if (platform() === "linux" && arch() === "x64") return "x86_64-unknown-linux-gnu";

  throw new Error(`Unsupported sidecar build host: ${platform()} ${arch()}`);
}

function tryRustcHostTriple() {
  try {
    const output = execFileSync("rustc", ["-Vv"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      shell: platform() === "win32",
    });
    const hostLine = output
      .split(/\r?\n/)
      .find((line) => line.startsWith("host:"));
    return hostLine?.replace("host:", "").trim() || null;
  } catch {
    return null;
  }
}

function mapBunCompileTarget(triple) {
  switch (triple) {
    case "x86_64-pc-windows-msvc":
      return "bun-windows-x64";
    case "aarch64-pc-windows-msvc":
      return "bun-windows-arm64";
    case "x86_64-apple-darwin":
      return "bun-darwin-x64";
    case "aarch64-apple-darwin":
      return "bun-darwin-arm64";
    case "x86_64-unknown-linux-gnu":
      return "bun-linux-x64";
    case "aarch64-unknown-linux-gnu":
      return "bun-linux-arm64";
    default:
      throw new Error(`No Bun compile target mapping for Rust target triple: ${triple}`);
  }
}
