#!/usr/bin/env node
/**
 * Build the daemon as a Tauri sidecar executable using Node.js SEA.
 *
 * Steps:
 * 1. Bundle TypeScript → single CJS file with esbuild
 * 2. Generate SEA blob with Node.js
 * 3. Copy node binary → inject blob → output sidecar executable
 * 4. Copy native modules (better-sqlite3) alongside the executable
 */

import { execFileSync } from "node:child_process";
import { build as esbuild } from "esbuild";
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  cpSync,
  writeFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { arch, platform } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const requireFromDaemon = createRequire(join(root, "daemon", "package.json"));
const binaryBaseName = "jarvis-daemon";
const binariesDir = join(root, "frontend", "src-tauri", "binaries");
const entrypoint = join(root, "daemon", "src", "index.ts");
const tempDir = join(root, ".sea-temp");

// ─── Detect target triple ─────────────────────────────────────────────────────
const targetTriple = process.env.JARVIS_SIDECAR_TARGET ?? detectTargetTriple();
const isWindows = targetTriple.includes("windows");
const exeExt = isWindows ? ".exe" : "";
const outputPath = join(binariesDir, `${binaryBaseName}-${targetTriple}${exeExt}`);

console.log(`[build-daemon] Target triple: ${targetTriple}`);
console.log(`[build-daemon] Entry point: ${entrypoint}`);
console.log(`[build-daemon] Output: ${outputPath}`);

// ─── Step 0: Clean ────────────────────────────────────────────────────────────
mkdirSync(binariesDir, { recursive: true });
mkdirSync(tempDir, { recursive: true });

// ─── Step 1: Bundle TypeScript → CJS with esbuild ────────────────────────────
console.log(`[build-daemon] Step 1: Bundling with esbuild...`);

const bundledFile = join(tempDir, "daemon.cjs");
const betterSqliteShim = join(tempDir, "better-sqlite3-shim.cjs");
writeFileSync(betterSqliteShim, `
const { createRequire } = require("node:module");
const { dirname, join } = require("node:path");
const moduleRoot = process.env.JARVIS_SIDECAR_MODULE_ROOT || dirname(process.execPath);
module.exports = createRequire(join(moduleRoot, "package.json"))("better-sqlite3");
`);

try {
  await esbuild({
    entryPoints: [entrypoint],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    outfile: bundledFile,
    external: [
      "@discordjs/opus",
      "prism-media",
      "node:*",
    ],
    plugins: [sidecarNativeShimPlugin()],
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.JARVIS_VERSION": JSON.stringify(requireFromDaemon("./package.json").version),
    },
    logLevel: "warning",
    banner: {
      js: "(async()=>{",
    },
    footer: {
      js: "})().catch(e=>{console.error(e);process.exit(1)});",
    },
  });
} catch (err) {
  console.error(`[build-daemon] esbuild failed: ${err.message}`);
  process.exit(1);
}

if (!existsSync(bundledFile)) {
  console.error(`[build-daemon] ERROR: esbuild bundle was not created: ${bundledFile}`);
  process.exit(1);
}

const bundleSize = (await import("node:fs")).statSync(bundledFile).size;
console.log(`[build-daemon] Bundle created: ${(bundleSize / 1024 / 1024).toFixed(1)} MB`);

// ─── Step 2: Generate SEA blob ────────────────────────────────────────────────
console.log(`[build-daemon] Step 2: Generating SEA blob...`);

const seaConfigPath = join(tempDir, "sea-config.json");
const blobPath = join(tempDir, "sea-prep.blob");

writeFileSync(seaConfigPath, JSON.stringify({
  main: bundledFile,
  output: blobPath,
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
}, null, 2));

execFileSync(process.execPath, [
  "--experimental-sea-config", seaConfigPath,
], {
  cwd: root,
  stdio: "inherit",
});

if (!existsSync(blobPath)) {
  console.error(`[build-daemon] ERROR: SEA blob was not created: ${blobPath}`);
  process.exit(1);
}

console.log(`[build-daemon] SEA blob created`);

// ─── Step 3: Copy node binary ────────────────────────────────────────────────
console.log(`[build-daemon] Step 3: Copying node binary...`);

const nodeExe = process.execPath;
const sidecarBin = join(tempDir, `jarvis-daemon${exeExt}`);

if (isWindows) {
  // Windows: use fs.copyFileSync
  execFileSync("node", [
    "-e", `require('fs').copyFileSync(${JSON.stringify(nodeExe)}, ${JSON.stringify(sidecarBin)})`,
  ], { cwd: root, stdio: "inherit" });
} else {
  // Linux/macOS: use cp
  execFileSync("cp", [nodeExe, sidecarBin], { cwd: root, stdio: "inherit" });
}

console.log(`[build-daemon] Node binary copied to ${sidecarBin}`);

// ─── Step 4: Inject blob ──────────────────────────────────────────────────────
console.log(`[build-daemon] Step 4: Injecting SEA blob...`);

const sentinelFuse = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

// Remove signature on macOS
if (platform() === "darwin") {
  try {
    execFileSync("codesign", ["--remove-signature", sidecarBin], { stdio: "inherit" });
  } catch {}
}

// Inject with postject
const postjectBin = isWindows
  ? join(root, "node_modules", ".bin", "postject.CMD")
  : join(root, "node_modules", ".bin", "postject");
const postjectArgs = [
  sidecarBin,
  "NODE_SEA_BLOB",
  blobPath,
  "--sentinel-fuse", sentinelFuse,
];

