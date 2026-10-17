import { describe, it, expect } from "vitest";
import {
  parseShellCommand,
  normalizeBinaryName,
} from "../shell-tokenizer.js";

describe("parseShellCommand", () => {
  it("extracts binary and args of a simple command", () => {
    const parsed = parseShellCommand("git status --porcelain");
    expect(parsed.binary).toBe("git");
    expect(parsed.args).toEqual(["status", "--porcelain"]);
    expect(parsed.hasPipe).toBe(false);
    expect(parsed.segments).toHaveLength(1);
  });

  it("splits pipeline stages and flags the pipe", () => {
    const parsed = parseShellCommand("cat data.txt | grep error | wc -l");
    expect(parsed.hasPipe).toBe(true);
    expect(parsed.segments.map((s) => s.binary)).toEqual(["cat", "grep", "wc"]);
    expect(parsed.segments[1].args).toEqual(["error"]);
  });

  it("splits on ;; && and newlines too", () => {
    const a = parseShellCommand("echo one && echo two");
    expect(a.segments.map((s) => s.binary)).toEqual(["echo", "echo"]);
    const b = parseShellCommand("echo one ; echo two");
    expect(b.segments.map((s) => s.binary)).toEqual(["echo", "echo"]);
    const c = parseShellCommand("echo one\necho two");
    expect(c.segments.map((s) => s.binary)).toEqual(["echo", "echo"]);
  });

  it("resolves quoting so obfuscated binaries are unmasked", () => {
    expect(parseShellCommand('cu"rl" http://x').binary).toBe("curl");
    expect(parseShellCommand("cu'rl' http://x").binary).toBe("curl");
    expect(parseShellCommand("cu\\rl http://x").binary).toBe("curl");
    expect(parseShellCommand('ba"sh" -c "echo hi"').binary).toBe("bash");
  });

  it("keeps quoted spaces as single argv entries", () => {
    const parsed = parseShellCommand('grep "two words" file.txt');
    expect(parsed.args).toEqual(["two words", "file.txt"]);
  });

  it("skips environment assignment prefixes when picking the binary", () => {
    const parsed = parseShellCommand("FOO=1 BAR=2 git status");
    expect(parsed.binary).toBe("git");
    expect(parsed.args).toEqual(["status"]);
  });

  it("normalizes windows-style binaries and full paths", () => {
    expect(parseShellCommand('"C:\\Program Files\\Git\\bin\\git.exe" status').binary).toBe("git");
    expect(parseShellCommand("./node_modules/.bin/vitest run").binary).toBe("vitest");
    expect(parseShellCommand("POWERSHELL.EXE -Command dir").binary).toBe("powershell");
  });

  it("detects redirection without breaking the pipeline", () => {
    const parsed = parseShellCommand("curl https://x -o - | bash");
    expect(parsed.hasRedirection).toBe(false);
    expect(parsed.hasPipe).toBe(true);
    expect(parsed.segments[1].binary).toBe("bash");

    const redirected = parseShellCommand("echo hi > out.txt");
    expect(redirected.hasRedirection).toBe(true);
    expect(redirected.binary).toBe("echo");
  });

  it("treats fd-juggling like 2>&1 as redirection, not a stage binary", () => {
    const parsed = parseShellCommand("cmd 2>&1 | grep err");
    expect(parsed.hasRedirection).toBe(true);
    expect(parsed.segments.some((s) => s.binary === "2" || s.binary === "1")).toBe(false);
    expect(parsed.segments.map((s) => s.binary)).toEqual(["cmd", "grep"]);
  });

  it("flags command substitution", () => {
    expect(parseShellCommand("echo $(whoami)").hasSubstitution).toBe(true);
    expect(parseShellCommand("echo `whoami`").hasSubstitution).toBe(true);
    expect(parseShellCommand("echo (whoami)").hasSubstitution).toBe(false);
  });

  it("reports unterminated quotes as parse errors but keeps partial structure", () => {
    const parsed = parseShellCommand('rm -rf "unterminated');
    expect(parsed.parseError).toMatch(/unterminated double quote/);
    expect(parsed.binary).toBe("rm");
    // Partial words parsed before the failure are preserved for fail-closed rules.
    expect(parsed.args).toEqual(["-rf", "unterminated"]);
  });

  it("handles empty and whitespace-only input", () => {
    expect(parseShellCommand("").binary).toBe("");
    expect(parseShellCommand("   ").segments).toHaveLength(0);
    expect(parseShellCommand("").parseError).toBeUndefined();
  });

  it("unfolds escapes inside double quotes correctly", () => {
    const parsed = parseShellCommand('echo "a \\"quoted\\" \\\\ path"');
    expect(parsed.args).toEqual(['a "quoted" \\ path']);
  });

  it("treats a caret as an escape on windows-style input", () => {
    expect(parseShellCommand("cu^rl http://x").binary).toBe("curl");
  });
});

describe("normalizeBinaryName", () => {
  it("strips paths and executable extensions case-insensitively", () => {
    expect(normalizeBinaryName("GIT.EXE")).toBe("git");
    expect(normalizeBinaryName("/usr/bin/python3")).toBe("python3");
    expect(normalizeBinaryName("sh")).toBe("sh");
    expect(normalizeBinaryName("")).toBe("");
  });
});
