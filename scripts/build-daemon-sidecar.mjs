#!/usr/bin/env node
/**
 * Build daemon for Tauri bundling.
 *
 * Strategy:
 * 1. Compile TypeScript with tsc
 * 2. Bundle with esbuild into a single ESM file (native modules external)
 * 3. Copy native modules from pnpm store
 * 4. Output to Tauri resources directory for the Rust supervisor to spawn
 *
 * The Rust DaemonSupervisor spawns `node` with the bundled script directly.
 * No separate sidecar binary is needed - Node.js is expected on PATH.
 * For production, Node.js can be bundled as a Tauri resource later.
 */

import { mkdirSync, existsSync, cpSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { arch, platform } from "node:os";

const root = process.cwd();
const resourcesDir = join(root, "frontend", "src-tauri", "resources", "daemon");
const sidecarBuildDir = join(root, ".sidecar-build");
const isWindows = platform() === "win32";

// Find a pnpm-installed package's actual path
function findPnpmPackage(name) {
  const pnpmDir = join(root, "node_modules", ".pnpm");
  if (!existsSync(pnpmDir)) return null;
  const escaped = name.replace("/", "+");
  for (const entry of readdirSync(pnpmDir)) {
    if (entry.startsWith(escaped + "@")) {
      const pkgPath = join(pnpmDir, entry, "node_modules", name);
      if (existsSync(pkgPath)) return pkgPath;
    }
  }
  return null;
}

console.log("[build-daemon] Building daemon for Tauri bundling...");

// Step 1: Compile TypeScript
console.log("[build-daemon] Compiling TypeScript...");
execFileSync("pnpm", ["--filter", "daemon", "build"], {
  stdio: "inherit",
  shell: isWindows,
  cwd: root,
});

// Step 2: Bundle with esbuild (ESM format to preserve import.meta)
console.log("[build-daemon] Bundling with esbuild...");
mkdirSync(sidecarBuildDir, { recursive: true });

const esbuildArgs = [
  "node_modules/esbuild/bin/esbuild",
  "daemon/dist/index.js",
  "--bundle",
  "--platform=node",
  "--target=node20",
  "--format=esm",
  "--outfile=" + join(sidecarBuildDir, "index.mjs"),
  "--external:better-sqlite3",
  "--external:@discordjs/opus",
  "--external:prism-media",
];

execFileSync(process.execPath, esbuildArgs, {
  stdio: "inherit",
  cwd: root,
});

// Step 3: Copy native modules from pnpm store
console.log("[build-daemon] Copying native modules...");
const nativeModules = ["better-sqlite3", "@discordjs/opus", "prism-media"];
for (const mod of nativeModules) {
  const src = findPnpmPackage(mod);
  if (src) {
    const dest = join(sidecarBuildDir, "node_modules", mod);
    cpSync(src, dest, { recursive: true });
    console.log(`  Copied ${mod}`);
  } else {
    console.warn(`  Warning: ${mod} not found in pnpm store`);
  }
}

// Step 4: Create package.json for bundled daemon
writeFileSync(
  join(sidecarBuildDir, "package.json"),
  JSON.stringify({ name: "jarvis-daemon-bundle", type: "module", private: true }, null, 2)
);

// Step 5: Copy to Tauri resources directory
console.log("[build-daemon] Copying to Tauri resources...");
mkdirSync(resourcesDir, { recursive: true });
cpSync(sidecarBuildDir, resourcesDir, { recursive: true });

// Verify output
const scriptPath = join(resourcesDir, "index.mjs");
if (!existsSync(scriptPath)) {
  console.error(`[build-daemon] ERROR: Bundled script not found at ${scriptPath}`);
  process.exit(1);
}

console.log(`[build-daemon] Done. Resources: ${resourcesDir}`);