if (platform() === "darwin") {
  postjectArgs.push("--macho-segment-name", "NODE_SEA");
}

try {
  execFileSync(postjectBin, postjectArgs, {
    cwd: root,
    stdio: "inherit",
    shell: isWindows,
  });
} catch (err) {
  console.error(`[build-daemon] WARNING: postject injection failed: ${err.message}`);
  console.error(`[build-daemon] The executable may not work without blob injection.`);
  console.error(`[build-daemon] You may need to install postject globally: npm i -g postject`);
}

// Sign on macOS
if (platform() === "darwin") {
  try {
    execFileSync("codesign", ["--sign", "-", sidecarBin], { stdio: "inherit" });
  } catch {}
}

// ─── Step 5: Copy native modules alongside executable ─────────────────────────
const sidecarDir = dirname(sidecarBin);
console.log(`[build-daemon] Step 5: Copying native modules...`);

const sidecarNodeModules = join(sidecarDir, "node_modules");
rmSync(sidecarNodeModules, { recursive: true, force: true });
copyBetterSqliteRuntime(sidecarNodeModules);
copyPackageRuntime("bindings", sidecarNodeModules, ["bindings.js", "package.json", "LICENSE.md"]);
copyPackageRuntime("file-uri-to-path", sidecarNodeModules, ["index.js", "package.json", "LICENSE"]);

// ─── Step 6: Move to final output ─────────────────────────────────────────────
console.log(`[build-daemon] Step 6: Moving to output...`);

copyFileSync(sidecarBin, outputPath);

// Also copy native deps next to the final output
const outputDir = dirname(outputPath);
const nativeSrcDir = join(sidecarDir, "node_modules");
const nativeDestDir = join(outputDir, "node_modules");
rmSync(nativeDestDir, { recursive: true, force: true });
if (existsSync(nativeSrcDir)) {
  cpSync(nativeSrcDir, nativeDestDir, { recursive: true });
}

// ─── Step 7: Verify ───────────────────────────────────────────────────────────
if (!existsSync(outputPath)) {
  console.error(`[build-daemon] ERROR: sidecar binary was not created: ${outputPath}`);
  process.exit(1);
}

const outputSize = (await import("node:fs")).statSync(outputPath).size;
console.log(`[build-daemon] ✅ Created sidecar: ${outputPath} (${(outputSize / 1024 / 1024).toFixed(1)} MB)`);

// ─── Cleanup ──────────────────────────────────────────────────────────────────
try {
  const { rmSync } = await import("node:fs");
  rmSync(tempDir, { recursive: true, force: true });
} catch {}

// ─── Helper functions ─────────────────────────────────────────────────────────
function detectTargetTriple() {
  if (platform() === "win32" && arch() === "x64") return "x86_64-pc-windows-msvc";
  if (platform() === "win32" && arch() === "arm64") return "aarch64-pc-windows-msvc";
  if (platform() === "darwin" && arch() === "arm64") return "aarch64-apple-darwin";
  if (platform() === "darwin" && arch() === "x64") return "x86_64-apple-darwin";
  if (platform() === "linux" && arch() === "x64") return "x86_64-unknown-linux-gnu";
  if (platform() === "linux" && arch() === "arm64") return "aarch64-unknown-linux-gnu";
  throw new Error(`Unsupported platform: ${platform()} ${arch()}`);
}

function sidecarNativeShimPlugin() {
  return {
    name: "sidecar-native-shim",
    setup(build) {
      build.onResolve({ filter: /^better-sqlite3$/ }, () => ({
        path: betterSqliteShim,
      }));
    },
  };
}

function resolvePackageDir(pkg) {
  try {
    return dirname(requireFromDaemon.resolve(`${pkg}/package.json`));
  } catch {
    try {
      return dirname(requireFromDaemon.resolve(pkg));
    } catch {
      return resolvePnpmPackageDir(pkg);
    }
  }
}

function copyBetterSqliteRuntime(nodeModulesDir) {
  const srcDir = resolvePackageDir("better-sqlite3");
  const destDir = join(nodeModulesDir, "better-sqlite3");

  mkdirSync(join(destDir, "build", "Release"), { recursive: true });
  cpSync(join(srcDir, "lib"), join(destDir, "lib"), { recursive: true, dereference: true });
  copyFileIfExists(join(srcDir, "package.json"), join(destDir, "package.json"));
  copyFileIfExists(
    join(srcDir, "build", "Release", "better_sqlite3.node"),
    join(destDir, "build", "Release", "better_sqlite3.node"),
  );

  console.log(`[build-daemon]   Copied better-sqlite3 runtime`);
}

function copyPackageRuntime(pkg, nodeModulesDir, files) {
  const srcDir = resolvePackageDir(pkg);
  const destDir = join(nodeModulesDir, pkg);
  mkdirSync(destDir, { recursive: true });

  for (const file of files) {
    copyFileIfExists(join(srcDir, file), join(destDir, file));
  }

  console.log(`[build-daemon]   Copied ${pkg} runtime`);
}

function copyFileIfExists(src, dest) {
  if (!existsSync(src)) {
    console.warn(`[build-daemon]   Missing runtime file: ${src}`);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

function resolvePnpmPackageDir(pkg) {
  const pnpmDir = join(root, "node_modules", ".pnpm");
  const escapedPkg = pkg.replace("/", "+");
  const entry = readdirSync(pnpmDir).find((name) => name.startsWith(`${escapedPkg}@`));
  if (!entry) {
    throw new Error(`Cannot resolve package directory for ${pkg}`);
  }
  return join(pnpmDir, entry, "node_modules", pkg);
}
