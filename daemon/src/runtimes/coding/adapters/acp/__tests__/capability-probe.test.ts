import { describe, it, expect } from "vitest";
import { acpLaunchFingerprint, interpretProbe } from "../capability-probe.js";

const base = { agent: "claude", fingerprint: "fp" };

describe("acpLaunchFingerprint", () => {
  it("is stable for one launch configuration", () => {
    expect(acpLaunchFingerprint("claude", "/repo")).toBe(acpLaunchFingerprint("claude", "/repo"));
  });

  it("changes when the agent or the working directory changes", () => {
    expect(acpLaunchFingerprint("claude", "/repo")).not.toBe(acpLaunchFingerprint("codex", "/repo"));
    expect(acpLaunchFingerprint("claude", "/repo")).not.toBe(acpLaunchFingerprint("claude", "/other"));
  });
});

describe("interpretProbe", () => {
  it("reports ready with a session id on a successful handshake", () => {
    const snapshot = interpretProbe({
      ...base,
      exitCode: 0,
      stdout: "c117ffb0-7348-4c91-a0af-7676dc30a869\t(created)\n",
      stderr: "",
    });

    expect(snapshot.status).toBe("ready");
    expect(snapshot.detail).toContain("c117ffb0");
  });

  it("prefers agentInfo when the handshake surfaced it", () => {
    const snapshot = interpretProbe({
      ...base,
      exitCode: 0,
      stdout: '{"agentInfo":{"name":"claude-agent-acp","version":"0.93.0"}}',
      stderr: "",
    });

    expect(snapshot.status).toBe("ready");
    expect(snapshot.agentInfo).toEqual({ name: "claude-agent-acp", version: "0.93.0" });
    expect(snapshot.detail).toBe("claude-agent-acp 0.93.0");
  });

  it("separates missing credentials from an unreachable agent", () => {
    const needsAuth = interpretProbe({
      ...base,
      exitCode: 1,
      stdout: "",
      stderr: "Authentication required: run `claude login` or set ANTHROPIC_AUTH_TOKEN",
    });
    expect(needsAuth.status).toBe("needs_auth");

    const unreachable = interpretProbe({
      ...base,
      exitCode: 1,
      stdout: "",
      stderr: "spawn npx ENOENT",
    });
    expect(unreachable.status).toBe("unreachable");
    expect(unreachable.detail).toBe("spawn npx ENOENT");
  });

  it("never reads a JSON frame as the human-facing detail", () => {
    const snapshot = interpretProbe({
      ...base,
      exitCode: 1,
      stdout: '{"jsonrpc":"2.0","error":{"code":-32000,"message":"boom"}}',
      stderr: "",
    });

    expect(snapshot.status).toBe("unreachable");
    expect(snapshot.detail.length).toBeGreaterThan(0);
  });

  it("falls back to the exit code when nothing was written", () => {
    const snapshot = interpretProbe({ ...base, exitCode: 2, stdout: "", stderr: "" });
    expect(snapshot.detail).toBe("acpx exited with code 2");
  });
});
